import { PUZZLE } from './puzzle.js';

const TAP_MAX_TRAVEL = 8;
const TAP_MAX_MS = 500;
const ARM_PX = 28;
const DISARM_PX = 22;
const FLY_MS = 260;
const RETURN_MS = 200;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const givens = PUZZLE.split('').map(Number);
const ROW = (i) => Math.floor(i / 9);
const COL = (i) => i % 9;
const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const out = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) out.push(j);
  }
  return out;
});
const bit = (d) => 1 << d;

const state = {
  values: new Array(81).fill(0),
  manual: new Array(81).fill(0),
  autoAdded: new Array(81).fill(0),
  autoRemoved: new Array(81).fill(0),
  autoNotes: false,
  singleCue: true,
  selected: -1,
};
const history = [];

const value = (i) => givens[i] || state.values[i];

function computedCandidates(i) {
  if (value(i)) return 0;
  let mask = 0b1111111110;
  for (const p of PEERS[i]) {
    const v = value(p);
    if (v) mask &= ~bit(v);
  }
  return mask;
}

function candidates(i) {
  if (value(i)) return 0;
  if (!state.autoNotes) return state.manual[i];
  return (computedCandidates(i) & ~state.autoRemoved[i]) | state.autoAdded[i];
}

function hasCandidate(i, d) {
  return (candidates(i) & bit(d)) !== 0;
}

function popcount(m) {
  let n = 0;
  while (m) { n += m & 1; m >>= 1; }
  return n;
}

function snapshot() {
  history.push({
    values: state.values.slice(),
    manual: state.manual.slice(),
    autoAdded: state.autoAdded.slice(),
    autoRemoved: state.autoRemoved.slice(),
  });
  if (history.length > 500) history.shift();
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  Object.assign(state, prev);
  render();
}

function editable(i) {
  return i >= 0 && !givens[i];
}

function setAnswer(i, d) {
  if (!editable(i)) return false;
  snapshot();
  state.values[i] = state.values[i] === d ? 0 : d;
  render();
  return true;
}

function clearCell(i) {
  if (!editable(i)) return;
  if (state.values[i]) {
    snapshot();
    state.values[i] = 0;
  } else if (candidates(i)) {
    snapshot();
    if (state.autoNotes) {
      state.autoRemoved[i] = 0b1111111110;
      state.autoAdded[i] = 0;
    } else {
      state.manual[i] = 0;
    }
  } else {
    return;
  }
  render();
}

function toggleCandidate(i, d) {
  if (!editable(i) || state.values[i]) return false;
  snapshot();
  const b = bit(d);
  if (state.autoNotes) {
    const present = hasCandidate(i, d);
    if (present) {
      if (state.autoAdded[i] & b) state.autoAdded[i] &= ~b;
      if (computedCandidates(i) & b) state.autoRemoved[i] |= b;
    } else if (state.autoRemoved[i] & b) {
      state.autoRemoved[i] &= ~b;
    } else {
      state.autoAdded[i] |= b;
    }
  } else {
    state.manual[i] ^= b;
  }
  render();
  return true;
}

/* ---------------- rendering ---------------- */

const boardEl = document.getElementById('board');
const keypadEl = document.getElementById('keypad');
const statusEl = document.getElementById('status');
const cells = [];

for (let i = 0; i < 81; i++) {
  const el = document.createElement('div');
  el.className = 'cell';
  el.dataset.i = i;
  el.dataset.r = ROW(i);
  el.dataset.c = COL(i);
  el.setAttribute('role', 'gridcell');
  const v = document.createElement('span');
  v.className = 'v';
  const notes = document.createElement('div');
  notes.className = 'notes';
  for (let d = 1; d <= 9; d++) {
    const n = document.createElement('span');
    n.className = 'n';
    n.dataset.d = d;
    n.textContent = d;
    notes.appendChild(n);
  }
  el.append(v, notes);
  boardEl.appendChild(el);
  cells.push({ el, v, notes: [...notes.children] });
}

