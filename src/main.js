/* global __SUDOKU_BUILD__ */
import "./app.css";
import { stripUpdateParam, applyPendingUpdate } from "./auto-update-browser.js";
import { mount } from "svelte";
import App from "./App.svelte";
import { watchWeekdayFavicon } from "./favicon.js";

watchWeekdayFavicon(document, import.meta.env.BASE_URL);
stripUpdateParam();

const app = mount(App, { target: document.getElementById("app") });

// Even an already verified next-launch navigation must leave a usable screen
// while the new document loads. No network request gates this mount.
if (typeof __SUDOKU_BUILD__ !== "undefined") {
  requestAnimationFrame(() => applyPendingUpdate(__SUDOKU_BUILD__));
}

export default app;
