import { test, expect } from '@playwright/test';
import { touchDriver } from './touch.mjs';

const cell = (page, i) => page.locator(`.cell[data-i="${i}"]`);
const key = (page, d) => page.locator(`.key[data-d="${d}"]`);

// Cell 75 (row 9, col 4) is empty; its row/col/box candidates are 1379.
// 4 is illegal there (row, column and box), as are 2, 5, 6 and 8.
const EMPTY = 75;
const GIVEN_BG = 'rgb(233, 229, 220)';
const SELECTED_BG = 'rgb(211, 224, 248)';

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

test.describe('selection highlight', () => {
  const peerFree = async (page) => {
    // No row/column/box wash: every unselected, non-matching cell keeps its resting fill.
    const bgs = await page.locator('.cell:not(.selected):not(.same):not(.conflict):not(.given)').evaluateAll((els) =>
      [...new Set(els.map((el) => getComputedStyle(el).backgroundColor))]);
    expect(bgs).toEqual(['rgb(255, 255, 255)']);
    const givens = await page.locator('.cell.given:not(.selected):not(.same):not(.conflict)').evaluateAll((els) =>
      [...new Set(els.map((el) => getComputedStyle(el).backgroundColor))]);
    expect(givens).toEqual([GIVEN_BG]);
  };

  test('filled cell: ring on it, soft tint on same digits, emphasised matching candidates', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, 1)); // given 8 at r1c2
    await expect(cell(page, 1)).toHaveClass(/selected/);
    const ring = await cell(page, 1).evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).toContain('inset');
    await expect(page.locator('.cell.peer')).toHaveCount(0);
    await expect(cell(page, 21)).toHaveClass(/same/);
    const eights = await page.locator('.cell[data-value="8"]').count();
    await expect(page.locator('.cell.same')).toHaveCount(eights - 1);
    expect(await cell(page, 21).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(250, 236, 180)');
    expect(await cell(page, 1).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(SELECTED_BG);
    expect(await cell(page, 1).evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(42, 86, 198)');
    await peerFree(page);

    // Candidate 8 in r5c1 (cell 36) and elsewhere is emphasised; others are not.
    const n5 = cell(page, 36).locator('.n[data-d="8"]');
    await expect(n5).toHaveClass(/match/);
    const style = (el) => {
      const cs = getComputedStyle(el);
      return { w: cs.fontWeight, size: cs.fontSize, c: cs.color, tr: cs.transform, chip: cs.backgroundColor,
        line: cs.boxShadow, bg: getComputedStyle(el.closest('.cell')).backgroundColor };
    };
    const st = await n5.evaluate(style);
    const plain = await cell(page, 36).locator('.n.on[data-d="2"]').evaluate(style);
    expect(st.w).toBe(plain.w);
    expect(Number(st.w)).toBeLessThan(600);
    expect(st.size).toBe(plain.size);
    expect(st.tr).toBe('none');
    expect(st.c).toBe('rgb(115, 71, 10)');
    expect(st.chip).toBe('rgb(252, 239, 184)');
    expect(st.line).toContain('rgb(230, 207, 122)');
    expect(st.bg).toBe('rgb(255, 255, 255)');
    const matched = await page.locator('.n.match').evaluateAll((els) => els.map((el) => el.dataset.d));
    expect(matched.length).toBeGreaterThan(3);
    expect(new Set(matched)).toEqual(new Set(['8']));
  });

  test('given cells: warm grey fill; yellow, selection fill, conflict and flashes take precedence', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.clock.pauseAt(Date.now() + 2000);
    const t = await touchDriver(page);
    const bg = (i) => cell(page, i).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await bg(1)).toBe(GIVEN_BG);
    await expect(cell(page, 1).locator('.v')).toHaveCSS('color', 'rgb(31, 29, 26)');
    expect(await bg(EMPTY)).toBe('rgb(255, 255, 255)');

    await t.tap(cell(page, 21)); // given 8: the selected given turns blue under the blue ring
    expect(await bg(21)).toBe(SELECTED_BG);
    expect(await cell(page, 21).evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(42, 86, 198)');
    expect(await bg(1)).toBe('rgb(250, 236, 180)'); // same digit: yellow replaces grey
    expect(await bg(77)).toBe('rgb(250, 236, 180)');

    await t.tap(cell(page, 9));
    expect(await bg(9)).toBe(SELECTED_BG);
    await t.tap(key(page, 8)); // conflicts with the given 8 at cell 1
    expect(await bg(1)).toBe('rgb(251, 228, 228)');
    expect(await bg(9)).toBe('rgb(251, 228, 228)'); // conflict wins over the selection fill
    await t.tap(key(page, 8));
    expect(await bg(9)).toBe(SELECTED_BG);

    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit4'); // refused: given 4 at 79 flashes
    expect(await cell(page, 79).evaluate((el) => getComputedStyle(el).animationName)).toBe('blocked');
  });

  test('answer works like a given', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 3));
    await expect(page.locator('.cell.same')).toHaveCount(await page.locator('.cell[data-value="3"]').count() - 1);
    await expect(cell(page, EMPTY)).toHaveCSS('background-color', SELECTED_BG);
    await expect(cell(page, 0)).toHaveCSS('background-color', 'rgb(250, 236, 180)');
  });

  test('empty cell: only that cell is marked', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, EMPTY));
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY)).toHaveCSS('background-color', SELECTED_BG);
    await expect(page.locator('.cell.same, .cell.peer, .n.match')).toHaveCount(0);
    await peerFree(page);
  });

  test('selection fill sits under the refusal flash and the drag tint', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 21));
    const tint = 'color-mix(in srgb, rgb(217, 84, 30) 24%, rgb(255, 255, 255))';
    const probe = (cls) => cell(page, 21).evaluate((el, c) => {
      el.classList.add(c);
      const out = getComputedStyle(el).backgroundColor;
      el.classList.remove(c);
      return out;
    }, cls);
    const expected = await page.evaluate((c) => {
      const el = document.createElement('div');
      el.style.backgroundColor = c;
      document.body.append(el);
      const out = getComputedStyle(el).backgroundColor;
      el.remove();
      return out;
    }, tint);
    expect(await probe('blocking')).toBe(expected);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await probe('blocked')).toBe(expected);
    await expect(cell(page, 21)).toHaveCSS('background-color', SELECTED_BG);
  });
});

test('tap on key writes the answer; tapping the same key clears it', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  await t.tap(key(page, 3));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '3');
  await expect(cell(page, EMPTY)).toHaveClass(/user/);
  await t.tap(key(page, 1));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '1');
  await t.tap(key(page, 1));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('tap does not overwrite a given', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.tap(key(page, 9));
  await expect(cell(page, 0)).toHaveAttribute('data-value', '3');
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

  await t.swipeUp(key(page, 1), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '17');

  await t.swipeUp(key(page, 7), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
  await page.waitForTimeout(400);
  await expect(page.locator('.lift')).toHaveCount(0);
});

test('drag shows label, preview and arms at ~28px with hysteresis', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, EMPTY));
  const k = key(page, 3);
  const p = await t.center(k);
  await t.start(p.x, p.y);
  await t.move(p.x, p.y - 12);
  await expect(k).toHaveClass(/pressed/);
  await expect(k).toHaveClass(/show-label/);
  await expect(k.locator('.label')).toHaveText('+ candidate');
  await expect(cell(page, EMPTY).locator('.n[data-d="3"]')).toHaveClass(/preview-add/);
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
  await t.tap(key(page, 4)); // row already has a given 4 at cell 79
  await expect(cell(page, EMPTY)).toHaveClass(/conflict/);
  await expect(cell(page, 79)).toHaveClass(/conflict/);
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
  await expect(cell(page, 79)).not.toHaveClass(/conflict/);
});

