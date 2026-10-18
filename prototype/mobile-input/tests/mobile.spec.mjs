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

  // Fake clock, paused, Auto notes on, global cue clock restarted at a known instant.
  // Auto singles from the start: 40:5, 59:7, 62:4, 70:3.
  const INITIAL = ['40:5', '59:7', '62:4', '70:3'];
  async function frozenClock(page) {
    await page.clock.install();
    await page.goto('/');
    expect(await page.evaluate(() => window.__sudoku.cueInterval)).toBe(15000);
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
    await makeSingle(page, t, 18, 1, 2);
    await page.clock.runFor(6_000);
    await makeSingle(page, t, 21, 2, 3);
    await page.clock.runFor(8_900); // t = 14.9s
    expect(await lit(page)).toEqual([]);
    await page.clock.runFor(200); // t = 15.1s
    expect(await lit(page)).toEqual(sorted(['18:2', '21:3', ...INITIAL]));

    const s = await note(page, 18, 2).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, ring: cs.boxShadow, color: cs.color };
    });
    expect(s.bg).toBe('rgba(34, 197, 94, 0.2)');
    expect(s.ring).toContain('rgb(34, 197, 94)');
    expect(s.color).toBe('rgb(21, 128, 61)');
    expect(await cell(page, 40).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');

    // Becoming single mid-flash waits for the next tick.
    await makeSingle(page, t, 3, 6, 2);
    expect(await lit(page)).not.toContain('3:2');
    await page.clock.runFor(1_450); // t = 16.55s
    expect(await lit(page)).toEqual([]);
    await page.clock.runFor(13_400); // t = 29.95s
    expect(await lit(page)).toEqual([]);
    await page.clock.runFor(200);
    expect(await lit(page)).toEqual(sorted(['18:2', '21:3', '3:2', ...INITIAL]));
  });

  test('board changes never restart the clock', async ({ page }) => {
    const t = await frozenClock(page);
    await makeSingle(page, t, 18, 1, 2);
    await page.clock.runFor(10_000);
    await page.keyboard.press('Shift+Digit1');
    await expect(cell(page, 18)).toHaveAttribute('data-lone', '');
    await page.clock.runFor(2_000);
    await page.keyboard.press('Shift+Digit1');
    await expect(cell(page, 18)).toHaveAttribute('data-lone', '2');
    await page.clock.runFor(3_100); // t = 15.1s, not 12s + 15s
    expect(await lit(page)).toContain('18:2');
  });

  test('Manual mode: no cue, and none of its single notes flash', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.clock.pauseAt(Date.now() + 2000);
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit4');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '4');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-lone', '');
    for (let k = 0; k < 4; k++) {
      await page.clock.runFor(8_000);
      expect(await lit(page)).toEqual([]);
    }
    await t.tap(page.locator('#notes-mode'));
    for (let k = 0; k < 40 && (await lit(page)).length === 0; k++) await page.clock.runFor(500);
    expect(await lit(page)).toEqual(INITIAL);
    await t.tap(page.locator('#notes-mode')); // back to Manual mid-flash: cleared at once
    expect(await lit(page)).toEqual([]);
  });

  test('Manual mode: the setting is greyed out with a hint, and keeps its value', async ({ page }) => {
    const t = await touchDriver(page);
    const opt = page.locator('#opt-single');
    await t.tap(page.locator('#more'));
    await expect(opt).toBeDisabled();
    await expect(opt).toBeChecked();
    await expect(page.locator('#opt-single-hint')).toBeVisible();
    await expect(page.locator('#opt-single-hint')).toHaveText('Only works with Auto notes');
    expect(await page.locator('#opt-single-row').evaluate((el) => getComputedStyle(el).opacity)).toBe('0.55');
    await t.tap(page.locator('#sheet-close'));

    await t.tap(page.locator('#notes-mode'));
    await t.tap(page.locator('#more'));
    await expect(opt).toBeEnabled();
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
    await t.tap(page.locator('#notes-mode'));
    await expect(note(page, 40, 5)).toHaveClass(/lone-flash/, { timeout: 1500 });
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

test.describe('erase in Auto notes resets the cell', () => {
  test.beforeEach(async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, EMPTY));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
  });

  test('after removing a candidate', async ({ page }) => {
    const t = await touchDriver(page);
    await t.swipeUp(key(page, 2), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '14');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '14');
  });

  test('after adding a candidate', async ({ page }) => {
    const t = await touchDriver(page);
    await t.swipeUp(key(page, 7), 60);
    await t.swipeUp(key(page, 4), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '127');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '127');
  });

  test('answer first, then overrides; never blanks the cell', async ({ page }) => {
    const t = await touchDriver(page);
    await t.swipeUp(key(page, 2), 60);
    await t.tap(key(page, 4));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '14');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
  });

  test('keyboard 0 does the same reset', async ({ page }) => {
    const t = await touchDriver(page);
    await t.swipeUp(key(page, 1), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '24');
    await page.keyboard.press('0');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
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
    const p = await t.center(key(page, 3));
    await t.start(p.x, p.y);
    for (let s = 1; s <= 10; s++) await t.move(p.x, p.y - s * 30);
    await t.end(p.x, p.y - 300);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '3');
    await expectIdle(page);
    await t.swipeUp(key(page, 5), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '35');
  });

  test('pointer capture lost mid-swipe, pointerup outside the keypad: next swipe works', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const k = key(page, 3);
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

    await t.swipeUp(key(page, 5), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '5');
    await t.tap(key(page, 4));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  });

  test('pointerup delivered only outside the keypad (no capture)', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const k = key(page, 8);
    const box = await k.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.evaluate(({ x, y }) => {
      const key = document.querySelector('.key[data-d="8"]');
      const opts = (cy) => ({ bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', isPrimary: true, clientX: x, clientY: cy });
      key.dispatchEvent(new PointerEvent('pointerdown', opts(y)));
      key.dispatchEvent(new PointerEvent('pointermove', opts(y - 40)));
      document.querySelector('#board').dispatchEvent(new PointerEvent('pointerup', opts(y - 200)));
    }, { x, y });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '8');
    await expectIdle(page);
    await t.swipeUp(key(page, 9), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '89');
  });

  test('pointercancel mid-swipe glides back, writes nothing, next swipe works', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const k = key(page, 2);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 20);
    await t.move(p.x, p.y - 45);
    await expect(k).toHaveClass(/armed/);
    await t.cancel();
    await expectIdle(page);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await t.swipeUp(key(page, 2), 60);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '2');
  });

  test('a new press is never blocked by an unfinished gesture', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const a = await t.center(key(page, 5));
    const b = await t.center(key(page, 6));
    await t.raw('touchStart', [{ x: a.x, y: a.y, id: 1 }]);
    await t.raw('touchMove', [{ x: a.x, y: a.y - 40, id: 1 }]);
    await expect(key(page, 5)).toHaveClass(/armed/);
    await t.raw('touchStart', [{ x: a.x, y: a.y - 40, id: 1 }, { x: b.x, y: b.y, id: 2 }]);
    for (let s = 1; s <= 6; s++) {
      await t.raw('touchMove', [{ x: a.x, y: a.y - 40, id: 1 }, { x: b.x, y: b.y - s * 10, id: 2 }]);
    }
    await t.raw('touchEnd', [{ x: a.x, y: a.y - 40, id: 1 }]);
    await t.raw('touchEnd', []);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '6');
    await expectIdle(page);
  });

  test('rapid back-to-back swipes all land and leave nothing stranded', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const fast = { steps: 4, stepMs: 8, holdMs: 0 };
    for (const d of [1, 2, 3, 2, 4, 1, 1]) await t.swipeUp(key(page, d), 50, fast);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '134');
    await expectIdle(page);
    await expect(page.locator('.n.hidden-pending')).toHaveCount(0);
    const digitsVisible = await page.locator('.key .digit').evaluateAll((els) =>
      els.every((el) => getComputedStyle(el).opacity === '1'));
    expect(digitsVisible).toBe(true);
  });

  test('sideways drag is neither a tap nor a swipe', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    const p = await t.center(key(page, 5));
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
    await page.keyboard.press('Shift+Digit4');
    await page.waitForTimeout(350);
    await doubleTap(page, t, EMPTY);
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '4');
  });

  test('Auto mode: fills as one undo step, selection stays immediate', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, 18));
    await expect(cell(page, 18)).toHaveClass(/selected/);
    await page.keyboard.press('Shift+Digit1'); // auto override leaves only 2
    await page.waitForTimeout(350);
    await doubleTap(page, t, 18);
    await expect(cell(page, 18)).toHaveAttribute('data-value', '2');
    await t.tap(page.locator('#undo'));
    await expect(cell(page, 18)).toHaveAttribute('data-value', '');
    await expect(cell(page, 18)).toHaveAttribute('data-notes', '2');
  });

  test('auto notes: uses the candidates currently shown', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await doubleTap(page, t, 40);
    await expect(cell(page, 40)).toHaveAttribute('data-value', '5');
  });

  test('multi-candidate cell: double-tap only selects', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await doubleTap(page, t, EMPTY);
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
  });

  test('taps further apart than ~300ms do not fill', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await doubleTap(page, t, 40, 450);
    await expect(cell(page, 40)).toHaveAttribute('data-value', '');
  });

  test('works right after a swipe, and the board allows no double-tap zoom', async ({ page }) => {
    const t = await touchDriver(page);
    expect(await page.locator('#board').evaluate((el) => getComputedStyle(el).touchAction)).toBe('manipulation');
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, EMPTY));
    await t.swipeUp(key(page, 2), 60, { holdMs: 0 });
    await doubleTap(page, t, 40, 80);
    await expect(cell(page, 40)).toHaveAttribute('data-value', '5');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '14');
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

