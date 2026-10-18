import { PUZZLE } from './puzzle.js';

const TAP_MAX_TRAVEL = 8;
const TAP_MAX_MS = 500;
const ARM_PX = 28;
const DISARM_PX = 22;
const FLY_MS = 260;
const RETURN_MS = 200;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CUE_FLASH_MS = 1500;
const params = new URLSearchParams(location.search);
let cueIntervalMs = Number(params.get('cueMs')) || 30000;

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

const USER_STATE = ['values', 'manual', 'autoAdded', 'autoRemoved'];
const redoStack = [];

const capture = () => Object.fromEntries(USER_STATE.map((k) => [k, state[k].slice()]));

function snapshot() {
  flushPending();
  history.push(capture());
  if (history.length > 500) history.shift();
  redoStack.length = 0;
}

// Undo/redo are two-step: an amber ring lands on every affected cell first
// (RING_IN_MS), then the change is applied with the digit fade/scale. Anything
// that reads or edits the board flushes a pending step first.
const RING_IN_MS = 240;
const RING_MS = 620;
let pending = null;

function flushPending() {
  if (!pending) return;
  const p = pending;
  pending = null;
  clearTimeout(p.timer);
  p.apply();
}

function travel(from, to) {
  flushPending();
  const target = from.pop();
  if (!target) return;
  to.push(capture());
  const changed = [];
  for (let i = 0; i < 81; i++) {
    if (USER_STATE.some((k) => state[k][i] !== target[k][i])) changed.push(i);
  }
  const apply = () => {
    const before = boardSnapshot();
    Object.assign(state, target);
    if (changed.length) {
      state.selected = changed.includes(state.selected) ? state.selected : changed[0];
    }
    render();
    animateChange([], before);
  };
  for (const i of changed) restartClass(cells[i].el, 'undo-target', RING_MS);
  if (changed.length) quietHighlights();
  if (reducedMotion.matches || !changed.length) {
    apply();
  } else {
    pending = { apply, timer: setTimeout(flushPending, RING_IN_MS) };
    renderHistoryButtons();
  }
}

// Same-digit tints and candidate chips stay off while any undo/redo ring is
// running; each travel restarts the window so rapid repeats never flicker them.
const HL_IN_MS = 150;
let quietTimer = 0;
function quietHighlights() {
  clearTimeout(quietTimer);
  boardEl.classList.remove('hl-in');
  boardEl.classList.add('quiet');
  quietTimer = setTimeout(() => {
    boardEl.classList.remove('quiet');
    if (!reducedMotion.matches) restartClass(boardEl, 'hl-in', HL_IN_MS);
  }, RING_MS);
}

const undo = () => travel(history, redoStack);
const redo = () => travel(redoStack, history);

const boardSnapshot = () => Array.from({ length: 81 }, (_, i) => ({ v: value(i), n: candidates(i) }));

// Digits that appear or disappear (including auto candidates in peers) fade/scale
// in or out; `ringed` cells also get the amber ring. Used by undo/redo and Erase.
const UNDO_MS = 360;
function animateChange(ringed, before) {
  const reduce = reducedMotion.matches;
  for (const i of ringed) restartClass(cells[i].el, 'undo-target', RING_MS);
  if (reduce) return;
  for (let i = 0; i < 81; i++) {
    const { v, notes } = cells[i];
    const was = before[i];
    const now = value(i);
    if (now && now !== was.v) restartClass(v, 'undo-in');
    else if (!now && was.v) {
      v.textContent = was.v;
      restartClass(v, 'undo-out', () => { if (!value(i)) v.textContent = ''; });
    }
    const cand = candidates(i);
    for (let d = 1; d <= 9; d++) {
      const had = (was.n & bit(d)) !== 0;
      const has = (cand & bit(d)) !== 0;
      if (has && !had) restartClass(notes[d - 1], 'undo-in');
      else if (!has && had) restartClass(notes[d - 1], 'undo-out');
    }
  }
}

function restartClass(el, cls, ms = UNDO_MS, after) {
  if (typeof ms === 'function') [ms, after] = [UNDO_MS, ms];
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  clearTimeout(el[`_${cls}`]);
  el[`_${cls}`] = setTimeout(() => {
    el.classList.remove(cls);
    after?.();
  }, ms);
}

function editable(i) {
  return i >= 0 && !givens[i];
}

function setAnswer(i, d) {
  flushPending();
  if (!editable(i)) return false;
  snapshot();
  state.values[i] = state.values[i] === d ? 0 : d;
  render();
  return true;
}

