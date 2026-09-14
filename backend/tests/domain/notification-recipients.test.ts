import { describe, expect, it } from 'vitest';
import {
  canStillWatch,
  resolveRecipients,
  type WatcherCandidate,
} from '../../src/modules/notifications/domain/notification-recipients';

const ADMIN_CODES = ['DEMAND_ACCESS', 'DEMAND_VIEW_ALL', 'DEMAND_WATCH', 'PROJECT_ACCESS', 'PROJECT_ACCESS_ALL'];

function watcher(uuid: string, overrides: Partial<WatcherCandidate> = {}): WatcherCandidate {
  return {
    uuid,
    active: true,
    permissionCodes: ADMIN_CODES,
    memberOfProject: false,
    ownsDemand: false,
    ...overrides,
  };
}

describe('resolveRecipients', () => {
  it('notifies the responsible by default, without any permission', () => {
    expect(
      resolveRecipients({
        actorUuid: 'admin-1',
        responsible: { uuid: 'dev', active: true },
        demandHasProject: true,
        watchers: [],
      }),
    ).toEqual([{ uuid: 'dev', reason: 'RESPONSIBLE' }]);
  });

  it('never notifies whoever made the change', () => {
    expect(
      resolveRecipients({
        actorUuid: 'dev',
        responsible: { uuid: 'dev', active: true },
        demandHasProject: true,
        watchers: [],
      }),
    ).toEqual([]);
  });

  it('notifies the other watching admin and the responsible, each individually', () => {
    // Two admins and a developer: one admin changes the demand, the other admin (watching)
    // and the developer (responsible) are both told about it.
    const recipients = resolveRecipients({
      actorUuid: 'admin-1',
      responsible: { uuid: 'dev', active: true },
      demandHasProject: true,
      watchers: [watcher('admin-1'), watcher('admin-2')],
    });
    expect(recipients).toEqual([
      { uuid: 'dev', reason: 'RESPONSIBLE' },
      { uuid: 'admin-2', reason: 'WATCHER' },
    ]);
  });

  it('lists a responsible who also watches once, as responsible', () => {
    expect(
      resolveRecipients({
        actorUuid: 'admin-1',
        responsible: { uuid: 'dev', active: true },
        demandHasProject: false,
        watchers: [watcher('dev')],
      }),
    ).toEqual([{ uuid: 'dev', reason: 'RESPONSIBLE' }]);
  });

  it('tells the previous responsible of a reassignment too', () => {
    expect(
      resolveRecipients({
        actorUuid: 'admin-1',
        responsible: { uuid: 'new', active: true },
        formerResponsible: { uuid: 'old', active: true },
        demandHasProject: true,
        watchers: [],
      }).map((r) => r.uuid),
    ).toEqual(['new', 'old']);
  });

  it('skips inactive people', () => {
    expect(
      resolveRecipients({
        actorUuid: 'admin-1',
        responsible: { uuid: 'dev', active: false },
        demandHasProject: true,
        watchers: [watcher('admin-2', { active: false })],
      }),
    ).toEqual([]);
  });
});

describe('canStillWatch', () => {
  it('drops a watch once DEMAND_WATCH is revoked', () => {
    expect(
      canStillWatch(watcher('a', { permissionCodes: ADMIN_CODES.filter((c) => c !== 'DEMAND_WATCH') }), true),
    ).toBe(false);
  });

  it('applies ACCESS sovereignty — DEMAND_WATCH without DEMAND_ACCESS is inert', () => {
    expect(canStillWatch(watcher('a', { permissionCodes: ['DEMAND_WATCH', 'DEMAND_VIEW_ALL'] }), false)).toBe(
      false,
    );
  });

  it('requires allocation to the project without PROJECT_ACCESS_ALL', () => {
    const codes = ['DEMAND_ACCESS', 'DEMAND_VIEW_ALL', 'DEMAND_WATCH', 'PROJECT_ACCESS'];
    expect(canStillWatch(watcher('a', { permissionCodes: codes, memberOfProject: false }), true)).toBe(false);
    expect(canStillWatch(watcher('a', { permissionCodes: codes, memberOfProject: true }), true)).toBe(true);
  });

  it('requires DEMAND_VIEW_ALL, or owning the demand', () => {
    const codes = ['DEMAND_ACCESS', 'DEMAND_WATCH', 'PROJECT_ACCESS_ALL', 'PROJECT_ACCESS'];
    expect(canStillWatch(watcher('a', { permissionCodes: codes }), true)).toBe(false);
    expect(canStillWatch(watcher('a', { permissionCodes: codes, ownsDemand: true }), true)).toBe(true);
  });
});
