import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdater } from "./auto-update.js";

function setup(overrides = {}) {
  let visible = true;
  let busy = false;
  const candidate = { version: "new", builtAt: 2 };
  const probe = vi.fn(async () => candidate);
  const persist = vi.fn(() => true);
  const navigate = vi.fn();
  const attempted = new Set();
  const updater = createUpdater({
    current: { version: "old", builtAt: 1 },
    probe,
    persist,
    navigate,
    visible: () => visible,
    busy: () => busy,
    wasAttempted: (v) => attempted.has(v),
    markAttempted: (v) => {
      attempted.add(v);
      return true;
    },
    ...overrides,
  });
  return {
    updater,
    probe,
    persist,
    navigate,
    setVisible: (v) => (visible = v),
    setBusy: (v) => (busy = v),
  };
}

afterEach(() => vi.useRealTimers());
describe("safe automatic updates", () => {
  it("persists before navigating, once per target", async () => {
    const x = setup();
    await x.updater.check();
    expect(x.persist).toHaveBeenCalledOnce();
    expect(x.navigate).toHaveBeenCalledWith("new");
    expect(x.persist.mock.invocationCallOrder[0]).toBeLessThan(
      x.navigate.mock.invocationCallOrder[0]
    );
    await x.updater.check();
    expect(x.navigate).toHaveBeenCalledOnce();
  });
  it.each([null, { version: "old", builtAt: 3 }, { version: "older", builtAt: 0 }])(
    "ignores unavailable, same and older builds: %j",
    async (candidate) => {
      const x = setup({ probe: async () => candidate });
      await x.updater.check();
      expect(x.persist).not.toHaveBeenCalled();
      expect(x.navigate).not.toHaveBeenCalled();
    }
  );
  it("deduplicates in-flight lifecycle checks and throttles failures", async () => {
    vi.useFakeTimers();
    /** @type {(value: null) => void} */
    let resolve = () => {};
    const probe = vi.fn(() => new Promise((r) => (resolve = r)));
    const x = setup({ probe });
    const a = x.updater.check();
    await x.updater.check();
    expect(probe).toHaveBeenCalledOnce();
    resolve(null);
    await a;
    await x.updater.check();
    expect(probe).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_001);
    const b = x.updater.check();
    resolve(null);
    await b;
    expect(probe).toHaveBeenCalledTimes(2);
  });
  it("revalidates a deferred deployment after input ends", async () => {
    const x = setup();
    x.setBusy(true);
    await x.updater.check();
    expect(x.navigate).not.toHaveBeenCalled();
    x.setBusy(false);
    x.probe.mockResolvedValueOnce(null);
    await x.updater.settle();
    expect(x.navigate).not.toHaveBeenCalled();
    x.updater.stop();
  });
  it("does not navigate when hidden during a check", async () => {
    const x = setup();
    x.probe.mockImplementation(async () => {
      x.setVisible(false);
      return { version: "new", builtAt: 2 };
    });
    await x.updater.check();
    expect(x.persist).not.toHaveBeenCalled();
    x.updater.stop();
  });
  it.each([
    () => false,
    () => {
      throw Error("quota");
    },
  ])("keeps unsaved state when checkpoint fails", async (persist) => {
    const x = setup({ persist });
    await x.updater.check();
    expect(x.navigate).not.toHaveBeenCalled();
    x.updater.stop();
  });
  it("does not reload on network rejection or a failed loop guard write", async () => {
    const x = setup({
      probe: async () => {
        throw Error("offline");
      },
    });
    await x.updater.check();
    expect(x.navigate).not.toHaveBeenCalled();
    const y = setup({ markAttempted: () => false });
    await y.updater.check();
    expect(y.navigate).not.toHaveBeenCalled();
  });
  it("ignores a late result after teardown", async () => {
    const x = setup();
    x.probe.mockImplementation(async () => {
      x.updater.stop();
      return { version: "new", builtAt: 2 };
    });
    await x.updater.check();
    expect(x.navigate).not.toHaveBeenCalled();
  });
});

it("queues a foreground check that becomes due while a previous request is in flight", async () => {
  vi.useFakeTimers();
  /** @type {(value: null) => void} */
  let finish = () => {};
  const x = setup();
  x.probe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const launch = x.updater.check();
  vi.advanceTimersByTime(30_001);
  await x.updater.check();
  finish(null);
  await launch;
  await Promise.resolve();
  expect(x.probe).toHaveBeenCalledTimes(2);
  expect(x.navigate).toHaveBeenCalledWith("new");
});
