/** Signed list rules (E): a replay in progress is In progress, never Solved. */
const IN = {
  All: () => true,
  Unsolved: (item) => item.state === "unsolved",
  Solved: (item) => item.state === "solved",
  "In progress": (item) => item.state === "in_progress" || item.state === "replaying",
};
/** @param {boolean} custom */
export const listTabs = (custom) =>
  custom ? ["All", "Solved", "In progress"] : ["All", "Unsolved", "Solved", "In progress"];
/** Level walls keep puzzle order; Solved is newest solve first; Custom is most recently played first.
 * @template {{state: string, index: number, solvedAt: number | null, playedAt?: number}} T
 * @param {T[]} items @param {string} tab @param {boolean} custom @returns {T[]} */
export function tabItems(items, tab, custom) {
  const picked = items.filter(IN[tab]);
  if (tab === "Solved") return picked.sort((a, b) => b.solvedAt - a.solvedAt || a.index - b.index);
  return custom ? picked.sort((a, b) => b.playedAt - a.playedAt) : picked;
}
