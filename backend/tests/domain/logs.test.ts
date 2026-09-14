import { describe, expect, it } from 'vitest';
import {
  buildSeedActivity,
  SEED_UUID_PREFIX,
  validateSeedActivity,
} from '../../prisma/seed-activity';
import { DemandComment } from '../../src/modules/demands/domain/demand-comment';
import { PermissionSet } from '../../src/modules/iam/domain/permission-set';
import { summarizeActivity } from '../../src/modules/logs/application/summarize';
import { LogVisibilityPolicy } from '../../src/modules/logs/domain/log-visibility';
import { Actor } from '../../src/shared/application/actor';
import {
  LOG_ACTIONS,
  type ActivityAction,
  isLogAction,
  scopeOf,
} from '../../src/shared/domain/activity-catalog';
import { type DomainError } from '../../src/shared/domain/errors';
import { Uuid } from '../../src/shared/domain/identifier';

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

function errorCodeOf(action: () => unknown): string | null {
  try {
    action();
  } catch (error) {
    return (error as DomainError).code;
  }
  return null;
}

describe('Activity catalog', () => {
  it('has one definition per code', () => {
    const codes = LOG_ACTIONS.map((definition) => definition.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every(isLogAction)).toBe(true);
    expect(isLogAction('demand.not_a_real_action')).toBe(false);
  });

  it('scopes every entry about a demand or a project to that project', () => {
    for (const definition of LOG_ACTIONS) {
      const scope = scopeOf(definition);
      if (definition.category === 'SYSTEM') {
        expect(scope, definition.code).toBe('SYSTEM');
      } else if (definition.subjectType === 'DEMAND' || definition.subjectType === 'PROJECT') {
        expect(scope, definition.code).toBe('PROJECT');
      } else {
        expect(scope, definition.code).toBe('ORGANIZATION');
      }
    }
  });

});

