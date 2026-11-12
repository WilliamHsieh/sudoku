import { withBankLock } from "./write-lock.js";
import { fromSnapshot } from "../game/snapshot.js";

export const CUSTOM_SAVES_KEY = "sudoku-bank-custom-v1";
export const CUSTOM_LABEL = "Custom puzzle";
/** Custom boards have no rating or unlock evidence. They use the shared bank lock,
 * but never enter the rated attempt log.
 * @typedef {{attemptId:string, puzzle:string, snapshot:import('../game/snapshot.js').Snapshot, elapsed:number, updatedAt:number, completed:boolean, label?:string, createdAt?:number}} CustomSlot
 */
/** @param {import('./types.js').Storage} storage @returns {Record<string,CustomSlot>} */
function read(storage) {
  const text = storage.getItem(CUSTOM_SAVES_KEY);
  if (text === null) return {};
  const data = JSON.parse(text);
  if (
    data?.schema !== 1 ||
    !data.slots ||
    Array.isArray(data.slots) ||
    typeof data.slots !== "object"
  )
    throw new Error("Could not read custom saves.");
  for (const [id, slot] of Object.entries(data.slots)) {
    if (
      id !== slot.attemptId ||
      slot.puzzle !== slot.snapshot?.puzzle ||
      !Number.isSafeInteger(slot.elapsed) ||
      slot.elapsed < 0 ||
      !Number.isSafeInteger(slot.updatedAt) ||
      slot.updatedAt <= 0 ||
      typeof slot.completed !== "boolean"
    )
      throw new Error("Invalid custom save.");
    fromSnapshot(slot.snapshot);
  }
  return data.slots;
}
/** @param {{storage?:import('./types.js').Storage,locks?:Pick<LockManager,'request'>|null}} [options] */
export function createCustomRecorder(options = {}) {
  const storage = options.storage ?? localStorage;
  const locks = options.locks === undefined ? navigator.locks : options.locks;
  let id = "";
  let label = CUSTOM_LABEL;
  let createdAt = 0;
  let expected = null;
  let last = "";
  let draining = null;
  const jobs = [];
  function drain() {
    if (!draining)
      draining = withBankLock(locks, () => {
        while (jobs.length) {
          const value = jobs[0];
          const slots = read(storage);
          const current = JSON.stringify(slots[id] ?? null);
          const next = JSON.stringify(value);
          if (current !== expected && current !== next)
            throw new Error("Custom game changed in another tab.");
          const text = JSON.stringify({ schema: 1, slots: { ...slots, [id]: value } });
          storage.setItem(CUSTOM_SAVES_KEY, text);
          if (storage.getItem(CUSTOM_SAVES_KEY) !== text)
            throw new Error("Could not verify custom save.");
          expected = next;
          jobs.shift();
        }
      })
        .catch(() => {})
        .finally(() => {
          draining = null;
        });
    return draining;
  }
  return {
    get label() {
      return label;
    },
    get attemptId() {
      return id;
    },
    /** @param {string} [attemptId] @param {string} [name] */
    async open(attemptId = crypto.randomUUID(), name = CUSTOM_LABEL) {
      return withBankLock(locks, () => {
        const slots = read(storage);
        id = attemptId;
        last = "";
        label = slots[id]?.label ?? name;
        createdAt = slots[id]?.createdAt ?? slots[id]?.updatedAt ?? Date.now();
        expected = JSON.stringify(slots[id] ?? null);
        return slots[id] ?? null;
      });
    },
    /** @param {import('../game/snapshot.js').Snapshot} snapshot @param {number} elapsed @param {boolean} completed */
    save(snapshot, elapsed, completed) {
      const content = JSON.stringify({ snapshot, elapsed, completed });
      if (content === last) return;
      last = content;
      jobs.push({
        attemptId: id,
        label,
        puzzle: snapshot.puzzle,
        snapshot: structuredClone(snapshot),
        elapsed,
        completed,
        createdAt,
        updatedAt: Date.now(),
      });
      void drain();
    },
    async flush(strict = false) {
      await drain();
      if (jobs.length && strict) throw new Error("Could not save custom game. Please retry.");
      return { ok: !jobs.length };
    },
    async list() {
      return (await this.all()).filter((s) => !s.completed);
    },
    async all() {
      return withBankLock(locks, () =>
        Object.values(read(storage)).sort((a, b) => b.updatedAt - a.updatedAt)
      );
    },
  };
}
/** One record per board (its givens), numbered in first-opened order.
 * The saved solve is the earliest one, as in the level lists. A replay in progress is not solved.
 * @param {CustomSlot[]} slots */
export function customPuzzles(slots) {
  const opened = (/** @type {CustomSlot} */ s) => s.createdAt ?? s.updatedAt;
  /** @type {Map<string, CustomSlot[]>} */
  const boards = new Map();
  for (const s of [...slots].sort(
    (a, b) => opened(a) - opened(b) || a.attemptId.localeCompare(b.attemptId)
  ))
    boards.set(s.puzzle, [...(boards.get(s.puzzle) ?? []), s]);
  return [...boards.values()].map((group, i) => {
    const solves = group.filter((s) => s.completed).sort((a, b) => a.updatedAt - b.updatedAt);
    const active = group.filter((s) => !s.completed).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const label = group[0].label ?? CUSTOM_LABEL;
    return {
      puzzle: { digits: group[0].puzzle },
      name: `Custom ${i + 1}`,
      label,
      title: label === CUSTOM_LABEL ? `Custom ${i + 1}` : label,
      status: active ? (solves.length ? "replaying" : "in_progress") : "solved",
      solves,
      active: active ? { attemptId: active.attemptId, effectiveMs: active.elapsed * 1000 } : null,
    };
  });
}
