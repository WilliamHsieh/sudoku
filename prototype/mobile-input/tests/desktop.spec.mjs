import { test, expect } from '@playwright/test';

const cell = (page, i) => page.locator(`.cell[data-i="${i}"]`);
const EMPTY = 2;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('click selects; arrows move the selection', async ({ page }) => {
  await cell(page, EMPTY).click();
  await expect(cell(page, EMPTY)).toHaveClass(/selected/);
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 3)).toHaveClass(/selected/);
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 12)).toHaveClass(/selected/);
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
  await page.keyboard.press('Shift+Digit4');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '14');
  await page.keyboard.press('Shift+Digit1');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '4');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('right-click clears the cell', async ({ page }) => {
  await cell(page, EMPTY).click();
  await page.keyboard.press('2');
  await cell(page, EMPTY).click({ button: 'right' });
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
});

test('Ctrl+Z and Meta+Z undo', async ({ page }) => {
  await cell(page, EMPTY).click();
  await page.keyboard.press('Shift+Digit2');
  await page.keyboard.press('4');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  await page.keyboard.press('Control+z');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '2');
  await page.keyboard.press('Meta+z');
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '');
});

test('keypad works with a mouse (click = answer, drag up = candidate)', async ({ page }) => {
  await cell(page, EMPTY).click();
  const k = page.locator('.key[data-d="4"]');
  await k.click();
  await expect(cell(page, EMPTY)).toHaveAttribute('data-value', '4');
  await k.click();
  const b = await k.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 50, { steps: 10 });
  await page.mouse.up();
  await expect(cell(page, EMPTY)).toHaveAttribute('data-notes', '4');
});

test('solution is not shipped to the client', async ({ page }) => {
  const sources = await page.evaluate(async () => {
    const urls = ['/app.js', '/puzzle.js', '/index.html'];
    return Promise.all(urls.map((u) => fetch(u).then((r) => r.text())));
  });
  for (const src of sources) expect(src).not.toContain('534678912');
});