const keys = [];
for (let d = 1; d <= 9; d++) {
  const k = document.createElement('div');
  k.className = 'key';
  k.dataset.d = d;
  k.setAttribute('role', 'button');
  k.setAttribute('aria-label', `Digit ${d}`);
  k.innerHTML = `<span class="label"></span><span class="digit">${d}</span>`;
  keypadEl.appendChild(k);
  keys.push(k);
}

function conflicts() {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    const v = value(i);
    if (!v) continue;
    for (const p of PEERS[i]) {
      if (value(p) === v) { bad.add(i); break; }
    }
  }
  return bad;
}

function render() {
  const sel = state.selected;
  const selV = sel >= 0 ? value(sel) : 0;
  const bad = conflicts();
  let filled = 0;
  for (let i = 0; i < 81; i++) {
    const { el, v, notes } = cells[i];
    const val = value(i);
    if (val) filled++;
    v.textContent = val || '';
    el.dataset.value = val || '';
    const cand = candidates(i);
    const digits = [];
    for (let d = 1; d <= 9; d++) {
      const on = (cand & bit(d)) !== 0;
      notes[d - 1].classList.toggle('on', on);
      if (on) digits.push(d);
    }
    el.dataset.notes = digits.join('');
    el.classList.toggle('given', !!givens[i]);
    el.classList.toggle('user', !givens[i] && !!val);
    el.classList.toggle('selected', i === sel);
    el.classList.toggle('peer', sel >= 0 && i !== sel && PEERS[sel].includes(i));
    el.classList.toggle('same', !!selV && i !== sel && val === selV);
    el.classList.toggle('conflict', bad.has(i));
    el.classList.toggle('single-cue', state.singleCue && !val && digits.length === 1);
    el.setAttribute('aria-selected', i === sel ? 'true' : 'false');
  }
  const sw = document.getElementById('notes-mode');
  sw.setAttribute('aria-checked', String(state.autoNotes));
  document.getElementById('notes-mode-label').textContent = state.autoNotes ? 'Auto' : 'Manual';
  const complete = filled === 81 && bad.size === 0;
  statusEl.textContent = complete ? 'Complete' : `${81 - filled} left`;
  statusEl.classList.toggle('done', complete);
}

function select(i) {
  state.selected = i;
  render();
}

/* ---------------- board input ---------------- */

boardEl.addEventListener('click', (e) => {
  const c = e.target.closest('.cell');
  if (c) select(Number(c.dataset.i));
});
boardEl.addEventListener('contextmenu', (e) => {
  const c = e.target.closest('.cell');
  if (!c) return;
  e.preventDefault();
  const i = Number(c.dataset.i);
  select(i);
  clearCell(i);
});

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('sheet').hidden) {
    if (e.key === 'Escape') closeSheet();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (m) {
    e.preventDefault();
    const d = Number(m[1]);
    if (state.selected < 0) return;
    if (d === 0) clearCell(state.selected);
    else if (e.shiftKey) toggleCandidate(state.selected, d);
    else setAnswer(state.selected, d);
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    if (state.selected >= 0) clearCell(state.selected);
    return;
  }
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (moves[e.key]) {
    e.preventDefault();
    const [dr, dc] = moves[e.key];
    const cur = state.selected < 0 ? 40 : state.selected;
    const r = (ROW(cur) + dr + 9) % 9;
    const c = (COL(cur) + dc + 9) % 9;
    select(state.selected < 0 ? 40 : r * 9 + c);
  }
});

/* ---------------- tools ---------------- */

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('erase').addEventListener('click', () => clearCell(state.selected));
document.getElementById('notes-mode').addEventListener('click', () => {
  state.autoNotes = !state.autoNotes;
  render();
});

