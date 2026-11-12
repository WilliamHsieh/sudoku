<script>
  import { solvedState } from "../game/solved-state.js";
  /** @type {{givens: string, answers?: string | null, solved?: boolean}} */
  let { givens, answers = null, solved = false } = $props();
  const filled = $derived(solved ? solvedState(givens).answers.join("") : answers);
  const cells = $derived(
    [...givens].map((g, i) => ({
      x: (i % 9) * 10,
      y: Math.floor(i / 9) * 10,
      given: g !== "0",
      digit: g !== "0" ? g : filled?.[i] !== "0" ? filled?.[i] : "",
    }))
  );
</script>

<svg class="thumb" viewBox="0 0 90 90" aria-hidden="true"
  ><rect width="90" height="90" class="bg" />{#each cells as c, i (i)}{#if c.given}<rect
        x={c.x}
        y={c.y}
        width="10"
        height="10"
        class="g"
      />{/if}{#if c.digit}<text x={c.x + 5} y={c.y + 7.4} class:given={c.given}>{c.digit}</text
      >{/if}{/each}<path
    class="thin"
    d="M10 0V90M20 0V90M40 0V90M50 0V90M70 0V90M80 0V90M0 10H90M0 20H90M0 40H90M0 50H90M0 70H90M0 80H90"
  /><path class="box" d="M30 0V90M60 0V90M0 30H90M0 60H90" /><rect
    x="0.6"
    y="0.6"
    width="88.8"
    height="88.8"
    rx="2"
    class="outer"
  /></svg
>

<style>
  .thumb {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
  .bg {
    fill: var(--board-bg);
  }
  .g {
    fill: var(--given-bg);
  }
  text {
    font: 500 6.4px var(--digit-font);
    fill: var(--blue-d);
    text-anchor: middle;
  }
  text.given {
    font-weight: 700;
    fill: var(--given-ink);
  }
  path,
  .outer {
    fill: none;
  }
  .thin {
    stroke: var(--line-thin);
    stroke-width: 0.35;
  }
  .box {
    stroke: var(--line-box);
    stroke-width: 0.9;
  }
  .outer {
    stroke: var(--line-outer);
    stroke-width: 1.1;
  }
</style>
