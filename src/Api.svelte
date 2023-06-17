<script>
  import { onMount } from 'svelte';
  import { done, puzzle, conflictCell, cellUpdate, pencilBox, prefilled } from './store'

  $: if ($cellUpdate) {
    updatePencil();
    checkConflict();
    checkDone();
    $cellUpdate = false;
  }

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('q')) {
      setPuzzle(urlParams.get("q"));
    }

    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        $prefilled[i][j] = $puzzle[i][j] != 0;
      }
    }
    $cellUpdate = true;
  })

  function checkDone() {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if ($conflictCell[i][j] || $puzzle[i][j] == 0) return;
      }
    }
    $done = true;
  }

  function setPuzzle(q) {
    let ok = q.length == 81;
    for (let i = 0; i < q.length && ok; i++) {
      ok = q[i] >= '0' && q[i] <= '9';
    }
    if (!ok) {
      alert("invalid puzzle");
      return;
    }

    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        $puzzle[i][j] = parseInt(q[i * 9 + j], 10);
      }
    }
  }

  function updatePencil() {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        $pencilBox[i][j].fill(true);
      }
    }
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if ($puzzle[i][j]) {
          const idx = $puzzle[i][j] - 1;
          const bx = 3 * Math.floor(i / 3);
          const by = 3 * Math.floor(j / 3);
          for (let k = 0; k < 9; k++) {
            $pencilBox[i][k][idx] = false;
            $pencilBox[k][j][idx] = false;

            const bi = Math.floor(k / 3);
            const bj = k % 3;
            $pencilBox[bx + bi][by + bj][idx] = false;
          }
        }
      }
    }
  }

  function checkConflict() {
    // row
    for (let i = 0; i < 9; i++) {
      let mp = Array(10).fill(0);
      for (let j = 0; j < 9; j++) {
        mp[$puzzle[i][j]] += 1;
      }
      for (let j = 0; j < 9; j++) {
        $conflictCell[i][j] = $puzzle[i][j] > 0 && mp[$puzzle[i][j]] > 1;
      }
    }

    // column
    for (let j = 0; j < 9; j++) {
      let mp = Array(10).fill(0);
      for (let i = 0; i < 9; i++) {
        mp[$puzzle[i][j]] += 1;
      }
      for (let i = 0; i < 9; i++) {
        if ($puzzle[i][j] > 0 && mp[$puzzle[i][j]] > 1) {
          $conflictCell[i][j] = true;
        }
      }
    }

    // block
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(i / 3) * 3;
      const y = (i % 3) * 3;
      let mp = Array(10).fill(0);
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          mp[$puzzle[x + dx][y + dy]] += 1;
        }
      }
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          let xx = x + dx, yy = y + dy;
          if ($puzzle[xx][yy] > 0 && mp[$puzzle[xx][yy]] > 1) {
            $conflictCell[xx][yy] = true;
          }
        }
      }
    }
  }
</script>
