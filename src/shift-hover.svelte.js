import { game } from "./game/game.svelte.js";
import { resolveShiftHover, slotFromPoint } from "./game/shift-hover.js";

/** Raw pointer cell/slot and whether Shift is down. Not the hover target. */
const shiftInput = $state({
  down: false,
  cell: -1,
  slot: -1,
});

/**
 * One hover target, derived from the raw inputs plus the live game.
 * Cursor, box, and click all read this. A board change re-resolves it
 * without another pointer move.
 * @type {{ cell: number, slot: number, d: number } | null}
 */
const shiftTarget = $derived.by(() =>
  resolveShiftHover({
    shift: shiftInput.down,
    cell: shiftInput.cell,
    slot: shiftInput.slot,
    filled: shiftInput.cell >= 0 && game.value(shiftInput.cell) !== 0,
    hasNote:
      shiftInput.cell >= 0 &&
      shiftInput.slot >= 0 &&
      game.hasNote(shiftInput.cell, shiftInput.slot + 1),
  })
);

/** Live derived target. Click re-reads this at event time. */
export function getShiftHover() {
  return shiftTarget;
}

function readSlot(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const cellEl = el instanceof Element ? el.closest(".cell") : null;
  if (!(cellEl instanceof HTMLElement)) return { cell: -1, slot: -1 };
  const cell = Number(cellEl.dataset.i);
  if (!Number.isFinite(cell)) return { cell: -1, slot: -1 };
  return { cell, slot: slotFromPoint(cellEl.getBoundingClientRect(), clientX, clientY) };
}

function onMove(e) {
  const at = readSlot(e.clientX, e.clientY);
  shiftInput.cell = at.cell;
  shiftInput.slot = at.slot;
}

function onKeyDown(e) {
  if (e.key !== "Shift" || e.repeat) return;
  shiftInput.down = true;
}

function onKeyUp(e) {
  if (e.key !== "Shift") return;
  shiftInput.down = false;
}

function onBlur() {
  shiftInput.down = false;
}

/** Window-level Shift + pointer. Hover is $derived from these plus the game. */
export function installShiftHover() {
  window.addEventListener("pointermove", onMove);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    shiftInput.down = false;
    shiftInput.cell = -1;
    shiftInput.slot = -1;
  };
}
