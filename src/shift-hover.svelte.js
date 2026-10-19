import { game } from "./game/game.svelte.js";
import { resolveShiftHover, slotFromPoint } from "./game/shift-hover.js";

/** Last pointer + Shift. The derived hover is the only UI state. */
export const shiftPtr = $state({
  down: false,
  x: 0,
  y: 0,
  cell: -1,
  slot: -1,
});

export const shiftHover = $derived(
  resolveShiftHover({
    shift: shiftPtr.down,
    cell: shiftPtr.cell,
    slot: shiftPtr.slot,
    filled: shiftPtr.cell >= 0 && game.value(shiftPtr.cell) !== 0,
    hasNote:
      shiftPtr.cell >= 0 && shiftPtr.slot >= 0 && game.hasNote(shiftPtr.cell, shiftPtr.slot + 1),
  })
);

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
  if (!shiftPtr.down) {
    shiftPtr.cell = -1;
    shiftPtr.slot = -1;
    return;
  }
  const at = readSlot(clientX, clientY);
  shiftPtr.cell = at.cell;
  shiftPtr.slot = at.slot;
}

function onPointerMove(e) {
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
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    shiftPtr.down = false;
    shiftPtr.cell = -1;
    shiftPtr.slot = -1;
  };
}
