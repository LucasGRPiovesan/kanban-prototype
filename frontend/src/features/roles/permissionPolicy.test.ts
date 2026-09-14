import { describe, expect, it } from 'vitest';
import {
  depthOf,
  isModuleEnabled,
  isPermissionEnabled,
  togglePermission,
} from './permissionPolicy';
import type { PermissionCode, PermissionModuleGroup } from '@/lib/api/types';

const groups: PermissionModuleGroup[] = [
  {
    module: 'DEMAND',
    accessCode: 'DEMAND_ACCESS',
    permissions: [
      { code: 'DEMAND_ACCESS', module: 'DEMAND', action: 'ACCESS', description: 'Acessar' },
      { code: 'DEMAND_CREATE', module: 'DEMAND', action: 'CREATE', description: 'Criar' },
      { code: 'DEMAND_UPDATE', module: 'DEMAND', action: 'UPDATE', description: 'Editar' },
      {
        code: 'DEMAND_ARCHIVE',
        module: 'DEMAND',
        action: 'ARCHIVE',
        description: 'Arquivar',
        dependsOn: 'DEMAND_UPDATE',
      },
      { code: 'DEMAND_DELETE', module: 'DEMAND', action: 'DELETE', description: 'Excluir' },
    ],
  },
  {
    module: 'USER',
    accessCode: 'USER_ACCESS',
    permissions: [
      { code: 'USER_ACCESS', module: 'USER', action: 'ACCESS', description: 'Acessar' },
      { code: 'USER_CREATE', module: 'USER', action: 'CREATE', description: 'Criar' },
    ],
  },
];

describe('Role editor permission policy', () => {
  it('treats a standalone scope grant as independent of its module ACCESS', () => {
    const projects: PermissionModuleGroup = {
      module: 'PROJECT',
      accessCode: 'PROJECT_ACCESS',
      permissions: [
        { code: 'PROJECT_ACCESS', module: 'PROJECT', action: 'ACCESS', description: 'Tela' },
        {
          code: 'PROJECT_ACCESS_ALL',
          module: 'PROJECT',
          action: 'ACCESS_ALL',
          description: 'Todos',
          standalone: true,
        },
      ],
    };
    const all = projects.permissions[1]!;
    expect(togglePermission([projects], [], 'PROJECT_ACCESS_ALL', true)).toEqual([
      'PROJECT_ACCESS_ALL',
    ]);
    expect(isPermissionEnabled(projects, [], all)).toBe(true);
    expect(depthOf(projects, 'PROJECT_ACCESS_ALL')).toBe(0);
    expect(
      togglePermission(
        [projects],
        ['PROJECT_ACCESS', 'PROJECT_ACCESS_ALL'],
        'PROJECT_ACCESS',
        false,
      ),
    ).toEqual(['PROJECT_ACCESS_ALL']);
  });

  it('enabling a child also enables the module ACCESS', () => {
    const result = togglePermission(groups, [], 'DEMAND_CREATE', true);
    expect(result).toEqual(['DEMAND_ACCESS', 'DEMAND_CREATE']);
  });

  it('disabling ACCESS clears every child of that module', () => {
    const selected: PermissionCode[] = ['DEMAND_ACCESS', 'DEMAND_CREATE', 'DEMAND_DELETE'];
    expect(togglePermission(groups, selected, 'DEMAND_ACCESS', false)).toEqual([]);
  });

  it('disabling ACCESS leaves other modules untouched', () => {
    const selected: PermissionCode[] = [
      'DEMAND_ACCESS',
      'DEMAND_CREATE',
      'USER_ACCESS',
      'USER_CREATE',
    ];
    expect(togglePermission(groups, selected, 'DEMAND_ACCESS', false)).toEqual([
      'USER_ACCESS',
      'USER_CREATE',
    ]);
  });

  it('disabling one child keeps ACCESS and its siblings', () => {
    const selected: PermissionCode[] = ['DEMAND_ACCESS', 'DEMAND_CREATE', 'DEMAND_UPDATE'];
    expect(togglePermission(groups, selected, 'DEMAND_CREATE', false)).toEqual([
      'DEMAND_ACCESS',
      'DEMAND_UPDATE',
    ]);
  });

  it('returns codes in catalog order regardless of click order', () => {
    let selected: PermissionCode[] = [];
    selected = togglePermission(groups, selected, 'DEMAND_DELETE', true);
    selected = togglePermission(groups, selected, 'DEMAND_CREATE', true);
    expect(selected).toEqual(['DEMAND_ACCESS', 'DEMAND_CREATE', 'DEMAND_DELETE']);
  });

  it('reports module enablement from the presence of ACCESS', () => {
    expect(isModuleEnabled(groups[0]!, ['DEMAND_ACCESS'])).toBe(true);
    expect(isModuleEnabled(groups[0]!, ['DEMAND_CREATE'])).toBe(false);
  });

  it('enabling a permission with dependsOn also enables its parent and ACCESS', () => {
    const result = togglePermission(groups, [], 'DEMAND_ARCHIVE', true);
    expect(result).toEqual(['DEMAND_ACCESS', 'DEMAND_UPDATE', 'DEMAND_ARCHIVE']);
  });

  it('disabling the dependsOn parent clears the dependent permission too', () => {
    const selected: PermissionCode[] = ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'DEMAND_ARCHIVE'];
    expect(togglePermission(groups, selected, 'DEMAND_UPDATE', false)).toEqual(['DEMAND_ACCESS']);
  });

  it('disabling ACCESS clears a dependsOn permission transitively', () => {
    const selected: PermissionCode[] = ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'DEMAND_ARCHIVE'];
    expect(togglePermission(groups, selected, 'DEMAND_ACCESS', false)).toEqual([]);
  });

  it('disabling the dependent permission alone leaves its parent granted', () => {
    const selected: PermissionCode[] = ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'DEMAND_ARCHIVE'];
    expect(togglePermission(groups, selected, 'DEMAND_ARCHIVE', false)).toEqual([
      'DEMAND_ACCESS',
      'DEMAND_UPDATE',
    ]);
  });

  it('depthOf is 0 for ACCESS, 1 for a plain child, 2 for a dependsOn permission', () => {
    expect(depthOf(groups[0]!, 'DEMAND_ACCESS')).toBe(0);
    expect(depthOf(groups[0]!, 'DEMAND_UPDATE')).toBe(1);
    expect(depthOf(groups[0]!, 'DEMAND_ARCHIVE')).toBe(2);
  });

  it('a dependsOn permission is enabled only once its whole chain is granted', () => {
    const archivePermission = groups[0]!.permissions.find((p) => p.code === 'DEMAND_ARCHIVE')!;
    expect(isPermissionEnabled(groups[0]!, ['DEMAND_ACCESS'], archivePermission)).toBe(false);
    expect(
      isPermissionEnabled(groups[0]!, ['DEMAND_ACCESS', 'DEMAND_UPDATE'], archivePermission),
    ).toBe(true);
  });
});