test('auto notes compute from entered digits; manual starts empty', async ({ page }) => {
  const t = await touchDriver(page);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
  await t.tap(page.locator('#notes-mode'));
  await expect(page.locator('#notes-mode')).toHaveAttribute('aria-checked', 'true');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');

  // A wrong answer (1 at r9c2, solution is 6) still feeds the auto candidates.
  await t.tap(cell(page, 73));
  await t.tap(key(page, 1));
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '379');

  // Swipe toggles still work in auto mode.
  await t.tap(cell(page, EMPTY));
  await t.swipeUp(key(page, 3), 60);
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '79');

  await t.tap(page.locator('#notes-mode'));
  await expect(page.locator('#notes-mode')).toHaveAttribute('aria-checked', 'false');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
});

test.describe('single-candidate cue', () => {
  const note = (page, i, d) => cell(page, i).locator(`.n[data-d="${d}"]`);

  // Fake clock, paused, Auto notes on, global cue clock restarted at a known instant.
  // The only Auto single from the start: 55:9.
  const INITIAL = ['55:9'];
  async function frozenClock(page) {
    await page.clock.install();
    await page.goto('/');
    expect(await page.evaluate(() => window.__sudoku.cueInterval)).toBe(30000);
    await page.clock.pauseAt(Date.now() + 2000);
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await page.evaluate(() => window.__sudoku.setCueInterval(15000));
    return t;
  }
  const lit = (page) => page.evaluate(() =>
    [...document.querySelectorAll('.n.lone-flash')].map((n) => `${n.closest('.cell').dataset.i}:${n.dataset.d}`).sort());
  // Removes candidate `drop` from cell i so only `left` remains.
  async function makeSingle(page, t, i, drop, left) {
    await t.tap(cell(page, i));
    await page.keyboard.press(`Shift+Digit${drop}`);
    await expect(cell(page, i)).toHaveAttribute('data-lone', String(left));
  }
  const sorted = (a) => [...a].sort();

  test('one global clock: cells that became single at different times flash in the same frame', async ({ page }) => {
    const t = await frozenClock(page);
    await makeSingle(page, t, 5, 1, 5);
    await page.clock.runFor(6_000);
    await makeSingle(page, t, 11, 1, 9);
    await page.clock.runFor(8_900); // t = 14.9s
    expect(await lit(page)).toEqual([]);
    await page.clock.runFor(200); // t = 15.1s
    expect(await lit(page)).toEqual(sorted(['5:5', '11:9', ...INITIAL]));

    const s = await note(page, 5, 5).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, ring: cs.boxShadow, color: cs.color };
    });
    expect(s.bg).toBe('rgba(34, 197, 94, 0.2)');
    expect(s.ring).toContain('rgb(34, 197, 94)');
    expect(s.color).toBe('rgb(21, 128, 61)');
    expect(await cell(page, 55).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');

    // Becoming single mid-flash waits for the next tick.
    await makeSingle(page, t, 27, 2, 6);
    expect(await lit(page)).not.toContain('27:6');
    await page.clock.runFor(1_450); // t = 16.55s
    expect(await lit(page)).toEqual([]);
    await page.clock.runFor(13_400); // t = 29.95s
    expect(await lit(page)).toEqual([]);
    await page.clock.runFor(200);
    expect(await lit(page)).toEqual(sorted(['5:5', '11:9', '27:6', ...INITIAL]));
  });

  test('board changes never restart the clock', async ({ page }) => {
    const t = await frozenClock(page);
    await makeSingle(page, t, 5, 1, 5);
    await page.clock.runFor(10_000);
    await page.keyboard.press('Shift+Digit1');
    await expect(cell(page, 5)).toHaveAttribute('data-lone', '');
    await page.clock.runFor(2_000);
    await page.keyboard.press('Shift+Digit1');
    await expect(cell(page, 5)).toHaveAttribute('data-lone', '5');
    await page.clock.runFor(3_100); // t = 15.1s, not 12s + 15s
    expect(await lit(page)).toContain('5:5');
  });

  test('Manual mode: no cue, and none of its single notes flash', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.clock.pauseAt(Date.now() + 2000);
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit3');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '3');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-lone', '');
    for (let k = 0; k < 4; k++) {
      await page.clock.runFor(8_000);
      expect(await lit(page)).toEqual([]);
    }
    await t.tap(page.locator('#notes-mode'));
    for (let k = 0; k < 80 && (await lit(page)).length === 0; k++) await page.clock.runFor(500);
    expect(await lit(page)).toEqual(INITIAL);
    await t.tap(page.locator('#notes-mode')); // back to Manual mid-flash: cleared at once
    expect(await lit(page)).toEqual([]);
  });

  test('Manual mode: the setting is a disabled switch shown off, and keeps its saved value', async ({ page }) => {
    const t = await touchDriver(page);
    const opt = page.locator('#opt-single');
    await t.tap(page.locator('#more'));
    await expect(opt).toHaveAttribute('role', 'switch');
    await expect(opt).toBeDisabled();
    await expect(opt).not.toBeChecked(); // saved value is on, but never shown checked while disabled
    await expect(page.locator('#opt-single-hint')).toBeVisible();
    await expect(page.locator('#opt-single-hint')).toHaveText('Only available with Auto notes');
    await t.tap(opt);
    await t.tap(page.locator('#sheet-close'));

    await t.tap(page.locator('#notes-mode'));
    await t.tap(page.locator('#more'));
    await expect(opt).toBeEnabled();
    await expect(opt).toBeChecked(); // the tap while disabled changed nothing
    await expect(page.locator('#opt-single-hint')).toBeHidden();
    await t.tap(opt);
    await expect(opt).not.toBeChecked();
    await t.tap(page.locator('#sheet-close'));

    await t.tap(page.locator('#notes-mode'));
    await t.tap(page.locator('#more'));
    await expect(opt).toBeDisabled();
    await expect(opt).not.toBeChecked();
    await t.tap(page.locator('#sheet-close'));
    await t.tap(page.locator('#notes-mode'));
    await t.tap(page.locator('#more'));
    await expect(opt).toBeEnabled();
    await expect(opt).not.toBeChecked();
    await t.tap(opt);
    await expect(opt).toBeChecked();
  });

  test('interval is overridable by URL param; setting defaults on and can be turned off', async ({ page }) => {
    await page.goto('/?cueMs=1500');
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await expect(cell(page, 55)).toHaveAttribute('data-lone', '9'); // only 9 fits r7c2
    await expect(note(page, 55, 9)).toHaveClass(/lone-flash/, { timeout: 3000 });

    await t.tap(page.locator('#more'));
    const opt = page.locator('#opt-single');
    await expect(opt).toBeChecked();
    await t.tap(opt);
    await expect(opt).not.toBeChecked();
    await t.tap(page.locator('#sheet-close'));
    await expect(page.locator('.lone-flash')).toHaveCount(0);
    await page.waitForTimeout(3500);
    await expect(page.locator('.lone-flash')).toHaveCount(0);
    await expect(page.locator('.cell[data-lone="9"]')).toHaveCount(0);

    await t.tap(page.locator('#more'));
    await t.tap(opt);
    await t.tap(page.locator('#sheet-close'));
    await expect(note(page, 55, 9)).toHaveClass(/lone-flash/, { timeout: 3000 });
  });

  test('interval is overridable by test hook', async ({ page }) => {
    await page.evaluate(() => window.__sudoku.setCueInterval(500));
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await expect(note(page, 55, 9)).toHaveClass(/lone-flash/, { timeout: 1500 });
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
    const k = key(page, 9);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 40);
    await expect(k).toHaveClass(/armed/);
    await expect(page.locator('.lift')).toHaveCount(0);
    await t.end(p.x, p.y - 40);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '9');
    const tr = await cell(page, EMPTY).locator('.n[data-d="9"]').evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(tr).toBe('opacity');
  });
});

