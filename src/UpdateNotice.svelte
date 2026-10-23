<script>
  /** @type {{ active: boolean, inline?: boolean, reduced: boolean, copy: string, ondismiss: () => void }} */
  let { active, inline = false, reduced, copy, ondismiss } = $props();
</script>

<!-- The separate, persistent live region announces this visual copy. A pointer
     can dismiss it without taking focus from the game or Journal. -->
<button
  type="button"
  class="update-notice"
  class:active
  class:inline
  class:reduced
  aria-hidden="true"
  tabindex="-1"
  onpointerdown={(event) => event.preventDefault()}
  onclick={ondismiss}
>
  <!-- Lucide download. ISC License. Copyright (c) Lucide Contributors. -->
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <path d="m7 10 5 5 5-5"></path>
    <path d="M12 15V3"></path>
  </svg>
  {copy}
</button>

<style>
  .update-notice {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
    left: 50%;
    translate: -50% 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: max-content;
    max-width: calc(100vw - 32px);
    box-sizing: border-box;
    margin: 0;
    padding: 9px 12px;
    border: 1px solid var(--hair);
    border-radius: 10px;
    background: var(--page);
    color: var(--ink);
    font-family: var(--ui-font);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    z-index: 1100;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 180ms var(--ease-out),
      visibility 0s 180ms;
  }
  .active {
    opacity: 1;
    visibility: visible;
    transition: opacity 260ms var(--ease-out) var(--notice-in-delay, 0ms);
  }
  .inline {
    /* Let the hint finish its 180ms fade before showing the notice. */
    --notice-in-delay: 180ms;
    position: static;
    translate: none;
    grid-area: 1 / 1;
    justify-self: center;
    max-width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font: inherit;
    line-height: inherit;
  }
  svg {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    fill: none;
    stroke: var(--ink2);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .reduced {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .update-notice {
      transition: none;
    }
  }
</style>
