<script>
  // Custom-puzzle draft. Editing stays separate from the active game until Start.
  import { tick, onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import Icon from "../journal/Icon.svelte";
  import { parsePuzzleInput } from "./puzzle-input.js";
  import CopyPuzzleDialog from "./CopyPuzzleDialog.svelte";
  import { fitDraftKeypad } from "./fit-draft-keypad.js";

  /** @type {{open?: boolean, canStart?: boolean, preview?: boolean, raw?: string, incoming?: string | null, children?: import('svelte').Snippet, onstart?: () => void}} */
  let {
    open = $bindable(false),
    canStart = $bindable(false),
    preview = $bindable(false),
    raw = $bindable("0".repeat(81)),
    incoming = $bindable(null),
    children,
    onstart,
  } = $props();
  let mode = $state("board");
  let selected = $state(0);
  let pasteText = $state("");
  let importError = $state("");
  let reading = $state(false);
  let copyOpen = $state(false);
  let keyboardFocus = $state(false);
  let boardEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let past = $state(/** @type {string[]} */ ([]));
  let future = $state(/** @type {string[]} */ ([]));
  const normalized = $derived(raw.replace(/\s/g, "").replace(/\./g, "0"));
  const pasteLength = $derived(
    /^[0-9.\s]*$/.test(pasteText)
      ? pasteText.replace(/\s/g, "").length
      : parsePuzzleInput(pasteText).ok
        ? 81
        : 0
  );
  const invalid = $derived(/[^0-9]/.test(normalized));
  const cells = $derived(Array.from({ length: 81 }, (_, i) => Number(normalized[i]) || 0));
  const count = $derived(cells.filter(Boolean).length);
  const conflicts = $derived.by(() => {
    const found = new SvelteSet();
    for (let a = 0; a < 81; a++) {
      if (!cells[a]) continue;
      for (let b = a + 1; b < 81; b++) {
        if (cells[a] !== cells[b]) continue;
        if (
          Math.floor(a / 9) === Math.floor(b / 9) ||
          a % 9 === b % 9 ||
          (Math.floor(a / 27) === Math.floor(b / 27) &&
            Math.floor((a % 9) / 3) === Math.floor((b % 9) / 3))
        ) {
          found.add(a);
          found.add(b);
        }
      }
    }
    return found;
  });
  const ready = $derived(
    !importError &&
      !invalid &&
      normalized.length === 81 &&
      count > 0 &&
      count < 81 &&
      conflicts.size === 0
  );
  const error = $derived(
    invalid
      ? "Use 1–9, 0 or . only."
      : normalized.length > 81
        ? "Too long — enter exactly 81 characters."
        : conflicts.size
          ? "Repeated numbers in the highlighted cells."
          : count === 81
            ? "Leave some empty squares to solve."
            : ""
  );
  $effect(() => {
    canStart = ready;
  });
  onMount(() => {
    if (!incoming) return;
    const result = parsePuzzleInput(incoming);
    pasteText = incoming;
    incoming = null;
    if (result.ok === true) {
      raw = result.puzzle;
      preview = true;
    } else {
      importError = result.error;
      mode = "paste";
    }
  });

  /** @param {string} value */
  function commit(value) {
    if (value === raw) return;
    past = [...past, raw];
    future = [];
    raw = value;
    copyOpen = false;
  }
  function undo() {
    if (!past.length) return;
    future = [raw, ...future];
    raw = past[past.length - 1];
    past = past.slice(0, -1);
  }
  function redo() {
    if (!future.length) return;
    past = [...past, raw];
    raw = future[0];
    future = future.slice(1);
  }
  /** @param {string} next */
  function chooseMode(next) {
    if (next === "board" && (importError || invalid || normalized.length > 81)) return;
    if (next === "board" && normalized.length < 81) commit(normalized.padEnd(81, "0"));
    if (next === "paste") pasteText = count || invalid ? raw : "";
    mode = next;
  }
  async function focusCell() {
    await tick();
    boardEl?.querySelectorAll("button")[selected]?.focus({ preventScroll: true });
  }
  /** @param {number} value @param {boolean} [advance] */
  function fill(value, advance = true) {
    if (preview || importError || invalid || normalized.length > 81) return;
    const draft = [...cells];
    draft[selected] = value;
    commit(draft.join(""));
    if (advance && selected < 80) selected++;
    focusCell();
  }
  /** @param {KeyboardEvent} event */
  function boardKey(event) {
    if (preview || event.altKey) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") event.shiftKey ? redo() : undo();
    else if (command && event.key.toLowerCase() === "y") redo();
    else if (command) return;
    else if (/^[1-9]$/.test(event.key)) fill(Number(event.key));
    else if (["0", ".", " "].includes(event.key)) fill(0);
    else if (["Backspace", "Delete"].includes(event.key)) fill(0, false);
    else if (event.key === "ArrowLeft") selected = Math.max(0, selected - 1);
    else if (event.key === "ArrowRight") selected = Math.min(80, selected + 1);
    else if (event.key === "ArrowUp") selected = Math.max(0, selected - 9);
    else if (event.key === "ArrowDown") selected = Math.min(80, selected + 9);
    else return;
    event.preventDefault();
    focusCell();
  }
  function clear() {
    commit(mode === "board" ? "0".repeat(81) : "");
    pasteText = "";
    importError = "";
    selected = 0;
  }
  /** @param {string} value */
  function updatePaste(value) {
    pasteText = value;
    importError = "";
    copyOpen = false;
    const result = parsePuzzleInput(value);
    if (result.ok === true) commit(result.puzzle);
    else if (/^[0-9.\s]*$/.test(value) && value.replace(/\s/g, "").length <= 81) commit(value);
    else importError = result.error;
  }
  async function pasteClipboard() {
    reading = true;
    importError = "";
    copyOpen = false;
    try {
      const value = await navigator.clipboard.readText();
      const result = parsePuzzleInput(value);
      pasteText = value;
      if (result.ok === true) commit(result.puzzle);
      else importError = result.error;
    } catch {
      importError = "Clipboard unavailable. Paste a link or 81 digits into the field.";
    } finally {
      reading = false;
    }
  }
  function start() {
    if (ready) onstart?.();
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Tab") keyboardFocus = true;
  }}
  onpointerdown={() => (keyboardFocus = false)}
