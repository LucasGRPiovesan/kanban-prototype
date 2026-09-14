import type { Permission, Role as PrismaRole, User as PrismaUser } from '@prisma/client';
import { Uuid } from '../../../shared/domain/identifier';
import { PermissionSet } from '../domain/permission-set';
import { Role } from '../domain/role';
import { User } from '../domain/user';

/**
 * Persistence <-> domain translation.
 *
 * Prisma models are rows; domain entities are behaviour with invariants. Keeping the
 * two apart is what allows the schema to change (a column split, a denormalization)
 * without the domain noticing, and what keeps the numeric `id` from ever escaping
 * infrastructure — note that no mapper below reads or writes it.
 */

type RoleRow = PrismaRole & { permissions?: { permission: Pick<Permission, 'code'> }[] };

export const RoleMapper = {
  toDomain(row: RoleRow): Role {
    return Role.rehydrate({
      uuid: Uuid.create(row.uuid),
      name: row.name,
      slug: row.slug,
      isSystem: row.isSystem,
      active: row.active,
      permissions: PermissionSet.fromCodes((row.permissions ?? []).map((rp) => rp.permission.code)),
    });
  },
};

type UserRow = PrismaUser & { role?: Pick<PrismaRole, 'uuid'> };

export const UserMapper = {
  toDomain(row: UserRow & { role: Pick<PrismaRole, 'uuid'> }): User {
    return User.rehydrate({
      uuid: Uuid.create(row.uuid),
      name: row.name,
      avatarUrl: row.avatarUrl,
      roleUuid: Uuid.create(row.role.uuid),
      active: row.active,
      deletedAt: row.deletedAt,
    });
  },
};
