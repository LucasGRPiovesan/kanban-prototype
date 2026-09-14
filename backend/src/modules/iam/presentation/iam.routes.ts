import { type CookieOptions, Router } from 'express';
import { asyncHandler } from '../../../shared/http/error-handler';
import { currentActor, requirePermission } from '../../../shared/http/auth.middleware';
import { created, noContent, ok } from '../../../shared/http/response';
import {
  type GetCurrentSession,
  type ListLoginCandidates,
  type Login,
  type Logout,
} from '../application/use-cases/auth.use-cases';
import {
  type CreateRole,
  type GetPermissionCatalog,
  type ListAssignableRoles,
  type ListRoles,
  type NormalizePermissions,
  type UpdateRole,
} from '../application/use-cases/role.use-cases';
import {
  type CreateUser,
  type DeleteUser,
  type GetUser,
  type GetUserHistory,
  type ListUsers,
  type ListUsersPage,
  type RestoreUser,
  type UpdateOwnProfile,
  type UpdateUser,
} from '../application/use-cases/user.use-cases';
import {
  createRoleSchema,
  createUserSchema,
  deleteUserSchema,
  listUsersPageQuery,
  listUsersQuery,
  loginSchema,
  normalizePermissionsSchema,
  updateOwnProfileSchema,
  updateRoleSchema,
  updateUserSchema,
  userHistoryQuery,
  uuidParam,
} from './schemas';

export interface IamPresentationDeps {
  listLoginCandidates: ListLoginCandidates;
  login: Login;
  logout: Logout;
  getCurrentSession: GetCurrentSession;
  listUsers: ListUsers;
  listUsersPage: ListUsersPage;
  getUser: GetUser;
  getUserHistory: GetUserHistory;
  updateOwnProfile: UpdateOwnProfile;
  createUser: CreateUser;
  updateUser: UpdateUser;
  deleteUser: DeleteUser;
  restoreUser: RestoreUser;
  listRoles: ListRoles;
  listAssignableRoles: ListAssignableRoles;
  getPermissionCatalog: GetPermissionCatalog;
  createRole: CreateRole;
  updateRole: UpdateRole;
  normalizePermissions: NormalizePermissions;
  cookieName: string;
  cookieOptions: CookieOptions;
}

/**
 * Controllers are thin on purpose: parse input, call one use case, serialize output.
 * No branching on roles, no orchestration, no persistence — those belong to the layers
 * below and would be untestable up here.
 */
export function createAuthRouter(deps: IamPresentationDeps): Router {
  const router = Router();

  // Public: this *is* the login screen's user picker.
  router.get(
    '/candidates',
    asyncHandler(async (_req, res) => {
      return ok(res, await deps.listLoginCandidates.execute());
    }),
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const { token, session } = await deps.login.execute(body);
      // HttpOnly keeps the token out of reach of any script on the page, which is the
      // whole point of not storing it in localStorage.
      res.cookie(deps.cookieName, token, deps.cookieOptions);
      return ok(res, session);
    }),
  );

  // Public, like login: an expired session must still be able to sign out. The use case
  // records the event when the cookie still identifies someone and never blocks otherwise.
  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      const cookies = req.cookies as Record<string, string> | undefined;
      await deps.logout.execute(cookies?.[deps.cookieName] ?? null);
      res.clearCookie(deps.cookieName, { ...deps.cookieOptions, maxAge: undefined });
      return noContent(res);
    }),
  );

  return router;
}

/** Routes below this point are mounted behind `authenticate`. */
export function createSessionRouter(deps: IamPresentationDeps): Router {
  const router = Router();

  router.get('/me', (req, res) => ok(res, deps.getCurrentSession.execute(currentActor(req))));

  return router;
}

