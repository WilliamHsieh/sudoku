<script>
  import { onMount } from "svelte";
  import { levelName } from "./ui-copy.js";
  /** @type {{level: number, onclose: () => void}} */
  let { level, onclose } = $props();
  let dialog = $state(/** @type {HTMLDialogElement | undefined} */ (undefined));
  let closing = $state(false);
  let closeTimer;
  function close() {
    if (closing) return;
    closing = true;
    closeTimer = setTimeout(
      onclose,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220
    );
  }
  function keydown(event) {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) close();
    } else if (event.key === "Tab") {
      event.preventDefault();
      dialog?.querySelector("button")?.focus();
    }
  }
  onMount(() => {
    dialog?.showModal();
    dialog?.focus();
    return () => {
      clearTimeout(closeTimer);
      dialog?.close();
    };
  });
</script>

<!-- The entire overlay is the signed tap target; Enter and Escape share the close action. -->
<dialog
  bind:this={dialog}
  class="unlock-overlay"
  class:closing
  tabindex="-1"
  aria-labelledby="unlock-label"
  aria-modal="true"
  onclick={close}
  onkeydown={keydown}
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
>
  <div class="unlock-box">
    <div class="slot">
      <span class="lock-wrap"
        ><svg class="lock" viewBox="0 0 24 24" aria-hidden="true"
          ><path class="shackle" d="M7 11V7a5 5 0 0 1 10 0v4" /><rect
            class="body"
            width="18"
            height="11"
            x="3"
            y="11"
            rx="2"
          /><path class="key" d="M12 15.2v2.4" /></svg
        ></span
      >
      <div class="note"><span>L{level}</span></div>
    </div>
    <p id="unlock-label"><span class="sr-only">L{level} 已解鎖：</span>{levelName(level)}</p>
    <button type="button" onclick={close}>繼續</button>
  </div>
</dialog>

<style>
  @font-face {
    font-family: "Atkinson Hyperlegible";
    font-style: normal;
    font-weight: 700;
    font-display: block;
    src: url("@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2")
      format("woff2");
  }
  .unlock-overlay {
    position: fixed;
    inset: 0;
    z-index: 1200;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: rgba(24, 22, 18, 0.96);
    font-family: var(--ui-font);
    outline: none;
    animation: overlay-in 220ms ease-out both;
  }
  .unlock-overlay[open] {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .unlock-overlay::backdrop {
    background: transparent;
  }
  .unlock-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(358px, calc(100% - 32px));
  }
  .slot {
    position: relative;
    width: 168px;
    height: 168px;
  }
  .note {
    position: relative;
    width: 168px;
    height: 168px;
    border-radius: 26px;
    background: #fbe08a;
    border: 3px solid #f1d377;
    box-sizing: border-box;
    box-shadow: 0 7px 0 rgba(28, 26, 22, 0.1);
    display: grid;
    place-items: center;
    transform: rotate(-8deg);
    animation: note-pop 520ms cubic-bezier(0.2, 0.75, 0.25, 1) 1520ms both;
  }
  .note span {
    font:
      700 78px/1 "Atkinson Hyperlegible",
      sans-serif;
    color: #7a4b08;
    letter-spacing: -0.01em;
  }
  .lock-wrap {
    position: absolute;
    display: grid;
    place-items: center;
    pointer-events: none;
    left: 50%;
    top: 50%;
    width: 112px;
    height: 112px;
    margin: -56px 0 0 -56px;
    animation:
      lock-in 220ms cubic-bezier(0.2, 0.8, 0.3, 1) 100ms both,
      lock-gone 220ms ease-in 1180ms forwards;
  }
  .lock {
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: none;
    stroke: #fbe08a;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: lock-shake 260ms ease-in-out 380ms both;
  }
  .body {
    fill: #fbe08a;
    stroke: #f1d377;
    stroke-width: 1.2;
  }
  .key {
    stroke: #7a4b08;
    stroke-width: 2;
  }
  .shackle {
    transform-box: view-box;
    transform-origin: 7px 11px;
    animation: lock-open 420ms cubic-bezier(0.2, 0.7, 0.2, 1) 700ms both;
  }
  p {
    margin: 30px 0 0;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.2;
    color: #fff;
    animation: text-in 340ms cubic-bezier(0.2, 0.7, 0.2, 1) 1980ms both;
  }
  button {
    width: 100%;
    height: 48px;
    margin-top: 28px;
    border: 0;
    border-radius: 12px;
    background: var(--blue);
    color: var(--on-accent);
    font: 600 16px/1 var(--ui-font);
    cursor: pointer;
    animation: text-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) 2140ms both;
  }
  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
  :global(:root[data-theme="dark"]) button,
  :global(:root[data-theme="dim"]) button {
    background: var(--primary);
  }
  .closing {
    animation: overlay-out 220ms ease-out both;
  }
  .closing .note {
    animation: note-out 220ms ease-in both;
  }
  .closing .lock-wrap {
    display: none;
  }
  .closing p,
  .closing button {
    animation: overlay-out 140ms ease-out both;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  @keyframes overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes overlay-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes lock-in {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes lock-gone {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.78) translateY(8px);
    }
  }
  @keyframes lock-shake {
    0%,
    100% {
      transform: rotate(0);
    }
    22% {
      transform: rotate(-8deg);
    }
    48% {
      transform: rotate(7deg);
    }
    74% {
      transform: rotate(-3deg);
    }
  }
  @keyframes lock-open {
    0% {
      transform: none;
    }
    35% {
      transform: translateY(-3px);
    }
    100% {
      transform: translateY(-3px) rotate(-24deg);
    }
  }
  @keyframes note-pop {
    0% {
      opacity: 0;
      transform: translateY(16px) scale(0.5) rotate(0deg);
    }
    20% {
      opacity: 1;
      transform: translateY(10px) scale(0.66) rotate(-3deg);
    }
    62% {
      opacity: 1;
      transform: translateY(-5px) scale(1.07) rotate(-9deg);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1) rotate(-8deg);
    }
  }
  @keyframes text-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes note-out {
    from {
      opacity: 1;
      transform: rotate(-8deg) scale(1);
    }
    to {
      opacity: 0;
      transform: rotate(-8deg) scale(0.9);
    }
  }
  @media (min-width: 600px) {
    .unlock-box {
      width: 340px;
    }
    .slot,
    .note {
      width: 208px;
      height: 208px;
    }
    .note {
      border-radius: 32px;
    }
    .note span {
      font-size: 96px;
    }
    .lock-wrap {
      width: 136px;
      height: 136px;
      margin: -68px 0 0 -68px;
    }
    button {
      height: 56px;
      border-radius: 11px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .unlock-overlay,
    .unlock-overlay * {
      animation: none !important;
    }
    .lock-wrap {
      display: none;
    }
    .note {
      opacity: 1;
      transform: rotate(-8deg);
    }
  }
</style>
