import { expect } from "@playwright/test";

export const SELECTED_BG = "rgb(211, 224, 248)";
export const GIVEN_BG = "rgb(229, 228, 224)";
export const SAME_DIGIT_GIVEN_BG = "rgb(241, 211, 119)";
export const CONFLICT_BG = "rgb(251, 226, 224)";
export const CONFLICT = "rgb(192, 47, 47)";

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

/** Idle note slots tile the cell content inset by 1px (Opus `.notes`).
 * Matching chips and the aim box are sized to --chip-size (0.32) and skipped. */
export async function expectMasterDesktopPencils(page) {
  const { cells, pencils } = await page.evaluate(() => {
    const board = document.querySelector(".board").getBoundingClientRect();
    const cells = [...document.querySelectorAll(".board > .cell")].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: r.x - board.x,
        y: r.y - board.y,
        w: r.width,
        h: r.height,
        br: parseFloat(cs.borderRightWidth),
        bb: parseFloat(cs.borderBottomWidth),
      };
    });
    const pencils = [...document.querySelectorAll(".pencil-box")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        i: Number(el.closest(".cell")?.dataset.i),
        d: Number(el.dataset.d),
        x: r.x - board.x,
        y: r.y - board.y,
        w: r.width,
        h: r.height,
        cls: el.className,
      };
    });
    return { cells, pencils };
  });
  const INSET = 1;
  const plain = pencils.filter((p) => !/\bmatching-number\b/.test(p.cls) && !/\baim\b/.test(p.cls));
  expect(plain.length).toBeGreaterThan(0);
  for (const p of plain) {
    const c = cells[p.i];
    const col = (p.d - 1) % 3;
    const row = Math.floor((p.d - 1) / 3);
    const sw = (c.w - c.br - 2 * INSET) / 3;
    const sh = (c.h - c.bb - 2 * INSET) / 3;
    const x = c.x + INSET + col * sw;
    const y = c.y + INSET + row * sh;
    expect(Math.abs(p.x - x), `pencil ${p.i}/${p.d} x`).toBeLessThanOrEqual(GEO_EPS);
    expect(Math.abs(p.y - y), `pencil ${p.i}/${p.d} y`).toBeLessThanOrEqual(GEO_EPS);
    expect(Math.abs(p.w - sw), `pencil ${p.i}/${p.d} w`).toBeLessThanOrEqual(GEO_EPS);
    expect(Math.abs(p.h - sh), `pencil ${p.i}/${p.d} h`).toBeLessThanOrEqual(GEO_EPS);
  }
}

/** Chip/aim use --chip-size 0.32. Desktop/aim cap 4px; mobile match chips 1px. */
export function expectChipGeometry(sizes, cap = 4) {
  expect(Number.parseFloat(sizes.token)).toBeCloseTo(0.32, 5);
  expect(sizes.chip).toBeCloseTo(Math.min(sizes.cell * 0.32, sizes.slot - cap), 0);
}

export async function readChipGeometry(page, selector = ".pencil-box.matching-number") {
  return page.evaluate((selector) => {
    const chip = document.querySelector(selector);
    const host = chip.closest(".cell");
    const notes = host.querySelector(".candidate");
    return {
      chip: chip.getBoundingClientRect().width,
      cell: host.getBoundingClientRect().width,
      slot: notes.getBoundingClientRect().width / 3,
      token: getComputedStyle(document.documentElement).getPropertyValue("--chip-size").trim(),
    };
  }, selector);
}

/** Board + 81 cell boxes. Used to prove Shift/chips never move the grid. */
export async function readBoardRects(page) {
  return page.evaluate(() => {
    const board = document.querySelector(".board").getBoundingClientRect();
    const cells = [...document.querySelectorAll(".board > .cell")].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    return { board: { x: board.x, y: board.y, w: board.width, h: board.height }, cells };
  });
}

export function maxRectDelta(a, b) {
  let max = 0;
  const pair = (p, q) =>
    Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.w - q.w), Math.abs(p.h - q.h));
  max = Math.max(max, pair(a.board, b.board));
  for (let i = 0; i < 81; i++) max = Math.max(max, pair(a.cells[i], b.cells[i]));
  return max;
}

