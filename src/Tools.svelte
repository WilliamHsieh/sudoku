<script>
  import { game } from "./game/game.svelte.js";
  import { ring } from "./ring.js";
  import { playUi } from "./play/session.svelte.js";

  import NotesMode from "./NotesMode.svelte";
  const eraseOff = $derived(!game.eraseKind(game.selected));

  function openMore() {
    playUi.openOptions();
  }
</script>

<div class="tools" role="toolbar" aria-label="Tools">
  <button
    class="tool"
    id="undo"
    type="button"
    aria-label="Undo"
    disabled={!game.canUndo}
    onclick={() => {
      if (!playUi.paused) ring.undo();
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 14 4 9l5-5"></path>
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path>
    </svg>
    <span>Undo</span>
  </button>
  <button
    class="tool"
    id="redo"
    type="button"
    aria-label="Redo"
    disabled={!game.canRedo}
    onclick={() => {
      if (!playUi.paused) ring.redo();
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 14 5-5-5-5"></path>
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"></path>
    </svg>
    <span>Redo</span>
  </button>
  <button
    class="tool"
    id="erase"
    type="button"
    aria-label="Erase"
    disabled={eraseOff}
    onclick={() => {
      if (!playUi.paused) game.erase(game.selected);
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"
      ></path>
      <path d="m5.082 11.09 8.828 8.828"></path>
    </svg>
    <span>Erase</span>
  </button>
  <NotesMode />
  <button class="tool" type="button" data-more aria-haspopup="dialog" onclick={openMore}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="1"></circle>
      <circle cx="19" cy="12" r="1"></circle>
      <circle cx="5" cy="12" r="1"></circle>
    </svg>
    <span>More</span>
  </button>
</div>

<style>
  .tools {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }

  .tool {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--ui-ink);
    font: inherit;
    font-size: 12px;
    padding: 6px 2px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    touch-action: manipulation;
    font-family: var(--ui-font);
  }

  .tool:active {
    background: var(--key-pressed);
  }

  .tool:focus {
    outline: none;
  }

  .tool:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .tool:disabled {
    opacity: 0.35;
    cursor: default;
    background: transparent;
    pointer-events: none;
  }

  /* The row is already at 40%. Don't stack the disabled fade on top. */
  :global(.chrome-dim.dim) .tool:disabled {
    opacity: 1;
  }

  .tool svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
