import { describe, expect, it } from "vitest";
import { tokenizeCoordinates } from "./coordinate-text.js";

describe("hint coordinate text", () => {
  it("maps all 81 board references to zero-based cells", () => {
    for (let cell = 0; cell < 81; cell++) {
      const text = `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;
      expect(tokenizeCoordinates(text)).toEqual([{ type: "coordinate", text, cell }]);
    }
  });

  it("keeps punctuation and adjacent Chinese prose intact", () => {
    expect(tokenizeCoordinates("觀察r1c1、r5c8；（r9c9）不能填入。")).toEqual([
      { type: "text", text: "觀察" },
      { type: "coordinate", text: "r1c1", cell: 0 },
      { type: "text", text: "、" },
      { type: "coordinate", text: "r5c8", cell: 43 },
      { type: "text", text: "；（" },
      { type: "coordinate", text: "r9c9", cell: 80 },
      { type: "text", text: "）不能填入。" },
    ]);
  });

  it("keeps every repeated reference independently actionable", () => {
    expect(tokenizeCoordinates("r5c8/r5c8 → r5c8")).toEqual([
      { type: "coordinate", text: "r5c8", cell: 43 },
      { type: "text", text: "/" },
      { type: "coordinate", text: "r5c8", cell: 43 },
      { type: "text", text: " → " },
      { type: "coordinate", text: "r5c8", cell: 43 },
    ]);
  });

  it.each([
    "r0c1",
    "r1c0",
    "r10c1",
    "r1c10",
    "r99c99",
    "r01c1",
    "r1c01",
    "r-1c1",
    "r1c-1",
    "r1 c1",
    "R1C1",
    "xr1c1",
    "r1c1x",
    "_r1c1",
    "r1c1_",
    "2r1c1",
    "r1c1r2c2",
  ])("does not link invalid or embedded reference %s", (text) => {
    expect(tokenizeCoordinates(text)).toEqual([{ type: "text", text }]);
  });

  it("still finds valid references next to invalid ones", () => {
    const text = "r1c10、r1c1、xr2c2；r9c9";
    expect(tokenizeCoordinates(text)).toEqual([
      { type: "text", text: "r1c10、" },
      { type: "coordinate", text: "r1c1", cell: 0 },
      { type: "text", text: "、xr2c2；" },
      { type: "coordinate", text: "r9c9", cell: 80 },
    ]);
  });

  it.each([
    "",
    "沒有座標。",
    "  r1c1\t、\nr5c8  r9c9\r\n",
    "🙂r1c1 的候選數 & r9c9 < 9。",
    '<img src=x onerror="alert(1)">r5c8</img> & <script>r1c1</script>',
  ])("preserves the exact original text, including markup: %j", (text) => {
    expect(
      tokenizeCoordinates(text)
        .map((token) => token.text)
        .join("")
    ).toBe(text);
  });

  it("does not carry matching state between calls", () => {
    const text = "r1c1、r9c9";
    expect(tokenizeCoordinates(text)).toEqual(tokenizeCoordinates(text));
  });
});
