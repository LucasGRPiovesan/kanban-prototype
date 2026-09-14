import { type PrismaClient } from '@prisma/client';

/**
 * Temporarily revokes one permission from a seeded role, returning the undo.
 *
 * Suites that exercise project isolation need a profile that has LOG_ACCESS (or the
 * dashboard) but is still bounded by allocation. Under the seeded matrix the Agilista has
 * PROJECT_ACCESS_ALL, so those suites narrow it for their own duration — permissions are
 * re-read on every request, so the change applies immediately and the restore puts the
 * seeded matrix back exactly as it was.
 */
export async function revokeTemporarily(
  prisma: PrismaClient,
  roleSlug: string,
  permissionCode: string,
): Promise<() => Promise<void>> {
  const role = await prisma.role.findUniqueOrThrow({ where: { slug: roleSlug }, select: { id: true } });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: permissionCode },
    select: { id: true },
  });
  const deleted = await prisma.rolePermission.deleteMany({
    where: { roleId: role.id, permissionId: permission.id },
  });

  return async () => {
    if (deleted.count > 0) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  };
}
