/**
 * The API contract as the frontend consumes it.
 *
 * Note what is absent: there is no numeric `id` anywhere. Every resource is addressed
 * by `uuid`, because that is the only identifier the backend publishes.
 */

export const PERMISSION_CODES = [
  'DEMAND_ACCESS',
  'DEMAND_KANBAN',
  'DEMAND_LIST',
  'DEMAND_VIEW_ALL',
  'DEMAND_CREATE',
  'DEMAND_CREATE_WITH_STATUS',
  'DEMAND_UPDATE',
  'DEMAND_MANAGE_ALL',
  'DEMAND_UPDATE_PRIORITY',
  'DEMAND_UPDATE_DUE_DATE',
  'DEMAND_UPDATE_RESPONSIBLE',
  'DEMAND_UPDATE_PROJECT',
  'DEMAND_MANAGE_PRODUCTION',
  'DEMAND_ARCHIVE',
  'DEMAND_DELETE',
  'DEMAND_BE_ASSIGNEE',
  'DEMAND_COMMENT',
  'DEMAND_WATCH',
  'DASHBOARD_ACCESS',
  'DASHBOARD_VIEW_OWN',
  'DASHBOARD_VIEW_ALL',
  'USER_ACCESS',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'PROJECT_ACCESS',
  'PROJECT_ACCESS_ALL',
  'PROJECT_CREATE',
  'PROJECT_UPDATE',
  'PROJECT_MANAGE_MEMBERS',
  'PROJECT_MANAGE_INTEGRATION',
  'ROLE_ACCESS',
  'ROLE_CREATE',
  'ROLE_UPDATE',
  'LOG_ACCESS',
  'LOG_VIEW_ORGANIZATION',
  'LOG_VIEW_SYSTEM',
  'INTEGRATION_ACCESS',
  'ASSISTANT_ACCESS',
  'ASSISTANT_MANAGE',
  'DOCS_ACCESS',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const DEMAND_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'IN_REVIEW',
  'PRODUCTION',
] as const;

export type DemandStatus = (typeof DEMAND_STATUSES)[number];

export const DEMAND_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type DemandPriority = (typeof DEMAND_PRIORITIES)[number];

export const DEMAND_SORTS = ['dueDate', 'createdAt', 'priority'] as const;

export type DemandSort = (typeof DEMAND_SORTS)[number];

export interface RoleRef {
  uuid: string;
  name: string;
  slug: string;
}

export interface LoginCandidate {
  uuid: string;
  name: string;
  avatarUrl: string | null;
  role: RoleRef;
}

export interface Session {
  user: { uuid: string; name: string; avatarUrl: string | null };
  role: { uuid: string; slug: string; name: string };
  permissions: PermissionCode[];
}

