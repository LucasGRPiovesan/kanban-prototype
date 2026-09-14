import { Router } from 'express';
import { z } from 'zod';
import {
  LOG_CATEGORIES,
  LOG_LEVELS,
  LOG_SUBJECT_TYPES,
} from '../../../shared/domain/activity-catalog';
import { currentActor, requirePermission } from '../../../shared/http/auth.middleware';
import { asyncHandler } from '../../../shared/http/error-handler';
import { ok } from '../../../shared/http/response';
import { type GetLogFilters, type ListLogs } from '../application/use-cases';

const listQuery = z.object({
  category: z.enum(LOG_CATEGORIES).optional(),
  level: z.enum(LOG_LEVELS).optional(),
  action: z.string().trim().max(64).optional(),
  actorUuid: z.string().uuid('Usuário inválido.').optional(),
  projectUuid: z.string().uuid('Projeto inválido.').optional(),
  subjectType: z.enum(LOG_SUBJECT_TYPES).optional(),
  subjectUuid: z.string().uuid('Registro inválido.').optional(),
  from: z.string().datetime({ offset: true, message: 'Data inicial inválida.' }).optional(),
  to: z.string().datetime({ offset: true, message: 'Data final inválida.' }).optional(),
  search: z.string().trim().max(120).optional(),
  requestId: z.string().trim().max(128).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export interface LogsPresentationDeps {
  listLogs: ListLogs;
  getLogFilters: GetLogFilters;
}

export function createLogsRouter(deps: LogsPresentationDeps): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('LOG_ACCESS'),
    asyncHandler(async (req, res) => {
      const { page, limit, from, to, ...filter } = listQuery.parse(req.query);
      return ok(
        res,
        await deps.listLogs.execute(currentActor(req), {
          filter: {
            ...filter,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
          },
          page,
          limit,
        }),
      );
    }),
  );

  router.get(
    '/filters',
    requirePermission('LOG_ACCESS'),
    asyncHandler(async (req, res) => ok(res, await deps.getLogFilters.execute(currentActor(req)))),
  );

  return router;
}
