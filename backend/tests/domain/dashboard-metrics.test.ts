import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarDateIn,
  computeDashboard,
  daysBetween,
  median,
  percentile,
  weekStartOf,
  type MetricsDemand,
  type StatusTransition,
} from '../../src/modules/dashboard/domain/dashboard-metrics';

const TZ = 'America/Sao_Paulo';
// Thursday, 10 Sep 2026, 12:00 in São Paulo.
const NOW = new Date('2026-09-10T15:00:00Z');

const lucas = { uuid: 'u-lucas', name: 'Lucas Barbosa' };
const sofia = { uuid: 'u-sofia', name: 'Sofia Lima Braga' };
const p1 = { uuid: 'p-1', name: 'Portal do Cliente' };
const p2 = { uuid: 'p-2', name: 'App de Logística' };
const p3 = { uuid: 'p-3', name: 'Plataforma de Dados' };

function demand(
  uuid: string,
  status: MetricsDemand['status'],
  dueDate: string,
  createdAt: string,
  project = p1,
  responsible = lucas,
): MetricsDemand {
  return { uuid, title: `Demanda ${uuid}`, status, dueDate, createdAt: new Date(createdAt), project, responsible };
}

const move = (demandUuid: string, to: string, at: string): StatusTransition => ({
  demandUuid,
  from: null,
  to,
  occurredAt: new Date(at),
});

const demands = [
  demand('A', 'IN_PROGRESS', '2026-09-07', '2026-08-20T12:00:00Z'),
  demand('B', 'NOT_STARTED', '2026-09-10', '2026-09-09T12:00:00Z', p1, sofia),
  demand('C', 'IN_REVIEW', '2026-09-15', '2026-09-01T12:00:00Z', p2),
  demand('D', 'PRODUCTION', '2026-09-05', '2026-08-15T12:00:00Z'),
  demand('E', 'PRODUCTION', '2026-09-20', '2026-08-01T12:00:00Z', p2),
  demand('F', 'PRODUCTION', '2026-08-30', '2026-07-01T12:00:00Z', p2),
  demand('G', 'PAUSED', '2026-11-01', '2026-09-05T12:00:00Z', p2, sofia),
];

// Deliberately out of order: the function must not rely on the caller sorting them.
const transitions = [
  move('D', 'PRODUCTION', '2026-09-06T12:00:00Z'),
  move('A', 'IN_PROGRESS', '2026-08-25T12:00:00Z'),
  move('C', 'IN_PROGRESS', '2026-09-02T12:00:00Z'),
  move('C', 'IN_REVIEW', '2026-09-08T12:00:00Z'),
  move('D', 'IN_PROGRESS', '2026-08-17T12:00:00Z'),
  move('D', 'IN_REVIEW', '2026-08-25T12:00:00Z'),
  move('E', 'IN_PROGRESS', '2026-08-11T12:00:00Z'),
  // 23:00 on 8 Sep in São Paulo — already 9 Sep in UTC.
  move('E', 'PRODUCTION', '2026-09-09T02:00:00Z'),
  move('F', 'PRODUCTION', '2026-08-01T12:00:00Z'),
  move('G', 'IN_PROGRESS', '2026-09-06T12:00:00Z'),
  move('G', 'PAUSED', '2026-09-07T12:00:00Z'),
];

const metrics = computeDashboard({
  demands,
  transitions,
  projects: [p3, p2, p1],
  now: NOW,
  timeZone: TZ,
  periodDays: 30,
});

describe('calendar helpers', () => {
  it('counts days on the business calendar, not in UTC', () => {
    const toDate = calendarDateIn(TZ);
    expect(toDate(new Date('2026-09-09T02:00:00Z'))).toBe('2026-09-08');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(daysBetween('2026-09-10', '2026-09-07')).toBe(-3);
    expect(weekStartOf('2026-09-10')).toBe('2026-09-07');
    expect(weekStartOf('2026-09-07')).toBe('2026-09-07');
  });

  it('reports a median and a nearest-rank percentile, never an average', () => {
    expect(median([])).toBeNull();
    expect(median([1, 100, 3])).toBe(3);
    expect(median([2, 4])).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.85)).toBe(9);
    expect(percentile([5], 0.85)).toBe(5);
  });
});

