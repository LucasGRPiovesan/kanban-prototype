import { api } from './client';
import type {
  AssigneeOption,
  AssistantAnswer,
  AssistantCommand,
  AssistantStatus,
  Dashboard,
  DashboardPeriod,
  Demand,
  DemandAttachment,
  DemandComment,
  DemandFilterOptions,
  DemandPage,
  DemandPriority,
  DemandSort,
  DemandStatus,
  GeneratedIntegrationCredential,
  IntegrationStatus,
  LogFilterOptions,
  LogPage,
  LogQuery,
  LoginCandidate,
  NotificationPage,
  PermissionCode,
  PermissionModuleGroup,
  Project,
  ProjectMember,
  Role,
  RoleRef,
  Session,
  User,
  UserPage,
} from './types';

/** One module per resource, so the query hooks never build URLs by hand. */

export const authApi = {
  candidates: () => api.get<LoginCandidate[]>('/auth/candidates'),
  login: (userUuid: string) => api.post<Session>('/auth/login', { userUuid }),
  logout: () => api.post<void>('/auth/logout'),
  me: () => api.get<Session>('/auth/me'),
};

export const usersApi = {
  list: (params: { search?: string; activeOnly?: boolean } = {}) =>
    api.get<User[]>(`/users${toQuery(params)}`),
  /**
   * The Usuários screen: one page at a time, with the total known up front — the same
   * offset pagination the Logs and Demandas screens use. `list` stays the unbounded
   * query the member pickers need.
   */
  page: (
    params: {
      search?: string;
      roleUuid?: string;
      /** Tri-state: omit for every user, `true`/`false` to ask for one of the two. */
      active?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ) => {
    // `active` is sent as a string on purpose: `toQuery` drops `false` the way it drops
    // an empty string, which is right for an "only the active ones" flag and wrong for a
    // tri-state one — "false" here means "show the inactive users", not "no filter".
    const { active, ...rest } = params;
    return api.get<UserPage>(
      `/users/page${toQuery({ ...rest, active: active === undefined ? undefined : String(active) })}`,
    );
  },
  /** The user profile screen. */
  get: (uuid: string) => api.get<User>(`/users/${uuid}`),
  create: (input: { name: string; roleUuid: string }) => api.post<User>('/users', input),
  update: (uuid: string, input: { name?: string; roleUuid?: string; active?: boolean }) =>
    api.patch<User>(`/users/${uuid}`, input),
  /**
   * Self-service: the signed-in user editing their own name and picture. No `roleUuid`
   * or `active` — those belong only to the administrative screen, `update` above.
   */
  updateMe: (input: { name?: string; avatarUrl?: string | null }) =>
    api.patch<User>('/users/me', input),
  /** The profile screen's "Atualizações" section. */
  history: (uuid: string, page?: number) =>
    api.get<LogPage>(`/users/${uuid}/history${toQuery({ page })}`),
  /**
   * Soft delete: the account is deactivated, kept, and every demand it was responsible
   * for is either deleted or archived — whichever the caller asks for.
   */
  remove: (uuid: string, demandAction: 'delete' | 'archive') =>
    api.delete<void>(`/users/${uuid}`, { demandAction }),
  /** Undoes a soft delete. `active` is left as the exclusion set it — see RestoreUser. */
  restore: (uuid: string) => api.post<User>(`/users/${uuid}/restore`, {}),
};

export const rolesApi = {
  list: () => api.get<Role[]>('/roles'),
  assignable: () => api.get<RoleRef[]>('/roles/assignable'),
  permissionCatalog: () => api.get<PermissionModuleGroup[]>('/roles/permissions/catalog'),
  create: (input: { name: string; permissions: PermissionCode[] }) =>
    api.post<Role>('/roles', input),
  update: (
    uuid: string,
    input: { name?: string; permissions?: PermissionCode[]; active?: boolean },
  ) => api.patch<Role>(`/roles/${uuid}`, input),
};

export const projectsApi = {
  list: (params: { search?: string; includeInactive?: boolean } = {}) =>
    api.get<Project[]>(`/projects${toQuery(params)}`),
  get: (uuid: string) => api.get<Project>(`/projects/${uuid}`),
  create: (input: { name: string; description: string; memberUuids?: string[] }) =>
    api.post<Project>('/projects', input),
  update: (uuid: string, input: { name?: string; description?: string; active?: boolean }) =>
    api.patch<Project>(`/projects/${uuid}`, input),
  members: (uuid: string) => api.get<ProjectMember[]>(`/projects/${uuid}/members`),
  addMember: (uuid: string, userUuid: string) =>
    api.post<void>(`/projects/${uuid}/members`, { userUuid }),
  removeMember: (uuid: string, userUuid: string) =>
    api.delete<void>(`/projects/${uuid}/members/${userUuid}`),
  eligibleAssignees: (uuid: string, search?: string) =>
    api.get<AssigneeOption[]>(`/projects/${uuid}/eligible-assignees${toQuery({ search })}`),
  integrationStatus: (uuid: string) => api.get<IntegrationStatus>(`/projects/${uuid}/integration`),
  generateIntegrationCredential: (uuid: string) =>
    api.post<GeneratedIntegrationCredential>(`/projects/${uuid}/integration/credentials`, {}),
  revokeIntegrationCredential: (uuid: string) =>
    api.delete<void>(`/projects/${uuid}/integration/credentials`),
};

export const demandsApi = {
  list: (
    params: {
      projectUuid?: string;
      search?: string;
      status?: DemandStatus;
      archived?: boolean;
    } = {},
  ) => api.get<Demand[]>(`/demands${toQuery(params)}`),
  /**
   * The Demandas screen: every demand ever created, as a page-numbered history — one
   * request per page index, mirroring `logsApi.list`. Unlike `list`, this is never meant
   * to be fetched in full: the whole point is bounding how much a single request pulls.
   * Named `historyPage` rather than `history` to stay distinct from the per-demand
   * activity log below, which already owns that name.
   */
  historyPage: (
    params: {
      projectUuid?: string;
      search?: string;
      status?: DemandStatus;
      priority?: DemandPriority;
      responsibleUuid?: string;
      sort?: DemandSort;
      page?: number;
      limit?: number;
      /** Drops the archived filter entirely, instead of narrowing to one state. */
      includeArchived?: boolean;
    } = {},
  ) => api.get<DemandPage>(`/demands/history${toQuery(params)}`),
  /** Option lists for the Demandas screen's filter bar. */
  filters: () => api.get<DemandFilterOptions>('/demands/filters'),
  /**
   * Who may be the responsible of a demand. Narrowed to a project when one is given;
   * everyone who may hold a demand at all when none is — which is the list a demand with
   * no project has to offer.
   */
  assignees: (params: { projectUuid?: string; search?: string } = {}) =>
    api.get<AssigneeOption[]>(`/demands/assignees${toQuery(params)}`),
  get: (uuid: string) => api.get<Demand>(`/demands/${uuid}`),
  create: (input: {
    /** Optional: a demand may belong to no project — see CreateDemand on the server. */
    projectUuid?: string | null;
    title: string;
    description: string;
    dueDate: string;
    responsibleUuid: string;
    /** Written with the demand, in one request — see CreateDemand on the server. */
    checklist?: string[];
    /** Column to start in — the Kanban's per-column "+". Omitted, it is NOT_STARTED. */
    status?: DemandStatus;
    /** Omitted, it defaults to MEDIUM — unlike status, no permission gates this field. */
    priority?: DemandPriority;
  }) => api.post<{ uuid: string }>('/demands', input),
  update: (
    uuid: string,
    input: {
      title?: string;
      description?: string;
      dueDate?: string;
      responsibleUuid?: string;
      /** `null` detaches the demand from its project; omitted leaves it untouched. */
      projectUuid?: string | null;
      priority?: DemandPriority;
    },
  ) => api.patch<{ uuid: string }>(`/demands/${uuid}`, input),
  move: (uuid: string, status: DemandStatus) =>
    api.patch<{ uuid: string; status: DemandStatus }>(`/demands/${uuid}/status`, { status }),
  archive: (uuid: string, archived: boolean) =>
    api.patch<{ uuid: string; archived: boolean }>(`/demands/${uuid}/archive`, { archived }),
  remove: (uuid: string) => api.delete<void>(`/demands/${uuid}`),
  addChecklistItem: (uuid: string, title: string) =>
    api.post<{ uuid: string }>(`/demands/${uuid}/checklist`, { title }),
  updateChecklistItem: (
    uuid: string,
    itemUuid: string,
    input: { title?: string; done?: boolean },
  ) => api.patch<void>(`/demands/${uuid}/checklist/${itemUuid}`, input),
  removeChecklistItem: (uuid: string, itemUuid: string) =>
    api.delete<void>(`/demands/${uuid}/checklist/${itemUuid}`),
  uploadAttachments: (uuid: string, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    return api.upload<DemandAttachment[]>(`/demands/${uuid}/attachments`, form);
  },
  removeAttachment: (uuid: string, attachmentUuid: string) =>
    api.delete<void>(`/demands/${uuid}/attachments/${attachmentUuid}`),
  history: (uuid: string, page?: number) =>
    api.get<LogPage>(`/demands/${uuid}/history${toQuery({ page })}`),
  comments: (uuid: string) => api.get<DemandComment[]>(`/demands/${uuid}/comments`),
  addComment: (uuid: string, body: string) =>
    api.post<DemandComment>(`/demands/${uuid}/comments`, { body }),
  editComment: (uuid: string, commentUuid: string, body: string) =>
    api.patch<DemandComment>(`/demands/${uuid}/comments/${commentUuid}`, { body }),
  removeComment: (uuid: string, commentUuid: string) =>
    api.delete<void>(`/demands/${uuid}/comments/${commentUuid}`),
  /** Demands the signed-in person chose to be notified about. */
  watching: () => api.get<{ demandUuids: string[] }>('/demands/watching'),
  watch: (uuid: string) =>
    api.put<{ demandUuid: string; watching: boolean }>(`/demands/${uuid}/watch`),
  unwatch: (uuid: string) =>
    api.delete<{ demandUuid: string; watching: boolean }>(`/demands/${uuid}/watch`),
};

/** The signed-in person's own inbox — never anyone else's, so no permission gates it. */
export const notificationsApi = {
  list: (params: { unreadOnly?: boolean; limit?: number; before?: string } = {}) =>
    api.get<NotificationPage>(`/notifications${toQuery(params)}`),
  unreadCount: () => api.get<{ unreadCount: number }>('/notifications/unread-count'),
  markRead: (uuids: string[]) =>
    api.post<{ unreadCount: number }>('/notifications/read', { uuids }),
  markAllRead: () => api.post<{ unreadCount: number }>('/notifications/read-all'),
  streamPath: '/notifications/stream',
};

export const logsApi = {
  list: (query: LogQuery) =>
    api.get<LogPage>(`/logs${toQuery(query as Record<string, string | number | undefined>)}`),
  filters: () => api.get<LogFilterOptions>('/logs/filters'),
};

export const dashboardApi = {
  get: (query: { projectUuid?: string; period: DashboardPeriod }) =>
    api.get<Dashboard>(
      `/dashboard${toQuery({ projectUuid: query.projectUuid, period: query.period })}`,
    ),
};

export const assistantApi = {
  status: () => api.get<AssistantStatus>('/assistant'),
  updateSettings: (input: { enabled?: boolean; model?: string; apiKey?: string }) =>
    api.patch<AssistantStatus>('/assistant/settings', input),
  run: (command: AssistantCommand) => api.post<AssistantAnswer>('/assistant/commands', command),
};

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== '' && value !== false,
  );
  if (entries.length === 0) {
    return '';
  }
  const search = new URLSearchParams(entries.map(([key, value]) => [key, String(value)]));
  return `?${search.toString()}`;
}