test.describe('erase in Auto notes resets the cell', () => {
  test.beforeEach(async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, EMPTY));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
  });

  test('after removing a candidate', async ({ page }) => {
    const t = await touchDriver(page);
    await t.swipeUp(key(page, 3), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
  });

  test('after restoring one candidate and removing another', async ({ page }) => {
    const t = await touchDriver(page);
    await t.swipeUp(key(page, 7), 60);
    await t.swipeUp(key(page, 1), 60);
    await t.swipeUp(key(page, 7), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '379');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '379');
  });

  test('answer first, then overrides; never blanks the cell', async ({ page }) => {
    const t = await touchDriver(page);
    await t.swipeUp(key(page, 3), 60);
    await t.tap(key(page, 4));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
  });

  test('keyboard 0 does the same reset', async ({ page }) => {
    const t = await touchDriver(page);
    await t.swipeUp(key(page, 1), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '379');
    await page.keyboard.press('0');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
  });
});

test.describe('gesture always ends cleanly', () => {
  async function expectIdle(page) {
    await expect(page.locator('.lift')).toHaveCount(0);
    await expect(page.locator('.key.pressed, .key.armed, .key.lifted, .key.show-label')).toHaveCount(0);
  }

  test('release far outside the keypad (over the board) still commits', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const p = await t.center(key(page, 1));
    await t.start(p.x, p.y);
    for (let s = 1; s <= 10; s++) await t.move(p.x, p.y - s * 30);
    await t.end(p.x, p.y - 300);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
    await expectIdle(page);
    await t.swipeUp(key(page, 3), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '13');
  });

  test('pointer capture lost mid-swipe, pointerup outside the keypad: next swipe works', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const k = key(page, 1);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 20);
    await t.move(p.x, p.y - 40);
    await expect(k).toHaveClass(/armed/);
    // What iOS Safari can do: drop capture, so the rest of the touch goes to
    // whatever is under the finger (tools row / board), not the key.
    await k.evaluate((el) => {
      for (let id = 0; id < 50; id++) if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    });
    await t.move(p.x, p.y - 120);
    await t.end(p.x, p.y - 120);
    await expectIdle(page);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');

    await t.swipeUp(key(page, 3), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '3');
    await t.tap(key(page, 4));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  });

  test('pointerup delivered only outside the keypad (no capture)', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const k = key(page, 9);
    const box = await k.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.evaluate(({ x, y }) => {
      const key = document.querySelector('.key[data-d="9"]');
      const opts = (cy) => ({ bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', isPrimary: true, clientX: x, clientY: cy });
      key.dispatchEvent(new PointerEvent('pointerdown', opts(y)));
      key.dispatchEvent(new PointerEvent('pointermove', opts(y - 40)));
      document.querySelector('#board').dispatchEvent(new PointerEvent('pointerup', opts(y - 200)));
    }, { x, y });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '9');
    await expectIdle(page);
    await t.swipeUp(key(page, 7), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '79');
  });

  test('pointercancel mid-swipe glides back, writes nothing, next swipe works', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const k = key(page, 3);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 20);
    await t.move(p.x, p.y - 45);
    await expect(k).toHaveClass(/armed/);
    await t.cancel();
    await expectIdle(page);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await t.swipeUp(key(page, 3), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '3');
  });

  test('a new press is never blocked by an unfinished gesture', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const a = await t.center(key(page, 3));
    const b = await t.center(key(page, 7));
    await t.raw('touchStart', [{ x: a.x, y: a.y, id: 1 }]);
    await t.raw('touchMove', [{ x: a.x, y: a.y - 40, id: 1 }]);
    await expect(key(page, 3)).toHaveClass(/armed/);
    await t.raw('touchStart', [{ x: a.x, y: a.y - 40, id: 1 }, { x: b.x, y: b.y, id: 2 }]);
    for (let s = 1; s <= 6; s++) {
      await t.raw('touchMove', [{ x: a.x, y: a.y - 40, id: 1 }, { x: b.x, y: b.y - s * 10, id: 2 }]);
    }
    await t.raw('touchEnd', [{ x: a.x, y: a.y - 40, id: 1 }]);
    await t.raw('touchEnd', []);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '7');
    await expectIdle(page);
  });

  test('rapid back-to-back swipes all land and leave nothing stranded', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const fast = { steps: 4, stepMs: 8, holdMs: 0 };
    for (const d of [1, 3, 7, 3, 9, 1, 1]) await t.swipeUp(key(page, d), 50, fast);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
    await expectIdle(page);
    await expect(page.locator('.n.hidden-pending')).toHaveCount(0);
    const digitsVisible = await page.locator('.key .digit').evaluateAll((els) =>
      els.every((el) => getComputedStyle(el).opacity === '1'));
    expect(digitsVisible).toBe(true);
  });

  test('sideways drag is neither a tap nor a swipe', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const p = await t.center(key(page, 3));
    await t.start(p.x, p.y);
    for (let s = 1; s <= 6; s++) await t.move(p.x + s * 8, p.y - s * 3);
    await expect(page.locator('.lift')).toHaveCount(0);
    await t.end(p.x + 48, p.y - 18);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expectIdle(page);
  });
});

test.describe('double-tap fills a single-candidate cell', () => {
  async function doubleTap(page, t, i, gap = 120) {
    await t.tap(cell(page, i), { holdMs: 40 });
    await page.waitForTimeout(gap);
    await t.tap(cell(page, i), { holdMs: 40 });
  }

  test('Manual mode: double-tap on a single-note cell only selects', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit3');
    await page.waitForTimeout(350);
    await doubleTap(page, t, EMPTY);
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '3');
  });

  test('Auto mode: fills as one undo step, selection stays immediate', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, 5));
    await expect(cell(page, 5)).toHaveClass(/selected/);
    await page.keyboard.press('Shift+Digit1'); // auto override leaves only 5
    await page.waitForTimeout(350);
    await doubleTap(page, t, 5);
    await expect(cell(page, 5)).toHaveAttribute('data-value', '5');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, 5)).toHaveAttribute('data-value', '');
    await expect(cell(page, 5)).toHaveAttribute('data-notes', '5');
  });

  test('auto notes: uses the candidates currently shown', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await doubleTap(page, t, 55);
    await expect(cell(page, 55)).toHaveAttribute('data-value', '9');
  });

  test('multi-candidate cell: double-tap only selects', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await doubleTap(page, t, EMPTY);
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
  });

  test('taps further apart than ~300ms do not fill', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await doubleTap(page, t, 55, 450);
    await expect(cell(page, 55)).toHaveAttribute('data-value', '');
  });

  test('works right after a swipe, and the board allows no double-tap zoom', async ({ page }) => {
    const t = await touchDriver(page);
    expect(await page.locator('#board').evaluate((el) => getComputedStyle(el).touchAction)).toBe('manipulation');
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, EMPTY));
    await t.swipeUp(key(page, 3), 60, { holdMs: 0 });
    await doubleTap(page, t, 55, 80);
    await expect(cell(page, 55)).toHaveAttribute('data-value', '9');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
  });
});

