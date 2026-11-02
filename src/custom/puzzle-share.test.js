import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePuzzleInput } from "./puzzle-input.js";
import { copyPuzzleString, copyPuzzleLink, createPuzzleLink, sharePuzzle } from "./puzzle-share.js";

const PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const BASE = "https://example.com/sudoku/?prototype=custom&variant=A&q=old#review";
const LINK = `https://example.com/sudoku/?q=${PUZZLE}`;

afterEach(() => vi.unstubAllGlobals());

describe("copyPuzzleString", () => {
  it("copies exactly the canonical 81 digits before yielding", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const pending = copyPuzzleString(PUZZLE);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(PUZZLE);
    expect(await pending).toEqual({ status: "copied" });
  });

  it.each(["", PUZZLE.slice(1), PUZZLE + "0", PUZZLE.replace("0", "."), ` ${PUZZLE}`, LINK])(
    "does not copy noncanonical input: %j",
    async (input) => {
      const writeText = vi.fn();
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      expect(await copyPuzzleString(input)).toMatchObject({ status: "failed" });
      expect(writeText).not.toHaveBeenCalled();
    }
  );

  it("offers manual copying when clipboard access is unavailable or denied", async () => {
    for (const navigator of [
      undefined,
      {},
      { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } },
    ]) {
      vi.stubGlobal("navigator", navigator);
      expect(await copyPuzzleString(PUZZLE)).toEqual({
        status: "failed",
        error: "Select the numbers and copy them manually.",
      });
    }
  });
});

describe("createPuzzleLink", () => {
  it("preserves the base pathname and removes all previous query and hash state", () => {
    expect(createPuzzleLink(PUZZLE, BASE)).toBe(LINK);
    expect(createPuzzleLink(PUZZLE, "http://localhost:8000/sudoku/")).toBe(
      `http://localhost:8000/sudoku/?q=${PUZZLE}`
    );
  });

  it("round-trips through the shared import format", () => {
    expect(parsePuzzleInput(createPuzzleLink(PUZZLE, BASE))).toEqual({
      ok: true,
      puzzle: PUZZLE,
      source: "url",
    });
  });

  it("does not modify a supplied URL object or include its credentials", () => {
    const base = new URL("https://user:password@example.com/sudoku/?prototype=custom#editor");
    const original = base.href;
    expect(createPuzzleLink(PUZZLE, base)).toBe(LINK);
    expect(base.href).toBe(original);
  });

  it("preserves a pathname starting with two slashes without changing the origin", () => {
    expect(createPuzzleLink(PUZZLE, "https://example.com//sudoku/")).toBe(
      `https://example.com//sudoku/?q=${PUZZLE}`
    );
  });

  it.each(["", PUZZLE.slice(1), PUZZLE + "0", PUZZLE.replace("0", "."), ` ${PUZZLE}`])(
    "rejects noncanonical givens: %j",
    (puzzle) => expect(() => createPuzzleLink(puzzle, BASE)).toThrow(/81 digits/)
  );

  it.each(["/sudoku/", "not a URL", "ftp://example.com/sudoku/", "javascript:alert(1)"])(
    "rejects an invalid or unsupported base: %s",
    (base) => expect(() => createPuzzleLink(PUZZLE, base)).toThrow(/HTTP\(S\)/)
  );
});

describe("browser sharing", () => {
  it("invokes native sharing synchronously before yielding and shares only the clean link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    const pending = sharePuzzle(PUZZLE, BASE);
    expect(share).toHaveBeenCalledExactlyOnceWith({ title: "Sudoku puzzle", url: LINK });
    expect(await pending).toEqual({ status: "shared" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("uses canShare when available", async () => {
    const canShare = vi.fn().mockReturnValue(true);
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { canShare, share });
    expect(await sharePuzzle(PUZZLE, BASE)).toEqual({ status: "shared" });
    expect(canShare).toHaveBeenCalledExactlyOnceWith({ title: "Sudoku puzzle", url: LINK });
  });

  it.each(["absent", "unsupported", "rejected", "throws", "capability throws"])(
    "copies when native sharing is %s",
    async (mode) => {
      const share = vi.fn().mockResolvedValue(undefined);
      const canShare = vi.fn().mockReturnValue(true);
      const writeText = vi.fn().mockResolvedValue(undefined);
      if (mode === "unsupported") canShare.mockReturnValue(false);
      if (mode === "rejected")
        share.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
      if (mode === "throws")
        share.mockImplementation(() => {
          throw new Error("Unavailable");
        });
      if (mode === "capability throws")
        canShare.mockImplementation(() => {
          throw new Error("Unavailable");
        });
      vi.stubGlobal("navigator", {
        ...(mode === "absent" ? {} : { share, canShare }),
        clipboard: { writeText },
      });
      expect(await sharePuzzle(PUZZLE, BASE)).toEqual({ status: "copied" });
      expect(writeText).toHaveBeenCalledExactlyOnceWith(LINK);
      if (mode === "absent" || mode === "unsupported" || mode === "capability throws") {
        expect(share).not.toHaveBeenCalled();
      }
    }
  );

  it("treats native cancellation as cancellation without copying", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Dismissed", "AbortError"));
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    expect(await sharePuzzle(PUZZLE, BASE)).toEqual({ status: "cancelled" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("reports failure if both sharing and clipboard access fail", async () => {
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new Error("Share unavailable")),
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied")) },
    });
    expect(await sharePuzzle(PUZZLE, BASE)).toEqual({
      status: "failed",
      error: expect.any(String),
    });
  });

  it("copies directly without invoking native sharing", async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    const pending = copyPuzzleLink(PUZZLE, BASE);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(LINK);
    expect(await pending).toEqual({ status: "copied" });
    expect(share).not.toHaveBeenCalled();
  });

  it.each([sharePuzzle, copyPuzzleLink])("handles unavailable browser APIs: %s", async (action) => {
    vi.stubGlobal("navigator", undefined);
    expect(await action(PUZZLE, BASE)).toEqual({ status: "failed", error: expect.any(String) });
    vi.stubGlobal("navigator", {});
    expect(await action(PUZZLE, BASE)).toEqual({ status: "failed", error: expect.any(String) });
  });

  it.each([sharePuzzle, copyPuzzleLink])(
    "returns invalid-input failures without browser access: %s",
    async (action) => {
      const share = vi.fn();
      const writeText = vi.fn();
      vi.stubGlobal("navigator", { share, clipboard: { writeText } });
      expect(await action("invalid", BASE)).toEqual({
        status: "failed",
        error: expect.any(String),
      });
      expect(await action(PUZZLE, "/relative")).toEqual({
        status: "failed",
        error: expect.any(String),
      });
      expect(share).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    }
  );

  it("does not access browser APIs on import or when constructing links", async () => {
    const access = vi.fn(() => {
      throw new Error("No browser APIs before a user action");
    });
    vi.stubGlobal(
      "navigator",
      Object.defineProperties(
        {},
        {
          share: { get: access },
          clipboard: { get: access },
        }
      )
    );
    vi.resetModules();
    const helpers = await import("./puzzle-share.js");
    expect(helpers.createPuzzleLink(PUZZLE, BASE)).toBe(LINK);
    expect(access).not.toHaveBeenCalled();
  });
});
