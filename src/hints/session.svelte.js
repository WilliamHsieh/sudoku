import { applyHint, hintSnapshot, hintStateKey } from "./hint.js";
import { hintIdentity } from "./progress.js";

/** @param {{game: ReturnType<typeof import('../game/game.svelte.js').createGame>, provider?: import('./hint.js').HintProvider | null, beforeOpen?: () => void}} options */
export function createHintSession({ game, provider = null, beforeOpen = () => {} }) {
  /** @type {'closed'|'unavailable'|'searching'|'ready'|'empty'|'error'|'stale'|'applied'} */
  let status = $state("closed");
  let stage = $state(0);
  let hint = $state.raw(/** @type {import('./hint.js').Hint | null} */ (null));
  let key = "";
  let loadId = game.loadId;
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
  function reset() {
    cancel();
    status = "closed";
    hint = null;
    stage = 0;
    key = "";
    applied = null;
    undoAvailable = false;
    didApply = false;
  }
  function close() {
    reset();
    // A late lifecycle callback must not clear a newly loaded slot.
    if (loadId === game.loadId) game.setHintProgress(null);
    loadId = game.loadId;
  }
  function suspend() {
    reset();
    loadId = game.loadId;
  }
  function remember() {
    if (status === "ready" && hint && loadId === game.loadId)
      game.setHintProgress({ version: 1, key, identity: hintIdentity(hint), stage });
  }
  async function resume() {
    if (loadId !== game.loadId) suspend();
    if (status !== "closed") return;
    const saved = game.hintProgress;
    if (saved) await open(saved);
  }
  const isManual = () => game.notesMode === "manual";
  /** @param {import('./progress.js').HintProgress | null} [saved] */
  async function open(saved = null) {
    const wasClosed = status === "closed";
    reset();
    loadId = game.loadId;
    if (!saved) game.setHintProgress(null);
    if (game.notesMode === "manual") return;
    beforeOpen();
    // Settling an already requested history action may change the notes mode.
    if (isManual()) return;
    if (wasClosed && !saved) game.bankHint();
    if (!provider) {
      status = "unavailable";
      return;
    }
    key = hintStateKey(game.state);
    const request = generation;
    const requestedLoad = game.loadId;
    controller = new AbortController();
    status = "searching";
    try {
      const result = await provider(hintSnapshot(game.state), { signal: controller.signal });
      if (request !== generation || requestedLoad !== game.loadId) return;
      if (game.state.notesMode === "manual") {
        close();
        return;
      }
      if (key !== hintStateKey(game.state)) {
        status = "stale";
        return;
      }
      hint = result;
      status = result ? "ready" : "empty";
      if (result) {
        if (saved?.key === key && saved.identity === hintIdentity(result)) stage = saved.stage;
        remember();
      } else game.setHintProgress(null);
    } catch {
      if (request === generation && requestedLoad === game.loadId) status = "error";
    }
  }
  /** @param {import('../game/game.js').GameState} state */
  function reconcile(state) {
    if (loadId !== game.loadId) {
      suspend();
      return;
    }
    if (state.notesMode === "manual") {
      if (status !== "closed") close();
      return;
    }
    if ((status === "ready" || status === "searching") && hintStateKey(state) !== key) {
      cancel();
      status = "stale";
      game.setHintProgress(null);
    } else if (status === "applied" && state !== applied) {
      applied = null;
      undoAvailable = false;
      didApply = false;
      status = "stale";
    }
  }
  function apply() {
    if (loadId !== game.loadId) {
      suspend();
      return;
    }
    if (game.notesMode === "manual") {
      close();
      return;
    }
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
      game.setHintProgress(null);
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
    if (game.notesMode === "manual" || status !== "ready" || !hint) return null;
    // Proof masks describe reasoning, not the player’s pencil marks.
    const mask = game.notes(cell);
    const visible = (p) => p.cell === cell && !!(mask & (1 << p.digit));
    const observe = hint.observeCells.includes(cell);
    const premise = stage >= 1 && hint.premiseCells.includes(cell);
    const target = stage === 2 && hint.placements.some((p) => p.cell === cell);
    const candidates = stage >= 1 ? hint.premiseCandidates.filter(visible).map((p) => p.digit) : [];
    const excluded = stage >= 1 ? hint.excludedCandidates.filter(visible).map((p) => p.digit) : [];
    const eliminations = stage === 2 ? hint.eliminations.filter(visible).map((p) => p.digit) : [];
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
          mask,
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
    suspend,
    resume,
    reconcile,
    apply,
    undo,
    evidence,
    previous() {
      if (status === "ready" && stage > 0) {
        stage--;
        remember();
      }
    },
    next() {
      if (status === "ready" && stage < 2) {
        stage++;
        remember();
      }
    },
  };
}