// Erase only ever touches the answer or the active mode's own note set.
function eraseAction(i) {
  if (!editable(i)) return null;
  if (state.values[i]) return 'answer';
  if (state.autoNotes) return state.autoRemoved[i] || state.autoAdded[i] ? 'auto-overrides' : null;
  return state.manual[i] ? 'manual-notes' : null;
}

function clearCell(i) {
  flushPending();
  const action = eraseAction(i);
  if (!action) return;
  const before = boardSnapshot();
  snapshot();
  if (action === 'answer') {
    state.values[i] = 0;
  } else if (action === 'auto-overrides') {
    state.autoRemoved[i] = 0;
    state.autoAdded[i] = 0;
  } else {
    state.manual[i] = 0;
  }
  render();
  animateChange([i], before);
}

function toggleCandidate(i, d) {
  flushPending();
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
const cells = [];
const singleOpt = document.getElementById('opt-single');
const eraseBtn = document.getElementById('erase');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');

function renderHistoryButtons() {
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}
const singleRow = document.getElementById('opt-single-row');

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

/* ---------------- timer / pause ---------------- */

const timeEl = document.getElementById('time');
const timerEl = document.getElementById('timer');
const pauseBtn = document.getElementById('pause');
const coverEl = document.getElementById('paused-cover');
const pausedTimeEl = document.getElementById('paused-time');
let paused = false;
let complete = false;
let elapsedMs = 0;
let runStart = Date.now();

const running = () => !paused && !complete;
const elapsed = () => elapsedMs + (running() ? Date.now() - runStart : 0);

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function showTime() {
  const text = formatTime(elapsed());
  timeEl.textContent = text;
  pausedTimeEl.textContent = text;
}

function resetTimer() {
  elapsedMs = 0;
  runStart = Date.now();
  showTime();
}

function setRunning(update) {
  if (running()) elapsedMs += Date.now() - runStart;
  update();
  runStart = Date.now();
  showTime();
}

function setComplete(value) {
  if (value === complete) return;
  setRunning(() => { complete = value; });
  timerEl.classList.toggle('done', complete);
}

function setPaused(value) {
  if (value === paused) return;
  if (value && gesture) endGesture(true);
  setRunning(() => { paused = value; });
  document.body.classList.toggle('paused', paused);
  coverEl.hidden = !paused;
  pauseBtn.setAttribute('aria-pressed', String(paused));
  pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  if (paused) clearLoneFlashes();
}

pauseBtn.addEventListener('click', () => setPaused(!paused));
document.getElementById('resume').addEventListener('click', () => setPaused(false));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});
setInterval(showTime, 250);

/* ---------------- single-candidate cue ---------------- */

// One global clock: every cueIntervalMs, every cell that has exactly one
// candidate at that moment flashes it once for CUE_FLASH_MS. Board changes
// never restart the clock; a newly single cell just joins the next tick.
const lone = new Array(81).fill(0);
let cueClock = 0;
let cueHide = 0;

function clearLoneFlashes() {
  clearTimeout(cueHide);
  for (const n of boardEl.querySelectorAll('.n.lone-flash')) n.classList.remove('lone-flash');
}

function cueTick() {
  clearLoneFlashes();
  if (!state.singleCue || paused) return;
  for (let i = 0; i < 81; i++) {
    if (lone[i]) cells[i].notes[lone[i] - 1].classList.add('lone-flash');
  }
  cueHide = setTimeout(clearLoneFlashes, CUE_FLASH_MS);
}

function startCueClock() {
  clearInterval(cueClock);
  clearLoneFlashes();
  cueClock = setInterval(cueTick, cueIntervalMs);
}

function updateLoneCue(i, d) {
  const want = state.singleCue && state.autoNotes ? d : 0;
  cells[i].el.dataset.lone = want || '';
  if (want === lone[i]) return;
  lone[i] = want;
  for (const n of cells[i].notes) n.classList.remove('lone-flash');
}

window.__sudoku = {
  setCueInterval(ms) {
    cueIntervalMs = ms;
    startCueClock();
  },
  get cueInterval() {
    return cueIntervalMs;
  },
};

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
    el.classList.toggle('same', !!selV && i !== sel && val === selV);
    for (let d = 1; d <= 9; d++) notes[d - 1].classList.toggle('match', d === selV && digits.includes(d));
    el.classList.toggle('conflict', bad.has(i));
    el.setAttribute('aria-selected', i === sel ? 'true' : 'false');
    updateLoneCue(i, digits.length === 1 ? digits[0] : 0);
  }
  const sw = document.getElementById('notes-mode');
  sw.setAttribute('aria-checked', String(state.autoNotes));
  document.getElementById('notes-mode-label').textContent = state.autoNotes ? 'Auto' : 'Manual';
  eraseBtn.disabled = !eraseAction(sel);
  renderHistoryButtons();
  // In Manual mode the switch reads as off; state.singleCue keeps the saved value.
  singleOpt.disabled = !state.autoNotes;
  singleOpt.setAttribute('aria-checked', String(state.autoNotes && state.singleCue));
  singleRow.classList.toggle('disabled', !state.autoNotes);
  setComplete(filled === 81 && bad.size === 0);
}

