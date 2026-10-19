<script>
  import { onMount } from "svelte";
  import { game } from "./game/game.svelte.js";

  onMount(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q == null) return;
    if (!/^[0-9]{81}$/.test(q)) {
      alert("invalid puzzle");
      return;
    }
    game.load(q);
    window.dispatchEvent(
      new CustomEvent("loadPuzzle", {
        detail: { puzzleString: q },
      })
    );
  });
</script>
