<script>
  import { onMount, tick } from "svelte";
  import { game } from "./game/game.svelte.js";
  import { playUi } from "./play/session.svelte.js";

  /** @type {{ desktop?: boolean }} */
  let { desktop = false } = $props();
  const modes = /** @type {const} */ ([
    { id: "auto", name: "Auto", description: "Candidates filled in for you" },
    { id: "tidy", name: "Tidy", description: "Your notes, tidied as you place" },
    { id: "manual", name: "Manual", description: "Your notes, never changed" },
  ]);
  const label = $derived(modes.find((mode) => mode.id === game.notesMode)?.name);
  let open = $state(false);
  let button = $state(/** @type {HTMLButtonElement | undefined} */ (undefined));
  let panel = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let valueText = $state(/** @type {HTMLSpanElement | undefined} */ (undefined));
  let down = false;

  // Keep the full label within its slot when a platform's fallback font is wider.
  function fitLabel() {
    if (!valueText?.clientWidth) return;
    valueText.style.transform = "none";
    const range = document.createRange();
    range.selectNodeContents(valueText);
    const natural = range.getBoundingClientRect().width;
    const available = valueText.getBoundingClientRect().width;
    const scale = natural ? Math.min(1, available / natural) : 1;
    valueText.style.transform = scale < 1 ? `scaleX(${scale})` : "none";
  }

  $effect(() => {
    label;
    tick().then(fitLabel);
  });
  /** @type {Animation | undefined} */
  let animation;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hold;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function position() {
    if (!panel || !button || !open) return;
    const anchor = button.getBoundingClientRect();
    if (!anchor.width || !anchor.height) {
      close(false, true);
      return;
    }
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    down = desktop;
    const above = anchor.top - 8 - height;
    const below = anchor.bottom + 8;
    if (down && below + height > innerHeight - 12 && above >= 12) down = false;
    else if (!down && above < 12 && below + height <= innerHeight - 12) down = true;
    panel.style.left = `${Math.max(12, Math.min(anchor.x + anchor.width / 2 - width / 2, innerWidth - width - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(down ? below : above, innerHeight - height - 12))}px`;
    panel.style.transformOrigin = down ? "top center" : "bottom center";
  }

  /** @param {boolean} entering */
  function animate(entering) {
    animation?.cancel();
    if (!panel || reduced()) return;
    const css = getComputedStyle(panel);
    const tucked = { opacity: 0, transform: `translateY(${down ? -4 : 4}px) scale(.96)` };
    const shown = { opacity: 1, transform: "translateY(0) scale(1)" };
    animation = panel.animate(entering ? [tucked, shown] : [shown, tucked], {
      duration:
        parseFloat(css.getPropertyValue("--motion")) *
        (css.getPropertyValue("--motion").trim().endsWith("ms") ? 1 : 1000),
      easing: css.getPropertyValue("--ease-out").trim(),
      fill: "both",
    });
    return animation;
  }

  /** @param {boolean} [returnFocus] @param {boolean} [instant] */
  function close(returnFocus = true, instant = false) {
    clearTimeout(hold);
    if (!open) {
      if (instant) {
        animation?.cancel();
        panel?.hidePopover();
      }
      return;
    }
    open = false;
    if (returnFocus) button?.focus({ preventScroll: true });
    const leaving = instant ? undefined : animate(false);
    if (!leaving) {
      animation?.cancel();
      panel?.hidePopover();
    } else {
      leaving.finished.then(
        () => {
          if (!open) panel?.hidePopover();
        },
        () => {}
      );
    }
  }

  async function toggle() {
    if (playUi.paused) return;
    if (open) return close();
    clearTimeout(hold);
    open = true;
    await tick();
    if (!open || playUi.paused) return;
    panel?.showPopover();
    position();
    animate(true);
    const checked = panel?.querySelector("[aria-checked='true']");
    if (checked instanceof HTMLElement) checked.focus();
  }

  /** @param {import('./game/game.js').NotesMode} mode */
  async function choose(mode) {
    game.setNotesMode(mode);
    clearTimeout(hold);
    if (reduced()) close();
    else {
      // Start the hold after the board, label and check have rendered together.
      await tick();
      if (open) hold = setTimeout(() => close(), 120);
    }
  }

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    const items = [...(panel?.querySelectorAll("button") ?? [])];
    const index = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    let next = -1;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") close();
    else if (event.key === "Tab") {
      // Start the browser's normal Tab traversal at the trigger.
      close();
      event.stopPropagation();
      return;
    } else if (event.key !== "Enter" && event.key !== " ") return;
    event.stopPropagation();
    if (next >= 0) items[next].focus();
    if (event.key !== "Enter" && event.key !== " ") event.preventDefault();
  }

  onMount(() => {
    /** @param {PointerEvent} event */
    const outside = (event) => {
      if (!open || !(event.target instanceof Element)) return;
      if (panel?.contains(event.target) || button?.contains(event.target)) return;
      const control = event.target.closest(
        "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1']):not(:disabled)"
      );
      close(!control);
      if (control instanceof HTMLElement) control.focus({ preventScroll: true });
      // Pointer default focus runs after pointerdown. Restore after that default,
      // while allowing an outside control to keep its own focus.
      if (!control)
        setTimeout(() => {
          if (!open && !playUi.paused && document.activeElement === document.body)
            button?.focus({ preventScroll: true });
        }, 0);
    };
    const observer = new ResizeObserver(fitLabel);
    if (button) observer.observe(button);
    if (valueText) observer.observe(valueText);
    document.fonts.addEventListener("loadingdone", fitLabel);
    document.fonts.ready.then(fitLabel);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      clearTimeout(hold);
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fitLabel);
      animation?.cancel();
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  });

  $effect(() => {
    if (playUi.paused || playUi.modal) close(false, true);
  });