function select(i) {
  flushPending();
  state.selected = i;
  render();
}

/* ---------------- board input ---------------- */

// Selection happens on pointerdown (no click delay, and iOS can't swallow it as
// part of its own double-tap handling). The second tap is detected here too.
const DOUBLE_TAP_MS = 300;
let lastTap = { i: -1, t: -Infinity, hl: 0 };

boardEl.addEventListener('pointerdown', (e) => {
  if (paused || (e.button !== undefined && e.button > 0)) return;
  const c = e.target.closest('.cell');
  if (!c) return;
  const i = Number(c.dataset.i);
  flushPending();
  const now = performance.now();
  // The first tap moves the selection (and so the highlight); remember which
  // digit was highlighted before it, for the second tap to use.
  const highlighted = state.selected >= 0 ? value(state.selected) : 0;
  const isDouble = lastTap.i === i && now - lastTap.t <= DOUBLE_TAP_MS;
  const hl = lastTap.hl;
  lastTap = isDouble ? { i: -1, t: -Infinity, hl: 0 } : { i, t: now, hl: highlighted };
  select(i);
  if (isDouble) doubleTapFill(i, hl);
});

// Auto notes only: the highlighted digit if it is one of the cell's candidates,
// otherwise the cell's lone candidate.
function doubleTapFill(i, highlighted) {
  if (!state.autoNotes || !editable(i) || state.values[i]) return;
  const cand = candidates(i);
  let d = 0;
  if (highlighted && cand & bit(highlighted)) d = highlighted;
  else if (popcount(cand) === 1) d = Math.log2(cand);
  if (!d) return;
  setAnswer(i, d);
  restartClass(cells[i].v, 'undo-in');
}

boardEl.addEventListener('contextmenu', (e) => {
  const c = e.target.closest('.cell');
  if (!c) return;
  if (paused) return;
  e.preventDefault();
  const i = Number(c.dataset.i);
  select(i);
  clearCell(i);
});

