import { test, expect } from '@playwright/test';
import { touchDriver } from './touch.mjs';

const cell = (page, i) => page.locator(`.cell[data-i="${i}"]`);
const key = (page, d) => page.locator(`.key[data-d="${d}"]`);

// Cell 2 (row 1, col 3) is empty; its row/col/box candidates are 1, 2, 4.
const EMPTY = 2;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('board fits a 390px-wide screen', async ({ page }) => {
  const box = await page.locator('#board').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const pad = await page.locator('#keypad').boundingBox();
  expect(pad.y + pad.height).toBeLessThanOrEqual(844);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(390);
});

test('tap selects a cell and highlights row, column, box and same digit', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0)); // given 5 at r1c1
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expect(cell(page, 8)).toHaveClass(/peer/); // same row
  await expect(cell(page, 72)).toHaveClass(/peer/); // same column
  await expect(cell(page, 20)).toHaveClass(/peer/); // same box
  await expect(cell(page, 40)).not.toHaveClass(/peer/);
  await expect(cell(page, 14)).toHaveClass(/same/); // given 5 at r2c6
  const sameCount = await page.locator('.cell.same').count();
  const fives = await page.locator('.cell[data-value="5"]').count();
  expect(sameCount).toBe(fives - 1);
});

test('tap on key writes the answer; tapping the same key clears it', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.tap(key(page, 4));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  await expect(cell(page, EMPTY)).toHaveClass(/user/);
  await t.tap(key(page, 2));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '2');
  await t.tap(key(page, 2));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('tap does not overwrite a given', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.tap(key(page, 9));
  await expect(cell(page, 0)).toHaveAttribute('data-value', '5');
});

test('swipe up past threshold adds a candidate; swiping again removes it', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.swipeUp(key(page, 7), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '7');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  await expect(cell(page, EMPTY).locator('.n[data-d="7"]')).toHaveClass(/\bon\b/);
  await page.waitForTimeout(400);
  await expect(cell(page, EMPTY).locator('.n[data-d="7"]')).not.toHaveClass(/hidden-pending/);

  await t.swipeUp(key(page, 3), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '37');

  await t.swipeUp(key(page, 7), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '3');
  await page.waitForTimeout(400);
  await expect(page.locator('.lift')).toHaveCount(0);
});

test('drag shows label, preview and arms at ~28px with hysteresis', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  const k = key(page, 5);
  const p = await t.center(k);
  await t.start(p.x, p.y);
  await t.move(p.x, p.y - 12);
  await expect(k).toHaveClass(/pressed/);
  await expect(k).toHaveClass(/show-label/);
  await expect(k.locator('.label')).toHaveText('+ candidate');
  await expect(cell(page, EMPTY).locator('.n[data-d="5"]')).toHaveClass(/preview-add/);
  await expect(k).not.toHaveClass(/armed/);
  await expect(page.locator('.lift')).toHaveCount(1);

  await t.move(p.x, p.y - 30);
  await expect(k).toHaveClass(/armed/);
  await t.move(p.x, p.y - 24); // between disarm and arm: stays armed
  await expect(k).toHaveClass(/armed/);
  await t.move(p.x, p.y - 20); // below 22px: disarms
  await expect(k).not.toHaveClass(/armed/);
  await t.end(p.x, p.y - 20);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
});

test('remove label is shown in red mode when the candidate exists', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.swipeUp(key(page, 1), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
  await page.waitForTimeout(350);
  const k = key(page, 1);
  const p = await t.center(k);
  await t.start(p.x, p.y);
  await t.move(p.x, p.y - 15);
  await expect(k.locator('.label')).toHaveText('\u2212 candidate');
  await expect(k).toHaveClass(/remove/);
  await expect(cell(page, EMPTY).locator('.n[data-d="1"]')).toHaveClass(/preview-remove/);
  const color = await k.locator('.label').evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(214, 59, 59)');
  await t.end(p.x, p.y - 15);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
});

test('sub-threshold release writes nothing', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.swipeUp(key(page, 6), 18);
  await page.waitForTimeout(350);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  await expect(page.locator('.lift')).toHaveCount(0);
  await expect(key(page, 6)).not.toHaveClass(/lifted|armed|pressed/);
});

test('long press without movement is not a tap', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.tap(key(page, 4), { holdMs: 650 });
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('conflicting digits turn red with a steady dot', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.tap(key(page, 5)); // row already has a given 5 at cell 0
  await expect(cell(page, EMPTY)).toHaveClass(/conflict/);
  await expect(cell(page, 0)).toHaveClass(/conflict/);
  const color = await cell(page, EMPTY).locator('.v').evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(214, 59, 59)');
  const dot = await cell(page, EMPTY).evaluate((el) => {
    const s = getComputedStyle(el, '::after');
    return { content: s.content, anim: s.animationName };
  });
  expect(dot.content).toBe('""');
  expect(dot.anim).toBe('none');

  // A wrong-but-legal digit is never marked.
  await t.tap(key(page, 1));
  await expect(cell(page, EMPTY)).not.toHaveClass(/conflict/);
  await expect(cell(page, 0)).not.toHaveClass(/conflict/);
});

test('auto notes compute from entered digits; manual starts empty', async ({ page }) => {
  const t = await touchDriver(page);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
  await t.tap(page.locator('#notes-mode'));
  await expect(page.locator('#notes-mode')).toHaveAttribute('aria-checked', 'true');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');

  // A wrong answer (1 at r1c4, solution is 6) still feeds the auto candidates.
  await t.tap(cell(page, 3));
  await t.tap(key(page, 1));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '24');

  // Swipe toggles still work in auto mode.
  await t.tap(cell(page, EMPTY));
  await t.swipeUp(key(page, 2), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '4');

  await t.tap(page.locator('#notes-mode'));
  await expect(page.locator('#notes-mode')).toHaveAttribute('aria-checked', 'false');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
});