test.describe('timer and pause', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
  });

  test('advances, pause freezes it and blocks input, resume continues', async ({ page }) => {
    const t = await touchDriver(page);
    await expect(page.locator('#time')).toHaveText('0:00');
    await t.tap(cell(page, EMPTY));
    await page.clock.runFor(65_000);
    await expect(page.locator('#time')).toHaveText('1:05');

    await t.tap(page.locator('#pause'));
    await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#paused-cover')).toBeVisible();
    await expect(page.locator('#paused-time')).toHaveText('1:05');
    await expect(page.locator('#paused-cover button')).toHaveCount(1);
    expect(await page.locator('#paused-cover').evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    const board = await page.locator('#board').boundingBox();
    const cover = await page.locator('#paused-cover').boundingBox();
    expect(cover).toEqual(board);
    const topAtCell = await page.evaluate(() => {
      const r = document.querySelector('.cell[data-i="0"]').getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).closest('#paused-cover') !== null;
    });
    expect(topAtCell).toBe(true);

    await page.clock.runFor(30_000);
    await expect(page.locator('#time')).toHaveText('1:05');
    await t.tap(key(page, 4));
    await t.swipeUp(key(page, 4), 60);
    await page.keyboard.press('7');
    await page.keyboard.press('Shift+Digit7');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(page.locator('.lift')).toHaveCount(0);

    await t.tap(page.locator('#resume'));
    await expect(page.locator('#paused-cover')).toBeHidden();
    await page.clock.runFor(5_000);
    await expect(page.locator('#time')).toHaveText('1:10');
    await t.tap(key(page, 4));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  });

  test('shows h:mm:ss past an hour', async ({ page }) => {
    await page.clock.fastForward(3_725_000);
    await expect(page.locator('#time')).toHaveText('1:02:05');
  });

  test('pauses when the page is hidden and stays paused when visible again', async ({ page }) => {
    await page.clock.runFor(3_000);
    const setHidden = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await setHidden(true);
    await expect(page.locator('#paused-cover')).toBeVisible();
    await page.clock.runFor(10_000);
    await setHidden(false);
    await page.clock.runFor(10_000);
    await expect(page.locator('#paused-cover')).toBeVisible();
    await expect(page.locator('#time')).toHaveText('0:03');
  });
});

test.describe('undo / redo animation', () => {
  const ringOf = (page, i) => cell(page, i).evaluate((el) => {
    const cs = getComputedStyle(el, '::before');
    return { anim: cs.animationName, border: cs.borderTopColor, content: cs.content };
  });
  const lastRing = (page) => page.evaluate(() => window.__sudoku.lastRing);
  // The travelling ring's keyframes, as cell indices under its start and landing points.
  const ringPath = (page) => page.evaluate(() => {
    const ring = document.getElementById('undo-ring');
    const [anim] = ring.getAnimations();
    if (!anim) return null;
    const frames = anim.effect.getKeyframes();
    const wrap = ring.parentElement.getBoundingClientRect();
    const cellAt = (tr) => {
      const [, x, y] = tr.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).map(Number);
      const r = ring.getBoundingClientRect();
      const el = document.elementFromPoint(wrap.left + x + r.width / 2, wrap.top + y + r.height / 2)?.closest('.cell');
      return el ? Number(el.dataset.i) : -1;
    };
    return {
      from: cellAt(frames[0].transform),
      to: cellAt(frames[1].transform),
      startOpacity: Number(frames[0].opacity),
      landsAt: Math.round(frames[1].computedOffset * anim.effect.getTiming().duration),
      duration: anim.effect.getTiming().duration,
      easing: frames[0].easing,
    };
  });
  async function frozen(page) {
    await page.clock.install();
    await page.goto('/');
    await page.clock.pauseAt(Date.now() + 2000);
    return touchDriver(page);
  }

  test('the ring travels from the selection to the changed cell, then the change applies', async ({ page }) => {
    const t = await frozen(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(cell(page, 76)); // adjacent, right of EMPTY
    await t.tap(page.locator('#undo'));

    expect(await lastRing(page)).toMatchObject({ from: 76, to: EMPTY, dist: 1, travel: 300, apply: 200, rapid: false });
    expect(await ringPath(page)).toEqual({
      from: 76, to: EMPTY, startOpacity: 1, landsAt: 300, duration: 750, easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
    // Travel + 200ms: nothing applied yet, selection unchanged.
    await page.clock.runFor(490);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
    await expect(cell(page, 76)).toHaveClass(/selected/);
    await page.clock.runFor(20);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY).locator('.v')).toHaveClass(/undo-out/);
  });

  test('travel time scales with distance; a ring on the selected cell shows in place', async ({ page }) => {
    const t = await frozen(page);
    // Answers at the top-right corner (8) and at 70, a diagonal neighbour of 80, then undo them.
    await t.tap(cell(page, 8));
    await t.tap(key(page, 2));
    await t.tap(cell(page, 70));
    await t.tap(key(page, 3));
    await t.tap(cell(page, 80));
    await t.tap(page.locator('#undo')); // 80 -> 70: diagonal neighbour
    const near = await lastRing(page);
    await page.clock.runFor(2000);
    await t.tap(cell(page, 72));
    await t.tap(page.locator('#undo')); // 72 (a given) -> 8: across the board
    const far = await lastRing(page);
    expect(near).toMatchObject({ from: 80, to: 70, rapid: false });
    expect(far).toMatchObject({ from: 72, to: 8, dist: Math.hypot(8, 8), travel: 450, apply: 200, rapid: false });
    expect(near.travel).toBeGreaterThan(300);
    expect(near.travel).toBeLessThan(330);
    expect((await ringPath(page)).to).toBe(8);
    await page.clock.runFor(640);
    await expect(cell(page, 8)).toHaveAttribute('data-value', '2');
    await page.clock.runFor(20);
    await expect(cell(page, 8)).toHaveAttribute('data-value', '');
    await page.clock.runFor(2000);

    // Undoing a change on the selected cell: no travel, the ring pops in for 150ms.
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 5));
    await t.tap(page.locator('#undo'));
    expect(await lastRing(page)).toMatchObject({ from: EMPTY, to: EMPTY, dist: 0, travel: 150 });
    const path = await ringPath(page);
    expect(path).toMatchObject({ from: EMPTY, to: EMPTY, startOpacity: 0, landsAt: 150 });
    await page.clock.runFor(340);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '5');
    await page.clock.runFor(20);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  });

  test('rapid repeats run at half speed and finish the change in flight first', async ({ page }) => {
    const t = await frozen(page);
    await t.tap(cell(page, 8));
    await t.tap(key(page, 2));
    await t.tap(cell(page, 80));
    await t.tap(key(page, 1));
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(cell(page, 40));
    await t.tap(page.locator('#undo')); // 40 -> 75
    const first = await lastRing(page);
    expect(first.rapid).toBe(false);
    await page.clock.runFor(100);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');

    await t.tap(page.locator('#undo')); // while animating: 75 is applied at once
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    const second = await lastRing(page);
    const full = (d) => Math.round(300 + (150 * (d - 1)) / (Math.hypot(8, 8) - 1));
    expect(second).toMatchObject({ from: EMPTY, to: 80, rapid: true, apply: 100, fade: 125 });
    expect(second.travel).toBe(Math.round(full(second.dist) * 0.5));
    await page.clock.runFor(second.travel + second.apply + 5);
    await expect(cell(page, 80)).toHaveAttribute('data-value', '');

    // Within ~400ms of the last one finishing still counts as rapid; later does not.
    await page.clock.runFor(second.fade + 300);
    await t.tap(page.locator('#redo'));
    expect((await lastRing(page)).rapid).toBe(true);
    await page.clock.runFor(2000);
    await t.tap(page.locator('#redo'));
    expect((await lastRing(page)).rapid).toBe(false);
  });

  test('five quick undos end in the right state, five quick redos restore it', async ({ page }) => {
    const t = await frozen(page);
    const edits = [[8, 2], [80, 1], [EMPTY, 4], [44, 5], [5, 9]];
    for (const [i, d] of edits) {
      await t.tap(cell(page, i));
      await t.tap(key(page, d));
    }
    for (let k = 0; k < 5; k++) {
      await t.tap(page.locator('#undo'));
      await page.clock.runFor(60);
    }
    expect((await lastRing(page)).rapid).toBe(true);
    await page.clock.runFor(1000);
    for (const [i] of edits) await expect(cell(page, i)).toHaveAttribute('data-value', '');
    await expect(page.locator('#undo')).toBeDisabled();
    await expect(page.locator('#board')).not.toHaveClass(/quiet/);

    for (let k = 0; k < 5; k++) {
      await t.tap(page.locator('#redo'));
      await page.clock.runFor(60);
    }
    await page.clock.runFor(1000);
    for (const [i, d] of edits) await expect(cell(page, i)).toHaveAttribute('data-value', String(d));
    await expect(page.locator('#redo')).toBeDisabled();
    await expect(cell(page, 5)).toHaveClass(/selected/);
  });

  test('an edit during the travel applies the pending undo first', async ({ page }) => {
    const t = await frozen(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(page.locator('#undo'));
    await t.tap(key(page, 2)); // before the apply step
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '2');
    await t.tap(page.locator('#undo'));
    await page.clock.runFor(400);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  });

  test('restored answer and candidates animate in', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(page.locator('#erase'));
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
    await expect(cell(page, EMPTY).locator('.v')).toHaveClass(/undo-in/);

    await page.waitForTimeout(800);
    await t.tap(page.locator('#erase'));
    await t.swipeUp(key(page, 7), 60);
    await page.waitForTimeout(800);
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY).locator('.n[data-d="7"]')).toHaveClass(/undo-out/);
  });

  test('Erase-reset in Auto: undo travels to the cell and animates its restored overrides', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, EMPTY));
    await t.swipeUp(key(page, 3), 60);
    await t.swipeUp(key(page, 9), 60);
    await page.waitForTimeout(350);
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await t.tap(cell(page, 40));
    await t.tap(page.locator('#undo'));
    expect(await lastRing(page)).toMatchObject({ from: 40, to: EMPTY });
    await expect(cell(page, EMPTY).locator('.n[data-d="3"]')).toHaveClass(/undo-out/);
    await expect(cell(page, EMPTY).locator('.n[data-d="9"]')).toHaveClass(/undo-out/);
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '17');
  });

  test('reduced motion: no travel, static ring, instant change', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(cell(page, 40));
    await t.tap(page.locator('#undo'));
    expect(await cell(page, EMPTY).getAttribute('data-value')).toBe('');
    await expect(cell(page, EMPTY)).toHaveClass(/undo-target/);
    expect(await ringOf(page, EMPTY)).toEqual({ anim: 'none', border: 'rgb(217, 84, 30)', content: '""' });
    expect(await page.evaluate(() => document.getElementById('undo-ring').getAnimations().length)).toBe(0);
    await expect(page.locator('.undo-in, .undo-out')).toHaveCount(0);
  });
});