describe('summarizeActivity', () => {
  const activityActions = LOG_ACTIONS.filter((definition) => definition.category === 'ACTIVITY');

  it.each(activityActions.map((definition) => [definition.code, definition] as const))(
    'writes a complete sentence for %s',
    (code, definition) => {
      const summary = summarizeActivity({
        action: code as ActivityAction,
        subject: {
          type: definition.subjectType ?? 'USER',
          uuid: Uuid.generate().toString(),
          label: 'Alvo',
        },
        changes: [
          { field: 'status', from: 'IN_PROGRESS', to: 'IN_REVIEW' },
          { field: 'responsible', from: 'Ana', to: 'Bia' },
          { field: 'project', from: 'Projeto A', to: 'Projeto B' },
          { field: 'title', from: 'Antigo', to: 'Novo' },
        ],
        metadata: {
          item: { uuid: Uuid.generate().toString(), title: 'Item' },
          attachment: { uuid: Uuid.generate().toString(), name: 'contrato.pdf' },
          member: { uuid: Uuid.generate().toString(), name: 'Caio' },
          granted: ['DEMAND_COMMENT'],
          revoked: [],
        },
      });

      expect(summary.length).toBeGreaterThan(5);
      expect(summary.length).toBeLessThanOrEqual(500);
      expect(summary).not.toMatch(/undefined|null|\[object/);
    },
  );

  it('reads statuses by their labels, not their codes', () => {
    const summary = summarizeActivity({
      action: 'demand.status_changed',
      subject: { type: 'DEMAND', uuid: Uuid.generate().toString(), label: 'Portal' },
      changes: [{ field: 'status', from: 'IN_PROGRESS', to: 'PRODUCTION' }],
    });
    expect(summary).toBe('Moveu a demanda "Portal" de Em andamento para Em produção');
  });

  it('keeps a huge label from overflowing the column', () => {
    const summary = summarizeActivity({
      action: 'demand.updated',
      subject: { type: 'DEMAND', uuid: Uuid.generate().toString(), label: 'x'.repeat(2000) },
      changes: [{ field: 'title', from: 'a', to: 'b' }],
    });
    expect(summary.length).toBeLessThanOrEqual(500);
  });
});

describe('LogVisibilityPolicy', () => {
  const projects = [Uuid.generate().toString()];

  it('requires the module access permission', () => {
    expect(errorCodeOf(() => LogVisibilityPolicy.forActor(actorWith([]), projects))).toBe(
      'PERMISSION_DENIED',
    );
  });

  it('follows project visibility for project activity', () => {
    const member = LogVisibilityPolicy.forActor(actorWith(['LOG_ACCESS', 'PROJECT_ACCESS']), projects);
    expect(member).toEqual({ projectUuids: projects, organization: false, system: false });
    expect(LogVisibilityPolicy.allowsCategory(member, 'ACTIVITY')).toBe(true);
    expect(LogVisibilityPolicy.allowsCategory(member, 'SYSTEM')).toBe(false);
  });

  it('follows allocations without PROJECT_ACCESS — the Projetos screen is not the allocation', () => {
    const visibility = LogVisibilityPolicy.forActor(actorWith(['LOG_ACCESS']), projects);
    expect(visibility.projectUuids).toEqual(projects);
    expect(LogVisibilityPolicy.allowsCategory(visibility, 'ACTIVITY')).toBe(true);
  });

  it('sees no project activity when allocated to nothing', () => {
    const visibility = LogVisibilityPolicy.forActor(actorWith(['LOG_ACCESS']), []);
    expect(LogVisibilityPolicy.seesNothing(visibility)).toBe(true);
  });

  it('opens the wider views by capability, never by profile name', () => {
    const visibility = LogVisibilityPolicy.forActor(
      actorWith([
        'LOG_ACCESS',
        'LOG_VIEW_ORGANIZATION',
        'LOG_VIEW_SYSTEM',
        'PROJECT_ACCESS',
        'PROJECT_ACCESS_ALL',
      ]),
      null,
    );
    expect(visibility).toEqual({ projectUuids: null, organization: true, system: true });
    expect(LogVisibilityPolicy.seesNothing(visibility)).toBe(false);
  });
});

describe('DemandComment', () => {
  const demandUuid = Uuid.generate();
  const author = Uuid.generate();
  const someoneElse = Uuid.generate();

  it('normalizes line endings and trims the body', () => {
    const comment = DemandComment.create({ demandUuid, authorUuid: author, body: '  linha 1\r\nlinha 2  ' });
    expect(comment.body).toBe('linha 1\nlinha 2');
    expect(comment.editedAt).toBeNull();
  });

  it('rejects an empty or oversized body', () => {
    expect(errorCodeOf(() => DemandComment.create({ demandUuid, authorUuid: author, body: '   ' }))).toBe(
      'INVALID_COMMENT',
    );
    expect(
      errorCodeOf(() =>
        DemandComment.create({ demandUuid, authorUuid: author, body: 'a'.repeat(5001) }),
      ),
    ).toBe('INVALID_COMMENT');
  });

  it('lets only the author edit or delete', () => {
    const comment = DemandComment.create({ demandUuid, authorUuid: author, body: 'Original' });
    expect(errorCodeOf(() => comment.edit(someoneElse, 'Alterado'))).toBe('COMMENT_NOT_AUTHOR');
    expect(errorCodeOf(() => comment.assertCanDelete(someoneElse))).toBe('COMMENT_NOT_AUTHOR');
    expect(errorCodeOf(() => comment.assertCanDelete(author))).toBeNull();
  });

  it('does not count an identical save as an edit', () => {
    const comment = DemandComment.create({ demandUuid, authorUuid: author, body: 'Mesmo texto' });
    expect(comment.edit(author, '  Mesmo texto ')).toBe(false);
    expect(comment.editedAt).toBeNull();
    expect(comment.edit(author, 'Texto novo')).toBe(true);
    expect(comment.editedAt).toBeInstanceOf(Date);
  });

  it('quotes a flat, bounded excerpt', () => {
    const comment = DemandComment.create({
      demandUuid,
      authorUuid: author,
      body: `Primeira linha\n\n${'palavra '.repeat(40)}`,
    });
    expect(comment.excerpt()).not.toContain('\n');
    expect(comment.excerpt().length).toBeLessThanOrEqual(140);
  });
});

describe('Seed activity', () => {
  it('only contains history the seeded profiles and allocations could have produced', () => {
    expect(() => validateSeedActivity(buildSeedActivity(new Date()))).not.toThrow();
  });

  it('is deterministic and stays inside its own uuid prefix', () => {
    const first = buildSeedActivity(new Date('2026-09-10T12:00:00Z'));
    const later = buildSeedActivity(new Date('2026-12-01T08:30:00Z'));

    const uuids = [...first.logs, ...first.comments].map((entry) => entry.uuid);
    expect(uuids).toEqual([...later.logs, ...later.comments].map((entry) => entry.uuid));
    expect(new Set(uuids).size).toBe(uuids.length);
    expect(uuids.every((uuid) => uuid.startsWith(SEED_UUID_PREFIX))).toBe(true);
  });

  it('never dates an entry in the future', () => {
    const activity = buildSeedActivity(new Date());
    for (const entry of activity.logs) {
      expect(entry.occurredAt.getTime()).toBeLessThanOrEqual(activity.now.getTime());
    }
  });

  it('refuses a history a profile could not have produced', () => {
    const activity = buildSeedActivity(new Date());
    const move = activity.logs.find((entry) => entry.action === 'demand.status_changed');
    expect(move).toBeDefined();
    // The Administrador lacks DEMAND_UPDATE under the seeded matrix.
    move!.actorKey = 'marianaAlves';
    move!.actor = { uuid: move!.actor!.uuid, name: 'Mariana Alves' };
    expect(() => validateSeedActivity(activity)).toThrow();
  });
});
