import { type PrismaClient } from '@prisma/client';
import { type CookieOptions } from 'express';
import path from 'node:path';
import { type AppEnv } from '../config/env';
import { LocalFileStorage } from '../shared/infrastructure/local-file-storage';
import { VercelBlobStorage } from '../shared/infrastructure/vercel-blob-storage';
import { SharpImageProcessor } from '../shared/infrastructure/sharp-image-processor';
import { SanitizeHtmlAdapter } from '../shared/infrastructure/sanitize-html.adapter';
import { PrismaDatabase } from '../shared/infrastructure/prisma-database';
import { type FileStoragePort, type ImageProcessorPort } from '../shared/application/file-storage.port';
import { type HtmlSanitizer } from '../shared/application/html-sanitizer.port';

import { JwtTokenService } from '../modules/iam/infrastructure/jwt-token.service';
import { PrismaRoleRepository } from '../modules/iam/infrastructure/prisma-role.repository';
import {
  PrismaEffectivePermissionsResolver,
  PrismaUserRepository,
} from '../modules/iam/infrastructure/prisma-user.repository';
import {
  GetCurrentSession,
  ListLoginCandidates,
  Login,
  Logout,
  ResolveActor,
} from '../modules/iam/application/use-cases/auth.use-cases';
import {
  CreateRole,
  GetPermissionCatalog,
  ListAssignableRoles,
  ListRoles,
  NormalizePermissions,
  UpdateRole,
} from '../modules/iam/application/use-cases/role.use-cases';
import {
  CreateUser,
  DeleteUser,
  GetUser,
  GetUserHistory,
  ListUsers,
  ListUsersPage,
  RestoreUser,
  UpdateOwnProfile,
  UpdateUser,
  UploadOwnAvatar,
} from '../modules/iam/application/use-cases/user.use-cases';
import { type IamPresentationDeps } from '../modules/iam/presentation/iam.routes';

import {
  PrismaIntegrationCredentialRepository,
  PrismaProjectMemberRepository,
  PrismaProjectRepository,
} from '../modules/projects/infrastructure/prisma-project.repository';
import { JwtIntegrationTokenService } from '../modules/projects/infrastructure/jwt-integration-token.service';
import {
  AddProjectMember,
  CreateProject,
  GetProject,
  ListProjectMembers,
  ListProjects,
  ProjectAccessResolver,
  RemoveProjectMember,
  UpdateProject,
} from '../modules/projects/application/use-cases/project.use-cases';
import {
  AuthenticateIntegrationRequest,
  GenerateIntegrationCredential,
  GetIntegrationStatus,
  IssueIntegrationAccessToken,
  RevokeIntegrationCredential,
} from '../modules/projects/application/use-cases/integration.use-cases';
import { type ProjectsPresentationDeps } from '../modules/projects/presentation/projects.routes';
import { type IntegrationAuthPresentationDeps } from '../modules/projects/presentation/integration-auth.routes';

import {
  PrismaAssigneeDirectory,
  PrismaAttachmentRepository,
  PrismaDemandRepository,
} from '../modules/demands/infrastructure/prisma-demand.repository';
import { PrismaCommentRepository } from '../modules/demands/infrastructure/prisma-comment.repository';
import {
  AddChecklistItem,
  ArchiveDemand,
  CreateDemand,
  DeleteDemand,
  DemandAccessGuard,
  GetDemand,
  GetDemandFilters,
  ListDemands,
  ListDemandsPage,
  ListEligibleAssignees,
  MoveDemand,
  RemoveChecklistItem,
  UpdateChecklistItem,
  UpdateDemand,
} from '../modules/demands/application/use-cases/demand.use-cases';
import {
  DeleteAttachment,
  UploadAttachments,
} from '../modules/demands/application/use-cases/attachment.use-cases';
import {
  AddDemandComment,
  DeleteDemandComment,
  EditDemandComment,
  GetDemandHistory,
  ListDemandComments,
} from '../modules/demands/application/use-cases/comment.use-cases';
import {
  CreateDemandViaIntegration,
  MoveDemandViaIntegration,
  UpdateDemandViaIntegration,
} from '../modules/demands/application/use-cases/integration-demand.use-cases';
import { DemandActivityLog } from '../modules/demands/application/demand-activity';
import { type DemandsPresentationDeps } from '../modules/demands/presentation/demands.routes';
import { type IntegrationDemandsPresentationDeps } from '../modules/demands/presentation/integration-demands.routes';

