<script>
  import Icon from "../journal/Icon.svelte";
  /** @type {{preview: boolean, onback: () => void}} */
  let { preview, onback } = $props();
</script>

<header class="draft-header">
  <button
    class="back"
    type="button"
    onclick={onback}
    aria-label={preview ? "Back to editing" : "Back to daily puzzles"}
    ><Icon name="arrow-left" /></button
  >
  <h1>{preview ? "Review puzzle" : "Custom puzzle"}</h1>
</header>

<style>
  .draft-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    height: 64px;
    padding: 0 32px;
    margin: 0;
    border-bottom: 1px solid var(--hair);
    box-sizing: border-box;
    color: var(--ui-ink);
    font-family: var(--ui-font);
  }
  .back {
    display: grid;
    place-items: center;
    width: 44px;
    min-height: 44px;
    margin-left: -6px;
    padding: 0;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--ui-soft);
    cursor: pointer;
    --ic: 18px;
  }
  .back:hover {
    background: var(--neutral-2);
  }
  .back:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  h1 {
    margin: 0;
    font-size: 20px;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  @media (max-width: 599px) {
    .draft-header {
      height: 44px;
      padding: 0 8px;
      margin: -3px -8px -7px;
      border: 0;
      gap: 7px;
    }
    .back {
      width: 44px;
      margin-left: 0;
    }
    h1 {
      font-size: 18px;
    }
  }
</style>
