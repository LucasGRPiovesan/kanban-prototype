import { type Uuid } from '../../../../shared/domain/identifier';
import { type ProjectIntegrationCredential } from '../../domain/integration-credential';
import { type Project } from '../../domain/project';

export interface ProjectListFilter {
  activeOnly?: boolean;
  search?: string;
  /** `null` means unrestricted; an array restricts the result to those project uuids. */
  restrictToUuids?: readonly string[] | null;
}

export interface ProjectRepository {
  findByUuid(uuid: Uuid): Promise<Project | null>;
  list(filter?: ProjectListFilter): Promise<Project[]>;
  create(project: Project): Promise<Project>;
  update(project: Project): Promise<Project>;
  existsByName(name: string, exceptUuid?: Uuid): Promise<boolean>;
}

export interface ProjectMemberView {
  userUuid: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
  role: { uuid: string; name: string; slug: string };
  memberSince: Date;
}

/** Just enough of a member to draw them: the project listing's avatar group. */
export interface ProjectMemberSummary {
  uuid: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
}

export interface ProjectMemberRepository {
  /** Project uuids the user is allocated to — the input of ProjectAccessPolicy. */
  listProjectUuidsOfUser(userUuid: Uuid): Promise<string[]>;
  listMembers(projectUuid: Uuid): Promise<ProjectMemberView[]>;
  /** Allocations of many projects in one query, keyed by project uuid. */
  listMemberSummaries(projectUuids: readonly string[]): Promise<Map<string, ProjectMemberSummary[]>>;
  isMember(projectUuid: Uuid, userUuid: Uuid): Promise<boolean>;
  add(projectUuid: Uuid, userUuid: Uuid): Promise<void>;
  remove(projectUuid: Uuid, userUuid: Uuid): Promise<void>;
  /** Replaces the whole allocation of a project in one transaction. */
  replaceMembers(projectUuid: Uuid, userUuids: readonly Uuid[]): Promise<void>;
  countDemandsOfMember(projectUuid: Uuid, userUuid: Uuid): Promise<number>;
}

/**
 * One credential per project, addressed both by the project it belongs to (for the
 * management screen) and by its own `apiKey` (the only thing an inbound token-exchange
 * request carries before it is authenticated).
 */
export interface IntegrationCredentialRepository {
  findByProjectUuid(projectUuid: Uuid): Promise<ProjectIntegrationCredential | null>;
  findByApiKey(apiKey: string): Promise<ProjectIntegrationCredential | null>;
  /** Upsert by project: a fresh row on first generation, replaced in place on rotation. */
  save(credential: ProjectIntegrationCredential): Promise<ProjectIntegrationCredential>;
  deleteByProjectUuid(projectUuid: Uuid): Promise<void>;
}
