import { describe, expect, it } from 'vitest';
import { Actor } from '../../src/shared/application/actor';
import { DomainError } from '../../src/shared/domain/errors';
import { Uuid } from '../../src/shared/domain/identifier';
import { PermissionSet } from '../../src/modules/iam/domain/permission-set';
import { ProjectAccessPolicy } from '../../src/modules/projects/domain/project-access-policy';
import { AssigneeEligibility } from '../../src/modules/demands/domain/assignee-eligibility';
import { User } from '../../src/modules/iam/domain/user';

function actorWith(permissions: string[]): Actor {
  return new Actor(
    Uuid.generate(),
    'Pessoa de Teste',
    Uuid.generate(),
    'perfil-teste',
    'Perfil de Teste',
    PermissionSet.fromCodes(permissions),
  );
}

describe('ProjectAccessPolicy — project isolation', () => {
  const projectA = Uuid.generate();
  const projectB = Uuid.generate();

  it('grants access to a project the actor is allocated to', () => {
    const policy = ProjectAccessPolicy.forMemberships([projectA.toString()]);
    const actor = actorWith(['PROJECT_ACCESS']);

    expect(policy.canAccess(actor, projectA)).toBe(true);
    expect(policy.canAccess(actor, projectB)).toBe(false);
  });

  it('grants access to every project when PROJECT_ACCESS_ALL is held', () => {
    // No memberships at all — access comes purely from the capability.
    const policy = ProjectAccessPolicy.forMemberships([]);
    const admin = actorWith(['PROJECT_ACCESS', 'PROJECT_ACCESS_ALL']);

    expect(policy.canAccess(admin, projectA)).toBe(true);
    expect(policy.canAccess(admin, projectB)).toBe(true);
    expect(policy.visibleProjectUuids(admin)).toBeNull();
  });

  it('denies everything without PROJECT_ACCESS, even with memberships', () => {
    const policy = ProjectAccessPolicy.forMemberships([projectA.toString()]);
    const actor = actorWith([]);

    expect(policy.canAccess(actor, projectA)).toBe(false);
  });

  it('restricts the visible list to actual memberships', () => {
    const policy = ProjectAccessPolicy.forMemberships([projectA.toString()]);
    const actor = actorWith(['PROJECT_ACCESS']);

    expect(policy.visibleProjectUuids(actor)).toEqual([projectA.toString()]);
  });

  it('reports NOT_FOUND rather than FORBIDDEN, so existence does not leak', () => {
    const policy = ProjectAccessPolicy.forMemberships([]);
    const actor = actorWith(['PROJECT_ACCESS']);

    try {
      policy.assertAccess(actor, projectB);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as DomainError).kind).toBe('NOT_FOUND');
      expect((error as DomainError).code).toBe('PROJECT_NOT_FOUND');
    }
  });
});

describe('Actor.require', () => {
  it('passes when the permission is effective', () => {
    const actor = actorWith(['DEMAND_ACCESS', 'DEMAND_CREATE']);
    expect(() => actor.require('DEMAND_CREATE')).not.toThrow();
  });

  it('fails when the parent ACCESS is missing, even if the child is persisted', () => {
    const actor = actorWith(['DEMAND_CREATE']);
    expect(() => actor.require('DEMAND_CREATE')).toThrowError(DomainError);
  });

  it('rejects with FORBIDDEN', () => {
    const actor = actorWith([]);
    try {
      actor.require('USER_CREATE');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as DomainError).kind).toBe('FORBIDDEN');
      expect((error as DomainError).code).toBe('PERMISSION_DENIED');
    }
  });
});

describe('AssigneeEligibility', () => {
  const base = {
    userUuid: Uuid.generate(),
    name: 'Lucas Barbosa',
    active: true,
    requiresMembership: true,
    isProjectMember: true,
    canBeAssignee: true,
  };

  it('accepts an active project member with the capability', () => {
    expect(AssigneeEligibility.isEligible(base)).toBe(true);
    expect(() => AssigneeEligibility.assert(base)).not.toThrow();
  });

  it('rejects an inactive user', () => {
    expect(() => AssigneeEligibility.assert({ ...base, active: false })).toThrowError(
      /inativo/i,
    );
  });

  it('rejects someone who does not belong to the project', () => {
    try {
      AssigneeEligibility.assert({ ...base, isProjectMember: false });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('RESPONSIBLE_NOT_PROJECT_MEMBER');
    }
  });

  /**
   * A demand with no project has no allocation to check against, so membership stops
   * being a criterion for it — the whole reason `requiresMembership` exists rather than
   * the directory claiming `isProjectMember: true` about someone who is not a member of
   * anything.
   */
  it('ignores membership when the demand belongs to no project', () => {
    const detached = { ...base, requiresMembership: false, isProjectMember: false };
    expect(AssigneeEligibility.isEligible(detached)).toBe(true);
    expect(() => AssigneeEligibility.assert(detached)).not.toThrow();
  });

  it('still requires the capability when the demand belongs to no project', () => {
    try {
      AssigneeEligibility.assert({
        ...base,
        requiresMembership: false,
        isProjectMember: false,
        canBeAssignee: false,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('RESPONSIBLE_CANNOT_BE_ASSIGNEE');
    }
  });

  it('rejects a profile without DEMAND_BE_ASSIGNEE', () => {
    try {
      AssigneeEligibility.assert({ ...base, canBeAssignee: false });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('RESPONSIBLE_CANNOT_BE_ASSIGNEE');
    }
  });

  it('rejects an unknown user', () => {
    try {
      AssigneeEligibility.assert(null);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as DomainError).kind).toBe('NOT_FOUND');
    }
  });
});

describe('User name rule', () => {
  it('accepts letters, accents and spaces between words', () => {
    for (const name of ['João da Silva', 'André Carvalho', 'Ana', 'Sofia Lima Braga', "D'Ávila Souza"]) {
      expect(() => User.assertName(name)).not.toThrow();
    }
  });

  it('rejects digits and symbols', () => {
    for (const name of ['Ana123', 'Bob@x', 'user_1', '   ', 'A']) {
      expect(() => User.assertName(name)).toThrowError(DomainError);
    }
  });

  it('collapses repeated whitespace', () => {
    expect(User.assertName('  Maria   Clara  ')).toBe('Maria Clara');
  });
});
