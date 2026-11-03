import { test } from "@playwright/test";
import { registerHintCaptures } from "./hint-recording-helpers.js";
test.use({ video: { mode: "on", size: { width: 1280, height: 900 } } });
registerHintCaptures([
  { name: "auto-naked-pair-to-xy-wing-desktop", width: 1280, height: 900 },
  { name: "auto-x-wing-desktop", width: 1280, height: 900 },
]);
