<script>
  import Icon from "../journal/Icon.svelte";
  import {
    copyPuzzleString,
    createPuzzleLink,
    copyPuzzleLink,
    sharePuzzle,
  } from "./puzzle-share.js";

  /** @type {{open?: boolean, puzzle: string}} */
  let { open = $bindable(false), puzzle } = $props();
  let dialogEl = $state(/** @type {HTMLDialogElement | undefined} */ (undefined));
  let digitsEl = $state(/** @type {HTMLTextAreaElement | undefined} */ (undefined));
  let linkEl = $state(/** @type {HTMLInputElement | undefined} */ (undefined));
  let copied = $state(false);
  let feedback = $state("");
  let linkFeedback = $state("");
  let linkOpen = $state(false);
  const local =
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    location.hostname.endsWith(".localhost");
  const base =
    import.meta.env.DEV || local || !/^https?:$/.test(location.protocol)
      ? "https://williamhsieh.github.io/sudoku/"
      : location.href;
  const link = $derived(/^[0-9]{81}$/.test(puzzle) ? createPuzzleLink(puzzle, base) : "");

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      copied = false;
      feedback = "";
      linkFeedback = "";
      linkOpen = false;
      dialogEl.showModal();
      selectDigits();
    } else if (!open && dialogEl.open) dialogEl.close();
  });

  function selectDigits() {
    digitsEl?.focus({ preventScroll: true });
    digitsEl?.select();
  }
  function close() {
    dialogEl?.close();
    open = false;
  }
  async function copyDigits() {
    const result = await copyPuzzleString(puzzle);
    copied = result.status === "copied";
    feedback = copied
      ? "81 digits copied."
      : (result.error ?? "Select the numbers and copy them manually.");
    if (!copied) selectDigits();
  }
  /** @param {boolean} native */
  async function shareLink(native) {
    // Invoke from the click so native sharing and clipboard access retain activation.
    const result = await (native ? sharePuzzle(puzzle, base) : copyPuzzleLink(puzzle, base));
    if (result.status === "cancelled") return;
    linkFeedback =
      result.status === "shared"
        ? "Puzzle shared."
        : result.status === "copied"
          ? "Link copied."
          : (result.error ?? "Select and copy the link manually.");
    if (result.status === "failed") {
      linkEl?.focus({ preventScroll: true });
      linkEl?.select();
    }
  }
  /** @param {MouseEvent} event */
  function backdrop(event) {
    if (!dialogEl || event.target !== dialogEl) return;
    const r = dialogEl.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      close();
  }
</script>

<dialog
  class="copy-dialog"
  bind:this={dialogEl}
  aria-labelledby="copy-title"
  aria-describedby="copy-hint"
  onclose={() => (open = false)}
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
  onclick={backdrop}
