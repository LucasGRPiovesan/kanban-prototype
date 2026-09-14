import { describe, expect, it } from 'vitest';
import { PermissionSet } from '../../src/modules/iam/domain/permission-set';

describe('PermissionSet — ACCESS hierarchy', () => {
  it('drops children of a module whose ACCESS is absent', () => {
    // A deliberately inconsistent grant, as could exist in the database.
    const set = PermissionSet.fromCodes(['DEMAND_CREATE', 'DEMAND_UPDATE', 'DEMAND_DELETE']);

    expect(set.has('DEMAND_CREATE')).toBe(false);
    expect(set.has('DEMAND_UPDATE')).toBe(false);
    expect(set.has('DEMAND_DELETE')).toBe(false);
    expect(set.toArray()).toEqual([]);
  });

  it('keeps children once ACCESS is present', () => {
    const set = PermissionSet.fromCodes(['DEMAND_ACCESS', 'DEMAND_CREATE']);

    expect(set.has('DEMAND_ACCESS')).toBe(true);
    expect(set.has('DEMAND_CREATE')).toBe(true);
  });

  it('scopes the rule per module — one module cannot suppress another', () => {
    const set = PermissionSet.fromCodes(['USER_ACCESS', 'USER_CREATE', 'DEMAND_CREATE']);

    expect(set.has('USER_CREATE')).toBe(true);
    // DEMAND_ACCESS is missing, so its child stays inert.
    expect(set.has('DEMAND_CREATE')).toBe(false);
  });

  it('ignores unknown codes rather than trusting them', () => {
    const set = PermissionSet.fromCodes(['DEMAND_ACCESS', 'DEMAND_SUPERPOWER', '']);
    expect(set.toArray()).toEqual(['DEMAND_ACCESS']);
  });

  it('reports module access independently of the effective view', () => {
    const set = PermissionSet.fromCodes(['USER_ACCESS']);
    expect(set.hasModuleAccess('USER')).toBe(true);
    expect(set.hasModuleAccess('ROLE')).toBe(false);
  });

  describe('normalize', () => {
    it('adds the implied ACCESS when a child is granted', () => {
      expect(PermissionSet.normalize(['DEMAND_CREATE'])).toEqual(['DEMAND_ACCESS', 'DEMAND_CREATE']);
    });

    it('adds ACCESS for every module touched', () => {
      const normalized = PermissionSet.normalize(['DEMAND_UPDATE', 'ROLE_UPDATE']);
      expect(normalized).toContain('DEMAND_ACCESS');
      expect(normalized).toContain('ROLE_ACCESS');
    });

    it('is idempotent', () => {
      const once = PermissionSet.normalize(['DEMAND_CREATE', 'DEMAND_ACCESS']);
      expect(PermissionSet.normalize(once)).toEqual(once);
    });

    it('returns codes in catalog order regardless of input order', () => {
      const a = PermissionSet.normalize(['DEMAND_DELETE', 'DEMAND_ACCESS', 'DEMAND_CREATE']);
      const b = PermissionSet.normalize(['DEMAND_CREATE', 'DEMAND_DELETE', 'DEMAND_ACCESS']);
      expect(a).toEqual(b);
      expect(a).toEqual(['DEMAND_ACCESS', 'DEMAND_CREATE', 'DEMAND_DELETE']);
    });

    it('discards unknown codes', () => {
      expect(PermissionSet.normalize(['NOT_A_PERMISSION'])).toEqual([]);
    });
  });

  describe('hasAll / hasAny', () => {
    const set = PermissionSet.fromCodes(['DEMAND_ACCESS', 'DEMAND_CREATE', 'USER_ACCESS']);

    it('hasAll requires every code to be effective', () => {
      expect(set.hasAll(['DEMAND_ACCESS', 'DEMAND_CREATE'])).toBe(true);
      expect(set.hasAll(['DEMAND_ACCESS', 'DEMAND_DELETE'])).toBe(false);
    });

    it('hasAny requires at least one', () => {
      expect(set.hasAny(['DEMAND_DELETE', 'USER_ACCESS'])).toBe(true);
      expect(set.hasAny(['DEMAND_DELETE', 'ROLE_ACCESS'])).toBe(false);
    });
  });
});
