import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const MASTER_PENCILS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "master-desktop-pencils.json"), "utf8")
);

export const SELECTED_BG = "rgb(211, 224, 248)";
export const GIVEN_BG = "rgb(229, 228, 224)";
export const SAME_DIGIT_GIVEN_BG = "rgb(241, 211, 119)";
export const CONFLICT_BG = "rgb(251, 226, 224)";

export const cell = (page, i) => page.locator(".board > .cell").nth(i);
export const pencil = (page, i, d) =>
  cell(page, i)
    .locator(".pencil-box")
    .nth(d - 1);
export const pen = (page, i) => cell(page, i).locator(".pen-box");

/** Demo puzzle shipped on master (Play on desktop; `?q=` on mobile). */
export const DEMO_PUZZLE =
  "050900000800040307000280190538607940020301000109804623907400000045000209000030070";

export async function openBoard(page, path = "./") {
  const dest = path === "./" ? `./?q=${DEMO_PUZZLE}` : path;
  await page.goto(dest);
  const board = page.locator(".board > .cell");
  if ((await board.count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to puzzle/ }).click();
  }
  await expect(board).toHaveCount(81);
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

/** Master `338c075` at 1280×800 Chromium: `repeat(9, 1fr)` columns, implicit rows. */
export const MASTER_DESKTOP_1280 = {
  board: 650,
  origin: 4,
  track: 71.34375,
};

/** Every cell's box equals master's 1280×800 tracks (not minmax(0, 1fr) rounding). */
export function expectMasterDesktopTracks(geo) {
  const { board, origin, track } = MASTER_DESKTOP_1280;
  expect(geo.board.w).toBe(board);
  expect(geo.board.h).toBe(board);
  expect(geo.cells).toHaveLength(81);
  for (let i = 0; i < 81; i++) {
    const col = i % 9;
    const row = Math.floor(i / 9);
    const want = { x: origin + col * track, y: origin + row * track, w: track, h: track };
    expect(geo.cells[i].x - geo.board.x, `cell ${i} x`).toBe(want.x);
    expect(geo.cells[i].y - geo.board.y, `cell ${i} y`).toBe(want.y);
    expect(geo.cells[i].w, `cell ${i} w`).toBe(want.w);
    expect(geo.cells[i].h, `cell ${i} h`).toBe(want.h);
  }
}

/** Every candidate slot's box, relative to the board. */
export async function measurePencils(page) {
  return page.evaluate(() => {
    const board = document.querySelector(".board");
    const br = board.getBoundingClientRect();
    return [...board.querySelectorAll(".pencil-box")].map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        i,
        x: r.x - br.x,
        y: r.y - br.y,
        w: r.width,
        h: r.height,
        cls: el.className,
      };
    });
  });
}

/** Candidate slots keep master's 3×1fr boxes (not minmax(0, 1fr) rounding). */
export function expectMasterDesktopPencils(pencils) {
  expect(pencils.length).toBeGreaterThan(0);
  const byPos = new Map(MASTER_PENCILS.map((p) => [`${p.x}|${p.y}`, p]));
  for (const p of pencils) {
    const m = byPos.get(`${p.x}|${p.y}`);
    expect(m, `no master slot at ${p.x},${p.y} (${p.w}×${p.h})`).toBeTruthy();
    expect(p.w, `w at ${p.x},${p.y}`).toBe(m.w);
    expect(p.h, `h at ${p.x},${p.y}`).toBe(m.h);
  }
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

export async function moveToPencil(page, i, d) {
  const box = await pencil(page, i, d).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

export async function moveToCell(page, i) {
  const box = await cell(page, i).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

export async function readShiftHover(page) {
  return page.evaluate(() => {
    const slots = [...document.querySelectorAll(".pencil-box")].map((el) => {
      const cs = getComputedStyle(el);
      return {
        cell: Number(el.closest(".cell")?.dataset.i),
        d: Number(el.dataset.d),
        shift: el.dataset.shiftSlot === "true" || /\bshift-slot\b/.test(el.className),
        cursor: cs.cursor,
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
        shadow: cs.boxShadow,
      };
    });
    return { active: slots.filter((s) => s.shift), slots };
  });
}

/** Cursor, box, and the slot a click would enter must name the same candidate. */
export async function expectShiftAgreement(page, want) {
  const { active, slots } = await readShiftHover(page);
  if (!want) {
    expect(active, "no Shift-hover box").toEqual([]);
    expect(
      slots.filter((s) => s.cursor === "crosshair"),
      "no crosshair unless a box is shown"
    ).toEqual([]);
    return;
  }
  expect(active, "exactly one Shift-hover box").toEqual(
    expect.arrayContaining([expect.objectContaining({ cell: want.cell, d: want.d, shift: true })])
  );
  expect(active).toHaveLength(1);
  const hit = active[0];
  expect(hit.cursor).toBe("crosshair");
  expect(hit.radius).toBe("4px");
  expect(hit.shadow).not.toBe("none");
  expect(hit.bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(slots.filter((s) => s.cursor === "crosshair")).toHaveLength(1);
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
