import { test } from "@playwright/test";
import { recordPlacementComparison } from "./green-placement-recording.js";

test.use({
  viewport: { width: 1280, height: 844 },
  video: { mode: "on", size: { width: 1280, height: 844 } },
});
test("record published red then green placement preview and red deletion on desktop", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await recordPlacementComparison(page, testInfo, false);
});
