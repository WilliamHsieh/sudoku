<script>
  import Icon from "../journal/Icon.svelte";
  /** @type {{onopen: () => void, embedded?: boolean}} */
  let { onopen, embedded = false } = $props();
</script>

<button
  class="custom-entry"
  class:embedded
  type="button"
  aria-label="Custom puzzle"
  onclick={onopen}
>
  <span class="symbol"><Icon name="grid-3x3" /></span>
  <span class="copy"><b>Custom puzzle</b><span>Enter a board or paste a puzzle</span></span>
  <Icon name="chevron-right" />
</button>

<style>
  .custom-entry {
    position: relative;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 80px;
    padding: 16px;
    border: 1px solid var(--hair);
    border-radius: 14px;
    background: var(--card);
    color: var(--ink);
    font-family: var(--ui-font);
    text-align: left;
    cursor: pointer;
    --ic: 18px;
  }
  .symbol {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: var(--neutral-2);
    color: var(--ink2);
  }
  .copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  b {
    font-size: 15px;
    line-height: 1.3;
    font-weight: 600;
  }
  .copy > span {
    font-size: 12px;
    line-height: 1.45;
    color: var(--ink2);
  }
  .custom-entry > :global(svg) {
    color: var(--ink2);
  }
  .embedded {
    grid-template-columns: 18px minmax(0, 1fr) 18px;
    gap: 10px;
    min-height: 64px;
    padding: 12px 14px;
    border: 0;
    border-radius: 0;
  }
  .embedded::before {
    content: "";
    position: absolute;
    left: 14px;
    right: 12px;
    top: 0;
    border-top: 1px solid var(--hair);
  }
  .embedded .symbol {
    width: 18px;
    height: 20px;
    background: transparent;
    border-radius: 0;
  }
  .embedded b {
    font-size: 14px;
  }
  .embedded .copy {
    gap: 3px;
  }
  .custom-entry:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 3px;
  }
  .embedded:focus-visible {
    outline-offset: -4px;
  }
  .custom-entry:active {
    background: var(--neutral-2);
  }
  @media (hover: hover) {
    .custom-entry:hover {
      background: var(--page);
    }
  }
</style>
