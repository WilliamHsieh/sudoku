<script>
  import { playUi } from "./play/session.svelte.js";

  /** @type {{ onclosed?: () => void, onrestart: () => void }} */
  let { onclosed, onrestart } = $props();

  let optsEl = $state(/** @type {HTMLDialogElement | undefined} */ (undefined));
  let confirmEl = $state(/** @type {HTMLDialogElement | undefined} */ (undefined));
  let cueRow = $state(/** @type {HTMLButtonElement | undefined} */ (undefined));
  let restartRow = $state(/** @type {HTMLButtonElement | undefined} */ (undefined));
  let cancelBtn = $state(/** @type {HTMLButtonElement | undefined} */ (undefined));
  let syncing = false;

  const descId = $derived(playUi.cueReason ? "cue-why" : "cue-desc");

  function focusEl(/** @type {HTMLElement | undefined} */ el) {
    el?.focus({ preventScroll: true });
  }

  $effect(() => {
    const modal = playUi.modal;
    const where = playUi.focus;
    if (!optsEl || !confirmEl) return;
    syncing = true;
    try {
      if (modal === "options") {
        if (confirmEl.open) confirmEl.close();
        if (!optsEl.open) optsEl.showModal();
        focusEl(where === "restart" ? restartRow : cueRow);
      } else if (modal === "confirm") {
        if (optsEl.open) optsEl.close();
        if (!confirmEl.open) confirmEl.showModal();
        focusEl(cancelBtn);
      } else {
        if (optsEl.open) optsEl.close();
        if (confirmEl.open) confirmEl.close();
      }
    } finally {
      syncing = false;
    }
  });

  function onOptsClose() {
    if (syncing || playUi.modal !== "options") return;
    playUi.closeModal();
    onclosed?.();
  }

  /** @param {MouseEvent} e */
  function onOptsClick(e) {
    if (e.target === optsEl) {
      playUi.closeModal();
      onclosed?.();
    }
  }

  /** @param {Event} e */
  function onConfirmCancel(e) {
    e.preventDefault();
    playUi.backToOptions();
  }

  /** @param {MouseEvent} e */
  function onConfirmClick(e) {
    if (e.target === confirmEl) playUi.backToOptions();
  }

  function onDone() {
    playUi.closeModal();
    onclosed?.();
  }

  function onRestarted() {
    onrestart();
    playUi.closeModal();
    onclosed?.();
  }
</script>

<dialog
  class="opts"
  bind:this={optsEl}
  aria-labelledby="opts-title"
  onclose={onOptsClose}
  onclick={onOptsClick}
>
  <div class="opts-in">
    <span class="grabber" aria-hidden="true"></span>
    <div class="opts-h"><h2 id="opts-title">Options</h2></div>
    <div class="list">
      <button
        type="button"
        class="row"
        id="opt-cue"
        role="switch"
        aria-checked={playUi.switchChecked}
        aria-describedby={descId}
        disabled={playUi.switchDisabled}
        bind:this={cueRow}
        onclick={() => playUi.toggleCue()}
      >
        <span class="tx">
          <b>Single-candidate cue</b>
          <small id="cue-desc" hidden={playUi.cueReason}
            >Flash lone candidates after 30 s without input</small
          >
          <small id="cue-why" hidden={!playUi.cueReason}
            >Needs Auto notes. Your choice is kept.</small
          >
        </span>
        <span class="switch" aria-hidden="true"><span class="knob"></span></span>
      </button>
      <button
        type="button"
        class="row row-danger"
        id="opt-restart"
        aria-haspopup="dialog"
        bind:this={restartRow}
        onclick={() => playUi.openConfirm()}
      >
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
        <span class="tx"><b>Restart puzzle</b></span>
      </button>
    </div>
    <button type="button" class="btn btn-primary btn-done" id="opts-done" onclick={onDone}
      >Done</button
    >
  </div>
</dialog>

<dialog
  class="confirm"
  bind:this={confirmEl}
  role="alertdialog"
  aria-labelledby="confirm-title"
  aria-describedby="confirm-body"
  oncancel={onConfirmCancel}
  onclick={onConfirmClick}
>
  <h2 id="confirm-title">Restart this puzzle?</h2>
  <p id="confirm-body">This clears your answers, notes and the time. Undo can’t bring them back.</p>
  <div class="acts">
    <button
      type="button"
      class="btn btn-secondary"
      id="confirm-cancel"
      bind:this={cancelBtn}
      onclick={() => playUi.backToOptions()}>Cancel</button
    >
    <button type="button" class="btn btn-danger" id="confirm-ok" onclick={onRestarted}
      >Restart</button
    >
  </div>
</dialog>

