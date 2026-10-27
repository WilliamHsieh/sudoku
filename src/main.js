import "./app.css";
import { stripUpdateParam } from "./auto-update-browser.js";
import { mount } from "svelte";
import App from "./App.svelte";
import { watchWeekdayFavicon } from "./favicon.js";

watchWeekdayFavicon(document, import.meta.env.BASE_URL);
stripUpdateParam();

const app = mount(App, { target: document.getElementById("app") });

export default app;
