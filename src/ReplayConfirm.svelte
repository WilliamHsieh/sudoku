<script>
  import { onMount } from "svelte";
  import { formatTime } from "./store.js";
  import { fmtTime } from "./journal/format.js";
  import Icon from "./journal/Icon.svelte";
  /** @type {{time: number, replayTime?: number | null, oncancel: () => void, onconfirm: () => void}} */
  let { time, replayTime = null, oncancel, onconfirm } = $props();
  let dialog = $state(/** @type {HTMLDialogElement | undefined} */ (undefined));
  /** Keep Tab inside the card, including browsers that allow a stop in browser chrome. @param {KeyboardEvent} event */
  function trapFocus(event) {
    if (event.key !== "Tab" || !dialog) return;
    const buttons = [...dialog.querySelectorAll("button")];
    const first = buttons[0],
      last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  onMount(() => {
    dialog?.showModal();
  });
</script>

<dialog
  bind:this={dialog}
  onkeydown={trapFocus}
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="replay-title"
  aria-describedby="replay-body"
  oncancel={(event) => {
    event.preventDefault();
    oncancel();
  }}
>
  <h2 id="replay-title">{replayTime == null ? "Replay this puzzle?" : "Start the replay over?"}</h2>
  <p id="replay-body">
    {#if replayTime != null}Your replay at <b>{fmtTime(replayTime)}</b> will be cleared and you'll
      start again from 0:00. Your <b>{formatTime(time)}</b> stays saved.
    {:else}You'll start from a fresh board at 0:00. Your <b>{formatTime(time)}</b> stays saved, and is
      replaced only if you finish.{/if}
  </p>
  <div class="actions">
    <button class="quiet" onclick={oncancel}>Cancel</button>
    <button class="primary" onclick={onconfirm}
      ><Icon name="rotate-ccw" />{replayTime == null ? "Replay" : "Start over"}</button
    >
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: auto 16px 16px;
    width: auto;
    max-width: none;
    margin: 0;
    border: 0;
    background: var(--card);
    border-radius: 22px;
    padding: 22px 22px 18px;
    box-shadow: var(--sv-shadow);
    color: var(--ui-ink);
  }
  dialog::backdrop {
    background: var(--sv-scrim);
  }
  h2 {
    margin: 0;
    font: 700 19px/1.3 var(--ui-font);
  }
  p {
    margin: 8px 0 0;
    font: 500 15px/1.45 var(--ui-font);
    color: var(--ui-soft);
  }
  b {
    color: var(--ui-ink);
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }
  button {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 48px;
    border: 0;
    border-radius: 12px;
    font: 600 16px/1 var(--ui-font);
    cursor: pointer;
    --ic: 17px;
  }
  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .quiet {
    background: var(--neutral);
    color: var(--ui-ink);
  }
  .quiet:hover {
    background: var(--sv-quiet-hover);
  }
  .primary {
    background: var(--blue);
    color: var(--on-accent);
  }
  .primary:hover {
    background: var(--blue-d);
  }
  @media (min-width: 600px) {
    dialog {
      inset: 50% auto auto 50%;
      width: 400px;
      translate: -50% -50%;
    }
  }
</style>
