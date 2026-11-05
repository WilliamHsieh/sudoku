import { test } from "@playwright/test";
import { recordCandidateElimination } from "./candidate-elimination-recording.js";

test.use({ video: { mode: "on", size: { width: 390, height: 844 } } });
test("record real candidate elimination stages, edge navigation, Apply and Undo on phone touch emulation", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await recordCandidateElimination(page, testInfo, true);
});