import {
  PrismaActivityRecorder,
  PrismaLogQueries,
  PrismaSystemLogger,
} from '../modules/logs/infrastructure/prisma-log.store';
import { GetLogFilters, ListLogs } from '../modules/logs/application/use-cases';
import { type LogsPresentationDeps } from '../modules/logs/presentation/logs.routes';
import { PrismaDemandFlowQueries } from '../modules/logs/infrastructure/prisma-demand-flow.queries';

import {
  PrismaNotificationRepository,
  PrismaRecipientDirectory,
  PrismaWatcherRepository,
} from '../modules/notifications/infrastructure/prisma-notification.store';
import { InMemoryNotificationHub } from '../modules/notifications/infrastructure/in-memory-notification-hub';
import { NotifyDemandChange } from '../modules/notifications/application/notify-demand-change';
import {
  GetUnreadNotificationCount,
  ListNotifications,
  ListWatchedDemands,
  MarkAllNotificationsRead,
  MarkNotificationsRead,
  SetDemandWatch,
} from '../modules/notifications/application/use-cases';
import { type NotificationsPresentationDeps } from '../modules/notifications/presentation/notifications.routes';

import { GetDashboard } from '../modules/dashboard/application/get-dashboard';
import { type DashboardPresentationDeps } from '../modules/dashboard/presentation/dashboard.routes';

import {
  GetAssistantStatus,
  RunAssistantCommand,
  UpdateAssistantSettings,
} from '../modules/assistant/application/assistant.use-cases';
import { type LanguageModelProvider } from '../modules/assistant/application/ports';
import { GeminiLanguageModels } from '../modules/assistant/infrastructure/gemini-language-model';
import { PrismaAssistantSettingsRepository } from '../modules/assistant/infrastructure/prisma-assistant-settings.repository';
import { type AssistantPresentationDeps } from '../modules/assistant/presentation/assistant.routes';
import { PrismaDemandActivityQueries } from '../modules/logs/infrastructure/prisma-demand-activity.queries';
import { type RateLimiter } from '../shared/application/rate-limiter.port';
import {
  ASSISTANT_KEY_PURPOSE,
  AesGcmSecretCipher,
} from '../shared/infrastructure/aes-gcm-secret-cipher';
import { SlidingWindowRateLimiter } from '../shared/infrastructure/sliding-window-rate-limiter';

export interface AppDependencies {
  iam: IamPresentationDeps;
  projects: ProjectsPresentationDeps;
  demands: DemandsPresentationDeps;
  logs: LogsPresentationDeps;
  dashboard: DashboardPresentationDeps;
  assistant: AssistantPresentationDeps;
  notifications: NotificationsPresentationDeps;
  resolveActor: ResolveActor;
  tokens: JwtTokenService;
  storage: FileStoragePort;
  /** Directory served at /files — local driver only; null when files live elsewhere. */
  storageLocalDir: string | null;
  /** Per-IP throttles of the public endpoints (login, integration token exchange). */
  publicRateLimiters: PublicRateLimiters;
  cookieName: string;
  /** Exposed so the error handler can report failures and shutdown can flush pending writes. */
  systemLogger: PrismaSystemLogger;
  /** The demand-integration API: a public token exchange, a bearer gate, and the writes behind it. */
  integration: {
    auth: IntegrationAuthPresentationDeps;
    authenticate: AuthenticateIntegrationRequest;
    demands: IntegrationDemandsPresentationDeps;
  };
}

/** Test seams: the collaborators that reach outside this process or keep time-based state. */
export interface DependencyOverrides {
  languageModels?: LanguageModelProvider;
  assistantRateLimiter?: RateLimiter;
  publicRateLimiters?: PublicRateLimiters;
}

export interface PublicRateLimiters {
  login: RateLimiter;
  integrationToken: RateLimiter;
}

/** The automated suites log in hundreds of times a minute from one address. */
const UNLIMITED: RateLimiter = { consume: () => ({ allowed: true, retryAfterSeconds: 0 }) };

/**
 * The composition root: the one place that knows about concrete implementations.
 *
 * Wiring is explicit rather than reflection-based — a container would hide exactly the
 * dependency graph this architecture is trying to make visible, and would let a domain
 * layer accidentally acquire an infrastructure dependency without anyone noticing.
 * Swapping LocalFileStorage for an S3 adapter is a one-line change here and nowhere else.
 */
