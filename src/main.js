/* global __SUDOKU_BUILD__ */
import "./app.css";
import { stripUpdateParam, updateBeforeMount } from "./auto-update-browser.js";
import { mount } from "svelte";
import App from "./App.svelte";
import { watchWeekdayFavicon } from "./favicon.js";

watchWeekdayFavicon(document, import.meta.env.BASE_URL);

stripUpdateParam();
const navigating =
  typeof __SUDOKU_BUILD__ !== "undefined" &&
  (await updateBeforeMount({ current: __SUDOKU_BUILD__, base: import.meta.env.BASE_URL }));

const app = navigating ? undefined : mount(App, { target: document.getElementById("app") });

export default app;
