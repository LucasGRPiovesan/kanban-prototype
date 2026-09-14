import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { currentActor, requirePermission } from '../../../shared/http/auth.middleware';
import { asyncHandler } from '../../../shared/http/error-handler';
import { created, noContent, ok } from '../../../shared/http/response';
import { ALLOWED_MIME_TYPES } from '../domain/demand-attachment';
import { DEMAND_PRIORITIES } from '../domain/demand-priority';
import { DEMAND_STATUSES } from '../domain/demand-status';
import { DEMAND_SORTS } from '../application/ports/repositories';
import { type ListReachableProjects } from '../../projects/application/use-cases/project.use-cases';
import { type DeleteAttachment, type UploadAttachments } from '../application/use-cases/attachment.use-cases';
import {
  type AddChecklistItem,
  type ArchiveDemand,
  type CreateDemand,
  type DeleteDemand,
  type GetDemand,
  type GetDemandFilters,
  type ListDemands,
  type ListDemandsPage,
  type ListEligibleAssignees,
  type MoveDemand,
  type RemoveChecklistItem,
  type UpdateChecklistItem,
  type UpdateDemand,
} from '../application/use-cases/demand.use-cases';
import {
  type AddDemandComment,
  type DeleteDemandComment,
  type EditDemandComment,
  type GetDemandHistory,
  type ListDemandComments,
} from '../application/use-cases/comment.use-cases';

const uuidParam = z.object({ uuid: z.string().uuid('Demanda inválida.') });
const commentParams = z.object({
  uuid: z.string().uuid('Demanda inválida.'),
  commentUuid: z.string().uuid('Comentário inválido.'),
});
// The length rule lives in the DemandComment aggregate; this only bounds the payload.
const commentBodySchema = z.object({
  body: z.string({ required_error: 'Escreva o comentário.' }).trim().min(1, 'Escreva o comentário.').max(5000),
  /** Only accepted on creation — replying is not something an edit can turn a comment into. */
  parentCommentUuid: z.string().uuid('Comentário inválido.').optional(),
});
const historyQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const attachmentParams = z.object({
  uuid: z.string().uuid('Demanda inválida.'),
  attachmentUuid: z.string().uuid('Anexo inválido.'),
});
const checklistParams = z.object({
  uuid: z.string().uuid('Demanda inválida.'),
  itemUuid: z.string().uuid('Item inválido.'),
});

const listQuery = z.object({
  projectUuid: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  status: z.enum(DEMAND_STATUSES).optional(),
  archived: z.coerce.boolean().optional(),
});

const assigneesQuery = z.object({
  projectUuid: z.string().uuid('Projeto inválido.').optional(),
  search: z.string().trim().optional(),
});

