import { expect, test } from "@playwright/test";

function cell(page, r, c) {
  return page.locator(`.cell[data-r="${r}"][data-c="${c}"]`);
}

async function select(page, r, c) {
  await cell(page, r, c).click();
}

async function keyBox(page, digit) {
  const key = page.locator(`.key[data-digit="${digit}"]`);
  const box = await key.boundingBox();
  if (!box) throw new Error(`missing key ${digit}`);
  return {
    key,
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function swipeUp(page, digit, pixels) {
  const { x, y } = await keyBox(page, digit);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - pixels, { steps: 12 });
  await page.mouse.up();
}

test.describe("mobile sudoku input", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("the board fits a 390px screen", async ({ page }) => {
    const fit = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      inner: window.innerHeight,
      board: document.querySelector(".board").getBoundingClientRect().width,
    }));
    expect(fit.inner).toBe(844);
    expect(fit.board).toBeLessThanOrEqual(390);
    expect(fit.board).toBeGreaterThan(300);
    expect(fit.scroll).toBeLessThanOrEqual(fit.inner + 1);
  });

  test("tap writes an answer and the same key clears it", async ({ page }) => {
    await select(page, 0, 2);
    const target = cell(page, 0, 2);
    await expect(target).toHaveAttribute("data-selected", "true");

    const { key, x, y } = await keyBox(page, 4);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(560);
    await page.mouse.up();
    await expect(target).toHaveAttribute("data-value", "0");

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 5, { steps: 3 });
    await page.mouse.up();
    await expect(target).toHaveAttribute("data-value", "4");

    await key.click();
    await expect(target).toHaveAttribute("data-value", "0");
    await key.click();
    await expect(target).toHaveAttribute("data-value", "4");

    await select(page, 0, 0);
    await page.locator('.key[data-digit="9"]').click();
    await expect(cell(page, 0, 0)).toHaveAttribute("data-value", "5");
    await expect(cell(page, 0, 0)).toHaveAttribute("data-given", "true");

    await select(page, 0, 2);
    await page.locator("#erase").click();
    await expect(target).toHaveAttribute("data-value", "0");
    await page.locator("#undo").click();
    await expect(target).toHaveAttribute("data-value", "4");
  });

  test("swipe up past the threshold toggles a candidate", async ({ page }) => {
    await page.locator("#mode").click();
    await expect(page.locator("#mode")).toHaveAttribute("data-mode", "manual");
    await select(page, 1, 1);
    const target = cell(page, 1, 1);
    await expect(target).toHaveAttribute("data-candidates", "");

    const { key, x, y } = await keyBox(page, 7);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 48, { steps: 12 });
    await expect(key).toHaveClass(/armed/);
    await expect(key.locator(".label")).toHaveText("+ candidate");
    await expect(target.locator('.note[data-d="7"]')).toHaveClass(/\bpreview\b/);
    const previewClass = await target.locator('.note[data-d="7"]').getAttribute("class");
    expect(previewClass?.split(/\s+/)).not.toContain("preview-remove");
    await page.mouse.up();
    await expect(target).toHaveAttribute("data-candidates", "7");
    await expect(target).toHaveAttribute("data-value", "0");

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 48, { steps: 12 });
    await expect(key.locator(".label")).toHaveText("- candidate");
    await expect(key).toHaveClass(/remove/);
    await expect(target.locator('.note[data-d="7"]')).toHaveClass(/preview-remove/);
    await page.mouse.up();
    await expect(target).toHaveAttribute("data-candidates", "");
  });

  test("a sub-threshold swipe writes nothing, including after arming then disarming", async ({ page }) => {
    await page.addInitScript(() => {
      const original = Element.prototype.animate;
      window.__animations = [];
      Element.prototype.animate = function animate(keyframes, options) {
        window.__animations.push({
          className: this.className,
          keyframes,
          easing: options && options.easing,
        });
        return original.call(this, keyframes, options);
      };
    });
    await page.reload();
    await page.locator("#mode").click();
    await select(page, 1, 1);
    const target = cell(page, 1, 1);
    const { key, x, y } = await keyBox(page, 3);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 16, { steps: 8 });
    await expect(key).not.toHaveClass(/\barmed\b/);
    await page.mouse.up();
    await expect(target).toHaveAttribute("data-candidates", "");
    await expect(target).toHaveAttribute("data-value", "0");

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 48, { steps: 10 });
    await expect(key).toHaveClass(/armed/);
    await page.mouse.move(x, y - 16, { steps: 8 });
    await expect(key).not.toHaveClass(/\barmed\b/);
    await page.mouse.up();
    await expect(target).toHaveAttribute("data-candidates", "");
    await expect(target).toHaveAttribute("data-value", "0");

    const glides = await page.evaluate(() => window.__animations.filter((item) => String(item.className).includes("ghost")));
    expect(glides.length).toBeGreaterThan(0);
    for (const glide of glides) {
      expect(glide.easing).toBe("ease-out");
      expect(glide.keyframes).toHaveLength(2);
      expect(glide.keyframes[1].transform).toBe("translate(-50%, -50%) translate(0px, 0px)");
    }
  });

  test("duplicates turn red with a steady dot and a unique wrong digit does not", async ({ page }) => {
    await select(page, 0, 2);
    await page.locator('.key[data-digit="1"]').click();
    const entered = cell(page, 0, 2);
    await expect(entered).toHaveAttribute("data-value", "1");
    await expect(entered).toHaveAttribute("data-conflict", "false");
    const quiet = await entered.locator(".value").evaluate((el) => getComputedStyle(el).color);
    expect(quiet).toBe("rgb(29, 78, 137)");

    await page.locator('.key[data-digit="5"]').click();
    await expect(entered).toHaveAttribute("data-conflict", "true");
    await expect(cell(page, 0, 0)).toHaveAttribute("data-conflict", "true");
    await expect(cell(page, 1, 5)).toHaveAttribute("data-conflict", "false");
    await expect(cell(page, 0, 3)).toHaveAttribute("data-conflict", "false");

    const color = await entered.locator(".value").evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(220, 38, 38)");
    const dot = entered.locator(".dot");
    await expect(dot).toBeVisible();
    const animation = await dot.evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe("none");
  });

  test("auto notes are computed from entries and manual notes start empty", async ({ page }) => {
    const corner = cell(page, 0, 2);
    await expect(corner).toHaveAttribute("data-candidates", "1,2,4");
    await expect(cell(page, 4, 4)).toHaveAttribute("data-candidates", "5");
    await expect(page.locator("#mode")).toHaveAttribute("data-mode", "auto");

    await page.locator("#mode").click();
    await expect(page.locator("#mode")).toHaveAttribute("data-mode", "manual");
    await expect(corner).toHaveAttribute("data-candidates", "");
    await expect(cell(page, 4, 4)).toHaveAttribute("data-candidates", "");

    await select(page, 0, 2);
    await swipeUp(page, 7, 48);
    await expect(corner).toHaveAttribute("data-candidates", "7");

    await page.locator("#mode").click();
    await expect(corner).toHaveAttribute("data-candidates", "1,2,4");

    await select(page, 0, 2);
    await page.locator('.key[data-digit="5"]').click();
    await expect(cell(page, 0, 3)).toHaveAttribute("data-candidates", "2,6");
    await expect(corner).toHaveAttribute("data-conflict", "true");
  });

  test("selecting highlights the row, column, box, and matching digits", async ({ page }) => {
    await select(page, 0, 0);
    await expect(cell(page, 0, 0)).toHaveAttribute("data-selected", "true");
    await expect(cell(page, 0, 1)).toHaveAttribute("data-peer", "true");
    await expect(cell(page, 1, 0)).toHaveAttribute("data-peer", "true");
    await expect(cell(page, 2, 2)).toHaveAttribute("data-peer", "true");
    await expect(cell(page, 2, 2)).toHaveAttribute("data-same", "false");
    await expect(cell(page, 4, 4)).toHaveAttribute("data-peer", "false");
    await expect(cell(page, 1, 5)).toHaveAttribute("data-same", "true");
    await expect(cell(page, 1, 5)).toHaveAttribute("data-peer", "false");
    await expect(cell(page, 7, 8)).toHaveAttribute("data-same", "true");
  });

  test("keyboard arrows, digits, shift+digit, clear, and undo", async ({ page }) => {
    await select(page, 0, 2);
    await page.keyboard.press("4");
    await expect(cell(page, 0, 2)).toHaveAttribute("data-value", "4");

    await page.keyboard.press("ArrowRight");
    await expect(cell(page, 0, 3)).toHaveAttribute("data-selected", "true");
    await expect(cell(page, 0, 3)).toHaveAttribute("data-candidates", "2,6");
    await page.keyboard.press("Shift+Digit9");
    await expect(cell(page, 0, 3)).toHaveAttribute("data-candidates", "2,6,9");
    await page.keyboard.press("Shift+Digit9");
    await expect(cell(page, 0, 3)).toHaveAttribute("data-candidates", "2,6");
    await page.keyboard.press("Control+z");
    await expect(cell(page, 0, 3)).toHaveAttribute("data-candidates", "2,6,9");

    await page.keyboard.press("ArrowLeft");
    await expect(cell(page, 0, 2)).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("Backspace");
    await expect(cell(page, 0, 2)).toHaveAttribute("data-value", "0");
    await page.keyboard.press("1");
    await page.keyboard.press("0");
    await expect(cell(page, 0, 2)).toHaveAttribute("data-value", "0");
    await page.keyboard.press("8");
    await cell(page, 0, 2).click({ button: "right" });
    await expect(cell(page, 0, 2)).toHaveAttribute("data-value", "0");
    await page.keyboard.press("2");
    await page.keyboard.press("Meta+z");
    await expect(cell(page, 0, 2)).toHaveAttribute("data-value", "0");

    await select(page, 0, 0);
    await page.keyboard.press("9");
    await expect(cell(page, 0, 0)).toHaveAttribute("data-value", "5");
    await page.keyboard.press("ArrowLeft");
    await expect(cell(page, 0, 0)).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(cell(page, 0, 0)).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(cell(page, 1, 0)).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("Shift+Digit4");
    await expect(cell(page, 1, 0)).toHaveAttribute("data-value", "6");
  });

  test("reduced motion still toggles a candidate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.locator("#mode").click();
    await select(page, 8, 0);
    await swipeUp(page, 9, 56);
    await expect(cell(page, 8, 0)).toHaveAttribute("data-candidates", "9");
    await swipeUp(page, 9, 56);
    await expect(cell(page, 8, 0)).toHaveAttribute("data-candidates", "");
  });
});