test.describe('highlights pause during undo / redo', () => {
  const TINT = 'rgb(250, 236, 180)';
  const CHIP = 'rgb(252, 239, 184)';
  // Same-digit cells as "<given|answer>:<background>" so resting fills can be told apart.
  const highlights = (page) => page.evaluate(() => ({
    same: [...new Set([...document.querySelectorAll('.cell.same:not(.conflict)')].map((el) =>
      `${el.classList.contains('given') ? 'given' : 'answer'}:${getComputedStyle(el).backgroundColor}`))].sort(),
    chips: [...new Set([...document.querySelectorAll('.n.on.match')].map((el) => getComputedStyle(el).backgroundColor))],
  }));
  const resting = (same) => same.every((s) => s === `given:${GIVEN_BG}` || s === 'answer:rgb(255, 255, 255)');
  const expectAbsent = async (page) => {
    const h = await highlights(page);
    expect(h.same.length).toBeGreaterThan(0);
    expect(resting(h.same)).toBe(true);
    expect(h.chips).toEqual(['rgba(0, 0, 0, 0)']);
  };
  const tinted = (h) => h.same.length > 0 && h.same.every((s) => s.endsWith(TINT)) && h.chips.join() === CHIP;
  const expectPresent = (page) => expect.poll(async () => tinted(await highlights(page))).toBe(true);

  // Answers 1 (cell 18) and 9 (cell 80), then erases both: each undo restores a digit
  // that has same-digit cells and matching candidates elsewhere.
  async function setup(page, reduce = false) {
    if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.goto('/');
    await page.clock.pauseAt(Date.now() + 2000);
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, 18));
    await t.tap(key(page, 1));
    await t.tap(cell(page, 80));
    await t.tap(key(page, 9));
    await t.tap(page.locator('#erase'));
    await t.tap(cell(page, 18));
    await t.tap(page.locator('#erase'));
    await page.clock.runFor(1000);
    return t;
  }

  test('absent through both steps, back with a fade once the ring ends', async ({ page }) => {
    const t = await setup(page);
    await t.tap(cell(page, 0)); // given 3: tints and chips on
    await expectPresent(page);
    await t.tap(page.locator('#undo')); // 0 -> 18: travel 315, apply at 515, ring gone at 765
    await page.clock.runFor(100); // travelling
    await expectAbsent(page);
    await expect(cell(page, 0)).toHaveCSS('background-color', SELECTED_BG); // the selection's resting fill
    await page.clock.runFor(450); // applied: 1 restored and selected
    await expect(cell(page, 18)).toHaveAttribute('data-value', '1');
    await expect(cell(page, 18)).toHaveClass(/selected/);
    await expectAbsent(page);
    await expect(cell(page, 18)).toHaveCSS('background-color', SELECTED_BG);
    await expect(cell(page, 0)).toHaveCSS('background-color', GIVEN_BG);
    await expect(cell(page, 45).locator('.v')).toHaveCSS('color', 'rgb(31, 29, 26)');
    await page.clock.runFor(250); // 800ms
    await expect(page.locator('#board')).not.toHaveClass(/quiet/);
    await expect(page.locator('#board')).toHaveClass(/hl-in/);
    const fades = await page.locator('.cell.same').evaluateAll((els) =>
      [...new Set(els.map((el) => `${el.classList.contains('given')}:${getComputedStyle(el).animationName}`))].sort());
    expect(fades.length).toBeGreaterThan(0);
    for (const f of fades) expect(['false:same-in', 'true:same-in-given']).toContain(f);
    await expectPresent(page);
  });

  test('two quick undos keep highlights off until the last ring ends', async ({ page }) => {
    const t = await setup(page);
    await t.tap(page.locator('#undo')); // in place on 18: applied at 350, done at 600
    await page.clock.runFor(400);
    await expect(cell(page, 18)).toHaveAttribute('data-value', '1');
    await t.tap(page.locator('#undo')); // still animating: half speed, 18 -> 80, done at ~430
    await page.clock.runFor(350); // 750ms after the first undo
    await expect(cell(page, 80)).toHaveAttribute('data-value', '9');
    await expect(page.locator('#board')).toHaveClass(/quiet/);
    await expectAbsent(page);
    await page.clock.runFor(200);
    await expect(page.locator('#board')).not.toHaveClass(/quiet/);
    await expectPresent(page);
  });

  test('redo behaves the same; conflict red stays visible', async ({ page }) => {
    const t = await setup(page);
    await t.tap(cell(page, 9));
    await t.tap(key(page, 8)); // conflicts with the given 8 at cell 1
    await expect(cell(page, 9)).toHaveClass(/conflict/);
    await t.tap(page.locator('#undo'));
    await page.clock.runFor(1500);
    await t.tap(page.locator('#redo')); // in place on 9: applied at 350, done at 600
    await page.clock.runFor(400);
    await expect(cell(page, 9)).toHaveAttribute('data-value', '8');
    await expectAbsent(page);
    await expect(cell(page, 1)).toHaveCSS('background-color', 'rgb(251, 228, 228)');
    await page.clock.runFor(300);
    await expectPresent(page);
  });

  test('reduced motion: suppressed during the ring, back without a fade', async ({ page }) => {
    const t = await setup(page, true);
    await t.tap(page.locator('#undo'));
    await expect(cell(page, 18)).toHaveAttribute('data-value', '1');
    await expectAbsent(page);
    await page.clock.runFor(700);
    await expect(page.locator('#board')).not.toHaveClass(/quiet|hl-in/);
    expect(tinted(await highlights(page))).toBe(true);
  });
});