export function expectZeroLayoutShift(before, after, label) {
  const d = maxRectDelta(before, after);
  expect(d, `${label}: max rect delta ${d}`).toBe(0);
  return d;
}

/** Shift-aim a visible note in the first cell of `want` (data-c / data-r). */
export async function aimFirstNoteIn(page, want) {
  const hit = await page.evaluate((want) => {
    const cells = [...document.querySelectorAll(".board > .cell")];
    for (const el of cells) {
      const i = Number(el.dataset.i);
      const col = i % 9;
      const row = Math.floor(i / 9);
      if (want.col != null && col !== want.col) continue;
      if (want.row != null && row !== want.row) continue;
      const note = [...el.querySelectorAll(".pencil-box")].find(
        (n) => !n.classList.contains("invisible") && n.textContent.trim()
      );
      if (!note) continue;
      const r = note.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, i, d: Number(note.dataset.d) };
    }
    return null;
  }, want);
  expect(hit, `a note in ${JSON.stringify(want)}`).toBeTruthy();
  await dispatchPointerMove(page, hit.x, hit.y);
  await page.keyboard.down("Shift");
  await dispatchPointerMove(page, hit.x, hit.y);
  return hit;
}

export async function expectNoGridShift(page) {
  const deltas = [];
  const idle = await readBoardRects(page);
  await cell(page, 1).click(); // given 5 — many yellow chips
  const many = await readBoardRects(page);
  deltas.push(expectZeroLayoutShift(idle, many, "many yellow chips"));

  await page.locator("h1").click();
  const none = await readBoardRects(page);
  deltas.push(expectZeroLayoutShift(idle, none, "0 chips"));

  await cell(page, 0).click();
  const oneCell = await readBoardRects(page);
  deltas.push(expectZeroLayoutShift(idle, oneCell, "selected empty, 0 chips"));

  const col9 = await aimFirstNoteIn(page, { col: 8 });
  const aimedCol9 = await readBoardRects(page);
  deltas.push(expectZeroLayoutShift(idle, aimedCol9, `Shift+aim col9 cell ${col9.i}`));
  await page.keyboard.up("Shift");

  const row9 = await aimFirstNoteIn(page, { row: 8 });
  const aimedRow9 = await readBoardRects(page);
  deltas.push(expectZeroLayoutShift(idle, aimedRow9, `Shift+aim row9 cell ${row9.i}`));
  await page.keyboard.up("Shift");

  await cell(page, 1).click();
  const oneChipAim = await page.locator(".pencil-box.matching-number").first();
  await expect(oneChipAim).toBeVisible();
  const box = await oneChipAim.boundingBox();
  await dispatchPointerMove(page, box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Shift");
  await dispatchPointerMove(page, box.x + box.width / 2, box.y + box.height / 2);
  const aimedChip = await readBoardRects(page);
  deltas.push(expectZeroLayoutShift(idle, aimedChip, "Shift+aim a yellow chip"));
  await page.keyboard.up("Shift");

  return Math.max(...deltas);
}

export function expectGapsAtLeast(gaps, px) {
  expect(gaps.length, "measured chips/aims").toBeGreaterThan(0);
  for (const g of gaps) {
    expect(
      g.min,
      `cell ${g.i} slot ${g.d} min gap ${g.min} (${JSON.stringify(g.gaps)})`
    ).toBeGreaterThanOrEqual(px);
  }
}

/** Yellow chips in corner slots 1/3/7/9, then aim the tightest of each.
 * A match chip must not change size or weight under Shift. Desktop match+aim
 * share the slot-4 cap so the 1.5px ring clears; mobile match stays slot-1
 * (no product Shift aim) and the ring is checked on a plain candidate. */
export async function expectCornerChipAndAimGaps(page) {
  const mobile = (page.viewportSize()?.width ?? 1280) <= 599;
  for (const d of [1, 3, 7, 9]) {
    const given = await page.evaluate((d) => {
      const el = [...document.querySelectorAll(".board > .cell")].find(
        (c) => Number(c.dataset.value) === d
      );
      return el ? Number(el.dataset.i) : null;
    }, d);
    expect(given, `a given ${d}`).not.toBeNull();
    await cell(page, given).click();
    const chips = (await measureChipLineGaps(page, ".pencil-box.matching-number")).filter(
      (g) => g.d === d
    );
    expectGapsAtLeast(chips, 1);
    const tightest = chips.reduce((a, b) => (a.min <= b.min ? a : b));
    const rest = await page.evaluate((want) => {
      const el = [...document.querySelectorAll(".pencil-box.matching-number")].find(
        (n) => Number(n.dataset.d) === want.d && Number(n.closest(".cell")?.dataset.i) === want.i
      );
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        w: r.width,
        h: r.height,
        weight: cs.fontWeight,
      };
    }, tightest);
    expect(rest.weight, `given ${d} chip weight`).toBe("400");
    await dispatchPointerMove(page, rest.x, rest.y);
    await page.keyboard.down("Shift");
    await dispatchPointerMove(page, rest.x, rest.y);
    const aimedBox = await page.evaluate(() => {
      const el = document.querySelector(".pencil-box.aim");
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { w: r.width, h: r.height, weight: cs.fontWeight };
    });
    expect(aimedBox.weight, `given ${d} aim weight`).toBe("400");
    expect(aimedBox.w, `given ${d} aim width`).toBeCloseTo(rest.w, 5);
    expect(aimedBox.h, `given ${d} aim height`).toBeCloseTo(rest.h, 5);
    if (!mobile) {
      const aimed = await measureChipLineGaps(page, ".pencil-box.aim");
      expectGapsAtLeast(aimed, 1);
    }
    await page.keyboard.up("Shift");
  }
  if (mobile) {
    const box = await page.evaluate(() => {
      const el = [...document.querySelectorAll(".pencil-box")].find(
        (n) =>
          !n.classList.contains("invisible") &&
          !n.classList.contains("matching-number") &&
          n.textContent.trim()
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    expect(box, "a plain candidate to aim").not.toBeNull();
    await dispatchPointerMove(page, box.x, box.y);
    await page.keyboard.down("Shift");
    await dispatchPointerMove(page, box.x, box.y);
    expectGapsAtLeast(await measureChipLineGaps(page, ".pencil-box.aim"), 1);
    await page.keyboard.up("Shift");
  }
}

/**
 * Gap from a chip/aim box (plus its ring) to the inner edge of every grid line
 * that bounds its cell. Thin and thick lines included.
 */
export async function measureChipLineGaps(page, selector) {
  return page.evaluate((selector) => {
    const board = document.querySelector(".board");
    const bcs = getComputedStyle(board);
    const br = board.getBoundingClientRect();
    const cells = [...board.querySelectorAll(":scope > .cell")];
    const inner = {
      left: br.left + parseFloat(bcs.borderLeftWidth),
      right: br.right - parseFloat(bcs.borderRightWidth),
      top: br.top + parseFloat(bcs.borderTopWidth),
      bottom: br.bottom - parseFloat(bcs.borderBottomWidth),
    };
    const out = [];
    for (const el of document.querySelectorAll(selector)) {
      const host = el.closest(".cell");
      const i = cells.indexOf(host);
      if (i < 0) continue;
      const col = i % 9;
      const row = Math.floor(i / 9);
      const cs = getComputedStyle(host);
      const cr = host.getBoundingClientRect();
      const left = col === 0 ? inner.left : cr.left;
      const right = col === 8 ? inner.right : cr.right - parseFloat(cs.borderRightWidth);
      const top = row === 0 ? inner.top : cr.top;
      const bottom = row === 8 ? inner.bottom : cr.bottom - parseFloat(cs.borderBottomWidth);
      const r = el.getBoundingClientRect();
      const pad = /\baim\b/.test(el.className)
        ? 1.5
        : /\bmatching-number\b/.test(el.className)
          ? 0.5
          : 0;
      const gaps = {
        left: r.left - pad - left,
        right: right - (r.right + pad),
        top: r.top - pad - top,
        bottom: bottom - (r.bottom + pad),
      };
      const min = Math.min(gaps.left, gaps.right, gaps.top, gaps.bottom);
      out.push({
        i,
        d: Number(el.dataset.d),
        col,
        row,
        slot: Number(el.dataset.d),
        w: r.width,
        h: r.height,
        pad,
        gaps,
        min,
      });
    }
    return out;
  }, selector);
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

export async function dispatchPointerMove(page, x, y) {
  await page.mouse.move(x, y);
  // Chromium's CDP mouse.move is not always a `pointermove`. The app listens
  // only for pointermove; synthesize one at the same point.
  await page.evaluate(
    ({ x, y }) => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: x,
          clientY: y,
          bubbles: true,
          pointerType: "mouse",
        })
      );
    },
    { x, y }
  );
}

