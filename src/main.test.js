import { afterEach, expect, it, vi } from "vitest";

const { mount, pending, strip } = vi.hoisted(() => ({
  mount: vi.fn(() => ({ mounted: true })),
  pending: vi.fn(() => new Promise(() => {})),
  strip: vi.fn(),
}));
vi.mock("svelte", () => ({ mount }));
vi.mock("./App.svelte", () => ({ default: () => {} }));
vi.mock("./favicon.js", () => ({ watchWeekdayFavicon: vi.fn() }));
vi.mock("./auto-update-browser.js", () => ({
  applyPendingUpdate: pending,
  stripUpdateParam: strip,
}));

afterEach(() => vi.unstubAllGlobals());

it("mounts before scheduling update work, even when that work never completes", async () => {
  const target = {};
  /** @type {FrameRequestCallback[]} */
  const frames = [];
  vi.stubGlobal("__SUDOKU_BUILD__", { version: "old", builtAt: 1 });
  vi.stubGlobal("document", { getElementById: () => target });
  vi.stubGlobal("requestAnimationFrame", (callback) => {
    frames.push(callback);
    return 1;
  });
  const { default: app } = await import("./main.js");
  expect(app).toEqual({ mounted: true });
  expect(mount).toHaveBeenCalledWith(expect.any(Function), { target });
  expect(strip).toHaveBeenCalledOnce();
  expect(pending).not.toHaveBeenCalled();
  expect(frames).toHaveLength(1);
  frames[0](0);
  expect(pending).toHaveBeenCalledExactlyOnceWith({ version: "old", builtAt: 1 });
  expect(app).toEqual({ mounted: true });
});