/>

{#if !open}
  {#if children}{@render children()}{/if}
{:else}
  <section
    use:fitDraftKeypad={{ preview }}
    class="custom-editor quiet"
    class:paste={mode === "paste" && !preview}
    class:preview
    aria-label="Custom sudoku editor"
  >
    <div class="editor-body">
      <div class="setup-top">
        {#if preview}
          <div class="review-copy">
            <span class="kicker">YOUR PUZZLE</span>
            <h3>Check the givens.</h3>
            <p>Check the starting numbers. These will be fixed when you begin.</p>
            <button
              class="secondary"
              onclick={() => {
                preview = false;
                mode = "board";
                focusCell();
              }}>Edit board <Icon name="grid-3x3" /></button
            >
          </div>
        {:else}
          <div class="input-modes" aria-label="Input method">
            <button
              class:active={mode === "board"}
              aria-pressed={mode === "board"}
              disabled={Boolean(importError) || invalid || normalized.length > 81}
              onclick={() => chooseMode("board")}><Icon name="grid-3x3" />Fill board</button
            >
            <button
              class:active={mode === "paste"}
              aria-pressed={mode === "paste"}
              onclick={() => chooseMode("paste")}
              ><svg viewBox="0 0 24 24" aria-hidden="true"
                ><path d="M9 5h10v14H5V9M5 3v6h6M3 9l6-6" /></svg
              >Paste puzzle</button
            >
          </div>
        {/if}
      </div>
      <section class="board-area" aria-label="Starting board">
        {#if preview}
          <div class="board-heading">
            <h2>Puzzle preview</h2>
            <span>{81 - count} empty squares</span>
          </div>
        {/if}
        <div class="input-board" role="group" aria-label="Puzzle board" bind:this={boardEl}>
          {#each cells as digit, i (i)}
            <button
              type="button"
              class="input-cell"
              class:given={digit > 0}
              class:selected={!preview && selected === i && mode === "board"}
              class:same={!preview &&
                mode === "board" &&
                digit > 0 &&
                digit === cells[selected] &&
                selected !== i}
              class:conflict={conflicts.has(i)}
              data-r={Math.floor(i / 9)}
              data-c={i % 9}
              tabindex={!preview && mode === "board" && selected === i ? 0 : -1}
              aria-label="Row {Math.floor(i / 9) + 1}, column {(i % 9) + 1}, {digit ||
                'empty'}{conflicts.has(i) ? ', repeated digit' : ''}"
              aria-pressed={!preview && selected === i && mode === "board"}
              onkeydown={boardKey}
              onclick={() => {
                if (preview || importError || invalid || normalized.length > 81) return;
                selected = i;
                chooseMode("board");
              }}><span class="input-digit">{digit || ""}</span></button
            >
          {/each}
        </div>
      </section>
      {#if !preview}
        <div class="input-region" role="group" aria-label="Puzzle input">
          <div
            class="manual-input"
            class:inactive={mode !== "board"}
            inert={mode !== "board"}
            aria-hidden={mode !== "board"}
          >
            <div class="manual-copy">
              <h3>Enter the givens.</h3>
              <p>Copy the starting numbers from your puzzle. Leave the empty squares blank.</p>
            </div>
            <div class="editor-tools" role="toolbar" aria-label="Board tools">
              <div class="history-tools">
                <button
                  class="tool blank"
                  aria-label="Enter blank"
                  title="Enter blank (0 / Space)"
                  onclick={() => fill(0)}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"
                    ><rect x="5" y="5" width="14" height="14" rx="2" /></svg
                  ><span>Blank</span></button
                >
                <span class="tool-divider" aria-hidden="true"></span>
                <button
                  class="tool"
                  aria-label="Undo"
                  title="Undo"
                  disabled={!past.length}
                  onclick={undo}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg
                  ><span>Undo</span></button
                >
                <button
                  class="tool"
                  aria-label="Redo"
                  title="Redo"
                  disabled={!future.length}
                  onclick={redo}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg
                  ><span>Redo</span></button
                >
                <span class="tool-divider" aria-hidden="true"></span>
                <button
                  class="tool erase"
                  aria-label="Erase selected cell"
                  title="Erase selected cell"
                  disabled={!cells[selected]}
                  onclick={() => fill(0, false)}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path
                      d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21M5.082 11.09l8.828 8.828"
                    /></svg
                  ><span>Erase</span></button
                >
              </div>
              <button
                class="clear-board"
                aria-label="Clear all givens"
                title="Clear all givens"
                disabled={!raw || /^0+$/.test(raw)}
                onclick={clear}
                ><svg viewBox="0 0 24 24" aria-hidden="true"
                  ><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg
                ><span>Clear</span></button
              >
            </div>
            <p class="keyboard-hint">
              1–9 enter <span>·</span> 0 / Space blank <span>·</span> Arrows move <span>·</span> ⌫ erase
            </p>
            <div class="keypad-panel">
              <div class="draft-keypad-slot">
                <div class="draft-keypad-scale">
                  <div class="input-keypad" aria-label="Enter given numbers">
                    {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as digit (digit)}<button
                        class="draft-key"
                        onclick={() => fill(digit)}
                        aria-label="Enter {digit}">{digit}</button
                      >{/each}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            class="paste-input"
            class:inactive={mode !== "paste"}
            inert={mode !== "paste"}
            aria-hidden={mode !== "paste"}
          >
            <div class="string-input" class:keyboard-focus={keyboardFocus}>
              <label for="puzzle-string">Puzzle link or 81 digits</label>
              <textarea
                id="puzzle-string"
                rows="4"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                placeholder="Paste a link or 81 digits…"
                value={pasteText}
                aria-describedby="string-help import-error"
                aria-invalid={Boolean(importError) || invalid || normalized.length > 81}
                oninput={(event) => updatePaste(event.currentTarget.value)}></textarea>
              <div class="string-meta">
                <span id="string-help">0 or . = empty</span><span>{pasteLength} / 81</span>
              </div>
              <button
                class="secondary paste-clipboard"
                disabled={reading}
                onclick={pasteClipboard}
                aria-label="Paste from clipboard"
                ><svg viewBox="0 0 24 24" aria-hidden="true"
                  ><rect x="5" y="5" width="14" height="16" rx="2" /><path
                    d="M9 3h6v4H9zM9 12h6M9 16h4"
                  /></svg
                >{reading ? "Pasting…" : "Paste"}</button
              >
              <p class="import-error" id="import-error" role="status">{importError}</p>
            </div>
            <p class="board-caption">Read left to right, top to bottom. Select a square to edit.</p>
          </div>
        </div>
      {/if}
      <p class="board-error" role="status">{error}</p>
    </div>

    <footer class="action-panel">
      <div class="draft-summary" role="status">
        <strong>{count} givens</strong><span class:error={Boolean(error) || Boolean(importError)}
          ><i class:ready></i>{error || importError
            ? "Check your input"
            : ready
              ? "Ready to start"
              : "Add your clues"}</span
        >
      </div>
      <button class="primary-action" disabled={!ready} onclick={start} aria-label="Start puzzle"
        >Start puzzle<Icon name="play" /></button
      >
      <button
        class="copy-toggle"
        aria-label="Share puzzle"
        aria-haspopup="dialog"
        disabled={!ready}
        onclick={() => (copyOpen = !copyOpen)}
        ><svg viewBox="0 0 24 24" aria-hidden="true"
          ><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg
        ><span>Share puzzle</span></button
      >
    </footer>
    <CopyPuzzleDialog bind:open={copyOpen} puzzle={normalized} />
  </section>
{/if}

<style>
  .custom-editor {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    width: 100%;
    max-width: 644px;
    max-height: var(--draft-viewport-height, none);
    margin: 0 auto;
    padding: 28px 32px 32px;
    color: var(--ui-ink);
    font-family: var(--ui-font);
  }
  .editor-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-anchor: none;
    overscroll-behavior: contain;
    padding-bottom: 4px;
  }
  button,
  textarea {
    font: inherit;
  }
  button {
    color: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:disabled {
    cursor: default;
  }
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  .board-area {
    flex: none;
    min-width: 0;
  }
  .board-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  h2 {
    font-size: 15px;
    line-height: 1.4;
    margin: 0;
    font-weight: 600;
  }
  .board-heading > span {
    font-size: 12px;
    color: var(--ui-soft);
  }
  .input-board {
    container-type: inline-size;
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    grid-template-rows: repeat(9, minmax(0, 1fr));
    width: 100%;
    aspect-ratio: 1;
    border: var(--line-outer-w) solid var(--line-outer);
    border-radius: var(--board-radius);
    overflow: hidden;
    background: var(--board-bg);
  }
  .input-cell {
    --cell: calc(100cqi / 9);
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    padding: 0;
    margin: 0;
    appearance: none;
    background: var(--board-bg);
    border: 0;
    border-right: var(--line-thin-w) solid var(--line-thin);
    border-bottom: var(--line-thin-w) solid var(--line-thin);
    font-family: var(--digit-font);
    color: var(--given-ink);
    border-radius: 0;
  }
  .input-cell[data-c="2"],
  .input-cell[data-c="5"] {
    border-right: var(--line-box-w) solid var(--line-box);
  }
  .input-cell[data-c="8"] {
    border-right: 0;
  }
  .input-cell[data-r="2"],
  .input-cell[data-r="5"] {
    border-bottom: var(--line-box-w) solid var(--line-box);
  }
  .input-cell[data-r="8"] {
    border-bottom: 0;
  }
  .input-cell.given {
    background: var(--given-bg);
  }
  .input-digit {
    font-size: calc(var(--cell) * var(--digit-size));
    font-weight: var(--given-weight);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .input-cell.same {
    background: var(--same-digit-given);
  }
  .input-cell.selected {
    background: var(--sel-bg);
    box-shadow: inset 0 0 0 var(--sel-ring-w) var(--sel-ring);
    z-index: 1;
  }
  .input-cell.conflict {
    color: var(--conflict);
    background: var(--conflict-bg);
  }
  .input-cell.conflict::after {
    content: "";
    position: absolute;
    top: 3px;
    right: 3px;
    width: 5px;
    height: 5px;
    background: var(--conflict);
    border-radius: 50%;
  }
  .input-cell:focus-visible {
    outline-offset: -3px;
  }
  .preview .input-cell {
    cursor: default;
  }
  .board-error,
  .import-error {
    margin: 10px 0 0;
    color: var(--conflict);
    font-size: 12px;
    line-height: 1.5;
  }
  .import-error:empty {
    display: none;
  }
  .editor-tools,
  .history-tools {
    display: flex;
    align-items: center;
  }
  .editor-tools {
    justify-content: space-between;
    gap: 8px;
    margin-top: 12px;
  }
  .history-tools {
    gap: 4px;
  }
  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-width: 44px;
    height: 40px;
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--ui-soft);
    font-size: 12px;
  }
  .tool:disabled,
  .clear-board:disabled {
    opacity: 0.35;
  }
  .tool:hover:not(:disabled),
  .clear-board:hover:not(:disabled),
  .clear-board:active:not(:disabled) {
    background: var(--neutral-2);
  }
  .tool-divider {
    flex: none;
    width: 1px;
    height: 18px;
    background: var(--hair);
    margin: 0 6px;
  }
  .clear-board {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    gap: 6px;
    min-width: 44px;
    height: 44px;
    padding: 0 8px;
    appearance: none;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--ui-soft);
    font-size: 12px;
    white-space: nowrap;
  }
  .keyboard-hint,
  .board-caption {
    margin: 10px 0 0;
    font-size: 11px;
    color: var(--ui-soft);
    line-height: 1.6;
  }
  .keyboard-hint span {
    margin: 0 4px;
    color: var(--line-thin);
  }
  .kicker {
    display: block;
    margin-bottom: 12px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--ui-soft);
  }
  .input-modes {
    display: flex;
    padding: 3px;
    gap: 3px;
    background: var(--neutral-2);
    border-radius: 9px;
  }
  .input-modes button {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    padding: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--ui-soft);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    --ic: 14px;
  }
  .input-modes button > svg {
    width: 14px;
    height: 14px;
  }
  .input-modes button.active {
    background: var(--board-bg);
    border-color: var(--hair);
    color: var(--ui-ink);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 4%, transparent);
  }
  .input-modes button:disabled {
    opacity: 0.4;
  }
  h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.3;
  }
  .manual-copy {
    margin-top: 24px;
  }
  .manual-copy p,
  .review-copy p {
    margin: 8px 0 0;
    color: var(--ui-soft);
    font-size: 13px;
    line-height: 1.7;
  }
  .keypad-panel {
    margin-top: 20px;
  }
  .input-keypad {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .draft-key {
    appearance: none;
    border: 1px solid var(--key-line);
    border-radius: var(--key-radius);
    background: var(--key-bg);
    box-shadow: var(--key-shadow);
    color: var(--key-ink);
  }
  .draft-key {
    display: grid;
    place-items: center;
    height: 52px;
    padding: 0;
    font-family: var(--key-font);
    font-size: 28px;
    font-weight: var(--key-weight);
  }
  .draft-key:active {
    background: var(--key-pressed);
  }
  .action-panel {
    position: relative;
    align-self: start;
    padding: 20px;
    border: 1px solid var(--hair);
    border-radius: 14px;
    background: var(--board-bg);
    min-width: 0;
  }
  .draft-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .draft-summary strong {
    font-size: 13px;
    font-weight: 600;
  }
  .draft-summary > span {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--ui-soft);
    font-size: 11px;
  }
  .draft-summary i {
    display: block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--line-thin);
  }
  .draft-summary i.ready {
    background: var(--cue-ink);
  }
  .draft-summary .error {
    color: var(--conflict);
  }
  .draft-summary .error i {
    background: var(--conflict);
  }
  .primary-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    min-height: 46px;
    padding: 10px 16px;
    border: 1px solid var(--primary);
    border-radius: 10px;
    background: var(--primary);
    color: var(--on-accent);
    font-size: 14px;
    font-weight: 600;
    margin-top: 16px;
    white-space: nowrap;
    --ic: 14px;
  }
  .primary-action :global(svg) {
    fill: currentColor;
    stroke: none;
    width: 12px;
    height: 12px;
  }
  .primary-action:disabled {
    border-color: var(--hair);
    background: var(--neutral);
    color: var(--ui-soft);
    opacity: 0.65;
  }
  .primary-action:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  .copy-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--ui-soft);
    font-size: 12px;
    margin-top: 8px;
  }
  .copy-toggle:disabled {
    opacity: 0.4;
  }
  .copy-toggle:hover:not(:disabled) {
    background: var(--neutral-2);
  }
  .secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid var(--hair);
    border-radius: 9px;
    background: var(--board-bg);
    color: var(--ui-ink);
    font-size: 12px;
    font-weight: 500;
    --ic: 16px;
  }
  .secondary:hover {
    background: var(--neutral-2);
  }
  .string-input {
    margin-top: 20px;
  }
  .string-input label {
    display: block;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 500;
  }
  textarea {
    display: block;
    width: 100%;
    min-height: 126px;
    resize: vertical;
    box-sizing: border-box;
    padding: 12px;
    border: 1px solid var(--key-line);
    border-radius: 10px;
    background: var(--board-bg);
    color: var(--ui-ink);
    font:
      14px/1.7 ui-monospace,
      monospace;
    overflow-wrap: anywhere;
  }
  textarea::placeholder {
    color: var(--cand);
  }
  textarea[aria-invalid="true"] {
    border-color: var(--conflict);
  }
  .string-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 9px;
    font-size: 11px;
    color: var(--ui-soft);
  }
  .paste-clipboard {
    margin-top: 16px;
  }
  .review-copy .secondary {
    margin-top: 20px;
  }
  @media (max-width: 899px) and (min-width: 600px) {
    .custom-editor {
      padding: 24px 16px;
    }
    .action-panel {
      padding: 16px;
    }
    .tool {
      padding: 0 7px;
    }
    .tool span {
      display: none;
    }
    .history-tools {
      gap: 0;
    }
    .tool-divider {
      margin: 0 3px;
    }
    .clear-board {
      font-size: 11px;
      padding: 0 4px;
    }
    .keyboard-hint {
      font-size: 10px;
    }
  }
  @media (max-width: 599px) {
    .custom-editor {
      display: flex;
      flex-direction: column;
      max-width: none;
      margin: 0;
      padding: 0;
      gap: 0;
      overflow: hidden;
    }
    .setup-top {
      order: 0;
      flex: none;
      padding: 4px;
      border: 1px solid var(--hair);
      border-radius: 12px;
      background: var(--board-bg);
    }
    .manual-copy {
      display: none;
    }
    .input-modes {
      background: transparent;
      padding: 0;
      gap: 4px;
    }
    .input-modes button {
      min-height: 44px;
      border-radius: 8px;
      font-size: 13px;
      border-color: transparent;
    }
    .input-modes button.active {
      background: var(--neutral-2);
      border-color: transparent;
      box-shadow: none;
    }
    .board-area {
      width: 100%;
      flex: none;
    }
    .input-board {
      width: var(--draft-board-side, 100%);
      margin-inline: auto;
    }
    .board-heading {
      margin: 0 4px 9px;
    }
    h2 {
      font-size: 12px;
    }
    .board-heading > span {
      font-size: 11px;
    }
    .editor-tools {
      margin-top: 7px;
    }
    .tool {
      min-height: 44px;
      padding: 0 9px;
      gap: 6px;
    }
    .tool span {
      display: none;
    }
    .tool.erase span,
    .tool.blank span {
      display: inline;
    }
    .tool-divider {
      margin: 0 4px;
    }
    .clear-board {
      font-size: 11px;
    }
    .keyboard-hint {
      display: none;
    }
    .keypad-panel {
      order: 2;
      flex: none;
      margin: 0;
      padding: 0;
    }
    .input-keypad {
      gap: 8px;
    }
    .draft-keypad-slot {
      flex: none;
      width: 100%;
      height: var(--draft-keypad-height, 187.2px);
    }
    .draft-keypad-scale {
      width: 100%;
      transform: scale(var(--draft-keypad-scale, 0.9));
      transform-origin: top center;
    }
    .draft-key {
      height: 64px;
      font-size: 30px;
    }
    .action-panel {
      position: relative;
      display: flex;
      align-items: center;
      flex: none;
      align-self: stretch;
      gap: 10px;
      padding: 12px 4px 0;
      margin-top: 4px;
      border: 0;
      border-radius: 0;
      background: transparent;
      z-index: 10;
    }
    .draft-summary {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .draft-summary strong {
      font-size: 13px;
      white-space: nowrap;
    }
    .draft-summary > span {
      font-size: 10px;
      white-space: nowrap;
    }
    .draft-summary i {
      display: none;
    }
    .primary-action {
      order: 2;
      width: auto;
      min-height: 46px;
      margin: 0;
      padding: 10px 14px;
      gap: 12px;
      font-size: 13px;
    }
    .copy-toggle {
      order: 1;
      flex: none;
      width: 44px;
      min-height: 44px;
      margin: 0;
    }
    .copy-toggle span {
      display: none;
    }
    .string-input {
      margin: 0;
      padding: 10px;
    }
    .string-input label {
      font-size: 12px;
      margin-bottom: 8px;
    }
    textarea {
      min-height: 82px;
      height: 82px;
      padding: 10px;
      font-size: 14px;
    }
    .paste-clipboard {
      margin-top: 12px;
    }
    .string-meta {
      margin-top: 8px;
    }
    .review-copy {
      padding: 12px;
    }
    .review-copy h3 {
      font-size: 18px;
    }
    .review-copy p {
      font-size: 12px;
    }
    .review-copy .kicker {
      display: none;
    }
    .review-copy .secondary {
      margin-top: 12px;
    }
    .board-caption {
      font-size: 10px;
      margin: 10px 4px;
    }
  }

  @media (max-width: 359px) {
    .history-tools {
      gap: 0;
    }
    .tool.erase span {
      display: none;
    }
    .clear-board {
      padding: 0 4px;
    }
  }

  /* Selected A: retain the existing tokens and controls, with quiet framing. */
  .quiet .action-panel {
    background: transparent;
    border: 0;
    border-radius: 0;
    padding: 8px 0 0;
  }
  .quiet .action-panel {
    border-top: 1px solid var(--hair);
    padding-top: 20px;
  }
  .quiet .input-modes {
    border: 0;
    border-bottom: 1px solid var(--hair);
    border-radius: 0;
    padding: 0;
    gap: 0;
    background: transparent;
  }
  .quiet .input-modes button {
    min-height: 44px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
  }
  .quiet .input-modes button.active {
    border-bottom-color: var(--primary);
    box-shadow: none;
    background: transparent;
    color: var(--ui-ink);
  }
  .quiet .manual-copy {
    margin-top: 20px;
  }
  .quiet .manual-copy h3 {
    font-size: 18px;
  }
  .quiet .manual-copy p {
    font-size: 12px;
  }
  .quiet .copy-toggle {
    border: 1px solid var(--hair);
    background: var(--board-bg);
  }
  @media (max-width: 599px) {
    .custom-editor {
      padding-left: 16px;
      padding-right: 16px;
    }
    .quiet .setup-top {
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .quiet .action-panel {
      padding: 12px 4px 0;
      border-top: 1px solid var(--hair);
    }
    .quiet .input-modes button {
      font-size: 13px;
    }
    .quiet .copy-toggle {
      border: 0;
      background: transparent;
    }
    .quiet .string-input {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0;
      position: relative;
      background: var(--board-bg);
      border: 1px solid var(--hair);
      border-radius: 10px;
      padding: 0;
      margin-top: 14px;
      overflow: hidden;
    }
    .quiet .string-input > label {
      grid-column: 1/3;
      grid-row: 1;
      margin: 0;
      padding: 12px 12px 8px;
      align-self: center;
      font-size: 12px;
    }
    .quiet textarea {
      grid-column: 1/3;
      grid-row: 2;
      height: 78px;
      min-height: 78px;
      padding: 0 12px;
      font-size: 16px;
      line-height: 24px;
      border: 0;
      border-radius: 0;
      background: transparent;
      resize: none;
      box-shadow: none;
    }
    .quiet textarea:focus {
      outline: 0;
    }
    .quiet .string-input.keyboard-focus:focus-within {
      border-color: var(--focus);
      box-shadow: 0 0 0 1px var(--focus);
    }
    .quiet .string-meta {
      grid-column: 1;
      grid-row: 3;
      align-self: center;
      padding: 0 12px;
      margin: 0;
      font-size: 10px;
    }
    .quiet .paste-clipboard {
      grid-column: 2;
      grid-row: 3;
      width: auto;
      min-height: 44px;
      margin: 0;
      padding: 0 12px;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      font-size: 12px;
      gap: 6px;
    }
    .quiet .import-error {
      grid-column: 1/3;
      grid-row: 4;
      margin: 0;
      padding: 0 12px;
    }
    .quiet .import-error:not(:empty) {
      padding-bottom: 10px;
    }
    .quiet.paste .input-board {
      width: var(--draft-board-side, 100%);
      margin-inline: auto;
    }
  }
  @media (max-width: 359px) {
    .quiet .tool {
      padding: 0 6px;
    }
    .quiet .tool-divider {
      margin: 0 2px;
    }
    .quiet .editor-tools {
      gap: 4px;
    }
  }
  @media (max-width: 599px) and (max-height: 600px) {
    .quiet .history-tools {
      gap: 0;
    }
  }
  /* Both panels occupy one grid track. The inactive panel still contributes its
     size, but is absent from focus navigation and the accessibility tree. */
  .setup-top {
    flex: none;
  }
  .input-region {
    display: grid;
    flex: none;
    min-width: 0;
  }
  .manual-input,
  .paste-input {
    grid-area: 1 / 1;
    min-width: 0;
    align-self: start;
  }
  .inactive {
    visibility: hidden;
    pointer-events: none;
  }
  .manual-copy {
    display: none;
  }
  .editor-tools {
    margin-top: 0;
  }
  .keypad-panel {
    margin-top: 8px;
  }
  .board-error {
    flex: none;
    margin: 0;
  }
  .board-error:empty {
    display: none;
  }
  .action-panel {
    flex: none;
  }
  @media (max-width: 599px) {
    .custom-editor {
      max-width: none;
    }
    .quiet .string-input {
      margin-top: 7px;
    }
  }
</style>
