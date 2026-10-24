import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";
import { decode } from "./painted-options.js";

const viewport = { width: 390, height: 844 };
test.use({ viewport });

async function openSheet(page, kind, settle = true) {
  if (kind === "more") {
    await openBoard(page, "./?shot=1&freeze");
    if (settle) await page.locator("[data-more]").filter({ visible: true }).click();
  } else {
    await page.goto("./");
    if (settle) await page.getByRole("button", { name: /Latest puzzles,/ }).click();
  }
  if (!settle) {
    await page.evaluate(async (kind) => {
      const opener =
        kind === "more"
          ? [...document.querySelectorAll("[data-more]")].find(
              (el) => el.getBoundingClientRect().width
            )
          : [...document.querySelectorAll("button")].find((el) =>
              el.getAttribute("aria-label")?.startsWith("Latest puzzles,")
            );
      opener.focus();
      opener.click();
      await Promise.resolve();
      const animations = document.getAnimations();
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = 0;
      }
      await Promise.all(animations.map((animation) => animation.ready));
    }, kind);
    return;
  }
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})))
  );
}

for (const entryTime of [null, 64]) {
  test(`both sheets share the 16 ms exit timeline, entry ${entryTime ?? "settled"}`, async ({
    page,
  }, testInfo) => {
    const timelines = [];
    for (const kind of ["difficulty", "more"]) {
      await openSheet(page, kind, entryTime === null);
      const result = await page.evaluate(
        async ({ kind, entryTime }) => {
          const sheet = document.querySelector(kind === "more" ? "dialog.opts" : ".sheet");
          const scrim = document.querySelector(kind === "more" ? ".modal-scrim" : ".scrim");
          let entryOpacity = 1;
          if (entryTime !== null) {
            const entering = [...sheet.getAnimations(), ...scrim.getAnimations()];
            for (const animation of entering) {
              animation.pause();
              animation.currentTime = entryTime;
            }
            await Promise.all(entering.map((animation) => animation.ready));
            entryOpacity = Number(getComputedStyle(scrim).opacity);
          }
          sheet.querySelector(kind === "more" ? "#opts-done" : "[aria-label=Close]").click();
          await Promise.resolve();
          const refocusedExit = sheet.contains(document.activeElement);
          const slide = sheet.getAnimations()[0];
          const fade = scrim.getAnimations()[0];
          const timing = (animation) => {
            const { duration, easing, fill } = animation.effect.getTiming();
            return { duration, easing, fill };
          };
          slide.pause();
          fade.pause();
          const frames = [];
          for (let ms = 0; ms <= 256; ms += 16) {
            slide.currentTime = fade.currentTime = ms;
            const transform = getComputedStyle(sheet).transform;
            const y = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
            frames.push({
              ms,
              fraction: y / sheet.getBoundingClientRect().height,
              scrim: Number(getComputedStyle(scrim).opacity),
              modal: sheet.matches(":modal"),
            });
          }
          const result = {
            slide: timing(slide),
            fade: timing(fade),
            frames,
            entryOpacity,
            refocusedExit,
          };
          slide.finish();
          fade.finish();
          return result;
        },
        { kind, entryTime }
      );
      if (entryTime !== null) {
        expect(result.entryOpacity).toBeGreaterThan(0);
        expect(result.entryOpacity).toBeLessThan(1);
      }
      if (kind === "more") expect(result.refocusedExit).toBe(false);
      expect(result.slide).toEqual(result.fade);
      expect(result.slide.duration).toBe(260);
      expect(result.slide.fill).toBe("forwards");
      for (const frame of result.frames) {
        expect(frame.modal).toBe(false);
        expect(frame.fraction + frame.scrim).toBeCloseTo(1, 4);
      }
      timelines.push(result);
    }
    for (let i = 0; i < timelines[0].frames.length; i++) {
      expect(timelines[0].frames[i].fraction).toBeCloseTo(timelines[1].frames[i].fraction, 4);
      expect(timelines[0].frames[i].scrim).toBeCloseTo(timelines[1].frames[i].scrim, 4);
    }
    await testInfo.attach("16ms-exit-timelines", {
      body: JSON.stringify(timelines),
      contentType: "application/json",
    });
  });
}

