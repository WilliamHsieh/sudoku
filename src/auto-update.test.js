import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdater } from "./auto-update.js";
import { installAutoUpdate, updateBeforeMount } from "./auto-update-browser.js";

const { deploymentProbe } = vi.hoisted(() => ({ deploymentProbe: vi.fn() }));
vi.mock("./auto-update.js", async (original) => ({
  ...(await original()),
  probeDeployment: deploymentProbe,
}));
const current = { version: "old", builtAt: 1 };
const next = { version: "new", builtAt: 2 };
function setup(overrides = {}) {
  let visible = true;
  const probe = vi.fn(async () => next);
  const notify = vi.fn();
  const updater = createUpdater({ current, probe, notify, visible: () => visible, ...overrides });
  return { updater, probe, notify, setVisible: (value) => (visible = value) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("foreground notices", () => {
  it("notifies once per version per document", async () => {
    vi.useFakeTimers();
    const x = setup();
    await x.updater.check();
    vi.advanceTimersByTime(30_000);
    await x.updater.check();
    expect(x.probe).toHaveBeenCalledTimes(2);
    expect(x.notify).toHaveBeenCalledExactlyOnceWith("new");
    x.probe.mockResolvedValue({ version: "newer", builtAt: 3 });
    vi.advanceTimersByTime(30_000);
    await x.updater.check();
    expect(x.notify).toHaveBeenLastCalledWith("newer");
  });
  it.each([null, current, { version: "older", builtAt: 0 }])("ignores %j", async (candidate) => {
    const x = setup({ probe: async () => candidate });
    await x.updater.check();
    expect(x.notify).not.toHaveBeenCalled();
  });
  it("deduplicates in-flight checks and throttles failures", async () => {
    vi.useFakeTimers();
    /** @type {(value: null) => void} */
    let finish = () => {};
    const probe = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const x = setup({ probe });
    const pending = x.updater.check();
    vi.advanceTimersByTime(30_000);
    await x.updater.check();
    expect(probe).toHaveBeenCalledOnce();
    finish(null);
    await pending;
    probe.mockRejectedValueOnce(Error("offline"));
    await x.updater.check();
    await x.updater.check();
    expect(probe).toHaveBeenCalledTimes(2);
    expect(x.notify).not.toHaveBeenCalled();
  });
  it("ignores hidden pages and late results after hide or teardown", async () => {
    const x = setup();
    x.setVisible(false);
    await x.updater.check();
    expect(x.probe).not.toHaveBeenCalled();
    x.setVisible(true);
    x.probe.mockImplementation(async () => {
      x.setVisible(false);
      return next;
    });
    await x.updater.check();
    expect(x.notify).not.toHaveBeenCalled();
    const y = setup();
    y.probe.mockImplementation(async () => {
      y.updater.stop();
      return next;
    });
    await y.updater.check();
    expect(y.notify).not.toHaveBeenCalled();
  });
  it("checks only visible returns and persisted pageshow, and removes listeners", async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: "hidden" });
    const win = new EventTarget();
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);
    deploymentProbe.mockResolvedValue(next);
    const notify = vi.fn();
    const stop = installAutoUpdate({ current, base: "/sudoku/", notify });
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("pageshow"));
    expect(deploymentProbe).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await Promise.resolve();
    expect(notify).toHaveBeenCalledExactlyOnceWith("new");
    stop();
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(deploymentProbe).toHaveBeenCalledOnce();
  });
});

function browser() {
  let href = "https://example.test/sudoku/?q=123&other=ok&_sudoku_update=prior#board";
  const replace = vi.fn();
  const values = new Map();
  vi.stubGlobal("location", {
    get href() {
      return href;
    },
    replace,
  });
  vi.stubGlobal("history", {
    state: null,
    replaceState: (_state, _title, url) => (href = url.href),
  });
  vi.stubGlobal("sessionStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  deploymentProbe.mockResolvedValue(next);
  return { replace, values, href: () => href };
}
describe("before mount", () => {
  it("strips the marker and attempts a version only once, preserving query and hash", async () => {
    const x = browser();
    expect(await updateBeforeMount({ current, base: "/sudoku/" })).toBe(true);
    expect(x.href()).toBe("https://example.test/sudoku/?q=123&other=ok#board");
    expect(x.replace).toHaveBeenCalledExactlyOnceWith(
      "https://example.test/sudoku/?q=123&other=ok&_sudoku_update=new#board"
    );
    expect(await updateBeforeMount({ current, base: "/sudoku/" })).toBe(false);
    expect(x.replace).toHaveBeenCalledOnce();
  });
  it("mounts normally on a failed check or blocked attempt storage", async () => {
    const x = browser();
    deploymentProbe.mockResolvedValueOnce(null);
    expect(await updateBeforeMount({ current, base: "/sudoku/" })).toBe(false);
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw Error("blocked");
      },
    });
    expect(await updateBeforeMount({ current, base: "/sudoku/" })).toBe(false);
    expect(x.replace).not.toHaveBeenCalled();
    expect(x.href()).not.toContain("_sudoku_update");
  });
});
