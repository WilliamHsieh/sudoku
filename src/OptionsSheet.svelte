<script>
  import { tick } from "svelte";
  import { createSheetExit } from "./sheet-exit.svelte.js";
  import { playUi } from "./play/session.svelte.js";
  import { OPT_TAP_SUB, OPT_TAP_TITLE } from "./keypad-copy.js";

  /** @type {{ onclosed?: () => void, onrestart: () => void }} */
  let { onclosed, onrestart } = $props();

  let optsEl = $state(/** @type {HTMLDialogElement | undefined} */ (undefined));
  let confirmEl = $state(/** @type {HTMLDialogElement | undefined} */ (undefined));
  let cueRow = $state(/** @type {HTMLButtonElement | undefined} */ (undefined));
  let restartRow = $state(/** @type {HTMLButtonElement | undefined} */ (undefined));
  let cancelBtn = $state(/** @type {HTMLButtonElement | undefined} */ (undefined));
  // WebKit can match :focus-visible after showModal() even on a touch open.
  // Keep native dialog focus; only hide the sheet's rings until keyboard input.
  let pointerInput = $state(false);
  let syncing = false;
  /**
   * `dialog.close()` reports `close` on a later task. Esc can restore the
   * sheet before that task, and the late event must not dismiss it.
   */
  let optsCloseDebt = 0;
  /** Esc is putting the sheet back; a nested cancel is not a dismiss. */
  let restoring = false;
  const optsExit = createSheetExit(finishOptsDismiss);
  /** Sheet leaving under the confirm; the scrim never drops. */
  let handoffAnim = /** @type {Animation | null} */ (null);
  let handoffTimer = 0;
  let sheetReturning = false;
  /** Parked off-screen, still open, until Cancel starts a fresh opening. */
  let sheetParked = $state(false);
  /** Confirm exit is an opacity fade. The dialog stays open until it finishes. */
  let confirmClosing = $state(false);
  let confirmFade = /** @type {Animation | null} */ (null);
  let confirmTimer = 0;
  /** @type {null | 'cancel' | 'restart'} */
  let confirmExit = null;
  const CONFIRM_OUT_MS = 180;

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function finishOptsDismiss() {
    if (playUi.modal !== "options") return;
    closeOpts();
    playUi.closeModal();
    tick().then(() => onclosed?.());
  }

  function dismissOpts() {
    if (playUi.modal !== "options" || optsExit.closing) return;
    dropHandoff();
    if (!optsEl?.open) {
      finishOptsDismiss();
      return;
    }
    optsExit.start({
      dialog: optsEl,
      closeDialog: closeOpts,
      centered: window.matchMedia("(min-width: 600px)").matches,
    });
  }

  const descId = $derived(playUi.cueReason ? "cue-why" : "cue-desc");

  function focusEl(/** @type {HTMLElement | undefined} */ el) {
    el?.focus({ preventScroll: true });
  }

  function closeOpts() {
    if (!optsEl?.open) return;
    optsCloseDebt++;
    optsEl.close();
  }

  function motionMs() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--motion").trim();
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return 260;
    return raw.endsWith("s") && !raw.endsWith("ms") ? n * 1000 : n;
  }

  function motionEasing() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim();
    return raw || "cubic-bezier(0.22, 0.8, 0.24, 1)";
  }

  function dropHandoff() {
    window.clearTimeout(handoffTimer);
    const anim = handoffAnim;
    handoffAnim = null;
    sheetReturning = false;
    anim?.cancel();
  }

  /** @param {Animation} anim */
  function armHandoffTimer(anim) {
    window.clearTimeout(handoffTimer);
    handoffTimer = window.setTimeout(() => {
      if (handoffAnim !== anim || sheetReturning) return;
      if (anim.playState === "finished" && playUi.modal === "confirm") sheetParked = true;
    }, motionMs() + 80);
  }

  /** Ease the still-open sheet away. The confirm is already on top of the dim. */
  function handoffSheet() {
    if (!optsEl?.open) return;
    if (reduceMotion()) {
      dropHandoff();
      closeOpts();
      return;
    }
    if (handoffAnim && !sheetReturning && handoffAnim.playState !== "finished") return;
    sheetParked = false;
    dropHandoff();
    for (const anim of optsEl.getAnimations()) anim.cancel();
    const wide = window.matchMedia("(min-width: 600px)").matches;
    const anim = optsEl.animate(
      wide
        ? [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "translateY(8px)" },
          ]
        : [{ transform: "none" }, { transform: "translateY(100%)" }],
      { duration: motionMs(), easing: motionEasing(), fill: "forwards" }
    );
    handoffAnim = anim;
    armHandoffTimer(anim);
    anim.onfinish = () => {
      if (handoffAnim !== anim) return;
      window.clearTimeout(handoffTimer);
      // Keep the outgoing end pose until the fresh opening is installed.
      sheetParked = true;
    };
  }

  /** Open forward from off-screen, keeping the shared scrim in place. */
  function returnSheet() {
    if (!optsEl || !handoffAnim || sheetReturning) return;
    // Discard the finished compositor animation before revealing the sheet.
    // Install the new start pose in this task, so no open pose can paint first.
    dropHandoff();
    if (reduceMotion()) {
      sheetParked = false;
      return;
    }
    const anim = optsEl.animate([{ transform: "translateY(100%)" }, { transform: "none" }], {
      duration: motionMs(),
      easing: motionEasing(),
      fill: "both",
    });
    handoffAnim = anim;
    sheetReturning = true;
    sheetParked = false;
    anim.onfinish = () => {
      if (handoffAnim !== anim) return;
      dropHandoff();
    };
  }

  function clearConfirmFade() {
    window.clearTimeout(confirmTimer);
    const anim = confirmFade;
    confirmFade = null;
    anim?.cancel();
  }

  function finishConfirmExit() {
    if (!confirmExit) return;
    const mode = confirmExit;
    confirmExit = null;
    clearConfirmFade();
    confirmClosing = false;
    closeConfirm();
    if (mode === "cancel") {
      focusEl(restartRow);
      return;
    }
    tick().then(() => onclosed?.());
  }

  /** Opacity only. No translate and no scale. */
  function startConfirmFade() {
    if (!confirmEl) return;
    clearConfirmFade();
    for (const anim of confirmEl.getAnimations()) anim.cancel();
    const anim = confirmEl.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CONFIRM_OUT_MS,
      easing: motionEasing(),
      fill: "forwards",
    });
    confirmFade = anim;
    confirmTimer = window.setTimeout(finishConfirmExit, CONFIRM_OUT_MS + 50);
    anim.onfinish = () => {
      if (confirmFade !== anim) return;
      finishConfirmExit();
    };
  }

  async function finishRestartNow() {
    onrestart();
    playUi.closeModal();
    await tick();
    onclosed?.();
  }

  /** @param {'cancel' | 'restart'} mode */
  function beginConfirmExit(mode) {
    if (confirmExit) return;
    if (reduceMotion() || !confirmEl?.open) {
      if (mode === "cancel") restoreSheet();
      else void finishRestartNow();
      return;
    }
    confirmExit = mode;
    confirmClosing = true;
    if (mode === "cancel") {
      // Sheet rise and confirm fade, both before the next paint. Scrim stays.
      returnSheet();
      startConfirmFade();
      restoreSheet();
      return;
    }
    // Confirm fade and scrim fade. closeModal drops .on on the scrim.
    startConfirmFade();
    onrestart();
    playUi.closeModal();
  }

  function closeConfirm() {
    if (!confirmEl?.open) return;
    confirmEl.close();
  }

  function restoreSheet() {
    restoring = true;
    playUi.backToOptions();
    queueMicrotask(() => {
      restoring = false;
    });
  }

  $effect(() => {
    const modal = playUi.modal;
    const where = playUi.focus;
    if (!optsEl || !confirmEl) return;
    syncing = true;
    try {
      if (modal === "options") {
        // Cancel already started the sheet opening and is fading the confirm.
        if (!confirmExit) {
          closeConfirm();
          returnSheet();
        }
        if (!optsEl.open) optsEl.showModal();
        if (!confirmExit) focusEl(where === "restart" ? restartRow : cueRow);
      } else if (modal === "confirm") {
        if (!confirmEl.open) confirmEl.showModal();
        focusEl(cancelBtn);
        handoffSheet();
      } else {
        dropHandoff();
        sheetParked = false;
        closeOpts();
        if (!confirmExit) closeConfirm();
      }
    } finally {
      syncing = false;
    }
  });

  function onOptsClose() {
    if (optsCloseDebt > 0) {
      optsCloseDebt--;
      return;
    }
    if (syncing || restoring || optsEl?.open) return;
    if (playUi.modal === "confirm") {
      restoreSheet();
      return;
    }
    if (playUi.modal !== "options") return;
    playUi.closeModal();
    onclosed?.();
  }

  /** @param {Event} e */
  function onOptsCancel(e) {
    e.preventDefault();
    if (restoring || playUi.modal === "confirm") {
      if (playUi.modal === "confirm") restoreSheet();
      return;
    }
    dismissOpts();
  }

  /** @param {MouseEvent} e */
  function onOptsClick(e) {
    if (e.target === optsEl) dismissOpts();
  }

  /** @param {Event} e */
  function onConfirmCancel(e) {
    e.preventDefault();
    beginConfirmExit("cancel");
  }

  /** @param {MouseEvent} e */
  function onConfirmClick(e) {
    if (e.target === confirmEl) beginConfirmExit("cancel");
  }

  function onDone() {
    dismissOpts();
  }

  function onRestarted() {
    beginConfirmExit("restart");
  }

  const scrimOn = $derived(playUi.modal === "options" || playUi.modal === "confirm");
