import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../shared/http/error-handler';
import { ok } from '../../../shared/http/response';
import { type IssueIntegrationAccessToken } from '../application/use-cases/integration.use-cases';

const tokenSchema = z.object({
  apiKey: z.string({ required_error: 'Informe a API key.' }).trim().min(1, 'Informe a API key.'),
  apiSecret: z.string({ required_error: 'Informe o secret.' }).trim().min(1, 'Informe o secret.'),
});

export interface IntegrationAuthPresentationDeps {
  issueAccessToken: IssueIntegrationAccessToken;
}

/**
 * The one endpoint of the demand-integration API with no gate at all — it is the gate.
 * Mounted at the same level as `/auth/login`, never behind the user-session
 * `authenticate()` or the `integrationAuth` bearer check.
 */
export function createIntegrationAuthRouter(deps: IntegrationAuthPresentationDeps): Router {
  const router = Router();

  router.post(
    '/auth/token',
    asyncHandler(async (req, res) => {
      const body = tokenSchema.parse(req.body);
      return ok(res, await deps.issueAccessToken.execute(body));
    }),
  );

  return router;
}
