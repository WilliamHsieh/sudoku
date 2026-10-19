import { game } from "./game/game.svelte.js";
import { resolveShiftHover, slotFromPoint } from "./game/shift-hover.js";

/** Last pointer + Shift. `hover` is the one UI state. */
export const shiftPtr = $state({
  down: false,
  x: 0,
  y: 0,
});

/** @type {{ cell: number, slot: number, d: number }} */
export const shiftHover = $state({ cell: -1, slot: -1, d: 0 });

function readSlot(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const cellEl = el instanceof Element ? el.closest(".cell") : null;
  if (!(cellEl instanceof HTMLElement)) return { cell: -1, slot: -1 };
  const cell = Number(cellEl.dataset.i);
  if (!Number.isFinite(cell)) return { cell: -1, slot: -1 };
  return { cell, slot: slotFromPoint(cellEl.getBoundingClientRect(), clientX, clientY) };
}

function sync(clientX = shiftPtr.x, clientY = shiftPtr.y) {
  shiftPtr.x = clientX;
  shiftPtr.y = clientY;
  const at = shiftPtr.down ? readSlot(clientX, clientY) : { cell: -1, slot: -1 };
  const next = resolveShiftHover({
    shift: shiftPtr.down,
    cell: at.cell,
    slot: at.slot,
    filled: at.cell >= 0 && game.value(at.cell) !== 0,
    hasNote: at.cell >= 0 && at.slot >= 0 && game.hasNote(at.cell, at.slot + 1),
  });
  shiftHover.cell = next?.cell ?? -1;
  shiftHover.slot = next?.slot ?? -1;
  shiftHover.d = next?.d ?? 0;
}

function onMove(e) {
  sync(e.clientX, e.clientY);
}

function onKeyDown(e) {
  if (e.key !== "Shift" || e.repeat) return;
  shiftPtr.down = true;
  sync();
}

function onKeyUp(e) {
  if (e.key !== "Shift") return;
  shiftPtr.down = false;
  sync();
}

function onBlur() {
  shiftPtr.down = false;
  sync();
}

/** Window-level Shift + pointer. Recomputes on keydown so a still pointer snaps. */
export function installShiftHover() {
  window.addEventListener("pointermove", onMove);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    shiftPtr.down = false;
    shiftHover.cell = -1;
    shiftHover.slot = -1;
    shiftHover.d = 0;
  };
}
