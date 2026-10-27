import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdater } from "./auto-update.js";
import {
  installAutoUpdate,
  applyPendingUpdate,
  createUpdateAction,
} from "./auto-update-browser.js";

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
  it("only re-shows for a newer build after dismissal, never an unseen intermediate build", async () => {
    vi.useFakeTimers();
    const x = setup();
    await x.updater.check();
    // Dismissal clears the UI, not the updater's version history.
    x.notify.mockClear();
    x.probe.mockResolvedValue({ version: "latest", builtAt: 4 });
    vi.advanceTimersByTime(30_000);
    await x.updater.check();
    x.probe.mockResolvedValue({ version: "intermediate", builtAt: 3 });
    vi.advanceTimersByTime(30_000);
    await x.updater.check();
    expect(x.notify).toHaveBeenCalledExactlyOnceWith("latest");
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
    await vi.waitFor(() => expect(notify).toHaveBeenCalled());
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
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  vi.stubGlobal("sessionStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  deploymentProbe.mockResolvedValue(next);
  return { replace, values, href: () => href };
}
describe("next launch", () => {
  it("applies a verified pending build synchronously without a network request", () => {
    const x = browser();
    x.values.set("sudoku-pending-update", JSON.stringify(next));
    deploymentProbe.mockImplementation(() => new Promise(() => {}));
    expect(applyPendingUpdate(current)).toBe(true);
    expect(deploymentProbe).not.toHaveBeenCalled();
    expect(x.href()).toBe("https://example.test/sudoku/?q=123&other=ok#board");
    expect(x.replace).toHaveBeenCalledExactlyOnceWith(
      "https://example.test/sudoku/?q=123&other=ok&_sudoku_update=new#board"
    );
    expect(applyPendingUpdate(current)).toBe(false);
  });
  it("allows immediate mount without a pending build even when version.json never resolves", () => {
    const x = browser();
    deploymentProbe.mockImplementation(() => new Promise(() => {}));
    expect(applyPendingUpdate(current)).toBe(false);
    expect(deploymentProbe).not.toHaveBeenCalled();
    expect(x.replace).not.toHaveBeenCalled();
  });
  it("keeps the current shell when storage is blocked", () => {
    const x = browser();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("blocked");
      },
    });
    expect(applyPendingUpdate(current)).toBe(false);
    expect(x.replace).not.toHaveBeenCalled();
    expect(x.href()).not.toContain("_sudoku_update");
  });
});

describe("explicit Update", () => {
  it("flushes progress before reload and reverts after three seconds without navigation", () => {
    vi.useFakeTimers();
    const calls = [];
    const setUpdating = vi.fn();
    const action = createUpdateAction({
      flush: () => {
        calls.push("flush");
      },
      reload: () => {
        calls.push("reload");
      },
      setUpdating,
    });
    action.run();
    action.run();
    expect(calls).toEqual(["flush", "reload"]);
    expect(setUpdating).toHaveBeenCalledExactlyOnceWith(true);
    vi.advanceTimersByTime(2999);
    expect(setUpdating).not.toHaveBeenCalledWith(false);
    vi.advanceTimersByTime(1);
    expect(setUpdating).toHaveBeenLastCalledWith(false);
    action.run();
    expect(calls).toEqual(["flush", "reload", "flush", "reload"]);
    action.stop();
  });
  it("recovers from a throwing flush without reloading", () => {
    vi.useFakeTimers();
    const reload = vi.fn(),
      setUpdating = vi.fn();
    createUpdateAction({
      flush: () => {
        throw Error("storage");
      },
      reload,
      setUpdating,
    }).run();
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(setUpdating).toHaveBeenLastCalledWith(false);
  });
});
