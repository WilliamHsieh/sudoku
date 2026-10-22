import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appleTouchPng, rasterizeSvg } from "./apple-touch-plugin.js";

/**
 * Mean x of the topmost and bottommost rows of matching pixels.
 * A -8° rotation puts the top of the note left of its bottom.
 * @param {Buffer} pixels
 * @param {number} width
 * @param {(r: number, g: number, b: number, a: number) => boolean} match
 */
function colorStats(pixels, width, match) {
  let count = 0;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = -1;
  /** @type {Map<number, number[]>} */
  const rows = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (!match(r, g, b, a)) continue;
    count += 1;
    const p = i / 4;
    const x = p % width;
    const y = Math.floor(p / width);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const row = rows.get(y);
    if (row) row.push(x);
    else rows.set(y, [x]);
  }
  const meanRows = (/** @type {number[]} */ ys) => {
    const xs = ys.flatMap((y) => rows.get(y) ?? []);
    return xs.reduce((sum, x) => sum + x, 0) / xs.length;
  };
  return {
    count,
    topMeanX: meanRows([minY]),
    bottomMeanX: meanRows([maxY]),
  };
}

/** Yellow note fill #fbe08a, allowing the antialiased edge. */
function isNote(r, g, b) {
  return r > 220 && g > 170 && g < 245 && b > 80 && b < 190 && r > g && g > b;
}

/** Digit ink #7a4b08. */
function isInk(r, g, b) {
  return r > 70 && r < 170 && g > 30 && g < 120 && b < 50 && r > g && g > b;
}

describe("apple-touch raster", () => {
  it("renders the 7 outlines to a 180 PNG with no font", () => {
    const svg = readFileSync(new URL("./I7-apple.svg", import.meta.url), "utf8");
    expect(svg).not.toMatch(/<text|font-family|@font-face/i);
    expect(svg).toContain("<path");
    expect(svg).toContain('transform="rotate(-8 90 90)"');

    const rendered = appleTouchPng();
    expect(rendered.width).toBe(180);
    expect(rendered.height).toBe(180);
    expect(rendered.png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(rendered.png.readUInt32BE(16)).toBe(180);
    expect(rendered.png.readUInt32BE(20)).toBe(180);

    const paper = rendered.pixels.subarray(0, 4);
    expect([...paper]).toEqual([245, 244, 240, 255]);

    const note = colorStats(rendered.pixels, 180, (r, g, b) => isNote(r, g, b));
    const ink = colorStats(rendered.pixels, 180, (r, g, b) => isInk(r, g, b));
    expect(note.count).toBeGreaterThan(5000);
    expect(ink.count).toBeGreaterThan(400);
    // rotate(-8) leans the top of the note to the right of its bottom.
    expect(note.topMeanX - note.bottomMeanX).toBeGreaterThan(20);
  });
});

describe("tab icon raster", () => {
  it("keeps the -8 degree tilt at 16px for Monday and Thursday", () => {
    for (const digit of [1, 4, 7]) {
      const svg = readFileSync(
        new URL(`../public/favicon/I${digit}-16.svg`, import.meta.url),
        "utf8"
      );
      expect(svg).not.toMatch(/<text|font-family/i);
      expect(svg).toContain('transform="rotate(-8 8 8)"');
      const rendered = rasterizeSvg(svg, 16);
      expect(rendered.width).toBe(16);
      expect(rendered.height).toBe(16);
      const note = colorStats(rendered.pixels, 16, (r, g, b) => isNote(r, g, b));
      const ink = colorStats(rendered.pixels, 16, (r, g, b) => isInk(r, g, b));
      expect(ink.count, `digit ${digit} ink`).toBeGreaterThan(8);
      expect(note.count, `digit ${digit} note`).toBeGreaterThan(40);
      expect(note.topMeanX - note.bottomMeanX, `digit ${digit} tilt`).toBeGreaterThan(1.5);
    }
  });
});