const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');
function openSheet() { sheet.hidden = false; backdrop.hidden = false; }
function closeSheet() { sheet.hidden = true; backdrop.hidden = true; }
document.getElementById('more').addEventListener('click', openSheet);
document.getElementById('sheet-close').addEventListener('click', closeSheet);
backdrop.addEventListener('click', closeSheet);
const singleOpt = document.getElementById('opt-single');
singleOpt.checked = state.singleCue;
singleOpt.addEventListener('change', () => {
  state.singleCue = singleOpt.checked;
  render();
});
document.getElementById('opt-reset').addEventListener('click', () => {
  snapshot();
  state.values.fill(0);
  state.manual.fill(0);
  state.autoAdded.fill(0);
  state.autoRemoved.fill(0);
  closeSheet();
  render();
});

/* ---------------- keypad gesture ---------------- */

function rubberBand(dy) {
  if (dy <= 0) return -Math.min(12, -dy * 0.25);
  if (dy <= ARM_PX) return dy * 0.85;
  const over = dy - ARM_PX;
  const dim = 120;
  return ARM_PX * 0.85 + (over * 0.55 * dim) / (dim + 0.55 * over);
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

function haptic(ms) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* unsupported */ }
  }
}

let gesture = null;

function noteEl(i, d) {
  return cells[i].notes[d - 1];
}

function clearPreview(g) {
  if (g.previewEl) g.previewEl.classList.remove('preview-add', 'preview-remove');
  g.previewEl = null;
}

function applyArmVisual(g) {
  g.key.classList.toggle('armed', g.armed);
}

function startGesture(e, key) {
  const d = Number(key.dataset.d);
  const i = state.selected;
  const canNote = editable(i) && !state.values[i];
  const mode = canNote ? (hasCandidate(i, d) ? 'remove' : 'add') : null;
  const g = {
    id: e.pointerId,
    key,
    d,
    cell: i,
    mode,
    startX: e.clientX,
    startY: e.clientY,
    t0: performance.now(),
    maxTravel: 0,
    armed: false,
    lifting: false,
    lift: null,
    origin: center(key.querySelector('.digit')),
    offset: { x: 0, y: 0 },
    previewEl: null,
  };
  key.classList.add('pressed');
  key.classList.toggle('remove', mode === 'remove');
  key.querySelector('.label').textContent =
    mode === 'remove' ? '\u2212 candidate' : mode === 'add' ? '+ candidate' : '';
  return g;
}

function ensureLift(g) {
  if (g.lift) return;
  const lift = document.createElement('div');
  lift.className = `lift ${g.mode || ''}`;
  lift.textContent = g.d;
  document.body.appendChild(lift);
  g.lift = lift;
  g.key.classList.add('lifted');
  positionLift(g);
}

