import { expect, test } from "@playwright/test";

test("static icons are digit 7 under /sudoku/ before the weekday swap", async ({ page }) => {
  const origin = "http://localhost:4173";
  const html = await (await page.request.get(`${origin}/sudoku/`)).text();
  expect(html).toContain('rel="icon"');
  expect(html).toContain('sizes="any"');
  expect(html).toContain('href="/sudoku/favicon/I7-16.svg"');
  expect(html).toContain('href="/sudoku/favicon/I7-32.svg"');
  expect(html).toContain('href="/sudoku/apple-touch-icon.png"');
  expect(html).not.toContain("manifest");

  const svg = await page.request.get(`${origin}/sudoku/favicon/I7-16.svg`);
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"] ?? "").toMatch(/svg/);

  const png = await page.request.get(`${origin}/sudoku/apple-touch-icon.png`);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"] ?? "").toMatch(/png/);
  const body = await png.body();
  expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(body.readUInt32BE(16)).toBe(180);
  expect(body.readUInt32BE(20)).toBe(180);
});

test("the tab icon links follow a mocked local weekday", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 19, 15, 0, 0) });
  await page.goto("./");

  const iconAny = page.locator('link[rel="icon"][sizes="any"]');
  const icon16 = page.locator('link[rel="icon"][sizes="16x16"]');
  const icon32 = page.locator('link[rel="icon"][sizes="32x32"]');
  await expect(iconAny).toHaveAttribute("href", /\/sudoku\/favicon\/I1-16\.svg$/);
  await expect(icon16).toHaveAttribute("href", /\/sudoku\/favicon\/I1-16\.svg$/);
  await expect(icon32).toHaveAttribute("href", /\/sudoku\/favicon\/I1-32\.svg$/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /\/sudoku\/apple-touch-icon\.png$/
  );

  const origin = new URL(page.url()).origin;
  for (const file of ["favicon/I1-16.svg", "favicon/I1-32.svg", "favicon/I4-32.svg"]) {
    const res = await page.request.get(`${origin}/sudoku/${file}`);
    expect(res.status(), file).toBe(200);
  }
});

test("the tab icon rolls to Sunday 7 at the next local midnight", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 24, 23, 59, 58) });
  await page.goto("./");

  const iconAny = page.locator('link[rel="icon"][sizes="any"]');
  const icon16 = page.locator('link[rel="icon"][sizes="16x16"]');
  const icon32 = page.locator('link[rel="icon"][sizes="32x32"]');
  await expect(iconAny).toHaveAttribute("href", /\/sudoku\/favicon\/I6-16\.svg$/);
  await expect(icon16).toHaveAttribute("href", /\/sudoku\/favicon\/I6-16\.svg$/);
  await expect(icon32).toHaveAttribute("href", /\/sudoku\/favicon\/I6-32\.svg$/);

  await page.clock.fastForward(3_000);

  await expect(iconAny).toHaveAttribute("href", /\/sudoku\/favicon\/I7-16\.svg$/);
  await expect(icon16).toHaveAttribute("href", /\/sudoku\/favicon\/I7-16\.svg$/);
  await expect(icon32).toHaveAttribute("href", /\/sudoku\/favicon\/I7-32\.svg$/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /\/sudoku\/apple-touch-icon\.png$/
  );
});
