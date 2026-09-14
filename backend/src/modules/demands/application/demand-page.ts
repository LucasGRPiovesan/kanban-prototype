import { type DemandCardView } from './ports/repositories';

export interface DemandPage {
  items: DemandCardView[];
  /** Total rows matching the filter, across every page — not just this one. */
  total: number;
}

export const DEFAULT_DEMAND_PAGE_SIZE = 10;
export const MAX_DEMAND_PAGE_SIZE = 100;

/**
 * Offset pagination, not keyset: this screen is a modest, internally-used history, not a
 * firehose, and the one thing keyset cannot do cheaply is answer "how many pages are
 * there" — which is exactly what letting someone jump straight to a page number requires.
 * `skip`/`take` plus a `count()` trades away keyset's stability under concurrent inserts
 * for a total the UI can show before the person has paged through anything.
 */
export function clampDemandPageSize(limit: number | undefined): number {
  if (!limit || limit < 1) {
    return DEFAULT_DEMAND_PAGE_SIZE;
  }
  return Math.min(limit, MAX_DEMAND_PAGE_SIZE);
}

export function clampDemandPageNumber(page: number | undefined): number {
  if (!page || page < 1) {
    return 1;
  }
  return Math.floor(page);
}
