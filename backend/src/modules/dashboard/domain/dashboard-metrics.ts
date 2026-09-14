import { DEMAND_STATUSES, type DemandStatusValue } from '../../demands/domain/demand-status';

/*
 * The Dashboard's metrics, as pure functions of plain data.
 *
 * Nothing here reads a database or a clock: the inputs are the demands in scope, their
 * status transitions and "now", and every number on the screen is derived from them.
 * That keeps each definition testable on its own and makes the rules readable in one
 * place — which matters more than usual here, because the value of a dashboard is that
 * its numbers mean exactly what their labels say.
 *
 * The metric set follows the flow metrics used to manage knowledge work (Kanban
 * Method / Vacanti's "Actionable Agile Metrics"): work in progress, work item age,
 * throughput, cycle and lead time — reported as percentiles, never averages, because
 * delivery times are skewed and one long-running item drags an average into a number no
 * item actually took — plus the two due-date measures this board is built around.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Started work that has not changed status in this many days is flagged as stalled. */
export const STALE_AFTER_DAYS = 7;
/** "Due soon" horizon, today included. */
export const DUE_SOON_DAYS = 7;
export const WEEKLY_SERIES_WEEKS = 8;
const ATTENTION_LIMIT = 8;
const STALE_LIMIT = 6;

/** Statuses in which a demand is being worked on — where a lack of movement is a signal. */
const STARTED_STATUSES: readonly DemandStatusValue[] = ['IN_PROGRESS', 'PAUSED', 'IN_REVIEW'];

export interface Ref {
  uuid: string;
  name: string;
}

export interface MetricsDemand {
  uuid: string;
  title: string;
  status: DemandStatusValue;
  /** Calendar date, YYYY-MM-DD. */
  dueDate: string;
  createdAt: Date;
  /** `null` for a demand attached to no project: it counts in every total, and in no
   *  per-project breakdown, because there is no project it could be attributed to. */
  project: Ref | null;
  responsible: Ref;
}

export interface StatusTransition {
  demandUuid: string;
  from: string | null;
  to: string;
  occurredAt: Date;
}

export interface MetricsInput {
  demands: readonly MetricsDemand[];
  /** Any order; grouped and sorted here. */
  transitions: readonly StatusTransition[];
  /** Projects in scope — listed even when they hold no demand. */
  projects: readonly Ref[];
  now: Date;
  timeZone: string;
  periodDays: number;
}

export type DueBucket = 'overdue' | 'today' | 'week' | 'month' | 'later';

export interface Distribution {
  median: number | null;
  p85: number | null;
  sample: number;
}

export interface DemandSnapshot {
  uuid: string;
  title: string;
  status: DemandStatusValue;
  dueDate: string;
  project: Ref | null;
  responsible: Ref;
}

export interface DashboardMetrics {
  today: string;
  timeZone: string;
  period: { days: number; from: string; to: string; previousFrom: string; previousTo: string };
  summary: {
    total: number;
    open: number;
    delivered: number;
    overdue: number;
    dueToday: number;
    dueSoon: number;
    stale: number;
  };
  flow: {
    throughput: { current: number; previous: number };
    arrivals: { current: number; previous: number };
    leadTimeDays: Distribution;
    cycleTimeDays: Distribution;
    onTime: { onTime: number; late: number; rate: number | null };
  };
  statusDistribution: { status: DemandStatusValue; count: number }[];
  dueBuckets: { bucket: DueBucket; count: number }[];
  weekly: { weekStart: string; arrivals: number; deliveries: number; partial: boolean }[];
  workload: { responsible: Ref; open: number; overdue: number; dueSoon: number }[];
  projects: {
    project: Ref;
    open: number;
    overdue: number;
    dueSoon: number;
    stale: number;
    delivered: number;
    onTimeRate: number | null;
  }[];
  attention: (DemandSnapshot & { daysToDue: number })[];
  attentionTotal: number;
  stalled: (DemandSnapshot & { daysInStatus: number; since: string })[];
}

// --- calendar ------------------------------------------------------------------------

export function calendarDateIn(timeZone: string): (instant: Date) => string {
  // en-CA formats as YYYY-MM-DD, the one locale whose output needs no reassembly.
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return (instant) => format.format(instant);
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Monday of the ISO week containing `iso`. */
export function weekStartOf(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((weekday + 6) % 7));
}

