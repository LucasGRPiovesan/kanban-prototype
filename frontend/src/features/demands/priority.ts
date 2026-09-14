import { ArrowDown, ArrowUp, Flame, Minus } from 'lucide-react';
import type { DemandPriority } from '@/lib/api/types';

export interface PriorityPresentation {
  label: string;
  icon: typeof ArrowDown;
  /** Icon and text colour, wherever the priority appears bare — a card, a list row. */
  accentClass: string;
  /** Badge background, text and border — the select trigger and its options. */
  badgeClass: string;
}

/**
 * Single source of truth for how a priority looks and reads, the same role
 * `STATUS_PRESENTATION` plays for status.
 *
 * Colours are reused from the existing semantic tokens rather than a new palette:
 * gray → lime → amber → red reads as an ascending scale of urgency without inventing a
 * fifth set of CSS variables for four values.
 */
export const PRIORITY_PRESENTATION: Record<DemandPriority, PriorityPresentation> = {
  LOW: {
    label: 'Baixa',
    icon: ArrowDown,
    accentClass: 'text-muted',
    badgeClass: 'bg-surface-muted text-muted border-line',
  },
  MEDIUM: {
    label: 'Média',
    icon: Minus,
    accentClass: 'text-brand-700',
    badgeClass: 'bg-brand-50 text-brand-700 border-brand-200',
  },
  HIGH: {
    label: 'Alta',
    icon: ArrowUp,
    accentClass: 'text-warning',
    badgeClass: 'bg-warning-surface text-warning border-warning/40',
  },
  URGENT: {
    label: 'Urgente',
    icon: Flame,
    accentClass: 'text-danger',
    badgeClass: 'bg-danger-surface text-danger border-danger/40',
  },
};

/** Selection order, low to high — the reading order for a dropdown or a legend. */
export const DEMAND_PRIORITIES_ORDERED: DemandPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
