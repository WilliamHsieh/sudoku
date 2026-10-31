import "./app.css";
import { stripUpdateParam } from "./auto-update-browser.js";
import { mount } from "svelte";
import App from "./App.svelte";
import { watchWeekdayFavicon } from "./favicon.js";
import { installTheme } from "./theme.js";

const stopTheme = installTheme();
if (import.meta.hot) import.meta.hot.dispose(stopTheme);
watchWeekdayFavicon(document, import.meta.env.BASE_URL);
stripUpdateParam();

const app = mount(App, { target: document.getElementById("app") });

export default app;
