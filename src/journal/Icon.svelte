<script>
  /** @typedef {'check' | 'play' | 'chevron-left' | 'chevron-right' | 'calendar-days' | 'grid-3x3' | 'flame' | 'trophy' | 'x' | 'history' | 'info' | 'arrow-left'} IconName */

  /** @type {{ name: IconName }} */
  let { name } = $props();
</script>

<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
  {#if name === "check"}
    <path d="M20 6 9 17l-5-5"></path>
  {:else if name === "play"}
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
    ></path>
  {:else if name === "chevron-left"}
    <path d="m15 18-6-6 6-6"></path>
  {:else if name === "chevron-right"}
    <path d="m9 18 6-6-6-6"></path>
  {:else if name === "calendar-days"}
    <path d="M8 2v3"></path>
    <path d="M16 2v3"></path>
    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
    <path d="M3 9h18"></path>
    <path d="M8 13h.01"></path>
    <path d="M12 13h.01"></path>
    <path d="M16 13h.01"></path>
    <path d="M8 17h.01"></path>
    <path d="M12 17h.01"></path>
    <path d="M16 17h.01"></path>
  {:else if name === "grid-3x3"}
    <rect width="18" height="18" x="3" y="3" rx="2"></rect>
    <path d="M3 9h18"></path>
    <path d="M3 15h18"></path>
    <path d="M9 3v18"></path>
    <path d="M15 3v18"></path>
  {:else if name === "flame"}
    <path
      d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"
    ></path>
  {:else if name === "trophy"}
    <path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"></path>
    <path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"></path>
    <path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"></path>
    <path d="M4 22h16"></path>
    <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path>
    <path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"></path>
  {:else if name === "x"}
    <path d="M18 6 6 18"></path>
    <path d="m6 6 12 12"></path>
  {:else if name === "history"}
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
    <path d="M3 3v5h5"></path>
    <path d="M12 7v5l4 2"></path>
  {:else if name === "info"}
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M12 16v-4"></path>
    <path d="M12 8h.01"></path>
  {:else if name === "arrow-left"}
    <path d="m12 19-7-7 7-7"></path>
    <path d="M19 12H5"></path>
  {/if}
</svg>

<style>
  svg {
    width: var(--ic, 18px);
    height: var(--ic, 18px);
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
