import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

export const APPLE_TOUCH_ICON = "apple-touch-icon.png";
export const APPLE_TOUCH_SIZE = 180;

const appleSvgUrl = new URL("./I7-apple.svg", import.meta.url);

/**
 * Rasterize an outline SVG to a square PNG.
 * System fonts stay unloaded: the digit is paths, so the picture does not
 * depend on Atkinson Hyperlegible being installed.
 * @param {string | Buffer} svg
 * @param {number} size
 */
export function rasterizeSvg(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
    shapeRendering: 2,
  });
  const rendered = resvg.render();
  return {
    png: rendered.asPng(),
    width: rendered.width,
    height: rendered.height,
    pixels: rendered.pixels,
  };
}

/** 180×180 apple-touch PNG for the static home-screen icon (digit 7). */
export function appleTouchPng() {
  const rendered = rasterizeSvg(readFileSync(appleSvgUrl), APPLE_TOUCH_SIZE);
  if (rendered.width !== APPLE_TOUCH_SIZE || rendered.height !== APPLE_TOUCH_SIZE) {
    throw new Error(
      `apple-touch icon rendered at ${rendered.width}x${rendered.height}, expected ${APPLE_TOUCH_SIZE}`
    );
  }
  return rendered;
}

/**
 * Emit the apple-touch PNG into the build, and serve the same bytes in dev.
 * Preview serves the file written to dist.
 * @returns {import('vite').Plugin}
 */
export function appleTouchIconPlugin() {
  return {
    name: "apple-touch-icon",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: APPLE_TOUCH_ICON,
        source: appleTouchPng().png,
      });
    },
    configureServer(server) {
      const prefix = server.config.base.replace(/\/$/, "");
      const expected = `${prefix}/${APPLE_TOUCH_ICON}`;
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0];
        if (pathname !== expected) {
          next();
          return;
        }
        const { png } = appleTouchPng();
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", String(png.length));
        res.end(png);
      });
    },
  };
}
