import { Router } from 'express';
import { z } from 'zod';
import { currentActor, requirePermission } from '../../../shared/http/auth.middleware';
import { asyncHandler } from '../../../shared/http/error-handler';
import { ok } from '../../../shared/http/response';
import { type InMemoryNotificationHub } from '../infrastructure/in-memory-notification-hub';
import {
  type GetUnreadNotificationCount,
  type ListNotifications,
  type ListWatchedDemands,
  type MarkAllNotificationsRead,
  type MarkNotificationsRead,
  type SetDemandWatch,
} from '../application/use-cases';
import { NotificationStreamSession } from '../application/notification-stream';
import { type NotificationRepository } from '../application/ports';

const listQuery = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.string().uuid('Cursor inválido.').optional(),
});

const uuidParam = z.object({ uuid: z.string().uuid('Demanda inválida.') });

const markReadSchema = z.object({
  uuids: z.array(z.string().uuid('Notificação inválida.')).min(1).max(100),
});

/** Keeps proxies and load balancers from closing a quiet stream as idle. */
const HEARTBEAT_MS = 25_000;

export interface NotificationsPresentationDeps {
  listNotifications: ListNotifications;
  getUnreadCount: GetUnreadNotificationCount;
  markRead: MarkNotificationsRead;
  markAllRead: MarkAllNotificationsRead;
  listWatchedDemands: ListWatchedDemands;
  setDemandWatch: SetDemandWatch;
  hub: InMemoryNotificationHub;
  /** Read by open streams to catch notifications written by another instance. */
  notificationRepository: Pick<NotificationRepository, 'listForRecipient' | 'countUnread'>;
  streamOptions: { pollIntervalMs: number; maxDurationMs: number };
}

export function createNotificationsRouter(deps: NotificationsPresentationDeps): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      return ok(res, await deps.listNotifications.execute(currentActor(req), query));
    }),
  );

  router.get(
    '/unread-count',
    asyncHandler(async (req, res) => ok(res, await deps.getUnreadCount.execute(currentActor(req)))),
  );

  router.post(
    '/read',
    asyncHandler(async (req, res) => {
      const { uuids } = markReadSchema.parse(req.body);
      return ok(res, await deps.markRead.execute(currentActor(req), uuids));
    }),
  );

  router.post(
    '/read-all',
    asyncHandler(async (req, res) => ok(res, await deps.markAllRead.execute(currentActor(req)))),
  );

  /**
   * Server-Sent Events: the live half of the inbox.
   *
   * SSE rather than WebSockets because the traffic is strictly server-to-browser — the
   * browser already has plain HTTP endpoints for everything it sends — and SSE rides on the
   * same authenticated request (the session cookie), reconnects on its own through the
   * browser's EventSource, and needs no extra protocol or library on either side.
   *
   * Authentication happens when the stream opens, through the same `authenticate`
   * middleware as every other route. The stream is also ended after a maximum duration
   * (see NOTIFICATION_STREAM_MAX_SECONDS): the browser reconnects on its own, which both
   * fits serverless time limits and re-checks the session — a user deactivated meanwhile
   * does not keep a stream open indefinitely.
   *
   * Delivery details (in-process push plus a database poll for other instances) live in
   * NotificationStreamSession; this handler only adapts it to an HTTP response.
   */
  router.get('/stream', (req, res) => {
    const actor = currentActor(req);

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tells an nginx in front of the API not to buffer the stream.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // How long the browser waits before reconnecting after the stream drops.
    res.write('retry: 5000\n\n');

    const session = new NotificationStreamSession(
      actor.userUuid.toString(),
      deps.notificationRepository,
      (userUuid, onEvent, close) => deps.hub.subscribe(userUuid, onEvent, close),
      {
        sendEvent: (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        sendHeartbeat: () => res.write(': ping\n\n'),
        close: () => res.end(),
      },
      { heartbeatMs: HEARTBEAT_MS, ...deps.streamOptions },
    );
    session.start();

    req.on('close', () => session.stop());
  });

  return router;
}

/**
 * Following a demand — mounted under `/demands`, ahead of the demands router, so the
 * static `/watching` path is matched before `/:uuid` can claim it.
 */
export function createDemandWatchRouter(deps: NotificationsPresentationDeps): Router {
  const router = Router();

  router.get(
    '/watching',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) =>
      ok(res, await deps.listWatchedDemands.execute(currentActor(req))),
    ),
  );

  router.put(
    '/:uuid/watch',
    requirePermission('DEMAND_ACCESS', 'DEMAND_WATCH'),
    asyncHandler(async (req, res) =>
      ok(
        res,
        await deps.setDemandWatch.execute(
          currentActor(req),
          uuidParam.parse(req.params).uuid,
          true,
        ),
      ),
    ),
  );

  router.delete(
    '/:uuid/watch',
    requirePermission('DEMAND_ACCESS', 'DEMAND_WATCH'),
    asyncHandler(async (req, res) =>
      ok(
        res,
        await deps.setDemandWatch.execute(
          currentActor(req),
          uuidParam.parse(req.params).uuid,
          false,
        ),
      ),
    ),
  );

  return router;
}