test.describe('redo', () => {
  const undoBtn = (page) => page.locator('#undo');
  const redoBtn = (page) => page.locator('#redo');

  test('disabled with nothing to redo; redo after undo restores and animates', async ({ page }) => {
    const t = await touchDriver(page);
    await expect(undoBtn(page)).toBeDisabled();
    await expect(redoBtn(page)).toBeDisabled();
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(cell(page, 5));
    await page.keyboard.press('Shift+Digit1');
    await expect(redoBtn(page)).toBeDisabled();
    await t.tap(undoBtn(page));
    await t.tap(undoBtn(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(undoBtn(page)).toBeDisabled();
    await expect(redoBtn(page)).toBeEnabled();

    await t.tap(cell(page, 40));
    await t.tap(redoBtn(page));
    expect(await page.evaluate(() => window.__sudoku.lastRing)).toMatchObject({ from: 40, to: EMPTY });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY).locator('.v')).toHaveClass(/undo-in/);
    await t.tap(redoBtn(page));
    await expect(cell(page, 5)).toHaveAttribute('data-notes', '1');
    await expect(redoBtn(page)).toBeDisabled();
    await expect(undoBtn(page)).toBeEnabled();
  });

  test('a new edit clears the redo stack', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(undoBtn(page));
    await expect(redoBtn(page)).toBeEnabled();
    await t.swipeUp(key(page, 1), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
    await expect(redoBtn(page)).toBeDisabled();
    await t.tap(redoBtn(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  });
});

test.describe('illegal candidates are refused', () => {
  // 4 is illegal in EMPTY (75): given 4s at 79 (row), 3 (column) and 59 (box).
  const BLOCKERS = ['3', '59', '79'];
  const blocked = (page) => page.locator('.cell.blocked').evaluateAll((els) => els.map((el) => el.dataset.i).sort());
  async function frozen(page) {
    await page.clock.install();
    await page.goto('/');
    await page.clock.pauseAt(Date.now() + 2000);
    return touchDriver(page);
  }
  async function swipeAndWatch(page, t, d) {
    const p = await t.center(key(page, d));
    await t.start(p.x, p.y);
    for (let s = 1; s <= 6; s++) await t.move(p.x, p.y - s * 10);
    await expect(key(page, d)).toHaveClass(/armed/);
    await t.end(p.x, p.y - 60);
  }
  const expectIdle = async (page) => {
    await expect(page.locator('.lift')).toHaveCount(0);
    await expect(page.locator('.key.pressed, .key.armed, .key.lifted, .key.show-label')).toHaveCount(0);
  };

  test('Manual: a refused swipe glides back, writes nothing, adds no undo step, flashes every blocker', async ({ page }) => {
    const t = await frozen(page);
    await t.tap(cell(page, EMPTY));
    await swipeAndWatch(page, t, 4);
    expect(await blocked(page)).toEqual(BLOCKERS);
    const flash = await cell(page, 79).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, ms: cs.animationDuration, easing: cs.animationTimingFunction };
    });
    expect(flash).toEqual({ name: 'blocked', ms: '0.3s', easing: 'ease-out' });
    await expect(page.locator('.lift')).toHaveCount(1); // gliding home, not flying to the cell
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(page.locator('#undo')).toBeDisabled();
    await page.clock.runFor(320);
    expect(await blocked(page)).toEqual([]);
    await expectIdle(page);
    await expect(page.locator('.n.hidden-pending')).toHaveCount(0);

    await t.swipeUp(key(page, 3), 60); // a legal add right after still works
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '3');
  });

  test('drag-time hint: no ghost, "Not allowed" label, blockers tinted while dragging', async ({ page }) => {
    const t = await frozen(page);
    await t.tap(cell(page, EMPTY));
    const k = key(page, 4);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 15);
    await expect(k.locator('.label')).toHaveText('Not allowed');
    await expect(k.locator('.label')).toHaveCSS('color', 'rgb(217, 84, 30)');
    await expect(page.locator('.n.preview-add, .n.preview-remove')).toHaveCount(0);
    const tinted = () => page.locator('.cell.blocking').evaluateAll((els) => els.map((el) => el.dataset.i).sort());
    expect(await tinted()).toEqual(BLOCKERS);
    const tint = await cell(page, 79).evaluate((el) => getComputedStyle(el).boxShadow);
    expect(tint).toContain('inset');
    await t.move(p.x, p.y - 40); // the arm threshold can still be crossed
    await expect(k).toHaveClass(/armed/);
    await expect(k).toHaveCSS('background-color', 'rgb(236, 233, 226)'); // neutral, not blue or red-orange
    await expect.poll(() => k.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(217, 84, 30)');
    await page.clock.runFor(2000); // the tint lasts as long as the drag
    expect(await tinted()).toEqual(BLOCKERS);
    await t.end(p.x, p.y - 40);
    expect(await tinted()).toEqual([]);
    expect(await blocked(page)).toEqual(BLOCKERS); // release turns it into the flash
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(page.locator('#undo')).toBeDisabled();

    // Below the threshold it still glides back and flashes.
    await page.clock.runFor(400);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 15);
    await t.end(p.x, p.y - 15);
    expect(await blocked(page)).toEqual(BLOCKERS);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');

    // Removing is unchanged: a legal digit added, then dragged again, shows "− candidate".
    await page.clock.runFor(400);
    await t.swipeUp(key(page, 3), 60);
    const k5 = key(page, 3);
    const p5 = await t.center(k5);
    await t.start(p5.x, p5.y);
    await t.move(p5.x, p5.y - 15);
    await expect(k5.locator('.label')).toHaveText('\u2212 candidate');
    await expect(k5).toHaveCSS('background-color', 'rgb(238, 241, 247)'); // legal drags keep the pressed surface
    await expect(cell(page, EMPTY).locator('.n[data-d="3"]')).toHaveClass(/preview-remove/);
    expect(await tinted()).toEqual([]);
    await t.end(p5.x, p5.y - 15);
  });

  test('drag-time hint under reduced motion is the same static tint', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const t = await frozen(page);
    await t.tap(cell(page, EMPTY));
    const p = await t.center(key(page, 4));
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 40);
    await expect(cell(page, 79)).toHaveClass(/blocking/);
    expect(await cell(page, 79).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await t.end(p.x, p.y - 40);
    await expect(cell(page, 79)).not.toHaveClass(/blocking/);
  });

  test('Auto: a refused swipe leaves the computed candidates and history alone', async ({ page }) => {
    const t = await frozen(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, EMPTY));
    await swipeAndWatch(page, t, 4);
    expect(await blocked(page)).toEqual(BLOCKERS);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await expect(page.locator('#undo')).toBeDisabled();
    await expect(page.locator('#erase')).toBeDisabled();

    // Restoring a candidate removed earlier is a legal add.
    await page.clock.runFor(400);
    await t.swipeUp(key(page, 3), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
    await t.swipeUp(key(page, 3), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    expect(await blocked(page)).toEqual([]);
  });

  test('judged only against the board: an answer blocks, a wrong-but-legal digit does not', async ({ page }) => {
    const t = await frozen(page);
    await t.tap(cell(page, 76));
    await t.tap(key(page, 7)); // answer 7 in the row (solution is 1)
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit7');
    expect(await blocked(page)).toEqual(['76']);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await page.keyboard.press('Shift+Digit1'); // 1 is not EMPTY's solution (7), but legal
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
  });

  test('removal is always allowed; notes made illegal later are left alone', async ({ page }) => {
    const t = await frozen(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit1');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
    await t.tap(cell(page, 76));
    await t.tap(key(page, 1)); // now 1 sits in EMPTY's row
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
    await t.tap(cell(page, EMPTY));
    await t.swipeUp(key(page, 1), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    expect(await blocked(page)).toEqual([]);
    await page.keyboard.press('Shift+Digit1'); // adding it back is refused
    expect(await blocked(page)).toEqual(['76']);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
  });

  test('reduced motion: a static tint for ~300ms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const t = await frozen(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit4');
    const s = await cell(page, 79).evaluate((el) => ({ name: getComputedStyle(el).animationName, bg: getComputedStyle(el).backgroundColor }));
    expect(s.name).toBe('none');
    expect(s.bg).not.toBe('rgb(255, 255, 255)');
    await page.clock.runFor(320);
    await expect(cell(page, 79)).toHaveCSS('background-color', GIVEN_BG);
  });
});

