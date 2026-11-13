import { writable } from "svelte/store";

/** @typedef {"system" | "light" | "dark" | "paper" | "dim" | "sage"} ThemePreference */
const STORAGE_KEY = "sudoku-theme";
/** @type {ThemePreference} */
let preference = "system";
/** @type {MediaQueryList | undefined} */
let systemTheme;

/** @type {import("svelte/store").Writable<ThemePreference>} */
export const themePreference = writable(preference);

/** @param {string | null} value @returns {ThemePreference} */
function normalize(value) {
  return ["light", "dark", "paper", "dim", "sage"].includes(value)
    ? /** @type {ThemePreference} */ (value)
    : "system";
}

function applyTheme() {
  const dark =
    ["dark", "dim"].includes(preference) || (preference === "system" && systemTheme?.matches);
  const resolved = preference === "system" ? (dark ? "dark" : "light") : preference;
  const background = {
    light: "#f5f4f0",
    dark: "#191b1f",
    paper: "#f5e9d3",
    dim: "#120d09",
    sage: "#dce8dc",
  }[resolved];
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
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
