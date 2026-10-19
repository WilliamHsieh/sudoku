import { expect } from "@playwright/test";

export const SELECTED_BG = "rgb(211, 224, 248)";
export const GIVEN_BG = "rgb(229, 228, 224)";
export const SAME_DIGIT_GIVEN_BG = "rgb(241, 211, 119)";

export const cell = (page, i) => page.locator(".board > .cell").nth(i);
export const pencil = (page, i, d) =>
  cell(page, i)
    .locator(".pencil-box")
    .nth(d - 1);
export const pen = (page, i) => cell(page, i).locator(".pen-box");

export async function openBoard(page, path = "./") {
  await page.goto(path);
  await page.getByRole("button", { name: /Play/ }).click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
}

export async function expectValue(page, i, v) {
  if (v) await expect(pen(page, i)).toHaveText(String(v));
  else await expect(pen(page, i)).toHaveCount(0);
}

const GEO_EPS = 0.75;

export async function measureBoard(page) {
  return page.evaluate(() => {
    const board = document.querySelector(".board");
    const br = board.getBoundingClientRect();
    const cells = [...board.querySelectorAll(":scope > .cell")].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    });
    return {
      board: {
        x: br.left,
        y: br.top,
        w: br.width,
        h: br.height,
        right: br.right,
        bottom: br.bottom,
        clientW: board.clientWidth,
        scrollW: board.scrollWidth,
        clientH: board.clientHeight,
        scrollH: board.scrollHeight,
      },
      cells,
    };
  });
}

function close(a, b) {
  expect(Math.abs(a - b), `${a} ≉ ${b}`).toBeLessThanOrEqual(GEO_EPS);
}

/** Every cell the same size, fully inside the board, no scroll overflow. */
export function expectUnclippedEqualCells(geo) {
  expect(geo.cells).toHaveLength(81);
  const w0 = geo.cells[0].w;
  const h0 = geo.cells[0].h;
  expect(w0).toBeGreaterThan(10);
  expect(h0).toBeGreaterThan(10);
  for (const c of geo.cells) {
    close(c.w, w0);
    close(c.h, h0);
    expect(c.x).toBeGreaterThanOrEqual(geo.board.x - GEO_EPS);
    expect(c.y).toBeGreaterThanOrEqual(geo.board.y - GEO_EPS);
    expect(c.right).toBeLessThanOrEqual(geo.board.right + GEO_EPS);
    expect(c.bottom).toBeLessThanOrEqual(geo.board.bottom + GEO_EPS);
  }
  close(geo.board.scrollW, geo.board.clientW);
  close(geo.board.scrollH, geo.board.clientH);
}

export function expectSameGeometry(before, after) {
  close(after.board.w, before.board.w);
  close(after.board.h, before.board.h);
  close(after.board.x, before.board.x);
  close(after.board.y, before.board.y);
  for (let i = 0; i < 81; i++) {
    close(after.cells[i].x, before.cells[i].x);
    close(after.cells[i].y, before.cells[i].y);
    close(after.cells[i].w, before.cells[i].w);
    close(after.cells[i].h, before.cells[i].h);
  }
}

export async function readDigitFonts(page) {
  return page.evaluate(() => {
    const face = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily, weight: cs.fontWeight };
    };
    const atkinsonBold = [...document.querySelectorAll("body *")].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.fontFamily.includes("Atkinson") && Number.parseInt(cs.fontWeight, 10) > 400;
    }).length;
    return {
      pad: face(document.querySelector(".key .digit")),
      given: face(document.querySelector(".pen-box.given")),
      answer: face(document.querySelector(".cell.user .pen-box")),
      atkinsonBold,
      synthesis: getComputedStyle(document.documentElement).fontSynthesis,
    };
  });
}

export function solve(q) {
  const g = [...q].map(Number);
  const ok = (i, d) => {
    const r = Math.floor(i / 9),
      c = i % 9;
    const br = r - (r % 3),
      bc = c - (c % 3);
    for (let k = 0; k < 9; k++) {
      if (g[r * 9 + k] === d || g[k * 9 + c] === d) return false;
      if (g[(br + Math.floor(k / 3)) * 9 + bc + (k % 3)] === d) return false;
    }
    return true;
  };
  const go = () => {
    const i = g.indexOf(0);
    if (i < 0) return true;
    for (let d = 1; d <= 9; d++) {
      if (!ok(i, d)) continue;
      g[i] = d;
      if (go()) return true;
    }
    g[i] = 0;
    return false;
  };
  if (!go()) throw new Error("unsolvable puzzle");
  return g.join("");
}
