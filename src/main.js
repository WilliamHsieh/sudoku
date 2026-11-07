import "./app.css";
import { stripUpdateParam } from "./auto-update-browser.js";
import { mount } from "svelte";
import { prepareOffline } from "../offline/client.js";
/* global __SUDOKU_BUILD__ */
import { createWorkerHintProvider } from "./hints/worker-provider.js";
import { watchWeekdayFavicon } from "./favicon.js";
import { installTheme } from "./theme.js";

const stopTheme = installTheme();
if (import.meta.hot) import.meta.hot.dispose(stopTheme);
watchWeekdayFavicon(document, import.meta.env.BASE_URL);
stripUpdateParam();

async function start() {
  const target = document.getElementById("app");
  if (import.meta.env.PROD) {
    target.replaceChildren();
    try {
      globalThis.__sudokuPuzzleBank = await prepareOffline(
        __SUDOKU_BUILD__,
        import.meta.env.BASE_URL,
        () => {
          target.innerHTML =
            '<div class="preparing" role="status"><h1>Preparing puzzles</h1><p>Downloading puzzles for offline play…</p></div>';
        }
      );
    } catch (error) {
      target.innerHTML =
        '<div class="preparing"><h1>Could not prepare puzzles</h1><p role="alert"></p><button type="button">Retry</button><p><a href="">Reload Sudoku</a></p></div>';
      target.querySelector('[role="alert"]').textContent = error.message;
      target.querySelector("button").onclick = () => void start();
      const reload = new URL(location.href);
      reload.searchParams.set("_sudoku_check", `${Date.now()}-${Math.random()}`);
      target.querySelector("a").href = reload.href;
      return null;
    }
  }
  const { default: App } = await import("./App.svelte");
  target.replaceChildren();
  return mount(App, {
    target,
    props: { hintProvider: createWorkerHintProvider() },
  });
}
const app = await start();
export default app;
