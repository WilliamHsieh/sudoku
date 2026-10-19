import { test, expect } from '@playwright/test';

const cell = (page, i) => page.locator(`.cell[data-i="${i}"]`);
// Cell 41 (row 5, col 6) is empty; candidates 1379.
const EMPTY = 41;

// Centre of candidate slot d (1-9) inside a cell, for `click({ position })`.
async function slot(page, i, d) {
  const b = await cell(page, i).boundingBox();
  const col = (d - 1) % 3, row = Math.floor((d - 1) / 3);
  return { x: ((col + 0.5) * b.width) / 3, y: ((row + 0.5) * b.height) / 3 };
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('click selects; arrows move the selection', async ({ page }) => {
  await cell(page, EMPTY).click();
  await expect(cell(page, EMPTY)).toHaveClass(/selected/);
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 42)).toHaveClass(/selected/);
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 51)).toHaveClass(/selected/);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, EMPTY)).toHaveClass(/selected/);
});

test('1-9 writes the answer, same digit clears, 0 and Backspace clear', async ({ page }) => {
  await cell(page, EMPTY).click();
  await page.keyboard.press('4');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  await page.keyboard.press('4');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  await page.keyboard.press('2');
  await page.keyboard.press('0');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  await page.keyboard.press('1');
  await page.keyboard.press('Backspace');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('Shift+digit toggles a candidate', async ({ page }) => {
  await cell(page, EMPTY).click();
  await page.keyboard.press('Shift+Digit1');
  await page.keyboard.press('Shift+Digit9');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '19');
  await page.keyboard.press('Shift+Digit1');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '9');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('Shift+digit refuses an illegal candidate and flashes the blockers', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.clock.pauseAt(Date.now() + 2000);
  await cell(page, EMPTY).click();
  await page.keyboard.press('Shift+Digit4'); // given 4 at r5c3
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
  await expect(cell(page, 38)).toHaveClass(/blocked/);
  await expect(page.locator('#undo')).toBeDisabled();
  await page.clock.runFor(320);
  await expect(cell(page, 38)).not.toHaveClass(/blocked/);
});

test('right-click clears the cell', async ({ page }) => {
  await cell(page, EMPTY).click();
  await page.keyboard.press('2');
  await cell(page, EMPTY).click({ button: 'right' });
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('Ctrl+Z and Meta+Z undo', async ({ page }) => {
  await cell(page, EMPTY).click();
  await page.keyboard.press('Shift+Digit7');
  await page.keyboard.press('4');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  await page.keyboard.press('Control+z');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '7');
  await page.keyboard.press('Meta+z');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
});

test('keypad works with a mouse (click = answer, drag up = candidate)', async ({ page }) => {
  await cell(page, EMPTY).click();
  const k = page.locator('.key[data-d="9"]');
  await k.click();
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '9');
  await k.click();
  const b = await k.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 50, { steps: 10 });
  await page.mouse.up();
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '9');
});

test('solution is not shipped to the client', async ({ page }) => {
  const sources = await page.evaluate(async () => {
    const urls = ['/app.js', '/puzzle.js', '/index.html'];
    return Promise.all(urls.map((u) => fetch(u).then((r) => r.text())));
  });
  for (const src of sources) expect(src).not.toContain('387495216');
});

test('Shift+click fills a candidate; pause blocks keys', async ({ page }) => {
  await page.locator('#notes-mode').click();
  await cell(page, 55).click({ position: await slot(page, 55, 9), modifiers: ['Shift'] });
  await expect(cell(page, 55)).toHaveAttribute('data-value', '9');
  await page.locator('#pause').click();
  await cell(page, EMPTY).click({ force: true });
  await page.keyboard.press('Control+z');
  await expect(cell(page, 55)).toHaveAttribute('data-value', '9');
  await page.locator('#resume').click();
  await page.keyboard.press('Control+z');
  await expect(cell(page, 55)).toHaveAttribute('data-value', '');
});

test('redo shortcuts: Ctrl/Cmd+Shift+Z and Ctrl+Y', async ({ page }) => {
  await cell(page, EMPTY).click();
  await page.keyboard.press('4');
  for (const combo of ['Control+Shift+z', 'Meta+Shift+z', 'Control+y']) {
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await page.keyboard.press(combo);
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  }
  await expect(page.locator('#redo')).toBeDisabled();
});

const notes = (page, i) => cell(page, i).getAttribute('data-notes');

