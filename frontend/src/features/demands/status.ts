import { CircleDot, Eye, PauseCircle, PlayCircle, CheckCircle2 } from 'lucide-react';
import type { DemandStatus } from '@/lib/api/types';

export interface StatusPresentation {
  label: string;
  /** Column background and border, from the visual reference. */
  columnClass: string;
  dotClass: string;
  badgeClass: string;
  accentClass: string;
  /** The status's solid colour as a border utility — the details panel's accent edge. */
  borderClass: string;
  /** Same solid colour, scoped to the top edge — the Kanban column's accent stripe. */
  topBorderClass: string;
  /** Small-scale representation — the "demandas por status" count next to a person's name. */
  icon: typeof CircleDot;
}

/**
 * Single source of truth for how a status looks and reads.
 *
 * The five columns and their labels are fixed by the specification; keeping their
 * presentation here means a column, a card badge and the details panel can never drift
 * apart in colour or wording.
 */
export const STATUS_PRESENTATION: Record<DemandStatus, StatusPresentation> = {
  NOT_STARTED: {
    label: 'Não iniciada',
    columnClass: 'bg-status-not-started-surface border-status-not-started-border',
    dotClass: 'bg-status-not-started',
    badgeClass:
      'bg-status-not-started-surface text-status-not-started border-status-not-started-border',
    accentClass: 'text-status-not-started',
    borderClass: 'border-status-not-started',
    topBorderClass: 'border-t-status-not-started',
    icon: CircleDot,
  },
  IN_PROGRESS: {
    label: 'Em andamento',
    columnClass: 'bg-status-in-progress-surface border-status-in-progress-border',
    dotClass: 'bg-status-in-progress',
    badgeClass:
      'bg-status-in-progress-surface text-status-in-progress border-status-in-progress-border',
    accentClass: 'text-status-in-progress',
    borderClass: 'border-status-in-progress',
    topBorderClass: 'border-t-status-in-progress',
    icon: PlayCircle,
  },
  PAUSED: {
    label: 'Pausada',
    columnClass: 'bg-status-paused-surface border-status-paused-border',
    dotClass: 'bg-status-paused',
    badgeClass: 'bg-status-paused-surface text-status-paused border-status-paused-border',
    accentClass: 'text-status-paused',
    borderClass: 'border-status-paused',
    topBorderClass: 'border-t-status-paused',
    icon: PauseCircle,
  },
  IN_REVIEW: {
    label: 'Em homologação',
    columnClass: 'bg-status-in-review-surface border-status-in-review-border',
    dotClass: 'bg-status-in-review',
    badgeClass: 'bg-status-in-review-surface text-status-in-review border-status-in-review-border',
    accentClass: 'text-status-in-review',
    borderClass: 'border-status-in-review',
    topBorderClass: 'border-t-status-in-review',
    icon: Eye,
  },
  PRODUCTION: {
    label: 'Em produção',
    columnClass: 'bg-status-production-surface border-status-production-border',
    dotClass: 'bg-status-production',
    badgeClass:
      'bg-status-production-surface text-status-production border-status-production-border',
    accentClass: 'text-status-production',
    borderClass: 'border-status-production',
    topBorderClass: 'border-t-status-production',
    icon: CheckCircle2,
  },
};

/** Column order is part of the specification, not a rendering detail. */
export const KANBAN_COLUMNS: DemandStatus[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'IN_REVIEW',
  'PRODUCTION',
];

/** Reading order for the "demandas por status" count — same order as the Kanban columns. */
export const DEMAND_STATUSES_ORDERED: DemandStatus[] = [...KANBAN_COLUMNS];