</script>

<svelte:window
  onpointerdown={() => (pointerInput = true)}
  onkeydown={() => (pointerInput = false)}
/>

<div class="modal-scrim" class:on={scrimOn} style={optsExit.scrimStyle} aria-hidden="true"></div>

<dialog
  class="opts"
  class:pointer-input={pointerInput}
  style={optsExit.sheetStyle}
  class:parked={sheetParked}
  bind:this={optsEl}
  aria-labelledby="opts-title"
  onclose={onOptsClose}
  oncancel={onOptsCancel}
  onclick={onOptsClick}
  onanimationend={optsExit.onanimationend}
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
        class="row"
        id="opt-tap-fill"
        role="switch"
        aria-checked={playUi.tapFill}
        aria-describedby="tap-fill-desc"
        onclick={() => playUi.toggleTapFill()}
      >
        <span class="tx">
          <b>{OPT_TAP_TITLE}</b>
          <small id="tap-fill-desc">{OPT_TAP_SUB}</small>
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
  class:closing={confirmClosing}
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
      onclick={() => beginConfirmExit("cancel")}>Cancel</button
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

  /* Author display:block would otherwise override the hidden attribute. */
  .row small[hidden] {
    display: none;
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
    transition: background var(--toggle) var(--ease-out);
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
    transition: transform var(--toggle) var(--ease-out);
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

  .opts.pointer-input .row:focus-visible,
  .opts.pointer-input .btn:focus-visible {
    outline: none;
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
    z-index: 41;
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
    animation: sheet-up var(--motion) var(--ease-out);
  }

  /* One page scrim for both dialogs. Backdrops stay clear so the dim
     does not double, and it does not restart when the sheet swaps. */
  .modal-scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--overlay-pr6);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--motion) var(--ease-out);
  }

  .modal-scrim.on {
    opacity: 1;
  }

  dialog.opts[open]::backdrop,
  dialog.confirm[open]::backdrop {
    background: transparent;
  }

  dialog.confirm[open] {
    animation: pop var(--motion) var(--ease-out);
  }

  /* Exit is opacity only, driven by WAAPI so it can start with the sheet. */
  dialog.confirm[open].closing {
    animation: none;
  }

  dialog.opts.parked {
    visibility: hidden;
  }

  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: none;
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
      animation: pop var(--motion) var(--ease-out);
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
    dialog.opts[open]::backdrop,
    dialog.confirm[open],
    dialog.confirm[open]::backdrop {
      animation: none;
    }
    .modal-scrim {
      transition: none;
    }
  }
</style>
