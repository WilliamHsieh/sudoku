import { afterEach, expect, it, vi } from "vitest";

const { mount, strip } = vi.hoisted(() => ({
  mount: vi.fn(() => ({ mounted: true })),
  strip: vi.fn(),
}));
vi.mock("svelte", () => ({ mount }));
vi.mock("./App.svelte", () => ({ default: () => {} }));
vi.mock("./favicon.js", () => ({ watchWeekdayFavicon: vi.fn() }));
vi.mock("./auto-update-browser.js", () => ({
  stripUpdateParam: strip,
}));

afterEach(() => vi.unstubAllGlobals());

it("mounts immediately without scheduling startup navigation", async () => {
  const target = {};
  const requestFrame = vi.fn();
  vi.stubGlobal("document", { getElementById: () => target });
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  const { default: app } = await import("./main.js");
  expect(app).toEqual({ mounted: true });
  expect(mount).toHaveBeenCalledWith(expect.any(Function), { target });
  expect(strip).toHaveBeenCalledOnce();
  expect(requestFrame).not.toHaveBeenCalled();
});