// --- statistics ----------------------------------------------------------------------

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2);
}

/** Nearest-rank percentile: a value some item really had, never an interpolation. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length)));
  return round1(sorted[rank - 1]!);
}

function distribution(values: readonly number[]): Distribution {
  return { median: median(values), p85: percentile(values, 0.85), sample: values.length };
}

const elapsedDays = (from: Date, to: Date): number => Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);

function bucketOf(daysToDue: number): DueBucket {
  if (daysToDue < 0) return 'overdue';
  if (daysToDue === 0) return 'today';
  if (daysToDue <= DUE_SOON_DAYS) return 'week';
  if (daysToDue <= 30) return 'month';
  return 'later';
}

// --- the dashboard -------------------------------------------------------------------

export function computeDashboard(input: MetricsInput): DashboardMetrics {
  const toDate = calendarDateIn(input.timeZone);
  const today = toDate(input.now);
  const from = addDays(today, -(input.periodDays - 1));
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(from, -input.periodDays);
  const inPeriod = (date: string) => date >= from && date <= today;
  const inPrevious = (date: string) => date >= previousFrom && date <= previousTo;

  const history = new Map<string, StatusTransition[]>();
  for (const transition of input.transitions) {
    const list = history.get(transition.demandUuid) ?? [];
    list.push(transition);
    history.set(transition.demandUuid, list);
  }
  for (const list of history.values()) {
    list.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  const rows = input.demands.map((demand) => {
    const moves = history.get(demand.uuid) ?? [];
    const intoCurrent = [...moves].reverse().find((move) => move.to === demand.status);
    // Production is terminal, so the last move into it is *the* delivery. A demand in
    // production with no recorded move (data older than the activity log) has no known
    // delivery date: it counts as delivered, but stays out of every time-based metric
    // rather than being given an invented one.
    const deliveredAt = demand.status === 'PRODUCTION' ? (intoCurrent?.occurredAt ?? null) : null;
    // Work starts the first time the demand enters any started column — not only
    // IN_PROGRESS: a demand can go straight from NOT_STARTED to IN_REVIEW or PAUSED, and
    // that is still the moment someone began working on it. A jump straight to production
    // has no start and stays out of cycle time rather than being measured as zero.
    const startedAt = moves.find((move) => STARTED_STATUSES.includes(move.to as DemandStatusValue))?.occurredAt ?? null;
    const statusSince = intoCurrent?.occurredAt ?? demand.createdAt;
    const open = demand.status !== 'PRODUCTION';
    const daysToDue = daysBetween(today, demand.dueDate);
    const daysInStatus = Math.max(0, daysBetween(toDate(statusSince), today));
    const stale =
      open && STARTED_STATUSES.includes(demand.status) && daysInStatus >= STALE_AFTER_DAYS;
    return {
      demand,
      open,
      daysToDue,
      daysInStatus,
      statusSince,
      stale,
      overdue: open && daysToDue < 0,
      dueSoon: open && daysToDue >= 0 && daysToDue <= DUE_SOON_DAYS,
      createdDate: toDate(demand.createdAt),
      deliveredAt,
      deliveredDate: deliveredAt ? toDate(deliveredAt) : null,
      startedAt,
    };
  });

  const openRows = rows.filter((row) => row.open);
  const deliveredInPeriod = rows.filter((row) => row.deliveredDate && inPeriod(row.deliveredDate));
  const onTimeCount = deliveredInPeriod.filter((row) => row.deliveredDate! <= row.demand.dueDate).length;

  const snapshot = (demand: MetricsDemand): DemandSnapshot => ({
    uuid: demand.uuid,
    title: demand.title,
    status: demand.status,
    dueDate: demand.dueDate,
    project: demand.project,
    responsible: demand.responsible,
  });

  // Weekly flow: the last eight ISO weeks, the current one included and flagged as
  // partial so a half-finished week is never read as a drop.
  const currentWeek = weekStartOf(today);
  const weekly = Array.from({ length: WEEKLY_SERIES_WEEKS }, (_, index) => {
    const weekStart = addDays(currentWeek, -7 * (WEEKLY_SERIES_WEEKS - 1 - index));
    return { weekStart, arrivals: 0, deliveries: 0, partial: weekStart === currentWeek };
  });
  const weekIndex = new Map(weekly.map((week, index) => [week.weekStart, index]));
  for (const row of rows) {
    const arrival = weekIndex.get(weekStartOf(row.createdDate));
    if (arrival !== undefined) weekly[arrival]!.arrivals += 1;
    if (row.deliveredDate) {
      const delivery = weekIndex.get(weekStartOf(row.deliveredDate));
      if (delivery !== undefined) weekly[delivery]!.deliveries += 1;
    }
  }

  const workload = new Map<string, DashboardMetrics['workload'][number]>();
  for (const row of openRows) {
    const entry = workload.get(row.demand.responsible.uuid) ?? {
      responsible: row.demand.responsible,
      open: 0,
      overdue: 0,
      dueSoon: 0,
    };
    entry.open += 1;
    if (row.overdue) entry.overdue += 1;
    if (row.dueSoon) entry.dueSoon += 1;
    workload.set(row.demand.responsible.uuid, entry);
  }

  const attentionRows = openRows
    .filter((row) => row.daysToDue <= 0)
    .sort((a, b) => a.daysToDue - b.daysToDue || a.demand.title.localeCompare(b.demand.title));

  return {
    today,
    timeZone: input.timeZone,
    period: { days: input.periodDays, from, to: today, previousFrom, previousTo },
    summary: {
      total: rows.length,
      open: openRows.length,
      delivered: rows.length - openRows.length,
      overdue: openRows.filter((row) => row.overdue).length,
      dueToday: openRows.filter((row) => row.daysToDue === 0).length,
      dueSoon: openRows.filter((row) => row.dueSoon).length,
      stale: openRows.filter((row) => row.stale).length,
    },
    flow: {
      throughput: {
        current: deliveredInPeriod.length,
        previous: rows.filter((row) => row.deliveredDate && inPrevious(row.deliveredDate)).length,
      },
      arrivals: {
        current: rows.filter((row) => inPeriod(row.createdDate)).length,
        previous: rows.filter((row) => inPrevious(row.createdDate)).length,
      },
      leadTimeDays: distribution(
        deliveredInPeriod.map((row) => elapsedDays(row.demand.createdAt, row.deliveredAt!)),
      ),
      cycleTimeDays: distribution(
        deliveredInPeriod
          .filter((row) => row.startedAt)
          .map((row) => elapsedDays(row.startedAt!, row.deliveredAt!)),
      ),
      onTime: {
        onTime: onTimeCount,
        late: deliveredInPeriod.length - onTimeCount,
        rate: deliveredInPeriod.length > 0 ? onTimeCount / deliveredInPeriod.length : null,
      },
    },
    statusDistribution: DEMAND_STATUSES.map((status) => ({
      status,
      count: rows.filter((row) => row.demand.status === status).length,
    })),
    dueBuckets: (['overdue', 'today', 'week', 'month', 'later'] as const).map((bucket) => ({
      bucket,
      count: openRows.filter((row) => bucketOf(row.daysToDue) === bucket).length,
    })),
    weekly,
    workload: [...workload.values()].sort(
      (a, b) => b.open - a.open || b.overdue - a.overdue || a.responsible.name.localeCompare(b.responsible.name),
    ),
    projects: input.projects
      .map((project) => {
        const own = rows.filter((row) => row.demand.project?.uuid === project.uuid);
        const delivered = own.filter((row) => row.deliveredDate && inPeriod(row.deliveredDate));
        const onTime = delivered.filter((row) => row.deliveredDate! <= row.demand.dueDate).length;
        return {
          project,
          open: own.filter((row) => row.open).length,
          overdue: own.filter((row) => row.overdue).length,
          dueSoon: own.filter((row) => row.dueSoon).length,
          stale: own.filter((row) => row.stale).length,
          delivered: delivered.length,
          onTimeRate: delivered.length > 0 ? onTime / delivered.length : null,
        };
      })
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.project.name.localeCompare(b.project.name)),
    attention: attentionRows
      .slice(0, ATTENTION_LIMIT)
      .map((row) => ({ ...snapshot(row.demand), daysToDue: row.daysToDue })),
    attentionTotal: attentionRows.length,
    stalled: openRows
      .filter((row) => row.stale)
      .sort((a, b) => b.daysInStatus - a.daysInStatus)
      .slice(0, STALE_LIMIT)
      .map((row) => ({
        ...snapshot(row.demand),
        daysInStatus: row.daysInStatus,
        since: row.statusSince.toISOString(),
      })),
  };
}
