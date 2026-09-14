import {
  PERMISSION_CATALOG,
  type PermissionCode,
  type PermissionModule,
  accessPermissionOf,
  isPermissionCode,
  moduleOf,
} from './permission';

/**
 * The single authority on "which permissions are actually in effect".
 *
 * ACCESS is sovereign: a module's ACCESS permission gates every other permission of
 * that module. If DEMAND_ACCESS is absent, DEMAND_CREATE/UPDATE/DELETE/BE_ASSIGNEE are
 * inert *even when persisted* — stored inconsistency can never widen authority.
 *
 * This rule is implemented exactly once, here. Nothing else in the system may
 * re-derive it: the API authorization middleware, the role editor's normalization and
 * the effective-permission payload sent to the frontend all funnel through this class.
 */
export class PermissionSet {
  private readonly granted: ReadonlySet<PermissionCode>;

  private constructor(granted: ReadonlySet<PermissionCode>) {
    this.granted = granted;
  }

  /** Builds a set from raw persisted codes, discarding anything unknown. */
  static fromCodes(codes: readonly string[]): PermissionSet {
    const known = new Set<PermissionCode>();
    for (const code of codes) {
      if (isPermissionCode(code)) {
        known.add(code);
      }
    }
    return new PermissionSet(known);
  }

  static empty(): PermissionSet {
    return new PermissionSet(new Set());
  }

  /**
   * The effective view: children of a module whose ACCESS is absent are dropped.
   * This is what authorization decisions and API responses must be based on.
   */
  effective(): ReadonlySet<PermissionCode> {
    const result = new Set<PermissionCode>();
    for (const code of this.granted) {
      const module = moduleOf(code);
      if (this.isAccessPermission(code) || this.granted.has(accessPermissionOf(module))) {
        result.add(code);
      }
    }
    return result;
  }

  has(code: PermissionCode): boolean {
    return this.effective().has(code);
  }

  hasAll(codes: readonly PermissionCode[]): boolean {
    const effective = this.effective();
    return codes.every((code) => effective.has(code));
  }

  hasAny(codes: readonly PermissionCode[]): boolean {
    const effective = this.effective();
    return codes.some((code) => effective.has(code));
  }

  hasModuleAccess(module: PermissionModule): boolean {
    return this.granted.has(accessPermissionOf(module));
  }

  /**
   * Normalizes an intended grant before persisting it, so the database never stores
   * a contradiction in the first place:
   *   - a child permission implies its module's ACCESS (enabling a child enables ACCESS);
   *   - a module without ACCESS drops all of its children.
   * Enabling the child wins over the absent parent — that is the least surprising
   * reading of an operator ticking "DEMAND_CREATE" in the role editor.
   */
  static normalize(codes: readonly string[]): PermissionCode[] {
    const requested = new Set<PermissionCode>();
    for (const code of codes) {
      if (isPermissionCode(code)) {
        requested.add(code);
      }
    }
    for (const code of [...requested]) {
      requested.add(accessPermissionOf(moduleOf(code)));
    }
    return PERMISSION_CATALOG.filter((p) => requested.has(p.code)).map((p) => p.code);
  }

  toArray(): PermissionCode[] {
    const effective = this.effective();
    return PERMISSION_CATALOG.filter((p) => effective.has(p.code)).map((p) => p.code);
  }

  private isAccessPermission(code: PermissionCode): boolean {
    return code === accessPermissionOf(moduleOf(code));
  }
}
