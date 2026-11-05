import { test } from "@playwright/test";
import { recordPlacementComparison } from "./green-placement-recording.js";

test.use({ video: { mode: "on", size: { width: 390, height: 844 } } });
test("record published red then green placement preview and red deletion on phone touch emulation", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await recordPlacementComparison(page, testInfo, true);
});
