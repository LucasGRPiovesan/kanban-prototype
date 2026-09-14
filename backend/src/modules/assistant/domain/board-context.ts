import { type DemandPriorityValue } from '../../demands/domain/demand-priority';
import { type DemandStatusValue } from '../../demands/domain/demand-status';
import {
  addDays,
  calendarDateIn,
  daysBetween,
  type StatusTransition,
} from '../../dashboard/domain/dashboard-metrics';
import { dataCell, plainText } from './text';

/**
 * Enough for any board this product is sized for, and a hard ceiling on prompt size. Past
 * it the oldest deliveries are dropped first — open work is never cut.
 */
export const CONTEXT_DEMAND_LIMIT = 150;
const DESCRIPTION_MAX = 280;

export const STATUS_LABELS: Record<DemandStatusValue, string> = {
  NOT_STARTED: 'Não iniciada',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Pausada',
  IN_REVIEW: 'Em homologação',
  PRODUCTION: 'Em produção',
};

/** Matches the frontend's `PRIORITY_PRESENTATION` labels, so the model's vocabulary is the user's. */
export const PRIORITY_LABELS: Record<DemandPriorityValue, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

export interface ContextDemandInput {
  uuid: string;
  title: string;
  /** Sanitized rich-text markup. */
  description: string;
  status: DemandStatusValue;
  priority: DemandPriorityValue;
  dueDate: string;
  createdAt: Date;
  /** `null` for a demand attached to no project — read as "sem projeto" in the prompt. */
  project: { uuid: string; name: string } | null;
  responsible: { uuid: string; name: string };
  checklist: readonly { done: boolean }[];
}

export interface BoardDemand {
  /** Short reference the model cites — `D7` — so it never has to reproduce a uuid. */
  ref: string;
  uuid: string;
  title: string;
  status: DemandStatusValue;
  priority: DemandPriorityValue;
  /** `null` for a demand attached to no project — read as "sem projeto" in the prompt. */
  project: { uuid: string; name: string } | null;
  responsible: { uuid: string; name: string };
  dueDate: string;
  /** Negative when overdue; `null` once delivered, when a deadline stops meaning anything. */
  daysToDue: number | null;
  /** Whole days since the demand entered its current status. */
  daysInStatus: number;
  checklist: { done: number; total: number };
  description: string;
}

export interface BoardContext {
  today: string;
  timeZone: string;
  demands: BoardDemand[];
  /** Delivered demands left out to respect CONTEXT_DEMAND_LIMIT. */
  omitted: number;
}

/**
 * The board, as the model gets to see it.
 *
 * Built from the same cards and status history the board and the Dashboard use, so the
 * assistant cannot know more than the person asking. Everything a manager would work out
 * by eye is computed here instead of asked of the model — days to deadline, days stuck in
 * a status, checklist progress — because arithmetic is exactly what a language model
 * gets wrong and a function does not.
 */
export function buildBoardContext(input: {
  demands: readonly ContextDemandInput[];
  transitions: readonly StatusTransition[];
  now: Date;
  timeZone: string;
  limit?: number;
}): BoardContext {
  const dateOf = calendarDateIn(input.timeZone);
  const today = dateOf(input.now);

  const lastMove = new Map<string, Date>();
  for (const transition of input.transitions) {
    const current = lastMove.get(transition.demandUuid);
    if (!current || transition.occurredAt > current) {
      lastMove.set(transition.demandUuid, transition.occurredAt);
    }
  }

  // Open work first, soonest deadline first; then deliveries, most recent first — so a
  // cut at the limit always falls on the least relevant rows.
  const ordered = [...input.demands].sort((a, b) => {
    const aOpen = a.status !== 'PRODUCTION';
    const bOpen = b.status !== 'PRODUCTION';
    if (aOpen !== bOpen) {
      return aOpen ? -1 : 1;
    }
    const byDue = aOpen ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate);
    return byDue || a.title.localeCompare(b.title);
  });

  const kept = ordered.slice(0, input.limit ?? CONTEXT_DEMAND_LIMIT);

  return {
    today,
    timeZone: input.timeZone,
    omitted: ordered.length - kept.length,
    demands: kept.map((demand, index) => ({
      ref: `D${index + 1}`,
      uuid: demand.uuid,
      title: demand.title,
      status: demand.status,
      priority: demand.priority,
      project: demand.project,
      responsible: demand.responsible,
      dueDate: demand.dueDate,
      daysToDue: demand.status === 'PRODUCTION' ? null : daysBetween(today, demand.dueDate),
      daysInStatus: Math.max(
        0,
        daysBetween(dateOf(lastMove.get(demand.uuid) ?? demand.createdAt), today),
      ),
      checklist: {
        done: demand.checklist.filter((item) => item.done).length,
        total: demand.checklist.length,
      },
      description: plainText(demand.description, DESCRIPTION_MAX),
    })),
  };
}

/** One demand, one line — every figure already worked out. */
export function describeDemand(demand: BoardDemand): string {
  const parts = [
    demand.ref,
    dataCell(demand.title),
    `projeto: ${demand.project ? dataCell(demand.project.name) : 'sem projeto'}`,
    STATUS_LABELS[demand.status],
    `prioridade: ${PRIORITY_LABELS[demand.priority]}`,
    `responsável: ${dataCell(demand.responsible.name)}`,
    describeDeadline(demand),
  ];
  if (demand.daysToDue !== null) {
    parts.push(`${plural(demand.daysInStatus, 'dia', 'dias')} neste status`);
  }
  if (demand.checklist.total > 0) {
    parts.push(`checklist ${demand.checklist.done}/${demand.checklist.total}`);
  }
  if (demand.description) {
    parts.push(`descrição: ${dataCell(demand.description)}`);
  }
  return parts.join(' | ');
}

function describeDeadline(demand: BoardDemand): string {
  const due = formatDayMonth(demand.dueDate);
  if (demand.daysToDue === null) {
    return `entregue (prazo era ${due})`;
  }
  if (demand.daysToDue < 0) {
    return `prazo ${due}, ATRASADA há ${plural(-demand.daysToDue, 'dia', 'dias')}`;
  }
  if (demand.daysToDue === 0) {
    return `prazo ${due}, vence HOJE`;
  }
  return `prazo ${due}, vence em ${plural(demand.daysToDue, 'dia', 'dias')}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** `2026-09-18` → `18/09`. */
export function formatDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** `2026-09-18` → `18/09/2026`. */
export function formatFullDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function weekdayOf(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
}

/** The last working day before `iso` — Friday, when asked on a Monday. */
export function previousBusinessDay(iso: string): string {
  let day = addDays(iso, -1);
  while ([0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) {
    day = addDays(day, -1);
  }
  return day;
}

/** The instant a calendar day starts in `timeZone` — 03:00Z for a day in São Paulo. */
export function startOfDayIn(iso: string, timeZone: string): Date {
  const utcMidnight = new Date(`${iso}T00:00:00.000Z`);
  const offset = zoneOffsetMs(utcMidnight, timeZone);
  const candidate = new Date(utcMidnight.getTime() - offset);
  // Re-read the offset at the candidate itself: across a DST change the two can differ.
  const settled = zoneOffsetMs(candidate, timeZone);
  return settled === offset ? candidate : new Date(utcMidnight.getTime() - settled);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}
