import { z } from 'zod';
import { PERMISSION_CODES } from '../domain/permission';

/**
 * HTTP-edge validation: shape, types and presence.
 *
 * Business rules (the accented-letters name rule, the ACCESS hierarchy) are asserted
 * by the domain, not here — duplicating them would create two sources of truth that
 * drift apart. Zod's job is to guarantee the use case receives well-typed input.
 */

export const uuidParam = z.object({
  uuid: z.string().uuid('Identificador inválido.'),
});

export const loginSchema = z.object({
  userUuid: z.string().uuid('Selecione um usuário válido.'),
});

export const createUserSchema = z.object({
  name: z
    .string({ required_error: 'O nome é obrigatório.' })
    .trim()
    .min(1, 'O nome é obrigatório.'),
  roleUuid: z
    .string({ required_error: 'O perfil é obrigatório.' })
    .uuid('Selecione um perfil válido.'),
});

/**
 * Self-service: no `roleUuid`, no `active` — those belong only to the administrative
 * screen. Absent by construction, not merely unvalidated.
 */
export const updateOwnProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'O nome é obrigatório.').optional(),
    // Empty string clears the picture — the same "sem foto" state as `null` — so the
    // frontend's own "remover foto" action needs no separate encoding.
    avatarUrl: z
      .union([z.string().trim().url('Informe um link válido (http ou https).'), z.literal('')])
      .nullable()
      .optional()
      .transform((value) => (value === '' ? null : value)),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, 'O nome é obrigatório.').optional(),
    roleUuid: z.string().uuid('Selecione um perfil válido.').optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

/** What to do with the demands the excluded user is responsible for. */
export const deleteUserSchema = z.object({
  demandAction: z.enum(['delete', 'archive'], {
    errorMap: () => ({ message: 'Informe o que fazer com as demandas do usuário.' }),
  }),
});

export const userHistoryQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const listUsersQuery = z.object({
  search: z.string().trim().optional(),
  activeOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

/**
 * The Usuários screen's query. `active` is tri-state — "true", "false" or absent — so
 * the screen can ask for the inactive users on their own, which `activeOnly` cannot say.
 */
export const listUsersPageQuery = z.object({
  search: z.string().trim().optional(),
  roleUuid: z.string().uuid('Perfil inválido.').optional(),
  active: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const permissionCode = z.enum(PERMISSION_CODES);

export const createRoleSchema = z.object({
  name: z
    .string({ required_error: 'O nome do perfil é obrigatório.' })
    .trim()
    .min(1, 'O nome do perfil é obrigatório.'),
  permissions: z.array(permissionCode).default([]),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1, 'O nome do perfil é obrigatório.').optional(),
    permissions: z.array(permissionCode).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export const normalizePermissionsSchema = z.object({
  permissions: z.array(permissionCode).default([]),
});
