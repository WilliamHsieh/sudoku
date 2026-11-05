import { test } from "@playwright/test";
import { recordCandidateElimination } from "./candidate-elimination-recording.js";

test.use({
  viewport: { width: 1280, height: 844 },
  video: { mode: "on", size: { width: 1280, height: 844 } },
});
test("record real candidate elimination stages, edge navigation, Apply and Undo on desktop", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await recordCandidateElimination(page, testInfo, false);
});
