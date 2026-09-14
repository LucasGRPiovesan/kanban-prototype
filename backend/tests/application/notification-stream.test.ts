import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationStreamSession } from '../../src/modules/notifications/application/notification-stream';
import {
  type NotificationEvent,
  type NotificationView,
} from '../../src/modules/notifications/application/ports';

function view(uuid: string, createdAt: Date): NotificationView {
  return {
    uuid,
    reason: 'RESPONSIBLE',
    action: 'demand.updated',
    summary: 'Editou a demanda',
    demand: { uuid: 'd', title: 'D' },
    projectName: null,
    actor: null,
    changes: [],
    readAt: null,
    createdAt,
  };
}

function setup(rows: () => NotificationView[], options = { pollIntervalMs: 1000, maxDurationMs: 0 }) {
  const sent: NotificationEvent[] = [];
  let heartbeats = 0;
  let closed = 0;
  let unsubscribed = 0;
  let push: ((event: NotificationEvent) => void) | null = null;
  let hubClose: (() => void) | null = null;

  const session = new NotificationStreamSession(
    'user-1',
    {
      listForRecipient: async () => ({ items: rows(), nextCursor: null }),
      countUnread: async () => 7,
    },
    (_user, onEvent, close) => {
      push = onEvent;
      hubClose = close;
      return () => {
        unsubscribed += 1;
      };
    },
    {
      sendEvent: (event) => sent.push(event),
      sendHeartbeat: () => {
        heartbeats += 1;
      },
      close: () => {
        closed += 1;
      },
    },
    { heartbeatMs: 500, ...options },
    () => new Date(Date.now()),
  );

  return {
    session,
    sent,
    push: (event: NotificationEvent) => push?.(event),
    hubClose: () => hubClose?.(),
    counts: () => ({ heartbeats, closed, unsubscribed }),
  };
}

describe('NotificationStreamSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delivers hub pushes immediately and never twice when the poll finds the same row', async () => {
    const created = new Date('2026-09-13T12:00:05.000Z');
    const stream = setup(() => [view('n1', created)]);
    stream.session.start();

    stream.push({ type: 'notification', notification: view('n1', created), unreadCount: 1 });
    expect(stream.sent.map((event) => event.notification.uuid)).toEqual(['n1']);

    await stream.session.poll();
    expect(stream.sent).toHaveLength(1);
    stream.session.stop();
  });

  it('polls rows written by another instance after the stream opened, oldest first', async () => {
    const before = new Date('2026-09-13T11:59:00.000Z');
    const rows = [
      view('n3', new Date('2026-09-13T12:00:09.000Z')),
      view('n2', new Date('2026-09-13T12:00:08.000Z')),
      view('old', before),
    ];
    const stream = setup(() => rows);
    stream.session.start();

    await stream.session.poll();

    expect(stream.sent.map((event) => event.notification.uuid)).toEqual(['n2', 'n3']);
    expect(stream.sent[0]?.unreadCount).toBe(7);
    stream.session.stop();
  });

  it('sends heartbeats, ends itself after the maximum duration and cleans up once', () => {
    const stream = setup(() => [], { pollIntervalMs: 60_000, maxDurationMs: 2_000 });
    stream.session.start();

    vi.advanceTimersByTime(1_000);
    expect(stream.counts().heartbeats).toBe(2);

    vi.advanceTimersByTime(1_000);
    expect(stream.counts()).toMatchObject({ closed: 1, unsubscribed: 1 });
    const heartbeatsAtClose = stream.counts().heartbeats;

    stream.session.stop();
    vi.advanceTimersByTime(5_000);
    expect(stream.counts()).toMatchObject({ heartbeats: heartbeatsAtClose, closed: 1, unsubscribed: 1 });
  });

  it('does not close the transport when the client itself went away, and closes it on shutdown', () => {
    const gone = setup(() => []);
    gone.session.start();
    gone.session.stop();
    expect(gone.counts()).toMatchObject({ closed: 0, unsubscribed: 1 });

    const shutdown = setup(() => []);
    shutdown.session.start();
    shutdown.hubClose();
    expect(shutdown.counts()).toMatchObject({ closed: 1, unsubscribed: 1 });
  });

  it('keeps the stream alive when a poll fails', async () => {
    const stream = setup(() => {
      throw new Error('db down');
    });
    stream.session.start();
    await expect(stream.session.poll()).resolves.toBeUndefined();
    expect(stream.counts().closed).toBe(0);
    stream.session.stop();
  });
});
