import { afterEach, expect, it, vi } from "vitest";

const keys = ["sudoku-progress", "sudoku-solved", "sudoku-cue", "sudoku-tap-fill"];
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  vi.resetModules();
  const values = new Map(keys.map((key) => [key, "initial"]));
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: vi.fn((key, value) => values.set(key, value)),
  };
  vi.stubGlobal("localStorage", storage);
  const persistence = await import("./persistence.js");
  for (const key of keys) persistence.readLocal(key);
  return { ...persistence, values, storage };
}

for (const key of keys) {
  it(`blocks all writes when another writer changes ${key}`, async () => {
    const p = await setup();
    p.values.set(key, "other tab");
    expect(p.localUnchanged()).toBe(false);
    expect(p.saveLocal("sudoku-progress", "stale map")).toBe(false);
    expect(p.saveLocal("sudoku-cue", "stale preference")).toBe(false);
    expect(p.flushLocal()).toBe(false);
    expect(p.storage.setItem).not.toHaveBeenCalled();
    expect(p.values.get(key)).toBe("other tab");
  });
}

it("does not retry a failed write over a newer external record", async () => {
  const p = await setup();
  p.storage.setItem.mockImplementationOnce(() => {
    throw Error("quota");
  });
  expect(p.saveLocal("sudoku-progress", "local edit")).toBe(false);
  p.values.set("sudoku-progress", "other tab");
  p.storage.setItem.mockClear();
  expect(p.flushLocal()).toBe(false);
  expect(p.storage.setItem).not.toHaveBeenCalled();
  expect(p.values.get("sudoku-progress")).toBe("other tab");
});

it("checks writer ordering between completion and progress cleanup", async () => {
  const p = await setup();
  expect(p.saveLocal("sudoku-solved", "local completion")).toBe(true);
  // A second writer runs after the completion save, before its progress cleanup.
  p.values.set("sudoku-progress", "other tab progress");
  p.values.set("sudoku-solved", "other tab completion");
  p.storage.setItem.mockClear();
  expect(p.saveLocal("sudoku-progress", "cleared stale map")).toBe(false);
  expect(p.flushLocal()).toBe(false);
  expect(p.storage.setItem).not.toHaveBeenCalled();
  expect(p.values.get("sudoku-solved")).toBe("other tab completion");
});

it("does not adopt a concurrent writer's value after failed readback", async () => {
  const p = await setup();
  p.storage.setItem.mockImplementationOnce((key) => p.values.set(key, "other tab"));
  expect(p.saveLocal("sudoku-progress", "local edit")).toBe(false);
  p.storage.setItem.mockClear();
  expect(p.flushLocal()).toBe(false);
  expect(p.storage.setItem).not.toHaveBeenCalled();
});

it("treats external deletion as a conflict too", async () => {
  const p = await setup();
  p.values.delete("sudoku-solved");
  expect(p.saveLocal("sudoku-solved", "stale completion")).toBe(false);
  expect(p.values.has("sudoku-solved")).toBe(false);
});

it("does not adopt an unreadable initial value as a safe baseline after recovery", async () => {
  vi.resetModules();
  const p = await import("./persistence.js");
  const values = new Map([["sudoku-progress", "other tab"]]);
  const storage = {
    getItem: vi.fn(
      /** @type {(key: string) => string | null} */ (
        () => {
          throw Error("blocked");
        }
      )
    ),
    setItem: vi.fn(),
  };
  vi.stubGlobal("localStorage", storage);
  expect(() => p.readLocal("sudoku-progress")).toThrow();
  storage.getItem.mockImplementation((key) => values.get(key) ?? null);
  expect(p.saveLocal("sudoku-progress", "empty fallback")).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
});
