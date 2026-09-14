import { Router } from 'express';
import { z } from 'zod';
import { currentActor, requirePermission } from '../../../shared/http/auth.middleware';
import { asyncHandler } from '../../../shared/http/error-handler';
import { ok } from '../../../shared/http/response';
import {
  type GetAssistantStatus,
  type RunAssistantCommand,
  type UpdateAssistantSettings,
} from '../application/assistant.use-cases';
import { ASSISTANT_ACTIONS } from '../domain/assistant-actions';

const PROMPT_MAX = 2000;

const commandSchema = z
  .object({
    action: z.enum(ASSISTANT_ACTIONS, { message: 'Ação desconhecida.' }).optional(),
    prompt: z
      .string()
      .trim()
      .max(PROMPT_MAX, `O pedido pode ter no máximo ${PROMPT_MAX} caracteres.`)
      .optional(),
    projectUuid: z.string().uuid('Projeto inválido.').optional(),
    demandUuid: z.string().uuid('Demanda inválida.').optional(),
  })
  .superRefine((value, context) => {
    // Free text needs something to classify; a draft and a question need their subject.
    const needsPrompt = !value.action || value.action === 'CREATE_DEMAND' || value.action === 'ASK_BOARD';
    if (needsPrompt && (value.prompt ?? '').length < 3) {
      context.addIssue({ code: 'custom', path: ['prompt'], message: 'Descreva o que você precisa.' });
    }
    if (value.action === 'PLAN_CHECKLIST' && !value.demandUuid) {
      context.addIssue({ code: 'custom', path: ['demandUuid'], message: 'Escolha a demanda.' });
    }
  });

const settingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    model: z.string().trim().min(1).optional(),
    apiKey: z.string().trim().max(512).optional(),
  })
  .strict();

export interface AssistantPresentationDeps {
  getStatus: GetAssistantStatus;
  updateSettings: UpdateAssistantSettings;
  runCommand: RunAssistantCommand;
}

export function createAssistantRouter(deps: AssistantPresentationDeps): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('ASSISTANT_ACCESS'),
    asyncHandler(async (req, res) => ok(res, await deps.getStatus.execute(currentActor(req)))),
  );

  router.patch(
    '/settings',
    requirePermission('ASSISTANT_ACCESS', 'ASSISTANT_MANAGE'),
    asyncHandler(async (req, res) =>
      ok(res, await deps.updateSettings.execute(currentActor(req), settingsSchema.parse(req.body))),
    ),
  );

  router.post(
    '/commands',
    requirePermission('ASSISTANT_ACCESS'),
    asyncHandler(async (req, res) =>
      ok(res, await deps.runCommand.execute(currentActor(req), commandSchema.parse(req.body))),
    ),
  );

  return router;
}
