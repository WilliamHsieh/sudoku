import fixture from "./finned-fish.json" with { type: "json" };
import { bit } from "../../game/board.js";

// All four exercises retain the supplied completion. The two-fin variants
// restore a legal 7 at r1c9; one-target variants already exclude 7 at r3c7.
export const fishCases = [
  { name: "one fin, two targets", finCells: [7], targetCells: [15, 24] },
  { name: "two fins, two targets", finCells: [7, 8], targetCells: [15, 24] },
  { name: "one fin, one target", finCells: [7], targetCells: [15] },
  { name: "two fins, one target", finCells: [7, 8], targetCells: [15] },
].map((variant) => ({
  ...fixture,
  ...variant,
  masks: fixture.masks.map((mask, cell) => {
    if (cell === 8 && variant.finCells.includes(cell)) return mask | bit(7);
    if (cell === 24 && !variant.targetCells.includes(cell)) return mask & ~bit(7);
    return mask;
  }),
}));
