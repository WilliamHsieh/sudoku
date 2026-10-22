import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { watchWeekdayFavicon } from "./favicon.js";

watchWeekdayFavicon(document, import.meta.env.BASE_URL);

// Svelte 5：class 實例化（new App）已移除，改用 mount()
const app = mount(App, {
  target: document.getElementById("app"),
});

export default app;
