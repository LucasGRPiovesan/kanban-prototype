import { Router } from 'express';
import { z } from 'zod';
import { currentActor, requirePermission } from '../../../shared/http/auth.middleware';
import { asyncHandler } from '../../../shared/http/error-handler';
import { created, noContent, ok } from '../../../shared/http/response';
import {
  type AddProjectMember,
  type CreateProject,
  type GetProject,
  type ListProjectMembers,
  type ListProjects,
  type RemoveProjectMember,
  type UpdateProject,
} from '../application/use-cases/project.use-cases';
import {
  type GenerateIntegrationCredential,
  type GetIntegrationStatus,
  type RevokeIntegrationCredential,
} from '../application/use-cases/integration.use-cases';

const uuidParam = z.object({ uuid: z.string().uuid('Projeto inválido.') });
const memberParams = z.object({
  uuid: z.string().uuid('Projeto inválido.'),
  userUuid: z.string().uuid('Usuário inválido.'),
});

const listQuery = z.object({
  search: z.string().trim().optional(),
  includeInactive: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

const createSchema = z.object({
  name: z.string({ required_error: 'O nome é obrigatório.' }).trim().min(1, 'O nome é obrigatório.'),
  description: z
    .string({ required_error: 'A descrição é obrigatória.' })
    .trim()
    .min(1, 'A descrição é obrigatória.'),
  memberUuids: z.array(z.string().uuid()).optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Informe ao menos um campo.' });

const addMemberSchema = z.object({ userUuid: z.string().uuid('Usuário inválido.') });

export interface ProjectsPresentationDeps {
  listProjects: ListProjects;
  getProject: GetProject;
  createProject: CreateProject;
  updateProject: UpdateProject;
  listProjectMembers: ListProjectMembers;
  addProjectMember: AddProjectMember;
  removeProjectMember: RemoveProjectMember;
  getIntegrationStatus: GetIntegrationStatus;
  generateIntegrationCredential: GenerateIntegrationCredential;
  revokeIntegrationCredential: RevokeIntegrationCredential;
}

export function createProjectsRouter(deps: ProjectsPresentationDeps): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('PROJECT_ACCESS'),
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      return ok(
        res,
        await deps.listProjects.execute(currentActor(req), {
          search: query.search,
          activeOnly: !query.includeInactive,
        }),
      );
    }),
  );

  router.post(
    '/',
    requirePermission('PROJECT_CREATE'),
    asyncHandler(async (req, res) => {
      const body = createSchema.parse(req.body);
      return created(res, await deps.createProject.execute(currentActor(req), body));
    }),
  );

  router.get(
    '/:uuid',
    requirePermission('PROJECT_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      return ok(res, await deps.getProject.execute(currentActor(req), uuid));
    }),
  );

  router.patch(
    '/:uuid',
    requirePermission('PROJECT_UPDATE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = updateSchema.parse(req.body);
      return ok(res, await deps.updateProject.execute(currentActor(req), uuid, body));
    }),
  );

  router.get(
    '/:uuid/members',
    requirePermission('PROJECT_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      return ok(res, await deps.listProjectMembers.execute(currentActor(req), uuid));
    }),
  );

  router.post(
    '/:uuid/members',
    requirePermission('PROJECT_MANAGE_MEMBERS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = addMemberSchema.parse(req.body);
      await deps.addProjectMember.execute(currentActor(req), uuid, body.userUuid);
      return noContent(res);
    }),
  );

  router.delete(
    '/:uuid/members/:userUuid',
    requirePermission('PROJECT_MANAGE_MEMBERS'),
    asyncHandler(async (req, res) => {
      const params = memberParams.parse(req.params);
      await deps.removeProjectMember.execute(currentActor(req), params.uuid, params.userUuid);
      return noContent(res);
    }),
  );

  /*
   * Integration credentials: an exclusively project-scoped resource. Generating one
   * hands back the plain secret exactly once, in this same response — it is never
   * retrievable again, only rotated (which invalidates the previous pair) or revoked.
   */
  router.get(
    '/:uuid/integration',
    requirePermission('PROJECT_MANAGE_INTEGRATION'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      return ok(res, await deps.getIntegrationStatus.execute(currentActor(req), uuid));
    }),
  );

  router.post(
    '/:uuid/integration/credentials',
    requirePermission('PROJECT_MANAGE_INTEGRATION'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      return created(res, await deps.generateIntegrationCredential.execute(currentActor(req), uuid));
    }),
  );

  router.delete(
    '/:uuid/integration/credentials',
    requirePermission('PROJECT_MANAGE_INTEGRATION'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      await deps.revokeIntegrationCredential.execute(currentActor(req), uuid);
      return noContent(res);
    }),
  );

  return router;
}