function liftTransform(x, y, scale = 1) {
  return `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
}

function positionLift(g) {
  const x = g.origin.x + g.offset.x;
  const y = g.origin.y + g.offset.y;
  g.lift.style.transform = liftTransform(x, y);
}

function moveGesture(e) {
  const g = gesture;
  const dx = e.clientX - g.startX;
  const up = g.startY - e.clientY;
  g.maxTravel = Math.max(g.maxTravel, Math.hypot(dx, up));
  if (!g.lifting && g.maxTravel >= TAP_MAX_TRAVEL) g.lifting = true;
  if (!g.lifting) return;

  if (g.mode) {
    g.key.classList.add('show-label');
    if (!g.previewEl) {
      g.previewEl = noteEl(g.cell, g.d);
      g.previewEl.classList.add(g.mode === 'add' ? 'preview-add' : 'preview-remove');
    }
  }

  if (!reducedMotion.matches) {
    ensureLift(g);
    g.offset = { x: dx * 0.15, y: -rubberBand(up) };
    positionLift(g);
  }

  const wasArmed = g.armed;
  if (!g.armed && up >= ARM_PX && g.mode) g.armed = true;
  else if (g.armed && up < DISARM_PX) g.armed = false;
  if (g.armed !== wasArmed) {
    applyArmVisual(g);
    if (g.armed) haptic(8);
  }
}

function resetKey(g) {
  g.key.classList.remove('pressed', 'armed', 'show-label', 'lifted', 'remove');
}

function animate(el, from, to, ms) {
  if (!el.animate) return Promise.resolve();
  const anim = el.animate([{ transform: from }, { transform: to }], {
    duration: ms,
    easing: EASE_OUT,
    fill: 'forwards',
  });
  return anim.finished.catch(() => {});
}

function flyHome(g) {
  const lift = g.lift;
  const key = g.key;
  const from = lift.style.transform;
  const to = liftTransform(g.origin.x, g.origin.y);
  animate(lift, from, to, RETURN_MS).then(() => {
    lift.remove();
    if (gesture?.key !== key) key.classList.remove('lifted');
  });
}

function noteScale(slot) {
  const fs = parseFloat(getComputedStyle(slot).fontSize);
  return fs / 28;
}

function commitAdd(g) {
  const slot = noteEl(g.cell, g.d);
  toggleCandidate(g.cell, g.d);
  if (reducedMotion.matches || !g.lift) {
    g.lift?.remove();
    return;
  }
  slot.classList.add('hidden-pending');
  const target = center(slot);
  const lift = g.lift;
  const from = lift.style.transform;
  const to = liftTransform(target.x, target.y, noteScale(slot));
  animate(lift, from, to, FLY_MS).then(() => {
    lift.remove();
    slot.classList.remove('hidden-pending');
    flash(slot);
  });
}

function commitRemove(g) {
  const slot = noteEl(g.cell, g.d);
  const start = center(slot);
  const scale = noteScale(slot);
  toggleCandidate(g.cell, g.d);
  if (reducedMotion.matches || !g.lift) {
    g.lift?.remove();
    return;
  }
  g.lift.remove();
  const key = g.key;
  key.classList.add('lifted');
  const fly = document.createElement('div');
  fly.className = 'lift remove';
  fly.textContent = g.d;
  document.body.appendChild(fly);
  const from = liftTransform(start.x, start.y, scale);
  fly.style.transform = from;
  animate(fly, from, liftTransform(g.origin.x, g.origin.y), FLY_MS).then(() => {
    fly.remove();
    if (gesture?.key !== key) key.classList.remove('lifted');
    flash(key);
  });
}

function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 260);
}

function endGesture(e, cancelled) {
  const g = gesture;
  gesture = null;
  clearPreview(g);
  const elapsed = performance.now() - g.t0;
  const isTap = !cancelled && g.maxTravel < TAP_MAX_TRAVEL && elapsed < TAP_MAX_MS;
  const commit = !cancelled && g.armed && g.mode;
  const mode = g.mode;
  resetKey(g);

  if (isTap) {
    if (g.lift) g.lift.remove();
    if (state.selected >= 0) setAnswer(state.selected, g.d);
    return;
  }
  if (commit) {
    if (mode === 'add') commitAdd(g);
    else commitRemove(g);
    return;
  }
  if (g.lift) {
    g.key.classList.add('lifted');
    flyHome(g);
  }
}

keypadEl.addEventListener('pointerdown', (e) => {
  const key = e.target.closest('.key');
  if (!key || gesture) return;
  if (e.button !== undefined && e.button > 0) return;
  e.preventDefault();
  key.setPointerCapture?.(e.pointerId);
  gesture = startGesture(e, key);
});
keypadEl.addEventListener('pointermove', (e) => {
  if (gesture && e.pointerId === gesture.id) moveGesture(e);
});
keypadEl.addEventListener('pointerup', (e) => {
  if (gesture && e.pointerId === gesture.id) endGesture(e, false);
});
keypadEl.addEventListener('pointercancel', (e) => {
  if (gesture && e.pointerId === gesture.id) endGesture(e, true);
});
keypadEl.addEventListener('contextmenu', (e) => e.preventDefault());
// Keeps the browser's own gesture recognizer out of keypad touches; otherwise
// a tap right after a swipe can be swallowed as part of a double-tap.
keypadEl.addEventListener('touchstart', (e) => {
  if (e.target.closest('.key')) e.preventDefault();
}, { passive: false });

render();
