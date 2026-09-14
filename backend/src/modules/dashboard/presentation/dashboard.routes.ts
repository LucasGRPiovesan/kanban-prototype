import { Router } from 'express';
import { z } from 'zod';
import { currentActor, requirePermission } from '../../../shared/http/auth.middleware';
import { asyncHandler } from '../../../shared/http/error-handler';
import { ok } from '../../../shared/http/response';
import { type GetDashboard } from '../application/get-dashboard';

const query = z.object({
  projectUuid: z.string().uuid('Projeto inválido.').optional(),
  period: z
    .enum(['30', '90'], { message: 'Período deve ser 30 ou 90 dias.' })
    .default('30')
    .transform((value) => Number(value) as 30 | 90),
});

export interface DashboardPresentationDeps {
  getDashboard: GetDashboard;
}

export function createDashboardRouter(deps: DashboardPresentationDeps): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const { projectUuid, period } = query.parse(req.query);
      return ok(
        res,
        await deps.getDashboard.execute(currentActor(req), { projectUuid, periodDays: period }),
      );
    }),
  );

  return router;
}