>
  <div class="dialog-heading">
    <h2 id="copy-title">Copy puzzle</h2>
    <button class="close" type="button" aria-label="Close copy dialog" onclick={close}
      ><Icon name="x" /></button
    >
  </div>
  <p id="copy-hint">81 digits, read row by row. Empty squares are <b>0</b>.</p>
  <label class="sr-only" for="copy-digits">Puzzle string (81 digits)</label>
  <textarea
    id="copy-digits"
    bind:this={digitsEl}
    readonly
    value={puzzle}
    rows="4"
    spellcheck="false"
    wrap="soft"
    onclick={selectDigits}></textarea>
  <button class="copy-digits" type="button" onclick={copyDigits} aria-label="Copy 81 digits"
    >{#if copied}<Icon name="check" />{:else}<svg viewBox="0 0 24 24" aria-hidden="true"
        ><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg
      >{/if}{copied ? "Copied" : "Copy 81 digits"}</button
  >
  <p class="feedback" class:copied role="status">{feedback}</p>
  <details bind:open={linkOpen}>
    <summary
      >Share a link instead <span class="chevron"><Icon name="chevron-right" /></span></summary
    >
    <div class="link-content">
      <p>A link lets someone open this puzzle directly in Sudoku.</p>
      <label class="sr-only" for="copy-link">Puzzle link</label><input
        id="copy-link"
        bind:this={linkEl}
        readonly
        value={link}
        onclick={() => linkEl?.select()}
      />
      <div class="link-actions">
        <button type="button" onclick={() => shareLink(false)}>Copy link</button><button
          type="button"
          onclick={() => shareLink(true)}>Share <span aria-hidden="true">↗</span></button
        >
      </div>
      <p class="feedback" role="status">{linkFeedback}</p>
    </div>
  </details>
</dialog>

<style>
  .copy-dialog {
    position: fixed;
    inset: 0;
    width: min(420px, calc(100% - 32px));
    max-height: calc(100% - 32px);
    box-sizing: border-box;
    margin: auto;
    padding: 24px;
    overflow: auto;
    border: 1px solid var(--hair);
    border-radius: 16px;
    background: var(--board-bg);
    color: var(--ui-ink);
    box-shadow: var(--shadow-dialog);
    font-family: var(--ui-font);
  }
  .copy-dialog::backdrop {
    background: var(--overlay-pr6);
  }
  .copy-dialog:focus {
    outline: none;
  }
  button,
  textarea,
  input {
    font: inherit;
  }
  button {
    cursor: pointer;
    touch-action: manipulation;
  }
  button:focus-visible,
  textarea:focus-visible,
  input:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
  .dialog-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: -8px;
    margin-right: -10px;
  }
  h2 {
    margin: 0;
    font-size: 21px;
    font-weight: 650;
    letter-spacing: -0.025em;
  }
  .close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--ui-soft);
    --ic: 18px;
  }
  .close:hover {
    background: var(--neutral-2);
  }
  p {
    margin: 10px 0 18px;
    color: var(--ui-soft);
    font-size: 13px;
    line-height: 1.65;
  }
  p b {
    color: var(--ui-ink);
    font-weight: 600;
  }
  textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 14px;
    border: 1px solid var(--hair);
    border-radius: 10px;
    background: var(--page-bg);
    color: var(--ui-ink);
    resize: none;
    font:
      15px/1.8 ui-monospace,
      monospace;
    letter-spacing: 0.03em;
    overflow-wrap: anywhere;
  }
  .copy-digits {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    width: 100%;
    min-height: 46px;
    margin-top: 16px;
    padding: 10px 14px;
    border: 1px solid var(--primary);
    border-radius: 10px;
    background: var(--primary);
    color: var(--on-accent);
    font-size: 14px;
    font-weight: 600;
    --ic: 17px;
  }
  .copy-digits > svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .copy-digits:hover {
    background: var(--primary-hover);
  }
  .feedback {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.6;
  }
  .feedback:empty {
    display: none;
  }
  .feedback.copied {
    color: var(--cue-ink);
  }
  details {
    margin-top: 20px;
    border-top: 1px solid var(--hair);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 48px;
    color: var(--ui-soft);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .chevron {
    display: flex;
    --ic: 15px;
  }
  details[open] .chevron {
    transform: rotate(90deg);
  }
  .link-content p {
    margin: 0 0 10px;
    font-size: 12px;
  }
  input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    min-height: 42px;
    padding: 9px 10px;
    border: 1px solid var(--hair);
    border-radius: 8px;
    background: var(--page-bg);
    color: var(--ui-ink);
    font-size: 12px;
  }
  .link-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .link-actions button {
    flex: 1;
    min-height: 44px;
    border: 1px solid var(--hair);
    border-radius: 9px;
    background: var(--board-bg);
    color: var(--ui-ink);
    font-size: 12px;
    font-weight: 500;
  }
  .link-actions button:hover {
    background: var(--neutral-2);
  }
  .link-content .feedback {
    margin-top: 10px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (max-width: 599px) {
    .copy-dialog {
      padding: 20px;
    }
    h2 {
      font-size: 20px;
    }
    textarea {
      font-size: 14px;
    }
  }
</style>
