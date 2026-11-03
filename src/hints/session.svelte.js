import { applyHint, hintSnapshot, hintStateKey } from "./hint.js";

/** @param {{game: ReturnType<typeof import('../game/game.svelte.js').createGame>, provider?: import('./hint.js').HintProvider | null}} options */
export function createHintSession({ game, provider = null }) {
  /** @type {'closed'|'unavailable'|'searching'|'ready'|'empty'|'error'|'stale'|'applied'} */
  let status = $state("closed");
  let stage = $state(0);
  let hint = $state.raw(/** @type {import('./hint.js').Hint | null} */ (null));
  let key = "";
  let generation = 0;
  let controller = /** @type {AbortController | null} */ (null);
  let applied = /** @type {import('../game/game.js').GameState | null} */ (null);
  let undoAvailable = $state(false);
  let didApply = $state(false);
  function cancel() {
    generation++;
    controller?.abort();
    controller = null;
  }
  function close() {
    cancel();
    status = "closed";
    applied = null;
    undoAvailable = false;
    didApply = false;
  }
  async function open() {
    cancel();
    hint = null;
    stage = 0;
    applied = null;
    undoAvailable = false;
    didApply = false;
    if (!provider) {
      status = "unavailable";
      return;
    }
    key = hintStateKey(game.state);
    const request = generation;
    controller = new AbortController();
    status = "searching";
    try {
      const result = await provider(hintSnapshot(game.state), { signal: controller.signal });
      if (request !== generation) return;
      if (key !== hintStateKey(game.state)) {
        status = "stale";
        return;
      }
      hint = result;
      status = result ? "ready" : "empty";
    } catch {
      if (request === generation) status = "error";
    }
  }
  /** @param {import('../game/game.js').GameState} state */
  function reconcile(state) {
    if ((status === "ready" || status === "searching") && hintStateKey(state) !== key) {
      cancel();
      status = "stale";
    } else if (status === "applied" && state !== applied) {
      applied = null;
      undoAvailable = false;
      didApply = false;
      status = "stale";
    }
  }
  function apply() {
    if (status !== "ready" || !hint || stage !== 2) return;
    if (key !== hintStateKey(game.state)) {
      cancel();
      status = "stale";
      return;
    }
    try {
      // Flush any pending undo/paint transaction before checking the baseline again.
      game.beginStroke();
      if (key !== hintStateKey(game.state)) {
        status = "stale";
        return;
      }
      const before = game.state;
      const next = applyHint(before, hint);
      if (next !== before) game.commitStroke(next);
      applied = game.state;
      didApply = next !== before;
      undoAvailable = didApply && game.canUndo;
      status = "applied";
    } catch {
      status = "error";
    }
  }
  function undo() {
    if (status !== "applied" || !undoAvailable || game.state !== applied) {
      reconcile(game.state);
      return;
    }
    game.undo();
    applied = null;
    undoAvailable = false;
    didApply = false;
    close();
  }
  /** @param {number} cell */
  function evidence(cell) {
    if (status !== "ready" || !hint) return null;
    const observe = hint.observeCells.includes(cell);
    const premise = stage >= 1 && hint.premiseCells.includes(cell);
    const target = stage === 2 && hint.placements.some((p) => p.cell === cell);
    const candidates =
      stage >= 1 ? hint.premiseCandidates.filter((p) => p.cell === cell).map((p) => p.digit) : [];
    const excluded =
      stage >= 1 ? hint.excludedCandidates.filter((p) => p.cell === cell).map((p) => p.digit) : [];
    const eliminations =
      stage === 2 ? hint.eliminations.filter((p) => p.cell === cell).map((p) => p.digit) : [];
    return observe ||
      premise ||
      target ||
      candidates.length ||
      excluded.length ||
      eliminations.length
      ? {
          observe,
          premise,
          target,
          candidates,
          excluded,
          eliminations,
          mask: hint.candidateMasks[cell],
        }
      : null;
  }
  return {
    get status() {
      return status;
    },
    get stage() {
      return stage;
    },
    get hint() {
      return hint;
    },
    get isOpen() {
      return status !== "closed";
    },
    get didApply() {
      return didApply;
    },
    get undoAvailable() {
      return undoAvailable;
    },
    open,
    close,
    reconcile,
    apply,
    undo,
    evidence,
    next() {
      if (status === "ready" && stage < 2) stage++;
    },
  };
}
