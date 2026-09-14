import { DomainError } from '../domain/errors';
import { type Uuid } from '../domain/identifier';
import { type PermissionCode } from '../../modules/iam/domain/permission';
import { type PermissionSet } from '../../modules/iam/domain/permission-set';

/**
 * The authenticated caller, as every use case sees it.
 *
 * Permissions are resolved from the database on each request rather than read out of
 * the JWT, so an administrator revoking a permission takes effect immediately instead
 * of waiting for old tokens to expire.
 */
export class Actor {
  constructor(
    readonly userUuid: Uuid,
    readonly name: string,
    readonly roleUuid: Uuid,
    readonly roleSlug: string,
    readonly roleName: string,
    readonly permissions: PermissionSet,
    /** Optional so every existing call site — production and test alike — stays valid. */
    readonly avatarUrl: string | null = null,
  ) {}

  can(permission: PermissionCode): boolean {
    return this.permissions.has(permission);
  }

  /** Guard used by use cases. Throws a domain error the API maps to 403. */
  require(permission: PermissionCode): void {
    if (!this.can(permission)) {
      throw DomainError.forbidden(
        'PERMISSION_DENIED',
        `Ação não permitida para o seu perfil (${permission}).`,
      );
    }
  }

  requireAll(permissions: readonly PermissionCode[]): void {
    permissions.forEach((permission) => this.require(permission));
  }

  /** True when the actor may see every project regardless of allocation. */
  hasGlobalProjectAccess(): boolean {
    return this.can('PROJECT_ACCESS_ALL');
  }

  /**
   * True when the actor reads the whole board rather than only their own cards.
   *
   * Orthogonal to `hasGlobalProjectAccess`: that one widens *which projects* are
   * reachable, this one widens *whose demands* are listed inside them.
   */
  canViewAllDemands(): boolean {
    return this.can('DEMAND_VIEW_ALL');
  }

  /**
   * True when the actor may change a demand that is neither theirs nor one they
   * created — not implied by `canViewAllDemands`. Seeing the whole board is a reading
   * concern; being trusted to edit, move, archive, delete or touch the checklist of
   * work that belongs to someone else is a different, deliberately separate grant.
   */
  canManageAllDemands(): boolean {
    return this.can('DEMAND_MANAGE_ALL');
  }
}
