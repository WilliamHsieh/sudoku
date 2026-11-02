import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium, webkit } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, ".lavish/hint-ui-implemented");
await mkdir(out, { recursive: true });
const result = await build({
  configFile: false,
  root,
  base: "./",
  logLevel: "error",
  plugins: [svelte()],
  define: { __SUDOKU_BUILD__: "undefined" },
  build: {
    write: false,
    cssCodeSplit: false,
    lib: {
      entry: path.join(root, "src/hints/demo.mjs"),
      formats: ["iife"],
      name: "OriginalHintMock",
    },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output;
const js = output
  .filter((x) => x.type === "chunk")
  .map((x) => x.code)
  .join("\n");
const css = output
  .filter((x) => x.type === "asset" && x.fileName.endsWith(".css"))
  .map((x) => String(x.source))
  .join("\n");
const html =
  '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sudoku hint mock</title><style>' +
  css +
  '</style></head><body><div id="app"></div><script>localStorage.setItem("sudoku-keypad-coach","1");</script><script>' +
  js.replaceAll("</script", "<\\/script") +
  "</script></body></html>";
const filename = path.join(out, "original-board.html");
await writeFile(filename, html);
if (process.argv.includes("--open")) {
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer.exe"
        : "xdg-open";
  spawnSync(opener, [filename], { stdio: "ignore" });
  console.log(filename);
  process.exit(0);
}
if (process.argv.includes("--build-only")) {
  console.log(filename);
  process.exit(0);
}
const browser = await chromium.launch();
const errors = [];
if (process.argv.includes("--check")) {
  let states = 0;
  for (const engine of [chromium, webkit]) {
    const qa = engine === chromium ? browser : await engine.launch();
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 900, height: 800 },
      { width: 1280, height: 800 },
      { width: 1600, height: 1000 },
    ])
      for (const caseId of ["xwing", "hidden", "pair"]) {
        for (const colorScheme of ["light", "dark"]) {
          const context = await qa.newContext({ viewport, colorScheme });
          const page = await context.newPage();
          page.on("pageerror", (e) => errors.push(e.message));
          await page.goto(pathToFileURL(filename).href + "?case=" + caseId);
          await page.waitForSelector('body[data-original-hint-mock="ready"]');
          await page
            .locator(".play")
            .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
          const baseline = await page.locator(".board").boundingBox();
          await page.locator('[aria-label="Hint"]').click();
          for (let phase = 1; phase <= 3; phase++) {
            if (phase > 1) await page.locator('.hint-panel [data-action="next"]').click();
            for (const large of [false, true]) {
              const style = large
                ? await page.addStyleTag({ content: ".hint-panel p{font-size:24px!important}" })
                : null;
              const actual = await page.evaluate(() => {
                const b = document.querySelector(".board").getBoundingClientRect();
                const p = document.querySelector(".hint-panel"),
                  r = p.getBoundingClientRect();
                const action = p.querySelector(".hint-primary").getBoundingClientRect();
                const secondary = p.querySelector(".hint-secondary").getBoundingClientRect();
                const actions = p.querySelector(".hint-actions").getBoundingClientRect();
                const position = p.querySelector(".hint-position").getBoundingClientRect();
                const chrome = document.querySelector(".mobile-chrome");
                return {
                  board: { x: b.x, y: b.y, width: b.width, height: b.height },
                  overlap:
                    Math.min(b.right, r.right) > Math.max(b.left, r.left) &&
                    Math.min(b.bottom, r.bottom) > Math.max(b.top, r.top),
                  clipped: p.scrollWidth > p.clientWidth + 1,
                  centered: Math.abs(position.x + position.width / 2 - (r.x + r.width / 2)) < 0.8,
                  compactButtons:
                    Math.abs(action.right - actions.right) < 0.8 &&
                    Math.abs(secondary.left - actions.left) < 0.8 &&
                    action.width < actions.width / 2 &&
                    secondary.width < actions.width / 2 &&
                    action.height >= 44 &&
                    secondary.height >= 44,
                  cleanFooter:
                    !p.querySelector(".hint-footer small") &&
                    getComputedStyle(p.querySelector(".hint-footer")).borderTopWidth === "0px",
                  techniqueScrolls:
                    !p.querySelector(".technique") ||
                    p.querySelector(".hint-body").contains(p.querySelector(".technique")),
                  docked: p.classList.contains("docked"),
                  chromeHidden: getComputedStyle(chrome).visibility === "hidden" && chrome.inert,
                  actionVisible:
                    action.bottom <= innerHeight && action.top >= b.bottom && action.height >= 44,
                  pageFits: document.documentElement.scrollHeight <= innerHeight + 1,
                };
              });
              if (
                actual.overlap ||
                actual.clipped ||
                !actual.centered ||
                !actual.compactButtons ||
                !actual.cleanFooter ||
                !actual.techniqueScrolls
              )
                throw Error(
                  "Overlap/clipping " + JSON.stringify({ viewport, caseId, phase, large, actual })
                );
              if (viewport.width < 600) {
                for (const key of ["x", "y", "width", "height"])
                  if (Math.abs(actual.board[key] - baseline[key]) > 0.8)
                    throw Error("Phone board moved");
                if (
                  !actual.docked ||
                  !actual.chromeHidden ||
                  !actual.actionVisible ||
                  !actual.pageFits
                )
                  throw Error(
                    "Phone replacement failed " +
                      JSON.stringify({ viewport, caseId, phase, large, actual })
                  );
              }
              states++;
              if (style) await style.evaluate((el) => el.remove());
            }
          }
          await page.locator(".hint-close").click();
          if (
            await page
              .locator(".mobile-chrome")
              .evaluate((el) => el.inert || getComputedStyle(el).visibility === "hidden")
          )
            throw Error("Close did not restore controls");
          if (caseId === "xwing") {
            await page.locator("#hint-trigger").click();
            await page.waitForSelector(".hint-progress");
            const edit = await page.locator(".cell").evaluateAll((cells) => {
              const el = cells.find(
                (cell) => !cell.getAttribute("data-value") && cell.getAttribute("data-notes")
              );
              return { cell: el.getAttribute("data-i"), digit: el.getAttribute("data-notes")[0] };
            });
            await page.locator(`.cell[data-i="${edit.cell}"]`).click({ position: { x: 5, y: 5 } });
            await page.keyboard.press(edit.digit);
            await page.getByRole("heading", { name: "盤面已變更" }).waitFor();
            if (await page.locator(".hint-premise").count())
              throw Error("Stale proof still highlighted");
            await page.keyboard.press("Escape");
            await page.locator("#hint-trigger:focus").waitFor();
            await page.locator("#hint-trigger").click();
            await page.getByRole("heading", { name: "暫時找不到提示" }).waitFor();
            await page.locator("#time-control").click();
            if (await page.locator(".hint-panel").count()) throw Error("Hint leaked through pause");
            await page.goto(pathToFileURL(filename).href + "?unavailable=1");
            await page.waitForSelector('body[data-original-hint-mock="ready"]');
            await page.locator("#hint-trigger").click();
            await page.getByRole("heading", { name: "提示功能準備中" }).waitFor();
            await page.keyboard.press("Escape");
            if (await page.locator(".hint-panel").count()) throw Error("Escape did not close hint");
          }
          await context.close();
        }
      }
    if (qa !== browser) await qa.close();
  }
  await browser.close();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    `${states} layout states passed: Chromium + WebKit; 8 viewports; light/dark; 3 fixtures; 3 reveal stages; normal/150% body text.`
  );
  process.exit(0);
}
async function click(page, selector, wait = 1500) {
  const locator = page.locator(selector).filter({ visible: true }).first();
  await locator.scrollIntoViewIfNeeded();
  const r = await locator.boundingBox();
  await page.evaluate(
    ({ x, y }) =>
      (document.querySelector(".record-pointer").style.transform =
        `translate(${x - 8}px,${y - 8}px)`),
    { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  );
  await page.waitForTimeout(250);
  await locator.click();
  await page.waitForTimeout(wait);
}
async function screenshot(page, name) {
  const style = await page.addStyleTag({ content: ".record-pointer{visibility:hidden!important}" });
  await page.screenshot({ path: path.join(out, name + ".png") });
  await style.evaluate((el) => el.remove());
}
for (const [name, viewport, caseId] of [
  ["desktop", { width: 1600, height: 1000 }, "xwing"],
  ["mobile", { width: 390, height: 844 }, "xwing"],
  ["mobile-dark", { width: 390, height: 844 }, "xwing"],
]) {
  if (process.argv.includes("--mobile-only") && !name.startsWith("mobile")) continue;
  const context = await browser.newContext({
    viewport,
    hasTouch: name.startsWith("mobile"),
    colorScheme: name.endsWith("dark") ? "dark" : "light",
    deviceScaleFactor: 1,
    recordVideo: { dir: path.join(out, "raw"), size: viewport },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(filename).href + "?case=" + caseId);
  await page.waitForSelector('body[data-original-hint-mock="ready"]');
  await page
    .locator(".play")
    .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      ".record-pointer{position:fixed;left:0;top:0;width:16px;height:16px;border:2px solid white;border-radius:50%;background:rgba(42,86,198,.7);box-shadow:0 0 0 5px rgba(42,86,198,.15);transform:translate(-50px,-50px);transition:transform .25s;pointer-events:none;z-index:100}";
    document.head.append(style);
    const el = document.createElement("div");
    el.className = "record-pointer";
    document.body.append(el);
  });
  const baseline = await page.locator(".board").boundingBox();
  await screenshot(page, name + "-original");
  await page.waitForTimeout(1000);
  await click(page, '[aria-label="Hint"]', 2800);
  const after = await page.locator(".board").boundingBox();
  for (const key of ["x", "y", "width", "height"])
    if (Math.abs(baseline[key] - after[key]) > 0.8)
      throw new Error(name + " board geometry changed: " + JSON.stringify({ baseline, after }));
  await click(page, '.hint-panel [data-action="next"]', 4000);
  const expanded = await page.locator(".board").boundingBox();
  if (
    Math.abs(expanded.width - baseline.width) > 0.8 ||
    Math.abs(expanded.height - baseline.height) > 0.8
  )
    throw new Error("Expanded hint resized original board");
  const readable = await page
    .locator(".hint-panel")
    .evaluate((el) => el.clientWidth >= 320 && el.scrollWidth <= el.clientWidth + 1);
  if (!readable) throw new Error("Hint panel is clipped or too narrow");
  await page.locator(".hint-panel").scrollIntoViewIfNeeded();
  await screenshot(page, name + "-reasoning");
  if (name.startsWith("mobile")) {
    const fixedBefore = await page.locator(".hint-head").boundingBox();
    const actionsBefore = await page.locator(".hint-actions").boundingBox();
    await page.locator(".hint-body").hover();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(2800);
    const fixedAfter = await page.locator(".hint-head").boundingBox();
    const actionsAfter = await page.locator(".hint-actions").boundingBox();
    const techniqueScrolled = await page
      .locator(".technique")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().bottom <= el.closest(".hint-body").getBoundingClientRect().top
      );
    if (
      Math.abs(fixedBefore.y - fixedAfter.y) > 0.8 ||
      Math.abs(actionsBefore.y - actionsAfter.y) > 0.8 ||
      !techniqueScrolled
    )
      throw Error("Scroll did not preserve header/actions or hide the technique name");
    await screenshot(page, name + "-reasoning-scrolled");
  }
  await click(page, '.hint-panel [data-cell="77"]', 2000);
  const rects = await page.evaluate(() => {
    const b = document.querySelector(".board").getBoundingClientRect(),
      p = document.querySelector(".hint-panel").getBoundingClientRect();
    return {
      overlap:
        Math.min(b.right, p.right) > Math.max(b.left, p.left) &&
        Math.min(b.bottom, p.bottom) > Math.max(b.top, p.top),
    };
  });
  if (rects.overlap) throw new Error("Panel overlaps original board");
  await click(page, '.hint-panel [data-action="next"]', 3500);
  await page.locator(".hint-panel").scrollIntoViewIfNeeded();
  await screenshot(page, name + "-conclusion");
  await click(page, '.hint-panel [data-action="apply"]', 3200);
  for (const i of [24, 60, 68])
    if (
      !(await page
        .locator(`.cell[data-i="${i}"] [data-d="1"]`)
        .evaluate((el) => el.classList.contains("invisible")))
    )
      throw new Error("Apply did not remove candidate 1 at " + i);
  await screenshot(page, name + "-applied");
  await click(page, '.hint-panel [data-action="undo"]', 1600);
  for (const i of [24, 60, 68])
    if (
      await page
        .locator(`.cell[data-i="${i}"] [data-d="1"]`)
        .evaluate((el) => el.classList.contains("invisible"))
    )
      throw new Error("Undo did not restore candidate 1 at " + i);
  if (
    await page
      .locator(".mobile-chrome")
      .evaluate((el) => el.inert || getComputedStyle(el).visibility === "hidden")
  )
    throw new Error("Keypad not restored");
  await screenshot(page, name + "-undone");
  const video = page.video();
  await context.close();
  const converted = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      await video.path(),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path.join(out, name + "-original-board.mp4"),
    ],
    { encoding: "utf8" }
  );
  if (converted.status !== 0) throw new Error(converted.stderr);
  console.log(
    name + ": original board preserved; X-Wing 3 eliminations applied/undone; keypad restored."
  );
}
await browser.close();
await rm(path.join(out, "raw"), { recursive: true, force: true });
if (errors.length) throw new Error(errors.join("\n"));
console.log("Delivered media: " + out);