document.addEventListener('keydown', (e) => {
  if (paused) return;
  if (!confirmEl.hidden) {
    if (e.key === 'Escape') setConfirm(false);
    return;
  }
  if (!document.getElementById('sheet').hidden) {
    if (e.key === 'Escape') closeSheet();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'z') {
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

undoBtn.addEventListener('click', () => { if (!paused) undo(); });
redoBtn.addEventListener('click', () => { if (!paused) redo(); });
eraseBtn.addEventListener('click', () => { if (!paused) clearCell(state.selected); });
document.getElementById('notes-mode').addEventListener('click', () => {
  if (paused) return;
  flushPending();
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
singleOpt.addEventListener('click', () => {
  if (singleOpt.disabled) return;
  state.singleCue = !state.singleCue;
  render();
});

const confirmEl = document.getElementById('confirm-restart');
const confirmBackdrop = document.getElementById('confirm-backdrop');
function setConfirm(open) {
  confirmEl.hidden = !open;
  confirmBackdrop.hidden = !open;
  if (open) document.getElementById('confirm-cancel').focus();
}
document.getElementById('opt-reset').addEventListener('click', () => setConfirm(true));
document.getElementById('confirm-cancel').addEventListener('click', () => setConfirm(false));
confirmBackdrop.addEventListener('click', () => setConfirm(false));
document.getElementById('confirm-ok').addEventListener('click', () => {
  state.values.fill(0);
  state.manual.fill(0);
  state.autoAdded.fill(0);
  state.autoRemoved.fill(0);
  state.selected = -1;
  flushPending();
  history.length = 0;
  redoStack.length = 0;
  resetTimer();
  setConfirm(false);
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
  flushPending();
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
  if (!g.lifting && up > TAP_MAX_TRAVEL && up > Math.abs(dx) * 0.75) g.lifting = true;
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
  g.key.classList.remove('pressed', 'armed', 'show-label', 'remove');
  releaseKey(g.key);
}

// The key's own digit stays hidden while a lifted copy belongs to it: either
// the live gesture's lift or a flight that is still travelling back into it.
function releaseKey(key) {
  const held = (gesture && gesture.key === key && gesture.lift) ||
    [...flights].some((f) => f.key === key && f.hidesKey);
  if (!held) key.classList.remove('lifted');
}

// Every in-flight animation is registered so it can be settled synchronously
// (jumped to its end state) when a new gesture starts on the same key.
const flights = new Set();

function fly(el, from, to, ms, { key, hidesKey = false, done }) {
  const f = { key, hidesKey, settled: false, anim: null };
  f.settle = () => {
    if (f.settled) return;
    f.settled = true;
    flights.delete(f);
    f.anim?.cancel();
    el.remove();
    done?.();
    releaseKey(key);
  };
  flights.add(f);
  if (!el.animate) {
    f.settle();
    return;
  }
  f.anim = el.animate([{ transform: from }, { transform: to }], {
    duration: ms,
    easing: EASE_OUT,
    fill: 'forwards',
  });
  f.anim.onfinish = f.settle;
  f.anim.oncancel = f.settle;
}

function settleFlights(key) {
  for (const f of [...flights]) if (f.key === key) f.settle();
}

function flyHome(g) {
  g.key.classList.add('lifted');
  fly(g.lift, g.lift.style.transform, liftTransform(g.origin.x, g.origin.y), RETURN_MS, {
    key: g.key,
    hidesKey: true,
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
  fly(g.lift, g.lift.style.transform, liftTransform(target.x, target.y, noteScale(slot)), FLY_MS, {
    key: g.key,
    done: () => {
      slot.classList.remove('hidden-pending');
      flash(slot);
    },
  });
}

function commitRemove(g) {
  const slot = noteEl(g.cell, g.d);
  const start = center(slot);
  const scale = noteScale(slot);
  toggleCandidate(g.cell, g.d);
  g.lift?.remove();
  if (reducedMotion.matches || !g.lift) return;
  const key = g.key;
  key.classList.add('lifted');
  const el = document.createElement('div');
  el.className = 'lift remove';
  el.textContent = g.d;
  document.body.appendChild(el);
  const from = liftTransform(start.x, start.y, scale);
  el.style.transform = from;
  fly(el, from, liftTransform(g.origin.x, g.origin.y), FLY_MS, {
    key,
    hidesKey: true,
    done: () => flash(key),
  });
}

function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 260);
}

function endGesture(cancelled) {
  const g = gesture;
  gesture = null;
  clearPreview(g);
  if (g.key.hasPointerCapture?.(g.id)) g.key.releasePointerCapture(g.id);
  const elapsed = performance.now() - g.t0;
  const isTap = !cancelled && g.maxTravel < TAP_MAX_TRAVEL && elapsed < TAP_MAX_MS;
  const commit = !cancelled && g.armed && g.mode;
  resetKey(g);

  if (isTap) {
    g.lift?.remove();
    if (state.selected >= 0) setAnswer(state.selected, g.d);
  } else if (commit) {
    if (g.mode === 'add') commitAdd(g);
    else commitRemove(g);
  } else if (g.lift) {
    flyHome(g);
  }
}

const ours = (e) => gesture && e.pointerId === gesture.id;

for (const key of keys) {
  key.addEventListener('pointerdown', (e) => {
    if (paused || (e.button !== undefined && e.button > 0)) return;
    e.preventDefault();
    // A gesture still open here never received its end event (or this is a
    // second finger); it must not block the new press.
    if (gesture) endGesture(true);
    settleFlights(key);
    gesture = startGesture(e, key);
    try { key.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  // Spec order is pointerup/pointercancel, then lostpointercapture, so a gesture
  // still open at this point lost its pointer without a proper end.
  key.addEventListener('lostpointercapture', (e) => {
    if (ours(e) && gesture.key === key) endGesture(true);
  });
}
window.addEventListener('pointermove', (e) => { if (ours(e)) moveGesture(e); });
window.addEventListener('pointerup', (e) => { if (ours(e)) endGesture(false); });
window.addEventListener('pointercancel', (e) => { if (ours(e)) endGesture(true); });
window.addEventListener('blur', () => { if (gesture) endGesture(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gesture) endGesture(true);
});
keypadEl.addEventListener('contextmenu', (e) => e.preventDefault());
// Keeps the browser's own gesture recognizer out of keypad touches; otherwise
// a tap right after a swipe can be swallowed as part of a double-tap.
keypadEl.addEventListener('touchstart', (e) => {
  if (e.target.closest('.key')) e.preventDefault();
}, { passive: false });
// iOS Safari can still double-tap-zoom despite touch-action: manipulation.
// Cancelling a single-finger touchend stops the zoom (and the synthesized
// click, which the board doesn't use: selection runs on pointerdown) while
// leaving two-finger pinch zoom alone.
for (const el of [boardEl, keypadEl]) {
  el.addEventListener('touchend', (e) => {
    if (e.touches.length === 0 && e.changedTouches.length === 1) e.preventDefault();
  }, { passive: false });
}

render();
startCueClock();