export async function moveToPencil(page, i, d) {
  const box = await pencil(page, i, d).boundingBox();
  await dispatchPointerMove(page, box.x + box.width / 2, box.y + box.height / 2);
}

export async function moveToCell(page, i) {
  const box = await cell(page, i).boundingBox();
  await dispatchPointerMove(page, box.x + box.width / 2, box.y + box.height / 2);
}

export async function readShiftHover(page) {
  return page.evaluate(() => {
    const board = document.querySelector(".board");
    const br = board?.getBoundingClientRect();
    const slots = [...document.querySelectorAll(".pencil-box")].map((el) => {
      const cs = getComputedStyle(el);
      return {
        cell: Number(el.closest(".cell")?.dataset.i),
        d: Number(el.dataset.d),
        shift: el.dataset.shiftSlot === "true" || /\baim\b/.test(el.className),
        match: /\bmatching-number\b/.test(el.className),
        cursor: cs.cursor,
        bg: cs.backgroundColor,
        color: cs.color,
        weight: cs.fontWeight,
        radius: cs.borderRadius,
        shadow: cs.boxShadow,
        w: el.getBoundingClientRect().width,
      };
    });
    return {
      boardAim: board?.classList.contains("shift-aim") ?? false,
      boardCursor: board ? getComputedStyle(board).cursor : "",
      cellW: br ? br.width / 9 : 0,
      active: slots.filter((s) => s.shift),
      slots,
    };
  });
}