export function createUsersRouter(deps: IamPresentationDeps): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('USER_ACCESS'),
    asyncHandler(async (req, res) => {
      const query = listUsersQuery.parse(req.query);
      return ok(res, await deps.listUsers.execute(currentActor(req), query));
    }),
  );

  /**
   * The Usuários screen's page — registered ahead of any `/:uuid` route so "page" is
   * never swallowed by a uuid param, the same ordering `/demands/history` relies on.
   */
  router.get(
    '/page',
    requirePermission('USER_ACCESS'),
    asyncHandler(async (req, res) => {
      const query = listUsersPageQuery.parse(req.query);
      return ok(res, await deps.listUsersPage.execute(currentActor(req), query));
    }),
  );

  router.post(
    '/',
    requirePermission('USER_CREATE'),
    asyncHandler(async (req, res) => {
      const body = createUserSchema.parse(req.body);
      return created(res, await deps.createUser.execute(currentActor(req), body));
    }),
  );

  /**
   * Self-service: editing your own name and picture, no permission required beyond
   * being signed in. Registered ahead of `/:uuid` so "me" is never swallowed by a uuid
   * param — the same ordering `/demands/history` relies on.
   */
  router.patch(
    '/me',
    asyncHandler(async (req, res) => {
      const body = updateOwnProfileSchema.parse(req.body);
      return ok(res, await deps.updateOwnProfile.execute(currentActor(req), body));
    }),
  );

  router.get(
    '/:uuid',
    requirePermission('USER_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      return ok(res, await deps.getUser.execute(currentActor(req), uuid));
    }),
  );

  router.get(
    '/:uuid/history',
    requirePermission('USER_ACCESS'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const query = userHistoryQuery.parse(req.query);
      return ok(res, await deps.getUserHistory.execute(currentActor(req), uuid, query));
    }),
  );

  router.patch(
    '/:uuid',
    requirePermission('USER_UPDATE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = updateUserSchema.parse(req.body);
      return ok(res, await deps.updateUser.execute(currentActor(req), uuid, body));
    }),
  );

  /**
   * Soft delete. `requirePermission` names only USER_DELETE — its own guard already
   * requires USER_UPDATE too, the same double-check the route-level guard and the use
   * case both perform everywhere else in this codebase.
   */
  router.delete(
    '/:uuid',
    requirePermission('USER_DELETE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = deleteUserSchema.parse(req.body);
      await deps.deleteUser.execute(currentActor(req), uuid, body);
      return noContent(res);
    }),
  );

  router.post(
    '/:uuid/restore',
    requirePermission('USER_DELETE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      return ok(res, await deps.restoreUser.execute(currentActor(req), uuid));
    }),
  );

  return router;
}

export function createRolesRouter(deps: IamPresentationDeps): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      return ok(res, await deps.listRoles.execute(currentActor(req), { activeOnly: false }));
    }),
  );

  /**
   * Deliberately mounted before `/:uuid`-style routes and guarded by its own narrower
   * rule: the user form needs the profile list without granting ROLE_ACCESS.
   */
  router.get(
    '/assignable',
    asyncHandler(async (req, res) => {
      return ok(res, await deps.listAssignableRoles.execute(currentActor(req)));
    }),
  );

  router.get(
    '/permissions/catalog',
    requirePermission('ROLE_ACCESS'),
    (req, res) => ok(res, deps.getPermissionCatalog.execute(currentActor(req))),
  );

  router.post(
    '/permissions/normalize',
    requirePermission('ROLE_ACCESS'),
    (req, res) => {
      const body = normalizePermissionsSchema.parse(req.body);
      return ok(res, deps.normalizePermissions.execute(currentActor(req), body.permissions));
    },
  );

  router.post(
    '/',
    requirePermission('ROLE_CREATE'),
    asyncHandler(async (req, res) => {
      const body = createRoleSchema.parse(req.body);
      return created(res, await deps.createRole.execute(currentActor(req), body));
    }),
  );

  router.patch(
    '/:uuid',
    requirePermission('ROLE_UPDATE'),
    asyncHandler(async (req, res) => {
      const { uuid } = uuidParam.parse(req.params);
      const body = updateRoleSchema.parse(req.body);
      return ok(res, await deps.updateRole.execute(currentActor(req), uuid, body));
    }),
  );

  return router;
}