export interface User {
  uuid: string;
  name: string;
  /** Profile picture. `null`, or a URL that fails to load, falls back to the monogram. */
  avatarUrl: string | null;
  active: boolean;
  /** Soft-delete marker, independent of `active` — `null` means never excluded. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: RoleRef;
}

/** How many demands a user is responsible for, broken down by priority. */
export interface DemandPriorityCounts {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  URGENT: number;
}

/** How many demands a user is responsible for, broken down by status — concluídas included. */
export interface DemandStatusCounts {
  NOT_STARTED: number;
  IN_PROGRESS: number;
  PAUSED: number;
  IN_REVIEW: number;
  PRODUCTION: number;
}

export interface UserPageItem extends User {
  demandPriorityCounts: DemandPriorityCounts;
  demandStatusCounts: DemandStatusCounts;
}

export interface UserPage {
  items: UserPageItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Role {
  uuid: string;
  name: string;
  slug: string;
  isSystem: boolean;
  active: boolean;
  permissions: PermissionCode[];
}

export interface PermissionDefinition {
  code: PermissionCode;
  module: string;
  action: string;
  description: string;
  /** The permission this one is inert without, beyond the module's own ACCESS. */
  dependsOn?: PermissionCode;
  /** A data-scope grant that stays in effect without its module's ACCESS. */
  standalone?: true;
}

export interface PermissionModuleGroup {
  module: string;
  accessCode: PermissionCode;
  permissions: PermissionDefinition[];
}

/** Just enough of a member to draw them — the project card's avatar group. */
export interface ProjectMemberSummary {
  uuid: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
}

export interface Project {
  uuid: string;
  name: string;
  description: string;
  active: boolean;
  /** Filled by the listing; empty on single-project reads, which have their own endpoint. */
  members: ProjectMemberSummary[];
}

export interface IntegrationStatus {
  configured: boolean;
  apiKey: string | null;
  secretPreview: string | null;
  createdAt: string | null;
  rotatedAt: string | null;
}

/** Present only in the response of the call that generated it — never returned again. */
export interface GeneratedIntegrationCredential extends IntegrationStatus {
  apiSecret: string;
}

export interface DashboardRef {
  uuid: string;
  name: string;
}

export interface DashboardDistribution {
  median: number | null;
  p85: number | null;
  sample: number;
}

export type DashboardPeriod = 30 | 90;
export type DashboardDueBucket = 'overdue' | 'today' | 'week' | 'month' | 'later';

export interface DashboardDemand {
  uuid: string;
  title: string;
  status: DemandStatus;
  dueDate: string;
  /** `null` when the demand is not attached to any project. */
  project: DashboardRef | null;
  responsible: DashboardRef;
}

export type DashboardScope = 'personal' | 'team';

/** Every date is a calendar date (YYYY-MM-DD) on the server's business calendar. */
export interface Dashboard {
  generatedAt: string;
  today: string;
  timeZone: string;
  scope: {
    projectUuid: string | null;
    /** `personal`: demands the user is responsible for. `team`: every demand they can read. */
    kind: DashboardScope;
    /** Scopes this user may switch between, most comprehensive first. */
    available: DashboardScope[];
  };
  period: {
    days: DashboardPeriod;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  summary: {
    total: number;
    open: number;
    delivered: number;
    overdue: number;
    dueToday: number;
    dueSoon: number;
    stale: number;
  };
  flow: {
    throughput: { current: number; previous: number };
    arrivals: { current: number; previous: number };
    leadTimeDays: DashboardDistribution;
    cycleTimeDays: DashboardDistribution;
    onTime: { onTime: number; late: number; rate: number | null };
  };
  statusDistribution: { status: DemandStatus; count: number }[];
  dueBuckets: { bucket: DashboardDueBucket; count: number }[];
  weekly: { weekStart: string; arrivals: number; deliveries: number; partial: boolean }[];
  workload: { responsible: DashboardRef; open: number; overdue: number; dueSoon: number }[];
  projects: {
    project: DashboardRef;
    open: number;
    overdue: number;
    dueSoon: number;
    stale: number;
    delivered: number;
    onTimeRate: number | null;
  }[];
  attention: (DashboardDemand & { daysToDue: number })[];
  attentionTotal: number;
  stalled: (DashboardDemand & { daysInStatus: number; since: string })[];
}

export interface ProjectMember {
  userUuid: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
  role: RoleRef;
  memberSince: string;
}

export interface DemandAttachment {
  uuid: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  url: string;
  thumbnailUrl: string | null;
}

export interface ChecklistItem {
  uuid: string;
  title: string;
  done: boolean;
  position: number;
}

export interface Demand {
  uuid: string;
  title: string;
  /** Sanitized rich-text markup produced by the editor. Never render it raw. */
  description: string;
  status: DemandStatus;
  priority: DemandPriority;
  /** ISO calendar date (YYYY-MM-DD) — never a timestamp. */
  dueDate: string;
  isTerminal: boolean;
  archived: boolean;
  /** `null` when the demand is not attached to any project. */
  project: { uuid: string; name: string } | null;
  responsible: {
    uuid: string;
    name: string;
    avatarUrl: string | null;
    /** `false` when this person has been deactivated or excluded since being assigned. */
    active: boolean;
    /** Soft-delete marker of the responsible's own account — `null` unless excluded. */
    deletedAt: string | null;
  };
  createdBy: { uuid: string; name: string };
  attachmentCount: number;
  previewThumbnailUrl: string | null;
  attachments?: DemandAttachment[];
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DemandPage {
  items: Demand[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DemandFilterOptions {
  responsibles: { uuid: string; name: string }[];
}

export interface AssigneeOption {
  uuid: string;
  name: string;
  avatarUrl: string | null;
}

/** Plain text. Authorship is enforced by the server; `canEdit` only saves a round trip. */
export interface DemandComment {
  uuid: string;
  /** The top-level comment this one replies to. `null` for a top-level comment itself. */
  parentUuid: string | null;
  body: string;
  author: { uuid: string; name: string; avatarUrl: string | null };
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
}

export type LogCategory = 'ACTIVITY' | 'SYSTEM';
export type LogLevel = 'INFO' | 'WARNING' | 'ERROR';
export type LogSubjectType = 'DEMAND' | 'PROJECT' | 'USER' | 'ROLE' | 'SETTING';

export type AssistantAction =
  | 'CREATE_DEMAND'
  | 'EXECUTIVE_REPORT'
  | 'DAILY_SUMMARY'
  | 'RISK_ANALYSIS'
  | 'PLAN_CHECKLIST'
  | 'ASK_BOARD';

export type AssistantWrittenAction =
  'EXECUTIVE_REPORT' | 'DAILY_SUMMARY' | 'RISK_ANALYSIS' | 'ASK_BOARD';

export interface AssistantStatus {
  enabled: boolean;
  /** A key is stored — whether the provider accepts it is only known when it is used. */
  configured: boolean;
  provider: string;
  model: { id: string; label: string };
  /** Present only for ASSISTANT_MANAGE. The key itself never leaves the server. */
  management: {
    apiKeyPreview: string | null;
    models: { id: string; label: string; description: string }[];
    updatedAt: string | null;
    updatedBy: { uuid: string; name: string } | null;
  } | null;
}

export interface BrandingStatus {
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  updatedAt: string | null;
  updatedBy: { uuid: string; name: string } | null;
}

export interface AssistantCommand {
  /** Omitted for free text, which the server classifies first. */
  action?: AssistantAction;
  prompt?: string;
  projectUuid?: string;
  demandUuid?: string;
}

export interface AssistantMeta {
  model: string;
  latencyMs: number;
  classified: boolean;
  project: { uuid: string; name: string } | null;
  generatedAt: string;
}

/** Checked against the facts by the server: a doubtful field comes back blank, with a note. */
export interface AssistantDemandDraft {
  title: string;
  /** Plain text; "- " lines are acceptance criteria. */
  description: string;
  project: { uuid: string; name: string } | null;
  responsible: { uuid: string; name: string } | null;
  dueDate: string | null;
  checklist: string[];
  priority: DemandPriority;
  notes: string[];
}

export type AssistantAnswer = { meta: AssistantMeta } & (
  | { action: 'CREATE_DEMAND'; draft: AssistantDemandDraft }
  | {
      action: AssistantWrittenAction;
      title: string;
      /** Citations are already links to `/kanban?demanda=<uuid>`, built by the server. */
      markdown: string;
      citations: { uuid: string; title: string }[];
    }
  | {
      action: 'PLAN_CHECKLIST';
      demand: { uuid: string; title: string; project: { uuid: string; name: string } | null };
      plan: { items: string[]; rationale: string };
    }
  | { action: 'CLARIFY'; message: string; suggestedAction: AssistantAction | null }
);

/** Display values captured when the event happened — not identifiers to look up. */
export interface LogFieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface LogEntry {
  uuid: string;
  occurredAt: string;
  category: LogCategory;
  level: LogLevel;
  action: string;
  /** Server-written sentence; the fallback for any action the UI does not render richly. */
  summary: string;
  actor: { uuid: string; name: string } | null;
  subject: { type: LogSubjectType; uuid: string; label: string | null } | null;
  project: { uuid: string; name: string } | null;
  changes: LogFieldChange[];
  metadata: Record<string, unknown> | null;
  requestId: string | null;
}

export interface LogPage {
  items: LogEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LogActionOption {
  code: string;
  label: string;
  category: LogCategory;
  group: string;
  groupLabel: string;
}

export interface LogFilterOptions {
  categories: LogCategory[];
  canViewOrganization: boolean;
  actions: LogActionOption[];
  actors: { uuid: string; name: string }[];
  projects: { uuid: string; name: string }[];
}

export interface LogQuery {
  category?: LogCategory;
  level?: LogLevel;
  action?: string;
  actorUuid?: string;
  projectUuid?: string;
  subjectType?: LogSubjectType;
  from?: string;
  to?: string;
  search?: string;
  requestId?: string;
  page?: number;
  limit?: number;
}

/** Why a notification reached this person: their own demand, or one they chose to follow. */
export type NotificationReason = 'RESPONSIBLE' | 'WATCHER';

export interface AppNotification {
  uuid: string;
  reason: NotificationReason;
  /** An activity code, e.g. `demand.status_changed` — the same vocabulary as the logs. */
  action: string;
  /** A ready sentence in the actor's voice: "Moveu a demanda … de … para …". */
  summary: string;
  /** A snapshot: the demand may have been renamed or deleted since. */
  demand: { uuid: string; title: string };
  projectName: string | null;
  actor: { uuid: string; name: string } | null;
  changes: { field: string; from: string | null; to: string | null }[];
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}

/** A Server-Sent Event pushed the moment a change reaches this person. */
export interface NotificationStreamEvent {
  type: 'notification';
  notification: AppNotification;
  unreadCount: number;
}
