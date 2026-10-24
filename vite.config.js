import { versionPlugin } from "./build/version-plugin.js";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { appleTouchIconPlugin } from "./favicon/apple-touch-plugin.js";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/sudoku/",
  plugins: [svelte(), appleTouchIconPlugin(), versionPlugin()],
});