test.describe('double-tap: highlighted digit', () => {
  async function doubleTap(page, t, i) {
    await t.tap(cell(page, i), { holdMs: 40 });
    await page.waitForTimeout(110);
    await t.tap(cell(page, i), { holdMs: 40 });
  }

  test('fills the highlighted digit on a multi-candidate cell, one undo step', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, 1)); // given 8 highlighted
    await expect(cell(page, 36).locator('.n[data-d="8"]')).toHaveClass(/match/);
    await expect(cell(page, 36)).toHaveAttribute('data-notes', '1268');
    await page.waitForTimeout(350);
    await doubleTap(page, t, 36);
    await expect(cell(page, 36)).toHaveAttribute('data-value', '8');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, 36)).toHaveAttribute('data-value', '');
    await expect(cell(page, 36)).toHaveAttribute('data-notes', '1268');
  });

  test('a highlighted digit that is not a candidate falls back to the lone candidate', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, 1)); // given 8 highlighted; r7c2 can only be 9
    await page.waitForTimeout(350);
    await doubleTap(page, t, 55);
    await expect(cell(page, 55)).toHaveAttribute('data-value', '9');
  });

  test('no highlighted digit: lone candidate fills, multi-candidate only selects', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, 7)); // empty, nothing highlighted
    await page.waitForTimeout(350);
    await doubleTap(page, t, 36);
    await expect(cell(page, 36)).toHaveAttribute('data-value', '');
    await page.waitForTimeout(350);
    await doubleTap(page, t, 55);
    await expect(cell(page, 55)).toHaveAttribute('data-value', '9');
  });

  test('Manual mode: highlighted digit does not fill', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 36));
    await page.keyboard.press('Shift+Digit1');
    await page.keyboard.press('Shift+Digit8');
    await t.tap(cell(page, 1));
    await expect(cell(page, 36).locator('.n[data-d="8"]')).toHaveClass(/match/);
    await page.waitForTimeout(350);
    await doubleTap(page, t, 36);
    await expect(cell(page, 36)).toHaveClass(/selected/);
    await expect(cell(page, 36)).toHaveAttribute('data-value', '');
  });
});

test('pause card hides the board border entirely', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(page.locator('#pause'));
  expect(await page.locator('#board').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  const r = await page.locator('#paused-cover').evaluate((el) => getComputedStyle(el).borderRadius);
  expect(r).toBe(await page.locator('#board').evaluate((el) => getComputedStyle(el).borderRadius));
});

test('emphasised-candidate colour comes from --cand-emph', async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(page.locator('#notes-mode'));
  await page.evaluate(() => document.documentElement.style.setProperty('--cand-emph', 'rgb(180, 83, 9)'));
  await t.tap(cell(page, 1));
  expect(await cell(page, 36).locator('.n[data-d="8"]').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(180, 83, 9)');
});