/**
 * Aim box is present iff `want` names a visible candidate under the pointer.
 * Crosshair (`board.shift-aim`) stays on while Shift is held over the board,
 * including empty slots and filled cells.
 * @param {import("@playwright/test").Page} page
 * @param {{ cell: number, d: number } | null} want
 * @param {{ overBoard?: boolean }} [opts]
 */
export async function expectShiftAgreement(page, want, opts = {}) {
  const { active, boardAim, boardCursor, cellW } = await readShiftHover(page);
  if (opts.overBoard) {
    expect(boardAim, "board.shift-aim").toBe(true);
    expect(boardCursor).toBe("crosshair");
  } else if (!want) {
    expect(boardAim, "no shift-aim").toBe(false);
  }
  if (!want) {
    expect(active, "no aim box").toEqual([]);
    return;
  }
  expect(boardAim, "board.shift-aim").toBe(true);
  expect(boardCursor).toBe("crosshair");
  expect(active, "exactly one aimed candidate").toEqual(
    expect.arrayContaining([expect.objectContaining({ cell: want.cell, d: want.d, shift: true })])
  );
  expect(active).toHaveLength(1);
  const hit = active[0];
  expect(hit.cursor).toBe("crosshair");
  expect(hit.weight).toBe("400");
  if (hit.match) expect(hit.color).toBe("rgb(122, 75, 8)");
  else expect(hit.color).toBe("rgb(28, 26, 22)");
  expect(hit.radius).toBe("3.5px");
  expect(hit.shadow).toContain("1.5px");
  if (hit.match) expect(hit.bg).not.toBe("rgba(0, 0, 0, 0)");
  else expect(hit.bg).toBe("rgba(0, 0, 0, 0)");
  const geo = await readChipGeometry(page, ".pencil-box.aim");
  expectChipGeometry(geo);
  expect(hit.w).toBeCloseTo(Math.min(cellW * 0.32, geo.slot - 4), 0);
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