<style>
  dialog {
    color: var(--ui-ink);
    font-family: var(--ui-font);
  }

  dialog:focus {
    outline: none;
  }

  .opts {
    border: 0;
    background: var(--board-bg);
    padding: 0;
    color: var(--ui-ink);
  }

  .opts-in {
    display: flex;
    flex-direction: column;
  }

  .opts-h {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
    min-height: 44px;
  }

  .opts-h h2 {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.005em;
    margin: 0;
  }

  .list {
    border-radius: 12px;
    background: var(--page-bg);
    box-shadow: inset 0 0 0 1px var(--hair);
    overflow: hidden;
    margin-top: 6px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 64px;
    padding: 12px 14px;
    text-align: left;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    font-family: var(--ui-font);
  }

  .row + .row {
    box-shadow: inset 0 1px 0 var(--hair);
  }

  .tx {
    flex: 1;
    min-width: 0;
  }

  .row b {
    display: block;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
  }

  .row small {
    display: block;
    font-size: 13px;
    line-height: 1.35;
    color: var(--ui-soft);
    margin-top: 2px;
  }

  .row .ic {
    width: 20px;
    height: 20px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .row-danger {
    color: var(--danger);
    min-height: 52px;
  }

  .row:focus {
    outline: none;
  }

  .row:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -3px;
    border-radius: 12px;
  }

  .row:disabled {
    cursor: default;
  }

  .row:disabled b {
    color: var(--ui-soft);
  }

  .switch {
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--switch-off);
    position: relative;
    flex: none;
    transition: background 160ms ease-out;
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--switch-knob);
    box-shadow: var(--shadow-knob);
    transition: transform 160ms ease-out;
  }

  .row[aria-checked="true"] .switch {
    background: var(--switch-on);
  }

  .row[aria-checked="true"] .knob {
    transform: translateX(16px);
  }

  .row:disabled .switch {
    background: var(--switch-disabled);
  }

  .row:disabled .knob {
    background: var(--switch-disabled-knob);
    box-shadow: 0 0 0 1px var(--timer-line);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 44px;
    padding: 0 22px;
    border-radius: 10px;
    border: 0;
    font-family: var(--ui-font);
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }

  .btn:focus {
    outline: none;
  }

  .btn:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .btn-primary {
    background: var(--primary);
    color: var(--on-accent);
  }

  .btn-secondary {
    background: var(--board-bg);
    color: var(--ui-ink);
    box-shadow: inset 0 0 0 1px var(--hair);
  }

  .btn-danger {
    background: var(--danger);
    color: var(--on-accent);
  }

  .btn-done {
    width: 100%;
    margin-top: 14px;
  }

  .confirm {
    border: 0;
    margin: auto;
    width: min(320px, calc(100vw - 48px));
    background: var(--board-bg);
    border-radius: 14px;
    padding: 20px 18px 16px;
    box-shadow: var(--shadow-pr6);
    color: var(--ui-ink);
  }

  .confirm h2 {
    font-size: 17px;
    font-weight: 700;
    margin: 0 0 6px;
  }

  .confirm p {
    font-size: 14px;
    line-height: 1.45;
    color: var(--ui-soft);
    margin: 0 0 18px;
  }

  .acts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .confirm .btn {
    padding: 0 12px;
  }

  .grabber {
    display: block;
    width: 36px;
    height: 5px;
    border-radius: 3px;
    background: var(--hair);
    margin: 0 auto 4px;
  }

  /* Bottom sheet on the phone; a centred dialog from 600px. */
  dialog.opts {
    position: fixed;
    inset: auto 0 0 0;
    margin: 0 auto;
    width: 390px;
    max-width: 100%;
    max-height: calc(100% - 48px);
    border-radius: 16px 16px 0 0;
    padding: 6px 16px calc(20px + env(safe-area-inset-bottom));
    box-shadow: var(--shadow-sheet);
  }

  dialog.opts[open] {
    animation: sheet-up 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  dialog.opts[open]::backdrop {
    background: var(--overlay-pr6);
    animation: fade 200ms ease-out;
  }

  dialog.confirm::backdrop {
    background: var(--overlay-pr6);
  }

  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: none;
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (hover: hover) {
    .row:not(:disabled):hover {
      background: var(--neutral-2);
    }
    .row-danger:not(:disabled):hover {
      background: var(--conflict-bg);
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-secondary:hover {
      background: var(--neutral-2);
    }
    .btn-danger:hover {
      background: var(--danger-hover);
    }
  }

  @media (min-width: 600px) {
    .grabber {
      display: none;
    }

    dialog.opts {
      inset: 0;
      margin: auto;
      width: 400px;
      max-height: none;
      border-radius: 14px;
      padding: 14px 18px 18px;
      box-shadow: var(--shadow-pr6);
    }

    dialog.opts[open] {
      animation: pop 180ms cubic-bezier(0.22, 1, 0.36, 1);
    }
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .switch,
    .knob {
      transition: none;
    }
    dialog.opts[open],
    dialog.opts[open]::backdrop {
      animation: none;
    }
  }
</style>
