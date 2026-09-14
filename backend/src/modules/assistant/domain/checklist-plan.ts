import { clip, comparableKey, oneLine } from './text';

const ITEMS_MAX = 8;
const ITEM_MAX = 240;
const RATIONALE_MAX = 400;

export interface ChecklistPlan {
  items: string[];
  rationale: string;
}

/**
 * Suggested steps, minus anything the demand already has.
 *
 * A model asked not to repeat existing items still rephrases them ("Validar e-mail" beside
 * "validar email"), so duplicates are removed by comparable key, not by exact text. The cap
 * matches what a person reviews in one glance; the aggregate's own limit still applies when
 * the items are saved.
 */
export function resolveChecklistPlan(
  raw: { items: readonly string[]; rationale: string },
  existing: readonly string[],
): ChecklistPlan {
  const seen = new Set(existing.map(comparableKey));
  const items: string[] = [];
  for (const candidate of raw.items) {
    const title = clip(oneLine(candidate).replace(/^(?:[-*•]|\d+[.)]|\[[ x]\])\s*/i, ''), ITEM_MAX);
    const key = comparableKey(title);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(title);
    if (items.length === ITEMS_MAX) {
      break;
    }
  }
  return { items, rationale: clip(oneLine(raw.rationale), RATIONALE_MAX) };
}