test.describe('mouse extras from the main app', () => {
  test('(a) clicking the title deselects; clicking a cell selects', async ({ page }) => {
    await cell(page, EMPTY).click();
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await page.locator('.top h1').click();
    await expect(page.locator('.cell.selected')).toHaveCount(0);
    await expect(page.locator('#erase')).toBeDisabled();
    await cell(page, 0).click();
    await expect(cell(page, 0)).toHaveClass(/selected/);
  });

  test('(b) Auto: clicking a candidate slot of the selected cell hides or restores it; illegal restores are refused', async ({ page }) => {
    await page.locator('#notes-mode').click();
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 3) }); // first click only selects
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    expect(await notes(page, EMPTY)).toBe('1379');
    await expect(page.locator('#undo')).toBeDisabled();

    await page.waitForTimeout(350);
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 3) });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
    await page.waitForTimeout(350);
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 3) });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');

    await page.waitForTimeout(350);
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 4) }); // 4 is in the row (38)
    await expect(cell(page, 38)).toHaveClass(/blocked/);
    expect(await notes(page, EMPTY)).toBe('1379');

    // Each toggle is one undo step; the refused one left none.
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('(b) Manual: clicking a slot toggles the note with the same refusal rule', async ({ page }) => {
    await cell(page, EMPTY).click();
    await page.waitForTimeout(350);
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 1) });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
    await page.waitForTimeout(350);
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 9) });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '19');
    await page.waitForTimeout(350);
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 6) }); // 6 is in the box (50)
    await expect(cell(page, 50)).toHaveClass(/blocked/);
    expect(await notes(page, EMPTY)).toBe('19');
    await page.waitForTimeout(350);
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 1) });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '9');
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '19');
  });

  test('(b) a mouse double-click never fills: on the selected cell it toggles the slot twice', async ({ page }) => {
    await page.locator('#notes-mode').click();
    await cell(page, EMPTY).click();
    await cell(page, EMPTY).dblclick({ position: await slot(page, EMPTY, 3) });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '179');
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await expect(page.locator('#undo')).toBeDisabled();

    // Lone candidate on an unselected cell: the first click selects, the second toggles.
    await cell(page, 42).click();
    await cell(page, 55).dblclick({ position: await slot(page, 55, 9) });
    await expect(cell(page, 55)).toHaveAttribute('data-value', '');
    await expect(cell(page, 55)).toHaveAttribute('data-notes', '');
    await page.keyboard.press('Control+z');
    await expect(cell(page, 55)).toHaveAttribute('data-notes', '9');
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('(c) Shift+click on a visible candidate enters it, selected or not, as one undo step', async ({ page }) => {
    await cell(page, EMPTY).click();
    await page.keyboard.press('Shift+Digit1');
    await page.keyboard.press('Shift+Digit7');
    await cell(page, 42).click();
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 3), modifiers: ['Shift'] }); // 3 is not a note
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '17');
    await cell(page, 42).click();
    await page.waitForTimeout(350);
    await cell(page, EMPTY).click({ position: await slot(page, EMPTY, 7), modifiers: ['Shift'] });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '7');
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '17');

    // Auto notes, unselected cell; a given never takes it.
    await page.locator('#notes-mode').click();
    await cell(page, 42).click();
    await cell(page, 55).click({ position: await slot(page, 55, 9), modifiers: ['Shift'] });
    await expect(cell(page, 55)).toHaveAttribute('data-value', '9');
    await cell(page, 0).click({ position: await slot(page, 0, 5), modifiers: ['Shift'] });
    await expect(cell(page, 0)).toHaveAttribute('data-value', '3');
  });

  test('(d) right-click: answer and its Auto overrides go in one step; empty cell erases; givens untouched', async ({ page }) => {
    await page.evaluate(() => {
      window.__menus = [];
      document.addEventListener('contextmenu', (e) => window.__menus.push(e.defaultPrevented));
    });
    await page.locator('#notes-mode').click();
    await cell(page, EMPTY).click();
    await page.keyboard.press('Shift+Digit1'); // Auto override: 1 removed
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '379');
    await page.keyboard.press('7');
    await cell(page, 42).click();
    await cell(page, EMPTY).click({ button: 'right' }); // no selection needed
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');
    await expect(cell(page, 42)).toHaveClass(/selected/);
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '7');
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '379');

    // Empty cell: Erase behaviour (Auto resets the overrides).
    await cell(page, EMPTY).click({ button: 'right' });
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1379');

    // Manual answer: only the answer goes, the manual notes come back.
    await page.locator('#notes-mode').click();
    await cell(page, 42).click();
    await page.keyboard.press('Shift+Digit2');
    await page.keyboard.press('3');
    await cell(page, EMPTY).click();
    await cell(page, 42).click({ button: 'right' });
    await expect(cell(page, 42)).toHaveAttribute('data-value', '');
    await expect(cell(page, 42)).toHaveAttribute('data-notes', '2');

    // Given: nothing but the suppressed menu.
    const depth = await page.locator('#undo').isEnabled();
    await cell(page, 38).click({ button: 'right' });
    await expect(cell(page, 38)).toHaveAttribute('data-value', '4');
    await expect(cell(page, EMPTY)).toHaveClass(/selected/);
    expect(await page.locator('#undo').isEnabled()).toBe(depth);
    expect(await page.evaluate(() => window.__menus)).toEqual([true, true, true, true]);
  });
});