</script>

<button
  bind:this={button}
  id={desktop ? "notes-mode-desktop" : "notes-mode"}
  class:dhbtn={desktop}
  class:tool={!desktop}
  class:manual={game.notesMode === "manual"}
  class="notes-mode"
  type="button"
  aria-label={`Notes mode: ${label}`}
  aria-haspopup="menu"
  aria-expanded={open}
  disabled={playUi.paused}
  onclick={toggle}
>
  <!-- Lucide pencil-line and chevron-down. ISC License, Lucide contributors. -->
  <svg class="pencil" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13 21h8"></path>
    <path d="m15 5 4 4"></path>
    <path
      d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
    ></path>
  </svg>
  <span class="mode-label"
    ><span class="value" bind:this={valueText}>{label}</span><svg
      class="chevron"
      viewBox="0 0 24 24"
      aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg
    ></span
  >
</button>
<div
  bind:this={panel}
  popover="manual"
  role="menu"
  tabindex="-1"
  aria-label="Notes"
  aria-hidden={!open}
  inert={!open}
  class="notes-menu"
  onkeydown={onKey}
>
  <p class="heading" aria-hidden="true">Notes</p>
  {#each modes as mode (mode.id)}
    <button
      type="button"
      role="menuitemradio"
      tabindex={game.notesMode === mode.id ? 0 : -1}
      aria-checked={game.notesMode === mode.id}
      onclick={() => choose(mode.id)}
    >
      <span class="text"><b>{mode.name}</b><small>{mode.description}</small></span>
      {#if game.notesMode === mode.id}
        <svg class="check" viewBox="0 0 24 24" aria-hidden="true"
          ><path d="M20 6 9 17l-5-5"></path></svg
        >
      {/if}
    </button>
  {/each}
</div>

<style>
  svg {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  .notes-mode {
    appearance: none;
    font-family: var(--ui-font);
    font-weight: 400;
    cursor: pointer;
    touch-action: manipulation;
  }
  .tool {
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--ui-ink);
    font-size: 12px;
    padding: 6px 2px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
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
    cursor: default;
  }
  .pencil {
    width: 22px;
    height: 22px;
    stroke-width: 1.8;
  }
  .mode-label {
    min-width: 0;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 1px;
    white-space: nowrap;
    line-height: 14px;
  }
  .value {
    display: block;
    min-width: 0;
    transform-origin: left center;
  }
  .chevron {
    width: 11px;
    height: 11px;
    stroke-width: 2;
  }
  .dhbtn {
    box-sizing: border-box;
    min-width: 86px;
    width: 86px;
    height: 30px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 10px;
    border: 1px solid var(--timer-line);
    border-radius: 8px;
    background: var(--timer-bg);
    color: var(--timer-ink);
    font-size: 14px;
  }
  .dhbtn.manual {
    width: max-content;
  }
  .dhbtn .pencil {
    width: 16px;
    height: 16px;
    stroke-width: 2;
  }
  .dhbtn .mode-label {
    flex: 1;
    justify-content: space-between;
    gap: 3px;
  }
  .dhbtn .chevron {
    width: 12px;
    height: 12px;
  }
  .dhbtn:focus {
    outline: none;
  }
  .dhbtn:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  :global(:root[data-modality="pointer"]) .dhbtn:focus-visible {
    outline: none;
  }
  .dhbtn:disabled {
    opacity: 1;
    cursor: default;
  }
  @media (hover: hover) {
    .dhbtn:hover:not(:disabled) {
      background: #fff;
      border-color: rgb(28 26 22 / 0.22);
    }
  }
  .notes-menu {
    position: fixed;
    inset: auto;
    margin: 0;
    box-sizing: border-box;
    padding: 6px;
    border: 0;
    border-radius: var(--key-radius);
    background: var(--board-bg);
    color: var(--ui-ink);
    box-shadow:
      0 0 0 1px var(--hair),
      var(--shadow-pr6);
    font-family: var(--ui-font);
    width: min(280px, calc(100vw - 24px));
  }
  .heading {
    margin: 0;
    padding: 6px 10px 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ui-soft);
  }
  .notes-menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 53px;
    padding: 8px 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }
  .notes-menu button:hover {
    background: var(--page-bg);
  }
  .notes-menu button:active {
    background: var(--key-pressed);
  }
  .notes-menu button:focus {
    outline: none;
  }
  .notes-menu button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  b {
    display: block;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
  }
  small {
    display: block;
    font-size: 13px;
    line-height: 1.35;
    color: var(--ui-soft);
    white-space: nowrap;
  }
  .check {
    width: 18px;
    height: 18px;
    stroke-width: 2.4;
    animation: check-in var(--motion) var(--ease-out) both;
  }
  @keyframes check-in {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .check {
      animation: none;
    }
  }
</style>
