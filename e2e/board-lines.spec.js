import { test, expect } from "@playwright/test";
import { cell, openBoard, measureBoard, expectSameGeometry } from "./helpers.js";
import { decode } from "./painted-options.js";
import { freezeTimers } from "./paint-cases.js";

// Check actual paint, including the corners where differently colored CSS
// borders meet. Geometry-only assertions cannot detect a thin line in a box line.
async function expectContinuousLines(page, testInfo, label) {
  const geometry = await page.locator(".board").evaluate((board) => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    };
    const style = getComputedStyle(board);
    const cells = [...board.querySelectorAll(":scope > .cell")];
    const scale = board.getBoundingClientRect().width / parseFloat(style.width);
    return {
      board: rect(board),
      cells: cells.map(rect),
      outer: parseFloat(style.borderLeftWidth) * scale,
      box: parseFloat(getComputedStyle(cells[2]).borderRightWidth) * scale,
      radius: parseFloat(style.borderTopLeftRadius) * scale,
      boxColor: style.getPropertyValue("--line-box").trim(),
      outerColor: style.getPropertyValue("--line-outer").trim(),
      dpr: devicePixelRatio,
    };
  });
  const path = testInfo.outputPath(`${label}.png`);
  const png = await page.screenshot({ path });
  await testInfo.attach(`${label}-board`, { path, contentType: "image/png" });
  const image = decode(png);
  const { board: b, cells, outer, box, radius, dpr } = geometry;
  const strips = [
    [b.x, b.y + radius, b.x + outer, b.bottom - radius, geometry.outerColor],
    [b.right - outer, b.y + radius, b.right, b.bottom - radius, geometry.outerColor],
    [b.x + radius, b.y, b.right - radius, b.y + outer, geometry.outerColor],
    [b.x + radius, b.bottom - outer, b.right - radius, b.bottom, geometry.outerColor],
    ...[2, 5].flatMap((i) => [
      [cells[i].right - box, b.y + outer, cells[i].right, b.bottom - outer, geometry.boxColor],
      [
        b.x + outer,
        cells[i * 9].bottom - box,
        b.right - outer,
        cells[i * 9].bottom,
        geometry.boxColor,
      ],
    ]),
  ];
  const gaps = [];
  let samples = 0;
  for (const [left, top, right, bottom, hex] of strips) {
    const color = hex.match(/[\da-f]{2}/gi).map((v) => parseInt(v, 16));
    // Check the solid core. Rasterizers may snap/antialias the outer physical
    // pixel differently at fractional zoom; a thin-line notch reaches the core.
    for (let y = Math.ceil(top * dpr + 1); y < Math.floor(bottom * dpr - 1); y++) {
      for (let x = Math.ceil(left * dpr + 1); x < Math.floor(right * dpr - 1); x++) {
        samples++;
        const offset = (y * image.w + x) * image.c;
        const rgb = [...image.data.subarray(offset, offset + 3)];
        if (rgb.some((v, i) => Math.abs(v - color[i]) > 1)) gaps.push({ x, y, rgb });
      }
    }
  }
  expect(samples).toBeGreaterThan(1000);
  expect(gaps.slice(0, 10), `${label}: ${gaps.length} pixels interrupt a thick line`).toEqual([]);
}

for (const { name, zoom, ...options } of [
  { name: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  {
    name: "phone",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: "fractional desktop",
    viewport: { width: 1281, height: 799 },
    deviceScaleFactor: 1.25,
    zoom: 1.1,
  },
  {
    name: "scaled small phone",
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 3,
    zoom: 0.9,
  },
]) {
  test.describe(name, () => {
    test.use(options);
    test("thick lines stay continuous at thin-line intersections", async ({ page }, testInfo) => {
      await openBoard(page);
      if (zoom)
        await page.locator(".board").evaluate((el, value) => {
          el.style.zoom = value;
        }, String(zoom));
      const before = await measureBoard(page);
      await page.mouse.move(0, 0);
      await expectContinuousLines(page, testInfo, "idle");
      await cell(page, 1).click();
      await expect(page.locator(".matching-number").first()).toBeVisible();
      await expectContinuousLines(page, testInfo, "highlight");
      await cell(page, 2).click();
      await page.keyboard.press("5");
      await expect(cell(page, 2)).toHaveClass(/conflict/);
      await expectContinuousLines(page, testInfo, "selected-conflict");
      for (const i of [0, 8, 20, 50, 72, 80]) {
        await cell(page, i).click();
        await expect(cell(page, i)).toHaveClass(/selected/);
        await expectContinuousLines(page, testInfo, `selected-${i}`);
      }
      expectSameGeometry(before, await measureBoard(page));
    });

    test("candidate cues and Shift aim stay below box lines", async ({ page }, testInfo) => {
      await freezeTimers(page);
      await openBoard(page);
      if (zoom)
        await page.locator(".board").evaluate((el, value) => {
          el.style.zoom = value;
        }, String(zoom));
      await page.clock.runFor(30_000);
      await expect(page.locator(".pencil-box.cue").first()).toBeVisible();
      // Freeze the animated halo near its maximum size.
      await page.locator(".pencil-box.cue").evaluateAll((els) => {
        for (const el of els) {
          for (const animation of el.getAnimations()) {
            animation.pause();
            animation.currentTime = 300;
          }
        }
      });
      await expectContinuousLines(page, testInfo, "candidate-cue");
      if (options.viewport.width >= 600) {
        await page.keyboard.down("Shift");
        await cell(page, 2).locator('.pencil-box[data-d="2"]').hover();
        await expect(page.locator(".pencil-box.aim")).toBeVisible();
        await expectContinuousLines(page, testInfo, "shift-aim");
        await page.keyboard.up("Shift");
      }
    });
  });
}
