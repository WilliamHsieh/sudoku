<script>
  /** @type {{ active: boolean, inline?: boolean, reduced: boolean, updating: boolean,
   * ondismiss: () => void, onupdate: () => void }} */
  let { active, inline = false, reduced, updating, ondismiss, onupdate } = $props();
  /** WebKit suppresses its compatibility click after pointerdown.preventDefault.
   * Handle a completed touch once; cancel its compatibility click in Chromium.
   * A drag released outside the button must never trigger Update.
   * @param {TouchEvent} event
   * @param {() => void} action
   */
  function finishTouch(event, action) {
    const touch = event.changedTouches[0];
    if (!touch || !(event.currentTarget instanceof HTMLElement)) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && event.currentTarget.contains(target)) {
      event.preventDefault();
      action();
    }
  }
</script>

<div
  class="update-notice"
  class:active
  class:inline
  class:pill={!inline}
  class:reduced
  class:updating
  role="group"
  aria-label="App update"
  aria-busy={updating}
  inert={!active}
>
  {#if updating}
    <svg class="ic spin" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
    <span class="msg">Updating…</span>
  {:else}
    <!-- Lucide icons. ISC License. Copyright (c) Lucide Contributors. -->
    <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5M12 15V3" />
    </svg>
    <span class="msg">New version ready</span>
    <span class="cap">
      <button
        type="button"
        class="btn update"
        ontouchstart={() => {}}
        onpointerdown={(event) => event.preventDefault()}
        ontouchend={(event) => finishTouch(event, onupdate)}
        onclick={onupdate}>Update</button
      >
      <button
        type="button"
        class="btn x"
        aria-label="Dismiss"
        ontouchstart={() => {}}
        onpointerdown={(event) => event.preventDefault()}
        ontouchend={(event) => finishTouch(event, ondismiss)}
        onclick={ondismiss}
      >
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"
          ><path d="m18 6-12 12M6 6l12 12" /></svg
        >
      </button>
    </span>
  {/if}
</div>

<style>
  .update-notice {
    display: flex;
    align-items: center;
    gap: 6px;
    width: max-content;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0;
    color: var(--ink);
    font-family: var(--ui-font);
    font-weight: 500;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 180ms var(--ease-out),
      visibility 0s 180ms;
  }
  .msg {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ic {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    fill: none;
    stroke: var(--ink2);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* Optical centring: the notice's ink runs from the download glyph's left stroke to the
   capsule's right border. The glyph's viewBox leaves a little empty space on its left; a
   -1px start margin balances the rendered (antialiased) ink, measured in Chromium + WebKit
   at 4x (tools/axis.py). */
  .update-notice > .ic:first-child {
    margin-inline-start: -1px;
  }

  /* The action group: one joined capsule, Update | ×, no gap. Each half draws its own 1px --hair
   border (Update: top/left/bottom; ×: all four, its left edge being the hairline divider), so
   the halves are the capsule and their pressed fills reach the border. */
  .cap {
    display: inline-flex;
    align-items: stretch;
    flex: none;
    margin-inline-start: 2px; /* 6 + 2 = 8px from the text */
    border-radius: 999px;
    background: var(--page);
  }
  .btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    line-height: 1;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .btn::after {
    content: "";
    position: absolute;
    left: -1px;
    right: -1px;
  } /* invisible hit area; insets are from the padding box, so -1px covers the border/divider */
  .update::after {
    right: 0;
  } /* no right border: its hit area ends where ×'s begins */
  .update {
    padding: 0 10px 0 11px;
    color: var(--blue);
    font-weight: 600;
    border: 1px solid var(--hair);
    border-right: 0;
    border-radius: 999px 0 0 999px;
  }
  .x {
    border: 1px solid var(--hair);
    border-radius: 0 999px 999px 0;
  }
  .x .ic {
    width: 12px;
    height: 12px;
    flex-basis: 12px;
  }
  .update:active {
    color: var(--blue-d);
    background: var(--sel);
  }
  .x:active {
    background: var(--neutral);
  }
  .btn:focus {
    outline: none;
  }
  .btn:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
    z-index: 1;
  }
  .updating {
    color: var(--ink2);
  }
  .spin {
    animation: un-spin 800ms linear infinite;
  }

  /* Play, narrow: lives in .hint-line's single grid cell; the row stays 14px.
   Capsule is 20px tall; -3px block margins keep its layout height at 14, so nothing moves. */
  .update-notice.inline {
    grid-area: 1/1;
    justify-self: center;
    font-size: 12px;
    line-height: normal;
    --notice-in-delay: 180ms;
  } /* the hint fades out first (master: 180ms) */
  .update-notice.inline .cap {
    height: 20px;
    margin-block: -3px;
  }
  .update-notice.inline .btn {
    height: 20px;
  }
  .update-notice.inline .x {
    width: 28px;
  }
  /* 44px hit: button box (incl. its border) is 721-741 at 390. 9px up (exactly to the keys' bottom
   edge 712, no overlap) + 20 + 15px down = 44. × is 28 wide; its hit area extends 16px past
   its right border = 44 wide. */
  .update-notice.inline .btn::after {
    top: -10px;
    bottom: -16px;
  } /* padding box 722-740 -> 712-756 */
  .update-notice.inline .x::after {
    right: -17px;
  }

  /* Journal + desktop: master's fixed bottom pill, now 44px tall, holding the same capsule. */
  .update-notice.pill {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
    left: 50%;
    translate: -50% 0;
    max-width: calc(100vw - 32px);
    height: 44px;
    padding: 7px 7px 7px 12px;
    border: 1px solid var(--hair);
    border-radius: 10px;
    background: var(--page);
    font-size: 13px;
    line-height: 1.3;
    z-index: 1100;
  }
  .update-notice.pill .cap {
    height: 28px;
  }
  .update-notice.pill .btn {
    height: 28px;
  }
  .update-notice.pill .x {
    width: 32px;
  }
  /* buttons are 26px inside the capsule border; 9 + 26 + 9 = the pill's full 44px incl. border */
  .update-notice.pill .btn::after {
    top: -9px;
    bottom: -9px;
  }
  .update-notice.pill .x::after {
    right: -13px;
  }
  .update-notice.pill.updating {
    padding-right: 12px;
  }

  .reduced,
  .reduced * {
    animation: none !important;
    transition: none !important;
  }

  @keyframes un-spin {
    to {
      rotate: 360deg;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .update-notice,
    .spin {
      animation: none;
    }
  }

  .update-notice.active {
    opacity: 1;
    visibility: visible;
    transition: opacity 180ms var(--ease-out) var(--notice-in-delay, 0ms);
  }
  .update-notice:not(.active) {
    pointer-events: none;
  }
  .update-notice.reduced,
  .reduced .spin {
    transition: none;
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .update-notice {
      transition: none;
    }
  }
</style>
