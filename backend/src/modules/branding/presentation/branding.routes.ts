import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DomainError } from '../../../shared/domain/errors';
import { currentActor, requirePermission } from '../../../shared/http/auth.middleware';
import { asyncHandler } from '../../../shared/http/error-handler';
import { ok } from '../../../shared/http/response';
import {
  type GetBrandingSettings,
  type ResetBrandingLogo,
  type UploadBrandingLogo,
} from '../application/use-cases/branding.use-cases';
import { isLogoVariant } from '../domain/branding-settings';

const variantParam = z.object({ variant: z.string().refine(isLogoVariant, 'Tema inválido.') });

export interface BrandingPublicPresentationDeps {
  getSettings: GetBrandingSettings;
}

export interface BrandingManagementPresentationDeps {
  uploadLogo: UploadBrandingLogo;
  resetLogo: ResetBrandingLogo;
  maxLogoSizeBytes: number;
}

/**
 * The current logo URLs, readable with no session: the login page shows them before
 * anyone is signed in, the same reasoning `/auth/candidates` is public.
 */
export function createPublicBrandingRouter(deps: BrandingPublicPresentationDeps): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => ok(res, await deps.getSettings.execute())),
  );

  return router;
}

export function createBrandingManagementRouter(deps: BrandingManagementPresentationDeps): Router {
  const router = Router();
  const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: deps.maxLogoSizeBytes, files: 1 },
  });

  router.post(
    '/logo/:variant',
    requirePermission('ASSISTANT_MANAGE'),
    logoUpload.single('file'),
    asyncHandler(async (req, res) => {
      const { variant } = variantParam.parse(req.params);
      const file = req.file;
      if (!file) {
        throw DomainError.validation('NO_FILE', 'Nenhum arquivo enviado.');
      }
      return ok(
        res,
        await deps.uploadLogo.execute(currentActor(req), variant, {
          mimeType: file.mimetype,
          content: file.buffer,
        }),
      );
    }),
  );

  router.delete(
    '/logo/:variant',
    requirePermission('ASSISTANT_MANAGE'),
    asyncHandler(async (req, res) => {
      const { variant } = variantParam.parse(req.params);
      return ok(res, await deps.resetLogo.execute(currentActor(req), variant));
    }),
  );

  return router;
}
