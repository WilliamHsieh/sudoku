import { game } from "./game/game.svelte.js";
import { padUi } from "./pad-ui.svelte.js";
import { resolveShiftHover, slotFromPoint } from "./game/shift-hover.js";

/**
 * Raw pointer + Shift. The aimed slot is $derived from these plus the live game.
 * `over` / `mouse` drive the board-wide crosshair (Opus `shift-aim`).
 */
const shiftInput = $state({
  down: false,
  mouse: true,
  over: false,
  cell: -1,
  slot: -1,
});

/**
 * Slot under the pointer, only if that cell has that candidate.
 * @type {{ cell: number, slot: number, d: number } | null}
 */
const shiftTarget = $derived.by(() => {
  if (!shiftInput.down || !shiftInput.over || !shiftInput.mouse || padUi.preview) return null;
  return resolveShiftHover({
    shift: true,
    cell: shiftInput.cell,
    slot: shiftInput.slot,
    filled: shiftInput.cell >= 0 && game.value(shiftInput.cell) !== 0,
    hasNote:
      shiftInput.cell >= 0 &&
      shiftInput.slot >= 0 &&
      game.hasNote(shiftInput.cell, shiftInput.slot + 1),
  });
});

const shiftAim = $derived(shiftInput.down && shiftInput.over && shiftInput.mouse && !padUi.preview);

/** Live derived target. Click re-reads this at event time. */
export function getShiftHover() {
  return shiftTarget;
}

/** Board-wide crosshair while Shift is held over the board (mouse only). */
export function isShiftAim() {
  return shiftAim;
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
  if (e.pointerType && e.pointerType !== "mouse") {
    shiftInput.mouse = false;
    shiftInput.over = false;
    shiftInput.cell = -1;
    shiftInput.slot = -1;
    return;
  }
  shiftInput.mouse = true;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const board = el instanceof Element ? el.closest(".board") : null;
  shiftInput.over = !!board;
  const at = board ? readSlot(e.clientX, e.clientY) : { cell: -1, slot: -1 };
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

/** Window-level Shift + pointer. Aim is $derived from these plus the game. */
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
    shiftInput.over = false;
    shiftInput.cell = -1;
    shiftInput.slot = -1;
  };
}
