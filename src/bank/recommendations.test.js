import { describe, expect, it, vi } from "vitest";
import { openCatalog } from "./catalog.js";
import { selectPuzzle } from "./select.js";
import {
  readRecommendations,
  saveRecommendation,
  recentPicks,
  RECOMMENDATIONS_KEY,
} from "./recommendations.js";
import { catalogWith, memoryStorage, start } from "./test-fixtures.js";
import { applyEvent, projectRecords } from "./records.js";

const catalog = (await openCatalog(catalogWith([10, 12, 13, 15]))).catalog;
const snapshot = selectPuzzle({ catalog, playerId: "player", mode: "easy", seed: 1 });
const pick = { id: "pick-1", playerId: "player", at: 1, snapshot };
describe("durable recommendation snapshots", () => {
  it("persists immutable snapshots, collapses retries and scopes recent picks to a player", () => {
    const storage = memoryStorage();
    expect(readRecommendations(storage).status).toBe("missing");
    expect(saveRecommendation(storage, pick).ok).toBe(true);
    expect(saveRecommendation(storage, pick).ok).toBe(true);
    const loaded = readRecommendations(storage);
    expect(loaded.status).toBe("ready");
    if (loaded.status !== "unreadable") {
      expect(loaded.log.events).toHaveLength(1);
      expect(recentPicks(loaded.log, "player")).toEqual([snapshot]);
      expect(recentPicks(loaded.log, "other")).toEqual([]);
    }
    expect(saveRecommendation(storage, { ...pick, at: 2 }).ok).toBe(false);
  });
  it("does not overwrite damaged or unreadable storage", () => {
    const storage = memoryStorage();
    for (const raw of ["{", "null", '{"schema":2,"events":[]}', '{"schema":1,"events":[{}]}']) {
      storage.setItem(RECOMMENDATIONS_KEY, raw);
      const write = vi.spyOn(storage, "setItem");
      expect(saveRecommendation(storage, pick)).toEqual({ ok: false, code: "unreadable_storage" });
      expect(write).not.toHaveBeenCalled();
      write.mockRestore();
    }
    expect(
      readRecommendations({
        getItem() {
          throw new Error("denied");
        },
      }).status
    ).toBe("unreadable");
    expect(saveRecommendation({ getItem: () => null, setItem() {} }, pick).ok).toBe(false);
    expect(
      saveRecommendation(
        {
          getItem: () => null,
          setItem() {
            throw new Error("quota");
          },
        },
        pick
      ).ok
    ).toBe(false);
  });
  it("pins the full recommendation in an attempt and rejects mismatched labels", () => {
    if (snapshot.status !== "selected") throw new Error("fixture exhausted");
    const data = start(1, {
      puzzle: snapshot.puzzle,
      mode: snapshot.mode,
      catalogVersion: snapshot.catalogVersion,
      ruleVersion: snapshot.ruleVersion,
      reason: snapshot.reason,
      recommendation: snapshot,
    });
    const event = /** @type {const} */ ({
      id: "start",
      attemptId: data.attemptId,
      at: 1,
      type: "start",
      start: data,
    });
    const log = applyEvent({ schema: 1, events: [] }, event);
    expect(projectRecords(log)[0].recommendation).toEqual(snapshot);
    expect(() =>
      applyEvent({ schema: 1, events: [] }, { ...event, start: { ...data, mode: "hard" } })
    ).toThrow("mismatch");
  });
});
