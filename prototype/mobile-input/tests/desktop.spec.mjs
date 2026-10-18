import { test, expect } from '@playwright/test';

const cell = (page, i) => page.locator(`.cell[data-i="${i}"]`);
// Cell 41 (row 5, col 6) is empty; candidates 1379.
const EMPTY = 41;

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

test('double-click fills a single-candidate cell; pause blocks keys', async ({ page }) => {
  await page.locator('#notes-mode').click();
  await cell(page, 55).dblclick();
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