test.describe('single-candidate cue', () => {
  const note = (page, i, d) => cell(page, i).locator(`.n[data-d="${d}"]`);

  test('lone candidate flashes after 15s for 1.5s, every 15s; no cell tint', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit4');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-lone', '4');
    const bgBefore = await cell(page, EMPTY).evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.clock.runFor(14_900);
    await expect(note(page, EMPTY, 4)).not.toHaveClass(/lone-flash/);
    await page.clock.runFor(200);
    await expect(note(page, EMPTY, 4)).toHaveClass(/lone-flash/);
    const s = await note(page, EMPTY, 4).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, ring: cs.boxShadow, color: cs.color };
    });
    expect(s.bg).toBe('rgba(34, 197, 94, 0.2)');
    expect(s.ring).toContain('rgb(34, 197, 94)');
    expect(s.color).toBe('rgb(21, 128, 61)');
    expect(await cell(page, EMPTY).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(bgBefore);

    await page.clock.runFor(1_450);
    await expect(note(page, EMPTY, 4)).not.toHaveClass(/lone-flash/);
    await page.clock.runFor(13_400);
    await expect(note(page, EMPTY, 4)).not.toHaveClass(/lone-flash/);
    await page.clock.runFor(200);
    await expect(note(page, EMPTY, 4)).toHaveClass(/lone-flash/);
  });

  test('cycle restarts when the cell stops and starts being single', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit4');
    await page.clock.runFor(10_000);
    await page.keyboard.press('Shift+Digit2');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-lone', '');
    await page.clock.runFor(2_000);
    await page.keyboard.press('Shift+Digit2');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-lone', '4');
    await page.clock.runFor(14_000);
    await expect(page.locator('.lone-flash')).toHaveCount(0);
    await page.clock.runFor(1_100);
    await expect(note(page, EMPTY, 4)).toHaveClass(/lone-flash/);
  });

  test('interval is overridable by URL param; setting defaults on and can be turned off', async ({ page }) => {
    await page.goto('/?cueMs=1500');
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await expect(cell(page, 40)).toHaveAttribute('data-lone', '5'); // only 5 fits r5c5
    await expect(note(page, 40, 5)).toHaveClass(/lone-flash/, { timeout: 3000 });

    await t.tap(page.locator('#more'));
    const opt = page.locator('#opt-single');
    await expect(opt).toBeChecked();
    await t.tap(opt);
    await expect(opt).not.toBeChecked();
    await t.tap(page.locator('#sheet-close'));
    await expect(page.locator('.lone-flash')).toHaveCount(0);
    await page.waitForTimeout(3500);
    await expect(page.locator('.lone-flash')).toHaveCount(0);
    await expect(page.locator('.cell[data-lone="5"]')).toHaveCount(0);

    await t.tap(page.locator('#more'));
    await t.tap(opt);
    await t.tap(page.locator('#sheet-close'));
    await expect(note(page, 40, 5)).toHaveClass(/lone-flash/, { timeout: 3000 });
  });

  test('interval is overridable by test hook', async ({ page }) => {
    await page.evaluate(() => window.__sudoku.setCueInterval(500));
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit1');
    await expect(note(page, EMPTY, 1)).toHaveClass(/lone-flash/, { timeout: 1500 });
  });
});

test('below-threshold release glides straight back with no overshoot', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  const k = key(page, 6);
  const p = await t.center(k);
  const home = await k.locator('.digit').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  await t.start(p.x, p.y);
  for (let s = 1; s <= 6; s++) await t.move(p.x, p.y - s * 3.5);
  await expect(page.locator('.lift')).toHaveCount(1);
  await page.evaluate(() => {
    window.__samples = [];
    const lift = document.querySelector('.lift');
    const tick = () => {
      if (!lift.isConnected) return;
      const r = lift.getBoundingClientRect();
      window.__samples.push(r.top + r.height / 2);
      requestAnimationFrame(tick);
    };
    tick();
  });
  await t.end(p.x, p.y - 21);
  await expect(page.locator('.lift')).toHaveCount(0);
  const ys = await page.evaluate(() => window.__samples);
  expect(ys.length).toBeGreaterThan(5);
  expect(ys[0]).toBeLessThan(home - 10);
  for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 0.01);
  expect(Math.max(...ys)).toBeLessThanOrEqual(home + 0.5);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
});

test('undo reverts answers and candidates', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.tap(key(page, 4));
  await t.tap(key(page, 4));
  await t.swipeUp(key(page, 9), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '9');
  await t.tap(page.locator('#undo'));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
  await t.tap(page.locator('#undo'));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  await t.tap(page.locator('#undo'));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('erase clears the answer, then the notes', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.swipeUp(key(page, 1), 60);
  await page.waitForTimeout(300);
  await t.tap(key(page, 4));
  await t.tap(page.locator('#erase'));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
  await t.tap(page.locator('#erase'));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
});

test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('no flying digit; candidate still toggles', async ({ page }) => {
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const k = key(page, 8);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 40);
    await expect(k).toHaveClass(/armed/);
    await expect(page.locator('.lift')).toHaveCount(0);
    await t.end(p.x, p.y - 40);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '8');
    const tr = await cell(page, EMPTY).locator('.n[data-d="8"]').evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(tr).toBe('opacity');
  });
});
