import { get, writable } from "svelte/store";

// Displayed seconds are whole seconds of running time. The partial second
// stays here so resume can schedule the next tick from that remainder.
// A 1s interval that keeps running through a pause fires early instead.
// Solved + in-progress journal history live in src/journal/progress.js.

const doneStore = writable(false);
const timerStore = writable(0);
const runningStore = writable(true);

const setDoneValue = doneStore.set.bind(doneStore);
const setTimerValue = timerStore.set.bind(timerStore);
const setRunningValue = runningStore.set.bind(runningStore);

/** Whole milliseconds of running time already folded in. */
let accumulated = 0;
/** `performance.now()` when the current running segment began. */
let segmentStart = 0;
let ticking = false;
let runningWanted = true;
let solved = false;
let attachments = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let tickHandle;

function mono() {
  return Math.floor(performance.now());
}

function liveMs() {
  if (!ticking) return accumulated;
  return accumulated + Math.max(0, mono() - segmentStart);
}

function publish() {
  setTimerValue(Math.floor(liveMs() / 1000));
}

function clearTick() {
  if (tickHandle !== undefined) clearTimeout(tickHandle);
  tickHandle = undefined;
}

/** @param {number} ms */
function delayUntilNextSecond(ms) {
  const into = ms % 1000;
  return into === 0 ? 1000 : 1000 - into;
}

function arm() {
  clearTick();
  if (!ticking) return;
  tickHandle = setTimeout(() => {
    tickHandle = undefined;
    publish();
    arm();
  }, delayUntilNextSecond(liveMs()));
}

function syncTicking() {
  const want = attachments > 0 && runningWanted && !solved;
  if (want === ticking) return;
  if (want) {
    ticking = true;
    segmentStart = mono();
    arm();
    return;
  }
  accumulated += Math.max(0, mono() - segmentStart);
  ticking = false;
  clearTick();
  publish();
}

/**
 * @param {number} seconds absolute displayed seconds. Saved games store
 * whole seconds, so a restore starts cleanly on a second boundary.
 */
function setDisplayed(seconds) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  accumulated = whole * 1000;
  if (ticking) segmentStart = mono();
  setTimerValue(whole);
  if (ticking) arm();
}

doneStore.set = (value) => {
  solved = !!value;
  setDoneValue(solved);
  syncTicking();
};
doneStore.update = (fn) => {
  doneStore.set(fn(get(doneStore)));
};

timerStore.set = (value) => {
  setDisplayed(value);
};
timerStore.update = (fn) => {
  timerStore.set(fn(get(timerStore)));
};

runningStore.set = (value) => {
  runningWanted = !!value;
  setRunningValue(runningWanted);
  syncTicking();
};
runningStore.update = (fn) => {
  runningStore.set(fn(get(runningStore)));
};

export let done = doneStore;

export let timer = timerStore;
export let timerRunning = runningStore;

export { solvedPuzzles, puzzleProgress } from "./journal/progress.js";

export function resetTimer() {
  timer.set(0);
  timerRunning.set(true);
}

/**
 * Count running time into `$timer`. Time while this is detached (the
 * journal, where the clock is not on screen) is not included. The next
 * displayed second lands one second of running time after the last one.
 * @returns {() => void} detach
 */
export function attachElapsedTimer() {
  attachments += 1;
  syncTicking();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    attachments -= 1;
    syncTicking();
  };
}

export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}
