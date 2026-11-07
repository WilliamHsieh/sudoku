export const MIGRATION_VERSION = 1;
export const LEGACY_KEYS = Object.freeze([
  "sudoku-progress",
  "sudoku-solved",
  "sudoku-replay-progress",
  "sudoku-custom-progress",
]);
/** Version 1 is deliberately non-destructive: retain legacy namespaces and start
 * the new event namespace independently. No guessed ratings or migrated evidence.
 * A later UI can list these summaries and keep the existing resume path.
 * @param {Pick<import('./types.js').Storage, 'getItem'>} storage */
export function inspectLegacySaves(storage) {
  const saves = LEGACY_KEYS.map((key) => {
    try {
      const raw = storage.getItem(key);
      if (raw === null) return { key, status: "missing", entries: 0 };
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid legacy root");
      return { key, status: "present", entries: Object.keys(value).length };
    } catch {
      return { key, status: "unreadable", entries: null };
    }
  });
  return {
    migrationVersion: MIGRATION_VERSION,
    targetRecordsSchema: 1,
    strategy: "retain_legacy_keys",
    saves,
    comparableEvidence: [],
    reason: {
      codes: ["legacy_unrated", "no_nyt_level_mapping"],
      detail:
        "Legacy and custom saves remain in their original keys. They have no comparable bank rating.",
    },
  };
}
