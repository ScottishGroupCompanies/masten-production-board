/** Column David calls "Re-do's". Older boards used "Jersey Re-Do's" or "Jersey Reduce". */
export const REDO_LIST_NAME = "Re-do's";

export const COMPLETED_LIST_NAME = "Completed 🎊";

/**
 * Columns David asked to remove, matched loosely so production names line up
 * with the short names in his notes.
 *
 * Measure Stack        → Measure Stacked Frame
 * Past Due Priority    → Past Due - PRIORITY
 * Reed Projects        → Reed Projects
 * New List             → New List
 * Text Message         → Text Messages
 * Estimate/Quote       → Estimates/Quotes
 */
const REMOVED_LIST_KEYS = new Set([
  "measure stack",
  "measure stacked frame",
  "past due priority",
  "reed projects",
  "new list",
  "text message",
  "text messages",
  "estimate quote",
  "estimates quotes",
]);

export function listKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isRemovedList(name: string): boolean {
  return REMOVED_LIST_KEYS.has(listKey(name));
}

export function isRedoAlias(name: string): boolean {
  const key = listKey(name);
  return key === "jersey reduce" || key === "jersey re dos" || key === "jersey redos" || key === "jersey redo" || key === "jersey re do";
}
