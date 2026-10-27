import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdater } from "./auto-update.js";
import { installAutoUpdate, createUpdateAction } from "./auto-update-browser.js";

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