test("single-candidate cue defaults to a 15s repeating flash on the digit", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-cue-interval", "15000");
  await expect(page.locator("html")).toHaveAttribute("data-cue-flash", "1500");
  await expect(page.locator("html")).toHaveAttribute("data-cue-enabled", "true");
  await expect(page.locator("#cue-toggle")).toBeChecked();
  const center = cell(page, 4, 4);
  const digit = center.locator('.note[data-d="5"]');
  await expect(center).toHaveAttribute("data-single", "true");
  await expect(center).toHaveAttribute("data-cue", "false");
  await expect(digit).not.toHaveClass(/\bcue\b/);
  await page.waitForTimeout(400);
  await expect(center).toHaveAttribute("data-cue", "false");
  await expect(center).not.toHaveClass(/\bcue\b/);
});

test("single-candidate cue flashes the lone digit, then repeats, and the setting can turn it off", async ({ page }) => {
  test.setTimeout(20000);
  await page.goto("/?cueInterval=2000");
  await expect(page.locator("html")).toHaveAttribute("data-cue-interval", "2000");
  const center = cell(page, 4, 4);
  const digit = center.locator('.note[data-d="5"]');
  await expect(digit).not.toHaveClass(/\bcue\b/);

  await expect(digit).toHaveClass(/\bcue\b/, { timeout: 3000 });
  await expect(center).toHaveAttribute("data-cue", "true");
  await expect(center).not.toHaveClass(/\bcue\b/);
  await expect(center.locator(".note.cue")).toHaveCount(1);

  const look = await digit.evaluate((el) => {
    const style = getComputedStyle(el);
    const cellStyle = getComputedStyle(el.closest(".cell"));
    return {
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
      animation: style.animationName,
      shadow: style.boxShadow,
      cellBackground: cellStyle.backgroundColor,
    };
  });
  expect(look.background).toBe("rgba(34, 197, 94, 0.2)");
  expect(look.borderWidth).toBe("2px");
  expect(look.borderColor).toBe("rgb(34, 197, 94)");
  expect(look.animation).toBe("pulse-glow");
  expect(look.shadow).not.toBe("none");
  expect(look.cellBackground).toBe("rgb(255, 253, 248)");

  await expect(digit).not.toHaveClass(/\bcue\b/, { timeout: 2500 });
  await expect(center).toHaveAttribute("data-cue", "false");
  await expect(digit).toHaveClass(/\bcue\b/, { timeout: 2500 });

  await page.locator("#more").click();
  await page.locator("#cue-toggle").evaluate((el) => {
    el.checked = false;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#cue-toggle")).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-cue-enabled", "false");
  await expect(digit).not.toHaveClass(/\bcue\b/);
  await page.waitForTimeout(2300);
  await expect(digit).not.toHaveClass(/\bcue\b/);

  await page.locator("#cue-toggle").evaluate((el) => {
    el.checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#cue-toggle")).toBeChecked();
  await expect(digit).not.toHaveClass(/\bcue\b/);
  await expect(digit).toHaveClass(/\bcue\b/, { timeout: 3000 });

  await page.keyboard.press("Escape");
  await select(page, 4, 1);
  await page.keyboard.press("5");
  await expect(center).toHaveAttribute("data-single", "false");
  await expect(digit).not.toHaveClass(/\bcue\b/);
  await expect(center).toHaveAttribute("data-cue", "false");
});