test.describe('undo animation', () => {
  test('undo selects the changed cell and fades the removed answer out', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(cell(page, 40));
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY)).toHaveClass(/undo-pulse/);
    await expect(cell(page, EMPTY).locator('.v')).toHaveClass(/undo-out/);
    await expect(cell(page, EMPTY).locator('.v')).toHaveText('4');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    const anim = await cell(page, EMPTY).evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('undo-ring');
    await page.waitForTimeout(450);
    await expect(cell(page, EMPTY)).not.toHaveClass(/undo-pulse/);
    await expect(cell(page, EMPTY).locator('.v')).toHaveText('');
  });

  test('restored answer and candidates animate in', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(page.locator('#erase'));
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
    await expect(cell(page, EMPTY).locator('.v')).toHaveClass(/undo-in/);

    await t.swipeUp(key(page, 4), 60); // no-op: cell has an answer
    await t.tap(page.locator('#erase'));
    await t.swipeUp(key(page, 7), 60);
    await page.waitForTimeout(350);
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY).locator('.n[data-d="7"]')).toHaveClass(/undo-out/);
  });

  test('Erase-reset in Auto: undo animates the cell and its restored overrides', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(page.locator('#notes-mode'));
    await t.tap(cell(page, EMPTY));
    await t.swipeUp(key(page, 2), 60);
    await t.swipeUp(key(page, 8), 60);
    await page.waitForTimeout(350);
    await t.tap(page.locator('#erase'));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
    await t.tap(cell(page, 40));
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await expect(cell(page, EMPTY)).toHaveClass(/undo-pulse/);
    await expect(cell(page, EMPTY).locator('.n[data-d="2"]')).toHaveClass(/undo-out/);
    await expect(cell(page, EMPTY).locator('.n[data-d="8"]')).toHaveClass(/undo-in/);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '148');
  });

  test('reduced motion: color flash only', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await t.tap(key(page, 4));
    await t.tap(page.locator('#undo'));
    await expect(cell(page, EMPTY)).toHaveClass(/undo-pulse/);
    expect(await cell(page, EMPTY).evaluate((el) => getComputedStyle(el).animationName)).toBe('undo-flash');
    await expect(page.locator('.undo-in, .undo-out')).toHaveCount(0);
  });
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
    await expect(cell(page, 0)).toHaveAttribute('data-value', '5');
    await t.tap(autoBtn(page));
    await expect(erase(page)).toBeDisabled();
  });

  test('answer in Manual: clears only the answer, manual notes come back; second Erase clears them', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit1');
    await page.keyboard.press('Shift+Digit4');
    await t.tap(key(page, 4));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(erase(page)).toBeEnabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '14');
    await expect(erase(page)).toBeEnabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(erase(page)).toBeDisabled();
  });

  test('answer in Auto: clears only the answer, overrides come back; second Erase resets them', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(autoBtn(page));
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit2');
    await t.tap(key(page, 1));
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '14');
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
    await expect(erase(page)).toBeDisabled();
  });

  test('Auto, empty cell: disabled without overrides, enabled with them', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(autoBtn(page));
    await t.tap(cell(page, EMPTY));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
    await expect(erase(page)).toBeDisabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
    await page.keyboard.press('Shift+Digit9');
    await expect(erase(page)).toBeEnabled();
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
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
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '24');
    await t.tap(autoBtn(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(erase(page)).toBeDisabled();
    await page.keyboard.press('Shift+Digit7');
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await t.tap(autoBtn(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '24');
  });

  test('erasing in Auto leaves Manual notes intact', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit7');
    await page.keyboard.press('Shift+Digit8');
    await t.tap(autoBtn(page));
    await expect(erase(page)).toBeDisabled();
    await page.keyboard.press('Shift+Digit2');
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '124');
    await t.tap(autoBtn(page));
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '78');
  });

  test('each Erase is one undo step and animates', async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, EMPTY));
    await page.keyboard.press('Shift+Digit1');
    await t.tap(key(page, 4));
    await t.tap(erase(page));
    await expect(cell(page, EMPTY)).toHaveClass(/undo-pulse/);
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
    await page.keyboard.press('Shift+Digit5');
    await t.tap(cell(page, 0));
    await expect(erase(page)).toBeDisabled();
    await t.tap(cell(page, 18));
    await expect(erase(page)).toBeEnabled();
    await t.tap(cell(page, EMPTY));
    await expect(erase(page)).toBeDisabled();
  });
});
