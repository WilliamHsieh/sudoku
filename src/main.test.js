import { afterEach, expect, it, vi } from "vitest";

const { mount, strip } = vi.hoisted(() => ({
  mount: vi.fn(() => ({ mounted: true })),
  strip: vi.fn(),
}));
vi.mock("svelte", () => ({ mount }));
vi.mock("./App.svelte", () => ({ default: () => {} }));
vi.mock("./favicon.js", () => ({ watchWeekdayFavicon: vi.fn() }));
vi.mock("./theme.js", () => ({ installTheme: vi.fn(() => () => {}) }));
vi.mock("./auto-update-browser.js", () => ({
  stripUpdateParam: strip,
}));

afterEach(() => vi.unstubAllGlobals());

it("mounts the development app without scheduling startup navigation", async () => {
  const target = { replaceChildren: vi.fn() };
  const requestFrame = vi.fn();
  vi.stubGlobal("document", { getElementById: () => target });
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  const { default: app } = await import("./main.js");
  expect(app).toEqual({ mounted: true });
  expect(mount).toHaveBeenCalledWith(expect.any(Function), {
    target,
    props: { hintProvider: expect.any(Function) },
  });
  expect(strip).toHaveBeenCalledOnce();
  expect(requestFrame).not.toHaveBeenCalled();
});
