// The implemented App and HintPanel, with a fixture source injected at mount.
import "../app.css";
import { mount, tick } from "svelte";
import App from "../App.svelte";
import { installTheme } from "../theme.js";
import { game } from "../game/game.svelte.js";
import { timer, timerRunning } from "../store.js";
import { hintFixture } from "./fixtures.mjs";

async function start() {
  installTheme();
  const params = new URLSearchParams(location.search);
  const fixture = hintFixture(params.get("case") ?? "xwing");
  mount(App, {
    target: document.getElementById("app"),
    props: { hintProvider: params.has("unavailable") ? null : fixture.provider },
  });
  await tick();
  game.load(fixture.state.givens.join(""));
  game.commitStroke(fixture.state);
  window.dispatchEvent(new CustomEvent("loadPuzzle"));
  timer.set(12 * 60 + 47);
  timerRunning.set(false);
  await tick();
  document.body.dataset.originalHintMock = "ready";
}
void start();
