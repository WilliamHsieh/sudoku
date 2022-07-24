<script>
  import { done } from './store'

  let timer = 0;
  setInterval(() => {
    if (!$done) timer += 1;
  }, 1000);

  $: minutes = Math.floor(timer / 60);
  $: seconds = timer % 60;
</script>

<p>{minutes}{seconds < 10 ? ":0" : ":"}{seconds}</p>
