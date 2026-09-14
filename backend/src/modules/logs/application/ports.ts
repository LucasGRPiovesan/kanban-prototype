import { type FieldChange } from '../../../shared/application/activity-log.port';
import {
  type LogCategory,
  type LogLevel,
  type LogSubjectType,
} from '../../../shared/domain/activity-catalog';
import { type LogVisibility } from '../domain/log-visibility';

export interface LogEntryView {
  uuid: string;
  occurredAt: Date;
  category: LogCategory;
  level: LogLevel;
  action: string;
  summary: string;
  actor: { uuid: string; name: string } | null;
  subject: { type: LogSubjectType; uuid: string; label: string | null } | null;
  project: { uuid: string; name: string } | null;
  changes: FieldChange[];
  metadata: Record<string, unknown> | null;
  requestId: string | null;
}

export interface LogSearchFilter {
  category?: LogCategory;
  level?: LogLevel;
  action?: string;
  actorUuid?: string;
  projectUuid?: string;
  subjectType?: LogSubjectType;
  subjectUuid?: string;
  from?: Date;
  to?: Date;
  search?: string;
  requestId?: string;
}

export interface LogPage {
  items: LogEntryView[];
  /** Total rows matching the filter, across every page — not just this one. */
  total: number;
}

export interface LogQueries {
  /**
   * Newest first. Visibility is applied by the store, never left to the caller's filter.
   * Offset pagination, not keyset: this is a modest, internally-used log, not a firehose,
   * and the one thing keyset cannot do cheaply is answer "how many pages are there" —
   * exactly what letting someone jump straight to a page number requires.
   */
  search(
    visibility: LogVisibility,
    filter: LogSearchFilter,
    page: { page: number; limit: number },
  ): Promise<LogPage>;
  /** Distinct actors among the entries the visibility allows, for the filter dropdown. */
  actorsSeen(visibility: LogVisibility): Promise<{ uuid: string; name: string }[]>;
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export function clampPageSize(limit: number | undefined): number {
  if (!limit || limit < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(limit, MAX_PAGE_SIZE);
}

export function clampPageNumber(page: number | undefined): number {
  if (!page || page < 1) {
    return 1;
  }
  return Math.floor(page);
}

export interface LogEntryDTO {
  uuid: string;
  occurredAt: string;
  category: LogCategory;
  level: LogLevel;
  action: string;
  summary: string;
  actor: { uuid: string; name: string } | null;
  subject: { type: LogSubjectType; uuid: string; label: string | null } | null;
  project: { uuid: string; name: string } | null;
  changes: FieldChange[];
  metadata: Record<string, unknown> | null;
  requestId: string | null;
}

export interface LogPageDTO {
  items: LogEntryDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toLogPageDTO(page: LogPage, pageNumber: number, pageSize: number): LogPageDTO {
  return {
    items: page.items.map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() })),
    page: pageNumber,
    pageSize,
    total: page.total,
    totalPages: Math.max(1, Math.ceil(page.total / pageSize)),
  };
}
