import { type Actor } from '../../../../shared/application/actor';
import { type ActivityRecorder, logActorOf } from '../../../../shared/application/activity-log.port';
import { type UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import { PERMISSION_CATALOG, type PermissionDefinition, accessPermissionOf } from '../../domain/permission';
import { PermissionSet } from '../../domain/permission-set';
import { Role } from '../../domain/role';
import { type RoleRepository } from '../ports/repositories';

export interface RoleDTO {
  uuid: string;
  name: string;
  slug: string;
  isSystem: boolean;
  active: boolean;
  permissions: string[];
}

function toDTO(role: Role): RoleDTO {
  return {
    uuid: role.uuid.toString(),
    name: role.name,
    slug: role.slug,
    isSystem: role.isSystem,
    active: role.active,
    // The effective view, so the UI never renders a grant the backend would ignore.
    permissions: role.permissions.toArray(),
  };
}

function roleSubject(role: Role) {
  return { type: 'ROLE' as const, uuid: role.uuid.toString(), label: role.name };
}

export class ListRoles {
  constructor(private readonly roles: RoleRepository) {}

  async execute(actor: Actor, filter: { activeOnly?: boolean } = {}): Promise<RoleDTO[]> {
    actor.require('ROLE_ACCESS');
    const roles = await this.roles.listAll(filter);
    return roles.map(toDTO);
  }
}

/**
 * The user-registration screen needs the profile dropdown, which would otherwise
 * require ROLE_ACCESS — a permission the specification does not give every profile
 * that can create users. Exposed as a separate, narrower use case rather than by
 * weakening ListRoles.
 */
export class ListAssignableRoles {
  constructor(private readonly roles: RoleRepository) {}

  async execute(actor: Actor): Promise<Pick<RoleDTO, 'uuid' | 'name' | 'slug'>[]> {
    if (!actor.can('USER_CREATE') && !actor.can('USER_UPDATE') && !actor.can('ROLE_ACCESS')) {
      throw DomainError.forbidden('PERMISSION_DENIED', 'Ação não permitida para o seu perfil.');
    }
    const roles = await this.roles.listAll({ activeOnly: true });
    return roles.map((role) => ({ uuid: role.uuid.toString(), name: role.name, slug: role.slug }));
  }
}

export interface PermissionCatalogDTO {
  module: string;
  accessCode: string;
  permissions: PermissionDefinition[];
}

/** Drives the role editor: grouped by module, with each module's sovereign ACCESS named. */
export class GetPermissionCatalog {
  execute(actor: Actor): PermissionCatalogDTO[] {
    actor.require('ROLE_ACCESS');
    const grouped = new Map<string, PermissionDefinition[]>();
    for (const permission of PERMISSION_CATALOG) {
      const list = grouped.get(permission.module) ?? [];
      list.push(permission);
      grouped.set(permission.module, list);
    }
    return [...grouped.entries()].map(([module, permissions]) => ({
      module,
      accessCode: accessPermissionOf(module as PermissionDefinition['module']),
      permissions,
    }));
  }
}

export class CreateRole {
  constructor(
    private readonly roles: RoleRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(actor: Actor, input: { name: string; permissions: string[] }): Promise<RoleDTO> {
    actor.require('ROLE_CREATE');
    const role = Role.create({ name: input.name, permissions: input.permissions });

    if (await this.roles.existsBySlug(role.slug)) {
      throw DomainError.conflict('ROLE_ALREADY_EXISTS', 'Já existe um perfil com esse nome.');
    }

    const created = await this.uow.run(async () => {
      const persisted = await this.roles.create(role);
      await this.activity.record(logActorOf(actor), {
        action: 'role.created',
        subject: roleSubject(persisted),
        metadata: { permissions: persisted.permissions.toArray() },
      });
      return persisted;
    });
    return toDTO(created);
  }
}

export class UpdateRole {
  constructor(
    private readonly roles: RoleRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(
    actor: Actor,
    roleUuid: string,
    input: { name?: string; permissions?: string[]; active?: boolean },
  ): Promise<RoleDTO> {
    actor.require('ROLE_UPDATE');

    if (!Uuid.isValid(roleUuid)) {
      throw DomainError.notFound('ROLE_NOT_FOUND', 'Perfil não encontrado.');
    }
    const uuid = Uuid.create(roleUuid);
    const role = await this.roles.findByUuid(uuid);
    if (!role) {
      throw DomainError.notFound('ROLE_NOT_FOUND', 'Perfil não encontrado.');
    }

    const before = {
      name: role.name,
      active: role.active,
      permissions: role.permissions.toArray() as string[],
    };

    if (input.name !== undefined) {
      // Renaming a system role would break the seed's identity contract; its
      // permissions stay editable so the matrix can still be explored.
      if (role.isSystem) {
        throw DomainError.forbidden(
          'SYSTEM_ROLE_IMMUTABLE',
          'O nome de perfis de sistema não pode ser alterado.',
        );
      }
      role.rename(input.name);
      if (await this.roles.existsBySlug(role.slug, uuid)) {
        throw DomainError.conflict('ROLE_ALREADY_EXISTS', 'Já existe um perfil com esse nome.');
      }
    }

    if (input.permissions !== undefined) {
      role.changePermissions(input.permissions);
    }

    if (input.active !== undefined) {
      if (input.active) {
        role.activate();
      } else {
        role.deactivate(); // rejects system roles in the entity
      }
    }

    const updated = await this.uow.run(async () => {
      const persisted = await this.roles.update(role);
      const author = logActorOf(actor);

      if (persisted.name !== before.name) {
        await this.activity.record(author, {
          action: 'role.updated',
          subject: roleSubject(persisted),
          changes: [{ field: 'name', from: before.name, to: persisted.name }],
        });
      }

      // Diffed on the *effective* sets, after normalization: what matters to an auditor
      // is authority that actually changed, not the checkboxes that were clicked.
      const after = persisted.permissions.toArray() as string[];
      const granted = after.filter((code) => !before.permissions.includes(code));
      const revoked = before.permissions.filter((code) => !after.includes(code));
      if (granted.length > 0 || revoked.length > 0) {
        await this.activity.record(author, {
          action: 'role.permissions_changed',
          subject: roleSubject(persisted),
          metadata: { granted, revoked },
        });
      }

      if (persisted.active !== before.active) {
        await this.activity.record(author, {
          action: persisted.active ? 'role.activated' : 'role.deactivated',
          subject: roleSubject(persisted),
        });
      }
      return persisted;
    });

    return toDTO(updated);
  }
}

/**
 * Server-side normalization preview used by the role editor: the client asks what a
 * given selection actually resolves to, instead of reimplementing the ACCESS hierarchy
 * in TypeScript on the browser side.
 */
export class NormalizePermissions {
  execute(actor: Actor, codes: string[]): string[] {
    actor.require('ROLE_ACCESS');
    return PermissionSet.normalize(codes);
  }
}
