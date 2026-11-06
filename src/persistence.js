/** Merge one puzzle only if its stored revision still matches this document.
 * Other tabs may change unrelated puzzles without causing a conflict.
 */
export function mergeEntry(current, expected, group, item, value) {
  if (JSON.stringify(current[group]?.[item]) !== JSON.stringify(expected[group]?.[item]))
    return null;
  const day = { ...current[group] };
  if (value === null) delete day[item];
  else day[item] = value;
  const next = { ...current };
  if (Object.keys(day).length) next[group] = day;
  else delete next[group];
  return next;
}
