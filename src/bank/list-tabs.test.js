import { describe, expect, it } from "vitest";
import { listTabs, tabItems } from "./list-tabs.js";

const item = (index, state, solvedAt = null, playedAt = index) => ({
  index,
  state,
  solvedAt,
  playedAt,
});
const items = [
  item(1, "solved", 300, 300),
  item(2, "replaying", 100, 900),
  item(3, "in_progress", null, 500),
  item(4, "unsolved"),
  item(5, "solved", 700, 700),
];
const ids = (list) => list.map((i) => i.index);

describe("list tabs", () => {
  it("Custom has no Unsolved tab", () => {
    expect(listTabs(true)).toEqual(["All", "Solved", "In progress"]);
    expect(listTabs(false)).toEqual(["All", "Unsolved", "Solved", "In progress"]);
  });
  it("a replay in progress counts under In progress, not Solved", () => {
    expect(ids(tabItems(items, "Solved", false))).toEqual([5, 1]);
    expect(ids(tabItems(items, "In progress", false))).toEqual([2, 3]);
    expect(ids(tabItems(items, "Unsolved", false))).toEqual([4]);
  });
  it("level All keeps puzzle order; Solved is newest solve first", () => {
    expect(ids(tabItems(items, "All", false))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(tabItems(items, "Solved", true))).toEqual([5, 1]);
  });
  it("Custom All and In progress are most recently played first", () => {
    const custom = items.filter((i) => i.state !== "unsolved");
    expect(ids(tabItems(custom, "All", true))).toEqual([2, 5, 3, 1]);
    expect(ids(tabItems(custom, "In progress", true))).toEqual([2, 3]);
  });
});