test.describe('Erase semantics', () => {
  const erase = (page) => page.locator('#erase');
  const autoBtn = (page) => page.locator('#notes-mode');

  test('nothing selected or a given cell: Erase is disabled and does nothing', async ({ page }) => {
    const t = await touchDriver(page);
    await expect(erase(page)).toBeDisabled();
    await t.tap(cell(page, 0));
    await expect(erase(page)).toBeDisabled();
    await t.tap(erase(page));
    await page.keyboard.press('0');
    await page.keyboard.press('Backspace');
    await expect(cell(page, 0)).toHaveAttribute('data-value', '3');
    await t.tap(autoBtn(page));
    await expect(erase(page)).toBeDisabled();
  });

  test('answer in Manual: clears only the answer, manual notes come back; second Erase clears them', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit1');
    await page.keyboard.press('Shift+Digit3');
    await t.tap(key(page, 4));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(erase(page)).toBeEnabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '13');
    await expect(erase(page)).toBeEnabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(erase(page)).toBeDisabled();
  });

  test('answer in Auto: clears only the answer, overrides come back; second Erase resets them', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(autoBtn(page));
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit3');
    await t.tap(key(page, 1));
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await expect(erase(page)).toBeDisabled();
  });

  test('Auto, empty cell: disabled without overrides, enabled with them', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(autoBtn(page));
    await t.tap(cell(page, EMPTY));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await expect(erase(page)).toBeDisabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await page.keyboard.press('Shift+Digit9');
    await expect(erase(page)).toBeEnabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await expect(erase(page)).toBeDisabled();
  });

  test('Manual, empty cell: disabled without notes, enabled with them', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await expect(erase(page)).toBeDisabled();
    await page.keyboard.press('Shift+Digit3');
    await expect(erase(page)).toBeEnabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(erase(page)).toBeDisabled();
  });

  test('erasing in Manual leaves Auto overrides intact', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(autoBtn(page));
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit1');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '379');
    await t.tap(autoBtn(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(erase(page)).toBeDisabled();
    await page.keyboard.press('Shift+Digit7');
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await t.tap(autoBtn(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '379');
  });

  test('erasing in Auto leaves Manual notes intact', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit7');
    await page.keyboard.press('Shift+Digit9');
    await t.tap(autoBtn(page));
    await expect(erase(page)).toBeDisabled();
    await page.keyboard.press('Shift+Digit3');
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await t.tap(autoBtn(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '79');
  });

  test('each Erase is one undo step and animates', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit1');
    await t.tap(key(page, 4));
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveClass(/undo-target/);
    await expect(cell(page, EMPTY).locator('.v')).toHaveClass(/undo-out/);
    await expect(cell(page, EMPTY).locator('.n[data-d="1"]')).toHaveClass(/undo-in/);
    await page.waitForTimeout(400);
    await t.tap(erase(page));
    await expect(cell(page, EMPTY).locator('.n[data-d="1"]')).toHaveClass(/undo-out/);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  });

  test('button state follows the selected cell', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 18));
    await page.keyboard.press('Shift+Digit2');
    await t.tap(cell(page, 0));
    await expect(erase(page)).toBeDisabled();
    await t.tap(cell(page, 18));
    await expect(erase(page)).toBeEnabled();
    await t.tap(cell(page, EMPTY));
    await expect(erase(page)).toBeDisabled();
  });
});

test.describe('restart puzzle', () => {
  test('asks for confirmation; Cancel keeps progress, Restart clears it', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(page.locator('#more'));
    const btn = page.locator('#opt-reset');
    expect(await btn.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await t.tap(btn);
    await expect(page.locator('#confirm-restart')).toBeVisible();
    await expect(page.locator('#confirm-title')).toHaveText('Restart puzzle?');
    await expect(page.locator('#confirm-body')).toHaveText('Your progress will be lost.');
    await t.tap(page.locator('#confirm-cancel'));
    await expect(page.locator('#confirm-restart')).toBeHidden();
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');

    await t.tap(btn);
    await t.tap(page.locator('#confirm-ok'));
    await expect(page.locator('#confirm-restart')).toBeHidden();
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(page.locator('#time')).toHaveText('0:00');
  });
});

test.describe('no double-tap zoom', () => {
  test('pinch zoom stays allowed by the viewport meta', async ({ page }) => {
    const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(meta).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
  });

  test('cells, board and keys opt out of double-tap zoom', async ({ page }) => {
    const ta = await page.evaluate(() => ({
      board: getComputedStyle(document.querySelector('#board')).touchAction,
      cell: getComputedStyle(document.querySelector('.cell')).touchAction,
      key: getComputedStyle(document.querySelector('.key')).touchAction,
      keypad: getComputedStyle(document.querySelector('#keypad')).touchAction,
    }));
    expect(ta).toEqual({ board: 'manipulation', cell: 'manipulation', key: 'none', keypad: 'none' });
  });

  test('single-finger touchend on board and keypad is cancelled; double-tap still fills; scale stays 1', async ({ page }) => {
    const t = await touchDriver(page);
    await page.evaluate(() => {
      window.__ends = [];
      addEventListener('touchend', (e) => window.__ends.push(e.defaultPrevented), false);
    });
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, 55), { holdMs: 40 });
    await page.waitForTimeout(100);
    await t.tap(cell(page, 55), { holdMs: 40 });
    await expect(cell(page, 55)).toHaveAttribute('data-value', '9');
    await t.tap(cell(page, 0)); // a given, so the key tap below writes nothing
    await t.tap(key(page, 1));
    const ends = await page.evaluate(() => window.__ends);
    // First entry is the Notes switch (not cancelled, it needs its click).
    expect(ends).toEqual([false, true, true, true, true]);
    expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
  });

  const recordEnds = (page) => page.evaluate(() => {
    window.__ends = [];
    addEventListener('touchend', (e) => window.__ends.push(e.defaultPrevented), false);
  });
  const ends = (page) => page.evaluate(() => window.__ends);
  async function doubleTap(t, loc) {
    await t.tap(loc, { holdMs: 40 });
    await loc.page().waitForTimeout(90);
    await t.tap(loc, { holdMs: 40 });
  }

  test('every control and the page itself opt into touch-action: manipulation, disabled ones too', async ({ page }) => {
    const ta = await page.evaluate(() => Object.fromEntries(
      ['html', 'body', '#pause', '#undo', '#redo', '#erase', '#notes-mode', '#more', '#opt-single', '#opt-reset', '#sheet-close', '#confirm-ok']
        .map((s) => [s, getComputedStyle(document.querySelector(s)).touchAction])));
    for (const [sel, v] of Object.entries(ta)) expect(v, sel).toBe('manipulation');
    await expect(page.locator('#redo')).toBeDisabled();
    expect(await page.locator('#redo').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  });

  test('double-tap on disabled Undo, Redo and Erase is cancelled, does nothing, and never zooms', async ({ page }) => {
    const t = await touchDriver(page);
    await recordEnds(page);
    for (const id of ['#undo', '#redo', '#erase']) {
      await expect(page.locator(id)).toBeDisabled();
      // The touch lands on the toolbar, not the disabled button.
      const hit = await page.locator(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).closest('.tools') !== null;
      });
      expect(hit).toBe(true);
      await doubleTap(t, page.locator(id));
      await page.waitForTimeout(400);
    }
    expect(await ends(page)).toEqual([false, true, false, true, false, true]);
    expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('double-tap on an enabled Undo is cancelled too, and both presses still undo', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(key(page, 4));
    await page.waitForTimeout(400);
    await recordEnds(page);
    await doubleTap(t, page.locator('#undo'));
    expect(await ends(page)).toEqual([false, true]);
    await expect(page.locator('#undo')).toBeDisabled();
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
  });

  test('top bar, settings sheet and restart dialog: quick second taps are cancelled', async ({ page }) => {
    const t = await touchDriver(page);
    await recordEnds(page);
    await doubleTap(t, page.locator('.top h1, .top .title').first());
    await page.waitForTimeout(400);
    await t.tap(page.locator('#more'));
    await page.waitForTimeout(400);
    await doubleTap(t, page.locator('#opt-single')); // disabled in Manual mode
    await page.waitForTimeout(400);
    await doubleTap(t, page.locator('#opt-reset'));
    await expect(page.locator('#confirm-restart')).toBeVisible();
    expect(await ends(page)).toEqual([false, true, false, false, true, false, true]);
    expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
  });
});
