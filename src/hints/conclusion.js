/**
 * The effect already supplies the explicit operation summary. Omit exact
 * copies from the final prose, while retaining distinct teaching verbatim.
 * @param {string[]} description
 * @param {string} effect
 */
export function conclusionRationale(description, effect) {
  const summary = effect.trim();
  return summary ? description.filter((text) => text.trim() !== summary) : description;
}