const historyPageQuery = z.object({
  projectUuid: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  status: z.enum(DEMAND_STATUSES).optional(),
  priority: z.enum(DEMAND_PRIORITIES).optional(),
  responsibleUuid: z.string().uuid().optional(),
  sort: z.enum(DEMAND_SORTS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  archived: z.coerce.boolean().optional(),
  includeArchived: z.coerce.boolean().optional(),
});

/**
 * The API contract is ISO (YYYY-MM-DD); DD/MM/YYYY is a presentation concern the
 * frontend converts at the edge.
 */
const isoDate = z
  .string({ required_error: 'O prazo é obrigatório.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o prazo no formato AAAA-MM-DD.');

const createSchema = z.object({
  // Optional: a demand may be written down before anyone decides where it belongs.
  // `null` and the absent field mean the same thing, so a form that clears the control
  // and one that never sent it are handled identically.
  projectUuid: z.string().uuid('Selecione um projeto válido.').nullish(),
  title: z.string({ required_error: 'O título é obrigatório.' }).trim().min(1, 'O título é obrigatório.'),
  description: z
    .string({ required_error: 'A descrição é obrigatória.' })
    .trim()
    .min(1, 'A descrição é obrigatória.'),
  dueDate: isoDate,
  responsibleUuid: z
    .string({ required_error: 'O responsável é obrigatório.' })
    .uuid('Selecione um responsável válido.'),
  // The aggregate caps the list too; this only keeps a hostile payload from reaching it.
  checklist: z.array(z.string().trim().min(1, 'Informe o item.')).max(50).optional(),
  // Column the demand starts in — the Kanban's per-column "+". Omitted, it is
  // NOT_STARTED; the use case is the authority on what beyond that is allowed.
  status: z.enum(DEMAND_STATUSES).optional(),
  // Omitted, the aggregate defaults it to MEDIUM — unlike status, no separate
  // permission gates this field.
  priority: z.enum(DEMAND_PRIORITIES).optional(),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1, 'O título é obrigatório.').optional(),
    description: z.string().trim().min(1, 'A descrição é obrigatória.').optional(),
    dueDate: isoDate.optional(),
    responsibleUuid: z.string().uuid('Selecione um responsável válido.').optional(),
    // `null` detaches the demand from its project; omitted leaves it untouched.
    projectUuid: z.string().uuid().nullable().optional(),
    priority: z.enum(DEMAND_PRIORITIES).optional(),
    // Optional so `PATCH /:uuid/status` stays the endpoint for a status change on its
    // own (drag-and-drop); accepted here too so an edit that also renames the demand,
    // say, records and notifies as the one save it actually was.
    status: z.enum(DEMAND_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Informe ao menos um campo.' });

/*
 * The description arrives as markup from the editor. Length is *not* validated here:
 * a limit on the markup would reject an ordinary paragraph that happened to be
 * formatted, so the rule belongs to the RichText value object, which measures the text
 * that survives sanitization. This schema only asserts the field is a non-empty string.
 */
const checklistCreateSchema = z.object({
  title: z
    .string({ required_error: 'Informe o item.' })
    .trim()
    .min(1, 'Informe o item.'),
});

const checklistUpdateSchema = z
  .object({
    title: z.string().trim().min(1, 'Informe o item.').optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Informe ao menos um campo.' });

const moveSchema = z.object({
  status: z.enum(DEMAND_STATUSES, {
    errorMap: () => ({ message: 'Status inválido.' }),
  }),
});

const archiveSchema = z.object({
  archived: z.boolean(),
});

export interface DemandsPresentationDeps {
  listDemands: ListDemands;
  listDemandsPage: ListDemandsPage;
  getDemandFilters: GetDemandFilters;
  listReachableProjects: ListReachableProjects;
  getDemand: GetDemand;
  createDemand: CreateDemand;
  updateDemand: UpdateDemand;
  moveDemand: MoveDemand;
  archiveDemand: ArchiveDemand;
  deleteDemand: DeleteDemand;
  listEligibleAssignees: ListEligibleAssignees;
  addChecklistItem: AddChecklistItem;
  updateChecklistItem: UpdateChecklistItem;
  removeChecklistItem: RemoveChecklistItem;
  uploadAttachments: UploadAttachments;
  deleteAttachment: DeleteAttachment;
  listDemandComments: ListDemandComments;
  addDemandComment: AddDemandComment;
  editDemandComment: EditDemandComment;
  deleteDemandComment: DeleteDemandComment;
  getDemandHistory: GetDemandHistory;
  maxFileSizeBytes: number;
  maxFilesPerRequest: number;
}

export function createDemandsRouter(deps: DemandsPresentationDeps): Router {
  const router = Router();

  /**
   * Files are buffered in memory: uploads are capped at a few megabytes and the
   * thumbnail pipeline needs the bytes anyway. Writing to a temp directory first would
   * add a cleanup path with nothing to gain at this size.
   */
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: deps.maxFileSizeBytes, files: deps.maxFilesPerRequest },
    fileFilter: (_req, file, callback) => {
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
        callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        return;
      }
      callback(null, true);
    },
  });

  /*
   * DEMAND_KANBAN and DEMAND_LIST decide which *screens* a profile opens, not which
   * demands it may read: both listings below apply exactly the same visibility rules
   * (DEMAND_ACCESS, DEMAND_VIEW_ALL, allocation), so neither exposes anything the other
   * would not. They stay on DEMAND_ACCESS because other modules read them too — the
   * Usuários screen lists a person's demands through `/history` — and withholding a
   * screen must never break a different module that legitimately reads the same data.
   */
  router.get(
    '/',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      return ok(res, await deps.listDemands.execute(currentActor(req), query));
    }),
  );

  router.get(
    '/projects',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => ok(res, await deps.listReachableProjects.execute(currentActor(req)))),
  );

  router.post(
    '/',
    requirePermission('DEMAND_ACCESS', 'DEMAND_CREATE'),
    asyncHandler(async (req, res) => {
      const body = createSchema.parse(req.body);
      return created(res, await deps.createDemand.execute(currentActor(req), body));
    }),
  );

  /**
   * The Demandas screen: every demand ever created, as a paged history — registered
   * ahead of `/:uuid` so "history" is never swallowed by the uuid param route.
   */
  router.get(
    '/history',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const query = historyPageQuery.parse(req.query);
      return ok(res, await deps.listDemandsPage.execute(currentActor(req), query));
    }),
  );

  router.get(
    '/filters',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => ok(res, await deps.getDemandFilters.execute(currentActor(req)))),
  );

  /**
   * Who may be the responsible of a demand, optionally narrowed to a project.
   *
   * The project-scoped twin of this route lives under `/projects/:uuid` and stays there:
   * that URL carries the isolation boundary in its path. This one exists because a
   * demand may have no project at all, and there is then no project path to ask under —
   * so the scope becomes an optional query parameter instead.
   */
  router.get(
    '/assignees',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const query = assigneesQuery.parse(req.query);
      return ok(
        res,
        await deps.listEligibleAssignees.execute(
          currentActor(req),
          query.projectUuid ?? null,
          query.search,
        ),
      );
    }),
  );

  router.get(
    '/:uuid',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      return ok(res, await deps.getDemand.execute(currentActor(req), uuid));
    }),
  );

  router.patch(
    '/:uuid',
    requirePermission('DEMAND_UPDATE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = updateSchema.parse(req.body);
      return ok(res, await deps.updateDemand.execute(currentActor(req), uuid, body));
    }),
  );

  /** Drag-and-drop target. Rejected moves come back as a domain error. */
  router.patch(
    '/:uuid/status',
    requirePermission('DEMAND_UPDATE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = moveSchema.parse(req.body);
      return ok(res, await deps.moveDemand.execute(currentActor(req), uuid, body.status));
    }),
  );

  /** Hides/restores a demand on the board without touching its lifecycle status. */
  router.patch(
    '/:uuid/archive',
    requirePermission('DEMAND_ARCHIVE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = archiveSchema.parse(req.body);
      return ok(res, await deps.archiveDemand.execute(currentActor(req), uuid, body.archived));
    }),
  );

  router.delete(
    '/:uuid',
    requirePermission('DEMAND_DELETE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      await deps.deleteDemand.execute(currentActor(req), uuid);
      return noContent(res);
    }),
  );

  /*
   * Checklist. Gated by DEMAND_UPDATE, like every other change to a demand's scope —
   * the route-level guard rejects early and the use case asserts it again, so a future
   * route cannot be added without the check.
   */
  router.post(
    '/:uuid/checklist',
    requirePermission('DEMAND_UPDATE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = checklistCreateSchema.parse(req.body);
      return created(
        res,
        await deps.addChecklistItem.execute(currentActor(req), uuid, body.title),
      );
    }),
  );

  router.patch(
    '/:uuid/checklist/:itemUuid',
    requirePermission('DEMAND_UPDATE'),
    asyncHandler(async (req, res) => {
      const params = checklistParams.parse(req.params);
      const body = checklistUpdateSchema.parse(req.body);
      await deps.updateChecklistItem.execute(
        currentActor(req),
        params.uuid,
        params.itemUuid,
        body,
      );
      return noContent(res);
    }),
  );

  router.delete(
    '/:uuid/checklist/:itemUuid',
    requirePermission('DEMAND_UPDATE'),
    asyncHandler(async (req, res) => {
      const params = checklistParams.parse(req.params);
      await deps.removeChecklistItem.execute(currentActor(req), params.uuid, params.itemUuid);
      return noContent(res);
    }),
  );

  router.post(
    '/:uuid/attachments',
    requirePermission('DEMAND_UPDATE'),
    upload.array('files', deps.maxFilesPerRequest),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      return created(
        res,
        await deps.uploadAttachments.execute(
          currentActor(req),
          uuid,
          files.map((file) => ({
            originalName: file.originalname,
            mimeType: file.mimetype,
            content: file.buffer,
          })),
        ),
      );
    }),
  );

  router.delete(
    '/:uuid/attachments/:attachmentUuid',
    requirePermission('DEMAND_UPDATE'),
    asyncHandler(async (req, res) => {
      const params = attachmentParams.parse(req.params);
      await deps.deleteAttachment.execute(currentActor(req), params.uuid, params.attachmentUuid);
      return noContent(res);
    }),
  );

  /*
   * History and comments.
   *
   * Reading either is part of reading the demand, so DEMAND_ACCESS suffices — the Logs
   * module's own permission is not required to see how one card got where it is.
   * Writing a comment is a capability of its own, DEMAND_COMMENT.
   */
  router.get(
    '/:uuid/history',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const query = historyQuery.parse(req.query);
      return ok(res, await deps.getDemandHistory.execute(currentActor(req), uuid, query));
    }),
  );

  router.get(
    '/:uuid/comments',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      return ok(res, await deps.listDemandComments.execute(currentActor(req), uuid));
    }),
  );

  router.post(
    '/:uuid/comments',
    requirePermission('DEMAND_ACCESS', 'DEMAND_COMMENT'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const { body, parentCommentUuid } = commentBodySchema.parse(req.body);
      return created(
        res,
        await deps.addDemandComment.execute(currentActor(req), uuid, body, parentCommentUuid),
      );
    }),
  );

  router.patch(
    '/:uuid/comments/:commentUuid',
    requirePermission('DEMAND_ACCESS', 'DEMAND_COMMENT'),
    asyncHandler(async (req, res) => {
      const params = commentParams.parse(req.params);
      const { body } = commentBodySchema.parse(req.body);
      return ok(
        res,
        await deps.editDemandComment.execute(currentActor(req), params.uuid, params.commentUuid, body),
      );
    }),
  );

  router.delete(
    '/:uuid/comments/:commentUuid',
    requirePermission('DEMAND_ACCESS', 'DEMAND_COMMENT'),
    asyncHandler(async (req, res) => {
      const params = commentParams.parse(req.params);
      await deps.deleteDemandComment.execute(currentActor(req), params.uuid, params.commentUuid);
      return noContent(res);
    }),
  );

  return router;
}

/**
 * Project-scoped demand routes. Mounted under `/projects/:uuid` so the URL itself
 * carries the isolation boundary, matching how the board is actually browsed.
 */
export function createProjectDemandsRouter(deps: DemandsPresentationDeps): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/demands',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const query = listQuery.parse(req.query);
      return ok(
        res,
        await deps.listDemands.execute(currentActor(req), { ...query, projectUuid: uuid }),
      );
    }),
  );

  router.post(
    '/demands',
    requirePermission('DEMAND_ACCESS', 'DEMAND_CREATE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = createSchema.parse({ ...req.body, projectUuid: uuid });
      return created(res, await deps.createDemand.execute(currentActor(req), body));
    }),
  );

  /** Feeds the searchable "responsável" combobox. */
  router.get(
    '/eligible-assignees',
    requirePermission('DEMAND_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      return ok(res, await deps.listEligibleAssignees.execute(currentActor(req), uuid, search));
    }),
  );

  return router;
}