describe('computeDashboard — current situation', () => {
  it('summarizes what is open, late, due soon and stalled', () => {
    expect(metrics.today).toBe('2026-09-10');
    expect(metrics.summary).toEqual({
      total: 7,
      open: 4,
      delivered: 3,
      overdue: 1,
      dueToday: 1,
      dueSoon: 2,
      stale: 1,
    });
  });

  it('buckets open demands by distance to their due date', () => {
    expect(metrics.dueBuckets).toEqual([
      { bucket: 'overdue', count: 1 },
      { bucket: 'today', count: 1 },
      { bucket: 'week', count: 1 },
      { bucket: 'month', count: 0 },
      { bucket: 'later', count: 1 },
    ]);
  });

  it('counts every status in board order', () => {
    expect(metrics.statusDistribution.map((entry) => [entry.status, entry.count])).toEqual([
      ['NOT_STARTED', 1],
      ['IN_PROGRESS', 1],
      ['PAUSED', 1],
      ['IN_REVIEW', 1],
      ['PRODUCTION', 3],
    ]);
  });

  it('lists what needs attention, most overdue first', () => {
    expect(metrics.attention.map((item) => [item.uuid, item.daysToDue])).toEqual([
      ['A', -3],
      ['B', 0],
    ]);
    expect(metrics.attentionTotal).toBe(2);
  });

  it('flags only started work that has not moved for a week', () => {
    // B has not moved either, but a backlog item waiting is not stalled work.
    expect(metrics.stalled).toEqual([
      expect.objectContaining({ uuid: 'A', daysInStatus: 16, since: '2026-08-25T12:00:00.000Z' }),
    ]);
  });
});

describe('computeDashboard — delivery flow', () => {
  it('compares throughput and arrivals with the previous period of the same length', () => {
    expect(metrics.period).toEqual({
      days: 30,
      from: '2026-08-12',
      to: '2026-09-10',
      previousFrom: '2026-07-13',
      previousTo: '2026-08-11',
    });
    expect(metrics.flow.throughput).toEqual({ current: 2, previous: 1 });
    expect(metrics.flow.arrivals).toEqual({ current: 5, previous: 1 });
  });

  it('measures lead and cycle time of the period’s deliveries as percentiles', () => {
    expect(metrics.flow.leadTimeDays).toEqual({ median: 30.3, p85: 38.6, sample: 2 });
    expect(metrics.flow.cycleTimeDays).toEqual({ median: 24.3, p85: 28.6, sample: 2 });
  });

  it('judges on-time delivery on the local calendar date', () => {
    // D shipped a day after its due date; E shipped on 8 Sep local time, before its own.
    expect(metrics.flow.onTime).toEqual({ onTime: 1, late: 1, rate: 0.5 });
  });

  it('builds eight ISO weeks, the current one marked as partial', () => {
    expect(metrics.weekly).toHaveLength(8);
    expect(metrics.weekly[0]).toMatchObject({ weekStart: '2026-07-20', partial: false });
    expect(metrics.weekly.at(-1)).toEqual({ weekStart: '2026-09-07', arrivals: 1, deliveries: 1, partial: true });
    const week = (start: string) => metrics.weekly.find((entry) => entry.weekStart === start);
    expect(week('2026-08-31')).toMatchObject({ arrivals: 2, deliveries: 1 });
    expect(week('2026-07-27')).toMatchObject({ arrivals: 1, deliveries: 1 });
  });

  it('breaks the load down by person and by project, riskiest first', () => {
    expect(metrics.workload).toEqual([
      { responsible: lucas, open: 2, overdue: 1, dueSoon: 1 },
      { responsible: sofia, open: 2, overdue: 0, dueSoon: 1 },
    ]);
    expect(metrics.projects).toEqual([
      { project: p1, open: 2, overdue: 1, dueSoon: 1, stale: 1, delivered: 1, onTimeRate: 0 },
      { project: p2, open: 2, overdue: 0, dueSoon: 1, stale: 0, delivered: 1, onTimeRate: 1 },
      { project: p3, open: 0, overdue: 0, dueSoon: 0, stale: 0, delivered: 0, onTimeRate: null },
    ]);
  });

  it('keeps a delivery with no recorded move out of every time-based metric', () => {
    const result = computeDashboard({
      demands: [demand('X', 'PRODUCTION', '2026-09-01', '2026-08-20T12:00:00Z')],
      transitions: [],
      projects: [p1],
      now: NOW,
      timeZone: TZ,
      periodDays: 30,
    });
    expect(result.summary.delivered).toBe(1);
    expect(result.flow.throughput.current).toBe(0);
    expect(result.flow.leadTimeDays).toEqual({ median: null, p85: null, sample: 0 });
    expect(result.flow.onTime.rate).toBeNull();
  });
});
