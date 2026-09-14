import { Router } from 'express';
import { z } from 'zod';
import { currentIntegration } from '../../../shared/http/integration-auth.middleware';
import { asyncHandler } from '../../../shared/http/error-handler';
import { created, ok } from '../../../shared/http/response';
import { type LogActor } from '../../../shared/application/activity-log.port';
import { DEMAND_PRIORITIES } from '../domain/demand-priority';
import { DEMAND_STATUSES } from '../domain/demand-status';
import {
  type CreateDemandViaIntegration,
  type MoveDemandViaIntegration,
  type UpdateDemandViaIntegration,
} from '../application/use-cases/integration-demand.use-cases';

const isoDate = z
  .string({ required_error: 'O prazo é obrigatório.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o prazo no formato AAAA-MM-DD.');

const createSchema = z.object({
  title: z.string({ required_error: 'O título é obrigatório.' }).trim().min(1, 'O título é obrigatório.'),
  description: z
    .string({ required_error: 'A descrição é obrigatória.' })
    .trim()
    .min(1, 'A descrição é obrigatória.'),
  dueDate: isoDate,
  responsibleUuid: z
    .string({ required_error: 'O responsável é obrigatório.' })
    .uuid('Informe um responsável válido.'),
  status: z.enum(DEMAND_STATUSES).optional(),
  priority: z.enum(DEMAND_PRIORITIES).optional(),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1, 'O título é obrigatório.').optional(),
    description: z.string().trim().min(1, 'A descrição é obrigatória.').optional(),
    dueDate: isoDate.optional(),
    responsibleUuid: z.string().uuid('Informe um responsável válido.').optional(),
    priority: z.enum(DEMAND_PRIORITIES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Informe ao menos um campo.' });

const statusSchema = z.object({
  status: z.enum(DEMAND_STATUSES, { required_error: 'O status é obrigatório.' }),
});

const uuidParam = z.object({ uuid: z.string().uuid('Demanda inválida.') });

export interface IntegrationDemandsPresentationDeps {
  createDemand: CreateDemandViaIntegration;
  updateDemand: UpdateDemandViaIntegration;
  moveDemand: MoveDemandViaIntegration;
}

/** `credentialUuid` doubles as the log actor's id — a stable, non-user identity to filter by. */
function actorOf(context: { credentialUuid: string; apiKeyPreview: string }): LogActor {
  return { uuid: context.credentialUuid, name: `Integração (${context.apiKeyPreview})` };
}

/**
 * The demand-integration API proper: create, edit and move, scoped entirely by the
 * bearer token's project — never by anything the request body says. Mounted behind
 * `integrationAuth`, never behind the user-session `authenticate()`.
 */
export function createIntegrationDemandsRouter(deps: IntegrationDemandsPresentationDeps): Router {
  const router = Router();

  router.post(
    '/demands',
    asyncHandler(async (req, res) => {
      const context = currentIntegration(req);
      const body = createSchema.parse(req.body);
      const result = await deps.createDemand.execute(actorOf(context), context.projectUuid, body);
      return created(res, result);
    }),
  );

  router.patch(
    '/demands/:uuid',
    asyncHandler(async (req, res) => {
      const context = currentIntegration(req);
      const { uuid } = uuidParam.parse(req.params);
      const body = updateSchema.parse(req.body);
      return ok(res, await deps.updateDemand.execute(actorOf(context), context.projectUuid, uuid, body));
    }),
  );

  router.patch(
    '/demands/:uuid/status',
    asyncHandler(async (req, res) => {
      const context = currentIntegration(req);
      const { uuid } = uuidParam.parse(req.params);
      const { status } = statusSchema.parse(req.body);
      return ok(
        res,
        await deps.moveDemand.execute(actorOf(context), context.projectUuid, uuid, status),
      );
    }),
  );

  return router;
}
