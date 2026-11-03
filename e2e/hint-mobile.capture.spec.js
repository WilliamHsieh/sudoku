import { test } from "@playwright/test";
import { registerHintCaptures } from "./hint-recording-helpers.js";
test.use({ video: { mode: "on", size: { width: 402, height: 874 } } });
registerHintCaptures([
  { name: "tidy-visible-naked-pair-mobile-emulation", width: 402, height: 874 },
  { name: "manual-hidden-to-tidy-single-mobile-emulation", width: 402, height: 874 },
]);
