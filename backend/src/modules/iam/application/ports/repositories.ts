import { type Uuid } from '../../../../shared/domain/identifier';
import { type PermissionCode } from '../../domain/permission';
import { type Role } from '../../domain/role';
import { type User } from '../../domain/user';

/**
 * Ports are narrow and purpose-built (ISP): each method exists because a concrete use
 * case needs it. There is deliberately no generic `Repository<T>` — a universal
 * repository forces every aggregate to share a lowest-common-denominator contract and
 * pushes query knowledge back into the application layer.
 */

export interface RoleRepository {
  findByUuid(uuid: Uuid): Promise<Role | null>;
  findBySlug(slug: string): Promise<Role | null>;
  listAll(filter?: { activeOnly?: boolean }): Promise<Role[]>;
  create(role: Role): Promise<Role>;
  /** Persists role attributes and its permission grants atomically. */
  update(role: Role): Promise<Role>;
  existsBySlug(slug: string, exceptUuid?: Uuid): Promise<boolean>;
}

export interface UserListFilter {
  activeOnly?: boolean;
  /**
   * Tri-state, unlike `activeOnly`: `true` lists only active users, `false` only
   * inactive ones, `undefined` both. The listing screen needs to ask for the inactive
   * ones on their own, which a boolean "only the active ones" flag cannot express.
   */
  active?: boolean;
  search?: string;
  roleUuid?: Uuid;
}

export interface UserRepository {
  findByUuid(uuid: Uuid): Promise<User | null>;
  list(filter?: UserListFilter): Promise<User[]>;
  create(user: User): Promise<User>;
  update(user: User): Promise<User>;
  existsByName(name: string, exceptUuid?: Uuid): Promise<boolean>;
}

/** Read model for a user together with the role data the UI needs. */
export interface UserWithRoleView {
  userUuid: string;
  name: string;
  /** Absolute URL of a profile picture, or `null` — the UI falls back to the monogram. */
  avatarUrl: string | null;
  active: boolean;
  /** Soft-delete marker, independent of `active` — see the `User` aggregate. */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role: { uuid: string; name: string; slug: string };
}

/** How many demands a user is responsible for, broken down by priority. */
export interface DemandPriorityCounts {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  URGENT: number;
}

export interface UserPageRow extends UserWithRoleView {
  /**
   * Excludes archived demands: a workload count is about what is still live, not
   * everything the person has ever held. Counted regardless of lifecycle status —
   * including produção — since the point is "how much", not "how far along".
   */
  demandPriorityCounts: DemandPriorityCounts;
}

export interface UserPageView {
  items: UserPageRow[];
  total: number;
}

export interface UserQueries {
  listWithRole(filter?: UserListFilter): Promise<UserWithRoleView[]>;
  /**
   * The Usuários screen's page. Offset-paged like the Logs and Demandas screens, so the
   * total is known up front and any page is one request away; `listWithRole` stays the
   * unbounded query the member pickers need.
   */
  listWithRolePage(
    filter: UserListFilter,
    page: { page: number; limit: number },
  ): Promise<UserPageView>;
  findWithRole(uuid: Uuid): Promise<UserWithRoleView | null>;
}

/**
 * Resolves the permissions actually in force for a user, on every request.
 * Kept separate from UserRepository because authentication needs it on a hot path and
 * has no use for the full aggregate.
 */
export interface EffectivePermissionsResolver {
  resolve(userUuid: Uuid): Promise<{
    userUuid: string;
    name: string;
    avatarUrl: string | null;
    active: boolean;
    roleUuid: string;
    roleSlug: string;
    roleName: string;
    permissions: PermissionCode[];
  } | null>;
}