for (const reducedMotion of ["no-preference", "reduce"]) {
  test.describe(`sheet cleanup, ${reducedMotion}`, () => {
    test.use({ reducedMotion });
    test("no frame keeps an overlay or modal backdrop after the sheet leaves", async ({
      page,
    }, testInfo) => {
      for (const kind of ["difficulty", "more"]) {
        await openSheet(page, kind);
        const frames = await page.evaluate(async (kind) => {
          const sheet = document.querySelector(kind === "more" ? "dialog.opts" : ".sheet");
          const scrim = document.querySelector(kind === "more" ? ".modal-scrim" : ".scrim");
          const start = performance.now();
          const frames = [];
          const sample = () => {
            const gone = !sheet.isConnected || getComputedStyle(sheet).display === "none";
            frames.push({
              ms: performance.now() - start,
              gone,
              modal: sheet.matches(":modal"),
              scrim: scrim.isConnected ? Number(getComputedStyle(scrim).opacity) : 0,
              locked: document.body.classList.contains("journal-sheet"),
            });
          };
          sheet.querySelector(kind === "more" ? "#opts-done" : "[aria-label=Close]").click();
          await Promise.resolve();
          sample();
          await new Promise((resolve) => {
            function frame() {
              sample();
              if (performance.now() - start < 450) requestAnimationFrame(frame);
              else resolve();
            }
            requestAnimationFrame(frame);
          });
          return frames;
        }, kind);
        expect(frames.at(-1).gone).toBe(true);
        if (reducedMotion === "reduce") expect(frames[0].gone).toBe(true);
        else expect(frames.some((frame) => !frame.gone && frame.scrim > 0)).toBe(true);
        for (const frame of frames) {
          expect(frame.modal).toBe(false);
          if (frame.gone) {
            expect(frame.scrim).toBe(0);
            expect(frame.locked).toBe(false);
          }
        }
        await testInfo.attach(`${kind}-cleanup`, {
          body: JSON.stringify(frames),
          contentType: "application/json",
        });
      }
    });
  });
}

test("More keeps the header clear like the picker after view navigation", async ({
  page,
}, testInfo) => {
  await openBoard(page, "./?shot=1&freeze");
  await page.addStyleTag({
    content: ".top-strip { height: 47px !important } main { padding-top: 47px !important }",
  });
  for (const kind of ["difficulty", "more"]) {
    if (kind === "difficulty") await page.locator(".header .dbtn").click();
    else {
      await page.clock.resume();
      await page.getByRole("button", { name: "Back to game", exact: true }).click();
    }
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})))
    );
    const header = await page.locator(".header").boundingBox();
    const clip = { x: 0, y: 0, width: 390, height: Math.floor(header.y + header.height) };
    const clockTime = Date.now();
    await page.clock.install({ time: clockTime });
    await page.clock.pauseAt(clockTime + 1000);
    await page.clock.setFixedTime(new Date(await page.evaluate(() => Date.now())));
    const reference = await page.screenshot({ clip });
    await testInfo.attach(`${kind}-header-reference`, {
      body: reference,
      contentType: "image/png",
    });
    const closed = decode(reference).data;
    if (kind === "more") await page.locator("[data-more]").filter({ visible: true }).click();
    else await page.getByRole("button", { name: /Latest puzzles,/ }).click();
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})))
    );
    await page.evaluate(async (kind) => {
      const sheet = document.querySelector(kind === "more" ? "dialog.opts" : ".sheet");
      const scrim = document.querySelector(kind === "more" ? ".modal-scrim" : ".scrim");
      sheet.querySelector(kind === "more" ? "#opts-done" : "[aria-label=Close]").click();
      await Promise.resolve();
      window.exitFrames = [...sheet.getAnimations(), ...scrim.getAnimations()];
      for (const a of window.exitFrames) {
        a.pause();
        a.currentTime = 0;
      }
      await Promise.all(window.exitFrames.map((a) => a.ready));
    }, kind);
    for (const ms of [0, 64, 128, 192, 256]) {
      await page.evaluate((ms) => {
        for (const a of window.exitFrames) a.currentTime = ms;
      }, ms);
      const png = await page.screenshot({ clip });
      if (ms === 0)
        await testInfo.attach(`${kind}-header-0ms`, { body: png, contentType: "image/png" });
      expect(decode(png).data.equals(closed), `${kind} header at ${ms} ms`).toBe(true);
      if (ms === 64)
        await testInfo.attach(`${kind}-top-64ms`, { body: png, contentType: "image/png" });
    }
    await page.evaluate(() => {
      for (const a of window.exitFrames) a.finish();
    });
    await page.clock.runFor(400);
    expect(decode(await page.screenshot({ clip })).data.equals(closed)).toBe(true);
  }
});
