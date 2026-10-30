// Throwaway mock only. Run: npm run prototype:keypad
// Produces a self-contained HTML file; no server, storage or deployment.
import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const bundle = await build({
  configFile: false,
  plugins: [svelte()],
  logLevel: "warn",
  build: {
    write: false,
    lib: { entry: `${dir}main.js`, name: "KeypadScalePrototype", formats: ["iife"] },
    cssCodeSplit: false,
    minify: true,
  },
});
const output = (Array.isArray(bundle) ? bundle[0] : bundle).output;
const js = output.find((item) => item.type === "chunk").code;
const css = output
  .find((item) => item.fileName.endsWith(".css"))
  .source.replace(/height:100(?:s|d)?vh/g, "height:var(--scene-height)");
const template = await readFile(`${dir}shell.html`, "utf8");
const payload = JSON.stringify({ js, css }).replaceAll("<", "\\u003c");
const html = template.replace("/*__SCENE_BUNDLE__*/", `const sceneBundle = ${payload};`);
await writeFile(`${dir}keypad-scale.prototype.html`, html);
console.log(`Mock ready: ${dir}keypad-scale.prototype.html`);