export function buildDependencies(
  env: AppEnv,
  prisma: PrismaClient,
  overrides: DependencyOverrides = {},
): AppDependencies {
  // --- Infrastructure ---
  // Local disk for Docker and development; Vercel Blob where the filesystem is ephemeral.
  // env.ts already refused a vercel-blob configuration that cannot authenticate. The
  // adapter only needs to know *which* store; credentials (OIDC on Vercel, a read-write
  // token elsewhere) are resolved by the Blob SDK itself.
  const storageDir =
    env.STORAGE_DRIVER === 'local' ? path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR) : null;
  const storage: FileStoragePort =
    storageDir !== null
      ? new LocalFileStorage(storageDir, env.STORAGE_PUBLIC_BASE_URL)
      : new VercelBlobStorage({
          storeId: env.BLOB_STORE_ID,
          readWriteToken: env.BLOB_READ_WRITE_TOKEN,
          publicBaseUrl: env.BLOB_PUBLIC_BASE_URL,
        });
  const images: ImageProcessorPort = new SharpImageProcessor();
  // Rich text crosses a trust boundary twice — in from an editor, out to a browser —
  // so the concrete sanitizer is chosen here and nowhere else.
  const htmlSanitizer: HtmlSanitizer = new SanitizeHtmlAdapter();
  const tokens = new JwtTokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN);

  // One database handle shared by every repository, so a unit of work opened by a use
  // case reaches all of them. The same object is the UnitOfWork the use cases receive.
  const database = new PrismaDatabase(prisma);
  const uow = database;

  const roleRepository = new PrismaRoleRepository(database);
  const userRepository = new PrismaUserRepository(database);
  const permissionsResolver = new PrismaEffectivePermissionsResolver(database);

  const projectRepository = new PrismaProjectRepository(database);
  const projectMemberRepository = new PrismaProjectMemberRepository(database);
  const integrationCredentialRepository = new PrismaIntegrationCredentialRepository(database);

  const demandRepository = new PrismaDemandRepository(database);
  const attachmentRepository = new PrismaAttachmentRepository(database);
  const assigneeDirectory = new PrismaAssigneeDirectory(database);
  const commentRepository = new PrismaCommentRepository(database);

  // --- Logs ---
  // Activity joins the caller's transaction; system events deliberately use the root
  // client so they survive the rollback of the work they report on.
  const activityRecorder = new PrismaActivityRecorder(database);
  const systemLogger = new PrismaSystemLogger(prisma);
  const logQueries = new PrismaLogQueries(database);

  // --- Cross-module collaborators ---
  // Demands depends on the *projects* application service rather than on its tables:
  // module boundaries hold, and project-access semantics stay owned by one module.
  const projectAccess = new ProjectAccessResolver(projectMemberRepository);
  const demandGuard = new DemandAccessGuard(demandRepository, projectAccess);
  // --- Notifications ---
  // Every recorded demand change is also announced to Notifications, which decides who
  // hears about it; the rows join the change's transaction, the live push waits for commit.
  const notificationRepository = new PrismaNotificationRepository(database);
  const watcherRepository = new PrismaWatcherRepository(database);
  const notificationHub = new InMemoryNotificationHub();
  const notifyDemandChange = new NotifyDemandChange(
    new PrismaRecipientDirectory(database),
    notificationRepository,
    notificationHub,
    database,
  );
  const demandActivity = new DemandActivityLog(demandRepository, activityRecorder, notifyDemandChange);

  const resolveActor = new ResolveActor(permissionsResolver);

  // --- Demand-integration API ---
  // A JWT service of its own: the two credentials (a user session, a project's
  // integration token) must never verify against each other's shape. See
  // `JwtIntegrationTokenService` for how the token payload keeps that true even
  // though both happen to share the same signing secret.
  const integrationTokens = new JwtIntegrationTokenService(
    env.JWT_SECRET,
    env.INTEGRATION_TOKEN_EXPIRES_IN,
  );
  const authenticateIntegrationRequest = new AuthenticateIntegrationRequest(
    integrationCredentialRepository,
    integrationTokens,
  );

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    // Secure by default in production (AUTH_COOKIE_SECURE overrides): `secure` over plain
    // HTTP on a non-localhost host would silently drop the cookie and break login.
    secure: env.authCookieSecure,
    // Lax unless the API is deliberately served from another site — see AUTH_COOKIE_SAMESITE.
    // Lax is also the first CSRF layer; originGuard is the second.
    sameSite: env.AUTH_COOKIE_SAMESITE,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  };

  const demandFlowQueries = new PrismaDemandFlowQueries(database);
  const getDashboard = new GetDashboard(
    demandRepository,
    demandFlowQueries,
    projectRepository,
    projectAccess,
    env.APP_TIMEZONE,
  );

  // --- AI assistant ---
  // The key is decrypted from the stored configuration on each request, so a key or model
  // changed on screen applies to the very next call. The limiter is per user: the provider
  // quota is shared by the whole installation, and one person must not exhaust it.
  const assistantSettings = new PrismaAssistantSettingsRepository(database);
  const assistantCipher = new AesGcmSecretCipher(env.JWT_SECRET, ASSISTANT_KEY_PURPOSE);
  const languageModels =
    overrides.languageModels ?? new GeminiLanguageModels(assistantCipher, { timeoutMs: 25_000 });
  const assistantRateLimiter =
    overrides.assistantRateLimiter ?? new SlidingWindowRateLimiter(20, 5 * 60_000);

  return {
    resolveActor,
    tokens,
    storage,
    storageLocalDir: storageDir,
    publicRateLimiters:
      overrides.publicRateLimiters ??
      (env.isTest
        ? { login: UNLIMITED, integrationToken: UNLIMITED }
        : {
            login: new SlidingWindowRateLimiter(60, 60_000),
            integrationToken: new SlidingWindowRateLimiter(20, 60_000),
          }),
    cookieName: env.AUTH_COOKIE_NAME,
    systemLogger,

    iam: {
      listLoginCandidates: new ListLoginCandidates(userRepository),
      login: new Login(permissionsResolver, tokens, activityRecorder),
      logout: new Logout(tokens, resolveActor, activityRecorder),
      getCurrentSession: new GetCurrentSession(),
      listUsers: new ListUsers(userRepository),
      listUsersPage: new ListUsersPage(userRepository),
      getUser: new GetUser(userRepository),
      getUserHistory: new GetUserHistory(logQueries),
      updateOwnProfile: new UpdateOwnProfile(userRepository, userRepository, uow, activityRecorder),
      uploadOwnAvatar: new UploadOwnAvatar(userRepository, userRepository, storage, uow, activityRecorder),
      maxAvatarSizeBytes: env.uploadMaxFileSizeBytes,
      createUser: new CreateUser(userRepository, userRepository, uow, activityRecorder),
      updateUser: new UpdateUser(userRepository, userRepository, uow, activityRecorder),
      deleteUser: new DeleteUser(
        userRepository,
        userRepository,
        demandRepository,
        demandRepository,
        attachmentRepository,
        storage,
        uow,
        activityRecorder,
        demandActivity,
        systemLogger,
      ),
      restoreUser: new RestoreUser(userRepository, userRepository, uow, activityRecorder),
      listRoles: new ListRoles(roleRepository),
      listAssignableRoles: new ListAssignableRoles(roleRepository),
      getPermissionCatalog: new GetPermissionCatalog(),
      createRole: new CreateRole(roleRepository, uow, activityRecorder),
      updateRole: new UpdateRole(roleRepository, uow, activityRecorder),
      normalizePermissions: new NormalizePermissions(),
      cookieName: env.AUTH_COOKIE_NAME,
      cookieOptions,
    },

    projects: {
      listProjects: new ListProjects(projectRepository, projectAccess, projectMemberRepository),
      getProject: new GetProject(projectRepository, projectAccess),
      createProject: new CreateProject(projectRepository, projectMemberRepository, uow, activityRecorder),
      updateProject: new UpdateProject(projectRepository, projectAccess, uow, activityRecorder),
      listProjectMembers: new ListProjectMembers(projectMemberRepository, projectAccess),
      addProjectMember: new AddProjectMember(
        projectMemberRepository,
        projectRepository,
        uow,
        activityRecorder,
        projectAccess,
      ),
      removeProjectMember: new RemoveProjectMember(
        projectMemberRepository,
        projectRepository,
        uow,
        activityRecorder,
        projectAccess,
      ),
      getIntegrationStatus: new GetIntegrationStatus(
        projectRepository,
        projectAccess,
        integrationCredentialRepository,
      ),
      generateIntegrationCredential: new GenerateIntegrationCredential(
        projectRepository,
        projectAccess,
        integrationCredentialRepository,
        uow,
        activityRecorder,
      ),
      revokeIntegrationCredential: new RevokeIntegrationCredential(
        projectRepository,
        projectAccess,
        integrationCredentialRepository,
        uow,
        activityRecorder,
      ),
    },

    demands: {
      listDemands: new ListDemands(demandRepository, projectAccess, storage),
      listDemandsPage: new ListDemandsPage(demandRepository, projectAccess, storage),
      getDemandFilters: new GetDemandFilters(demandRepository, projectAccess),
      getDemand: new GetDemand(demandGuard, demandRepository, storage),
      createDemand: new CreateDemand(
        demandRepository,
        assigneeDirectory,
        projectAccess,
        htmlSanitizer,
        uow,
        demandActivity,
      ),
      updateDemand: new UpdateDemand(
        demandGuard,
        demandRepository,
        assigneeDirectory,
        projectAccess,
        htmlSanitizer,
        uow,
        demandActivity,
      ),
      moveDemand: new MoveDemand(demandGuard, demandRepository, uow, demandActivity),
      archiveDemand: new ArchiveDemand(demandGuard, demandRepository, uow, demandActivity),
      deleteDemand: new DeleteDemand(
        demandGuard,
        demandRepository,
        attachmentRepository,
        storage,
        uow,
        demandActivity,
        systemLogger,
      ),
      listEligibleAssignees: new ListEligibleAssignees(assigneeDirectory, projectAccess),
      addChecklistItem: new AddChecklistItem(demandGuard, demandRepository, uow, demandActivity),
      updateChecklistItem: new UpdateChecklistItem(demandGuard, demandRepository, uow, demandActivity),
      removeChecklistItem: new RemoveChecklistItem(demandGuard, demandRepository, uow, demandActivity),
      uploadAttachments: new UploadAttachments(
        demandGuard,
        attachmentRepository,
        storage,
        images,
        uow,
        demandActivity,
      ),
      deleteAttachment: new DeleteAttachment(
        demandGuard,
        attachmentRepository,
        storage,
        uow,
        demandActivity,
        systemLogger,
      ),
      listDemandComments: new ListDemandComments(demandGuard, commentRepository),
      addDemandComment: new AddDemandComment(demandGuard, commentRepository, uow, demandActivity),
      editDemandComment: new EditDemandComment(demandGuard, commentRepository, uow, demandActivity),
      deleteDemandComment: new DeleteDemandComment(demandGuard, commentRepository, uow, demandActivity),
      getDemandHistory: new GetDemandHistory(demandGuard, logQueries),
      maxFileSizeBytes: env.uploadMaxFileSizeBytes,
      maxFilesPerRequest: env.UPLOAD_MAX_FILES_PER_REQUEST,
    },

    dashboard: { getDashboard },

    notifications: {
      listNotifications: new ListNotifications(notificationRepository),
      getUnreadCount: new GetUnreadNotificationCount(notificationRepository),
      markRead: new MarkNotificationsRead(notificationRepository),
      markAllRead: new MarkAllNotificationsRead(notificationRepository),
      listWatchedDemands: new ListWatchedDemands(watcherRepository),
      setDemandWatch: new SetDemandWatch(demandGuard, watcherRepository),
      hub: notificationHub,
      notificationRepository,
      streamOptions: {
        pollIntervalMs: env.NOTIFICATION_POLL_INTERVAL_SECONDS * 1000,
        maxDurationMs: env.NOTIFICATION_STREAM_MAX_SECONDS * 1000,
      },
    },

    assistant: {
      getStatus: new GetAssistantStatus(assistantSettings),
      updateSettings: new UpdateAssistantSettings(
        assistantSettings,
        assistantCipher,
        uow,
        activityRecorder,
      ),
      runCommand: new RunAssistantCommand({
        settings: assistantSettings,
        models: languageModels,
        rateLimiter: assistantRateLimiter,
        demands: demandRepository,
        flow: demandFlowQueries,
        activity: new PrismaDemandActivityQueries(database),
        projects: projectRepository,
        projectAccess,
        assignees: assigneeDirectory,
        demandGuard,
        dashboard: getDashboard,
        systemLogger,
        timeZone: env.APP_TIMEZONE,
      }),
    },

    logs: {
      listLogs: new ListLogs(logQueries, projectAccess),
      getLogFilters: new GetLogFilters(logQueries, projectAccess, projectRepository),
    },

    integration: {
      auth: {
        issueAccessToken: new IssueIntegrationAccessToken(
          integrationCredentialRepository,
          integrationTokens,
        ),
      },
      authenticate: authenticateIntegrationRequest,
      demands: {
        createDemand: new CreateDemandViaIntegration(
          demandRepository,
          assigneeDirectory,
          htmlSanitizer,
          uow,
          demandActivity,
        ),
        updateDemand: new UpdateDemandViaIntegration(
          demandRepository,
          assigneeDirectory,
          htmlSanitizer,
          uow,
          demandActivity,
        ),
        moveDemand: new MoveDemandViaIntegration(demandRepository, uow, demandActivity),
      },
    },
  };
}