async function hover(page, i, d) {
  const b = await cell(page, i).boundingBox();
  const p = await slot(page, i, d);
  await page.mouse.move(b.x + p.x, b.y + p.y);
}
const note = (page, i, d) => cell(page, i).locator(`.n:nth-child(${d})`);
const INK = 'rgb(28, 26, 22)';
const boardCursor = (page, i) => cell(page, i).evaluate((el) => getComputedStyle(el).cursor);

test.describe('Shift-hover', () => {
  test('snaps the visible candidate under the pointer, with a crosshair only while Shift is held', async ({ page }) => {
    await page.locator('#notes-mode').click();
    await hover(page, EMPTY, 3);
    await expect(page.locator('.n.aim')).toHaveCount(0);
    expect(await boardCursor(page, EMPTY)).not.toBe('crosshair');

    await page.keyboard.down('Shift');
    await expect(page.locator('.n.aim')).toHaveCount(1);
    await expect(note(page, EMPTY, 3)).toHaveClass(/aim/);
    await expect(page.locator('.board')).toHaveClass(/shift-aim/);
    expect(await boardCursor(page, EMPTY)).toBe('crosshair');
    const look = await note(page, EMPTY, 3).evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, weight: s.fontWeight, ring: s.boxShadow };
    });
    expect(look.color).toBe(INK);
    expect(look.weight).toBe('700');
    expect(look.ring).toContain(INK);

    await hover(page, EMPTY, 4); // not a candidate
    await expect(page.locator('.n.aim')).toHaveCount(0);
    expect(await boardCursor(page, EMPTY)).toBe('crosshair');
    await hover(page, 0, 5); // given
    await expect(page.locator('.n.aim')).toHaveCount(0);

    await hover(page, EMPTY, 3);
    await expect(note(page, EMPTY, 3)).toHaveClass(/aim/);
    await page.keyboard.up('Shift');
    await expect(page.locator('.n.aim')).toHaveCount(0);
    await expect(page.locator('.board')).not.toHaveClass(/shift-aim/);
    expect(await boardCursor(page, EMPTY)).not.toBe('crosshair');

    await page.keyboard.down('Shift');
    await expect(note(page, EMPTY, 3)).toHaveClass(/aim/);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('.n.aim')).toHaveCount(0);
    await expect(page.locator('.board')).not.toHaveClass(/shift-aim/);
    await page.keyboard.up('Shift');
  });

  test('on a yellow chip the outline goes on the chip and the text turns ink', async ({ page }) => {
    await page.locator('#notes-mode').click();
    await cell(page, 1).click(); // given 8 lights up the 8 chips
    await hover(page, 36, 8);
    await page.keyboard.down('Shift');
    const chip = note(page, 36, 8);
    await expect(chip).toHaveClass(/match/);
    await expect(chip).toHaveClass(/aim/);
    const look = await chip.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor, ring: s.boxShadow, weight: s.fontWeight };
    });
    expect(look.color).toBe(INK);
    expect(look.bg).toBe('rgb(252, 239, 190)');
    expect(look.ring).toContain(INK);
    expect(look.weight).toBe('700');
    await page.keyboard.up('Shift');
  });

  test('follows Shift+digit changes, and Shift+click enters the snapped digit', async ({ page }) => {
    await cell(page, EMPTY).click(); // Manual notes: none yet
    await hover(page, EMPTY, 1);
    await page.keyboard.down('Shift');
    await expect(page.locator('.n.aim')).toHaveCount(0);
    await page.keyboard.press('Digit1');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '1');
    await expect(note(page, EMPTY, 1)).toHaveClass(/aim/);
    await page.keyboard.press('Digit1');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
    await expect(page.locator('.n.aim')).toHaveCount(0);
    await page.keyboard.press('Digit1');
    await expect(note(page, EMPTY, 1)).toHaveClass(/aim/);

    await page.mouse.down();
    await page.mouse.up();
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '1');
    await expect(page.locator('.n.aim')).toHaveCount(0);
    await page.keyboard.up('Shift');
    await page.keyboard.press('Control+z');
    await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
    await expect(page.locator('.n.aim')).toHaveCount(0);
    await page.keyboard.down('Shift');
    await expect(note(page, EMPTY, 1)).toHaveClass(/aim/);
    await page.keyboard.up('Shift');
  });

  test('clears when the pointer leaves the board and while paused', async ({ page }) => {
    await page.locator('#notes-mode').click();
    await hover(page, EMPTY, 3);
    await page.keyboard.down('Shift');
    await expect(note(page, EMPTY, 3)).toHaveClass(/aim/);
    await page.mouse.move(2, 2);
    await expect(page.locator('.n.aim')).toHaveCount(0);
    await expect(page.locator('.board')).not.toHaveClass(/shift-aim/);
    await hover(page, EMPTY, 3);
    await expect(note(page, EMPTY, 3)).toHaveClass(/aim/);
    await page.evaluate(() => document.querySelector('#pause').click());
    await expect(page.locator('.n.aim')).toHaveCount(0);
    await expect(page.locator('.board')).not.toHaveClass(/shift-aim/);
    await page.keyboard.up('Shift');
  });
});
