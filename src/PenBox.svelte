<script>
  import { puzzle, conflictCell } from "./store";

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
</script>

<div class="pen-box">
  {$puzzle[x][y]}
  <div class:conflict={$conflictCell[x][y]}></div>
</div>

<style>
  .pen-box {
    width: 100%;
    height: 100%;
    font-size: 2rem;
    position: relative;
    font-weight: 700;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
  }

  .conflict {
    position: absolute;
    width: 10px;
    height: 10px;
    right: 6px;
    bottom: 6px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.4);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.8;
    }
  }
</style>
