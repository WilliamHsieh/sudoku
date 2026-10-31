import { writable } from "svelte/store";

/** @typedef {"system" | "light" | "dark"} ThemePreference */
const STORAGE_KEY = "sudoku-theme";
/** @type {ThemePreference} */
let preference = "system";
/** @type {MediaQueryList | undefined} */
let systemTheme;

/** @type {import("svelte/store").Writable<ThemePreference>} */
export const themePreference = writable(preference);

/** @param {string | null} value @returns {ThemePreference} */
function normalize(value) {
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme() {
  const dark = preference === "dark" || (preference === "system" && systemTheme?.matches);
  const resolved = dark ? "dark" : "light";
  const background = dark ? "#191b1f" : "#f5f4f0";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.documentElement.style.backgroundColor = background;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", dark ? "black" : "default");
}

/** @param {string} value */
export function setThemePreference(value) {
  preference = normalize(value);
  themePreference.set(preference);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The selection still works for this session when storage is unavailable.
  }
  applyTheme();
}

export function installTheme() {
  systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  try {
    preference = normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    preference = "system";
  }
  themePreference.set(preference);
  applyTheme();

  function onSystemChange() {
    if (preference === "system") applyTheme();
  }
  /** @param {StorageEvent} event */
  function onStorage(event) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    preference = normalize(event.newValue);
    themePreference.set(preference);
    applyTheme();
  }
  systemTheme.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    systemTheme?.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
