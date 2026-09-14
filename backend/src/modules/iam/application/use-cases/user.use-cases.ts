import { type Actor } from '../../../../shared/application/actor';
import {
  type ActivityRecorder,
  type FieldChange,
  type SystemLogger,
  logActorOf,
} from '../../../../shared/application/activity-log.port';
import { type FileStoragePort } from '../../../../shared/application/file-storage.port';
import { type UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import { type DemandActivityLog } from '../../../demands/application/demand-activity';
import {
  type AttachmentRepository,
  type DemandQueries,
  type DemandRepository,
} from '../../../demands/application/ports/repositories';
import { removeStoredFiles } from '../../../demands/application/storage-cleanup';
import {
  clampPageNumber,
  clampPageSize,
  type LogPageDTO,
  type LogQueries,
  toLogPageDTO,
} from '../../../logs/application/ports';
import { User } from '../../domain/user';
import {
  type UserPageRow,
  type UserQueries,
  type UserRepository,
  type UserWithRoleView,
} from '../ports/repositories';

export interface UserDTO {
  uuid: string;
  name: string;
  /** Absolute URL or `null`; the UI falls back to the monogram either way. */
  avatarUrl: string | null;
  active: boolean;
  /** Soft-delete marker, independent of `active` — `null` means never excluded. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: { uuid: string; name: string; slug: string };
}

function toDTO(view: UserWithRoleView): UserDTO {
  return {
    uuid: view.userUuid,
    name: view.name,
    avatarUrl: view.avatarUrl,
    active: view.active,
    deletedAt: view.deletedAt ? view.deletedAt.toISOString() : null,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    role: view.role,
  };
}

/**
 * Self-service: an authenticated user editing their own name and picture.
 *
 * Deliberately separate from `UpdateUser`, which is the administrative screen and is
 * gated by `USER_UPDATE`. Nobody needs a permission to correct their own name or add a
 * photo, and this use case's own shape enforces that boundary — it has no `roleUuid` or
 * `active` field to accept in the first place, so there is no way to reach here and end
 * up promoting yourself or reactivating your own account.
 */
export class UpdateOwnProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly queries: UserQueries,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(
    actor: Actor,
    input: { name?: string; avatarUrl?: string | null },
  ): Promise<UserDTO> {
    const user = await this.users.findByUuid(actor.userUuid);
    const before = await this.queries.findWithRole(actor.userUuid);
    if (!user || !before) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    if (input.name !== undefined) {
      user.rename(input.name);
      if (await this.users.existsByName(user.name, actor.userUuid)) {
        throw DomainError.conflict('USER_ALREADY_EXISTS', 'Já existe um usuário com esse nome.');
      }
    }
    if (input.avatarUrl !== undefined) {
      user.changeAvatar(input.avatarUrl);
    }

    const after = await this.uow.run(async () => {
      await this.users.update(user);
      const persisted = await this.queries.findWithRole(actor.userUuid);
      if (!persisted) {
        throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
      }

      const changes: FieldChange[] = [];
      if (persisted.name !== before.name) {
        changes.push({ field: 'name', from: before.name, to: persisted.name });
      }
      // The picture is not diffed field-by-field like a name would be: a URL is not
      // something a reader benefits from seeing before/after, only that it changed.
      if (persisted.avatarUrl !== before.avatarUrl) {
        changes.push({ field: 'avatarUrl', from: null, to: null });
      }
      if (changes.length > 0) {
        await this.activity.record(logActorOf(actor), {
          action: 'user.updated',
          subject: userSubject(persisted),
          changes,
        });
      }
      return persisted;
    });

    return toDTO(after);
  }
}

function userSubject(view: UserWithRoleView) {
  return { type: 'USER' as const, uuid: view.userUuid, label: view.name };
}

export class ListUsers {
  constructor(private readonly queries: UserQueries) {}

  async execute(actor: Actor, filter: { search?: string; activeOnly?: boolean }): Promise<UserDTO[]> {
    actor.require('USER_ACCESS');
    const views = await this.queries.listWithRole(filter);
    return views.map(toDTO);
  }
}

export interface UserPageItemDTO extends UserDTO {
  demandPriorityCounts: UserPageRow['demandPriorityCounts'];
}

export interface UserPageDTO {
  items: UserPageItemDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Bounds mirror the demand and log listings, so every paged screen behaves alike. */
const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 100;

/**
 * The Usuários screen.
 *
 * A separate use case rather than a flag on `ListUsers`: the member pickers genuinely
 * need every user in one call, and folding both readings into one signature would make
 * every caller state which of the two it meant.
 */
export class ListUsersPage {
  constructor(private readonly queries: UserQueries) {}

  async execute(
    actor: Actor,
    input: { search?: string; roleUuid?: string; active?: boolean; page?: number; limit?: number },
  ): Promise<UserPageDTO> {
    actor.require('USER_ACCESS');

    if (input.roleUuid !== undefined && !Uuid.isValid(input.roleUuid)) {
      throw DomainError.validation('INVALID_ROLE', 'Perfil inválido.');
    }

    const pageSize = Math.min(Math.max(1, Math.trunc(input.limit ?? PAGE_SIZE_DEFAULT)), PAGE_SIZE_MAX);
    const pageNumber = Math.max(1, Math.trunc(input.page ?? 1));

    const page = await this.queries.listWithRolePage(
      {
        search: input.search,
        active: input.active,
        roleUuid: input.roleUuid ? Uuid.create(input.roleUuid) : undefined,
      },
      { page: pageNumber, limit: pageSize },
    );

    return {
      items: page.items.map((row) => ({ ...toDTO(row), demandPriorityCounts: row.demandPriorityCounts })),
      page: pageNumber,
      pageSize,
      total: page.total,
      totalPages: Math.max(1, Math.ceil(page.total / pageSize)),
    };
  }
}

/** The user profile screen: name, role, situação — everything the edit form needs. */
export class GetUser {
  constructor(private readonly queries: UserQueries) {}

  async execute(actor: Actor, userUuid: string): Promise<UserDTO> {
    actor.require('USER_ACCESS');
    if (!Uuid.isValid(userUuid)) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    const view = await this.queries.findWithRole(Uuid.create(userUuid));
    if (!view) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    return toDTO(view);
  }
}

/**
 * The profile screen's "Atualizações" section: every recorded change to this account,
 * newest first — the same idea as `GetDemandHistory`.
 *
 * Governed by USER_ACCESS, not by LOG_ACCESS: whoever may open the Usuários screen may
 * read how one account got to where it is, the same way opening a demand is enough to
 * read its own history. Technical (SYSTEM) events are left out entirely — unlike
 * `GetDemandHistory`, which shows them to whoever holds LOG_VIEW_SYSTEM, a person's own
 * account history is kept to the actions taken about it, not a side door into the
 * system log for a permission this screen was never meant to require.
 */
export class GetUserHistory {
  constructor(private readonly logs: LogQueries) {}

  async execute(
    actor: Actor,
    userUuid: string,
    page: { page?: number; limit?: number } = {},
  ): Promise<LogPageDTO> {
    actor.require('USER_ACCESS');
    if (!Uuid.isValid(userUuid)) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    const pageSize = clampPageSize(page.limit);
    const pageNumber = clampPageNumber(page.page);
    const result = await this.logs.search(
      { projectUuids: null, organization: true, system: false },
      { subjectType: 'USER', subjectUuid: userUuid },
      { page: pageNumber, limit: pageSize },
    );
    return toLogPageDTO(result, pageNumber, pageSize);
  }
}

export class CreateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly queries: UserQueries,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(actor: Actor, input: { name: string; roleUuid: string }): Promise<UserDTO> {
    actor.require('USER_CREATE');

    if (!Uuid.isValid(input.roleUuid)) {
      throw DomainError.validation('INVALID_ROLE', 'Perfil inválido.');
    }

    // Entity construction validates the name rule; the repository validates that the
    // role exists and is active. Neither check lives in the controller.
    const user = User.create({ name: input.name, roleUuid: Uuid.create(input.roleUuid) });

    if (await this.users.existsByName(user.name)) {
      throw DomainError.conflict('USER_ALREADY_EXISTS', 'Já existe um usuário com esse nome.');
    }

    const view = await this.uow.run(async () => {
      const created = await this.users.create(user);
      const persisted = await this.queries.findWithRole(created.uuid);
      if (!persisted) {
        throw DomainError.invariant('USER_NOT_PERSISTED', 'Falha ao carregar o usuário criado.');
      }
      await this.activity.record(logActorOf(actor), {
        action: 'user.created',
        subject: userSubject(persisted),
        metadata: { role: persisted.role.name },
      });
      return persisted;
    });

    return toDTO(view);
  }
}

export class UpdateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly queries: UserQueries,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(
    actor: Actor,
    userUuid: string,
    input: { name?: string; roleUuid?: string; active?: boolean },
  ): Promise<UserDTO> {
    actor.require('USER_UPDATE');

    if (!Uuid.isValid(userUuid)) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    const uuid = Uuid.create(userUuid);
    const user = await this.users.findByUuid(uuid);
    const before = await this.queries.findWithRole(uuid);
    if (!user || !before) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    if (input.name !== undefined) {
      user.rename(input.name);
      if (await this.users.existsByName(user.name, uuid)) {
        throw DomainError.conflict('USER_ALREADY_EXISTS', 'Já existe um usuário com esse nome.');
      }
    }
    if (input.roleUuid !== undefined) {
      if (!Uuid.isValid(input.roleUuid)) {
        throw DomainError.validation('INVALID_ROLE', 'Perfil inválido.');
      }
      const target = Uuid.create(input.roleUuid);
      // Privilege escalation guard: with USER_UPDATE alone, moving yourself into a more
      // powerful profile would grant yourself every permission that profile holds. Same
      // shape as CANNOT_DEACTIVATE_SELF below — another person with USER_UPDATE can do it.
      if (user.uuid.equals(actor.userUuid) && !target.equals(user.roleUuid)) {
        throw DomainError.forbidden(
          'CANNOT_CHANGE_OWN_ROLE',
          'Não é possível alterar o próprio perfil.',
        );
      }
      user.changeRole(target);
    }
    if (input.active !== undefined) {
      // Locking yourself out of the system by deactivating your own account is a
      // support ticket waiting to happen.
      if (!input.active && user.uuid.equals(actor.userUuid)) {
        throw DomainError.validation(
          'CANNOT_DEACTIVATE_SELF',
          'Não é possível desativar o próprio usuário.',
        );
      }
      user.setActive(input.active);
    }

    const after = await this.uow.run(async () => {
      await this.users.update(user);
      const persisted = await this.queries.findWithRole(uuid);
      if (!persisted) {
        throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
      }

      const changes: FieldChange[] = [];
      if (persisted.name !== before.name) {
        changes.push({ field: 'name', from: before.name, to: persisted.name });
      }
      if (persisted.role.uuid !== before.role.uuid) {
        changes.push({ field: 'role', from: before.role.name, to: persisted.role.name });
      }

      // Activation is its own event rather than one more field in "updated": deactivating
      // someone is the change an auditor goes looking for, so it must be filterable alone.
      if (changes.length > 0) {
        await this.activity.record(logActorOf(actor), {
          action: 'user.updated',
          subject: userSubject(persisted),
          changes,
        });
      }
      if (persisted.active !== before.active) {
        await this.activity.record(logActorOf(actor), {
          action: persisted.active ? 'user.activated' : 'user.deactivated',
          subject: userSubject(persisted),
        });
      }
      return persisted;
    });

    return toDTO(after);
  }
}

/**
 * Excludes a user — a soft delete, not a row removed from the database: the account is
 * deactivated (`active: false`, the same flag `UpdateUser` flips) and kept, exactly like
 * `Project.active`/`Demand.archived` elsewhere in this system. What makes this different
 * from a plain deactivation is the question a deactivation never asks: what happens to
 * the demands this person is responsible for. `UpdateUser` leaves them untouched — an
 * inactive responsible is a state the rest of the app already tolerates — but excluding
 * someone is a decision to stop counting on them, so the caller is made to say, for every
 * one of their demands, whether it should be deleted outright or archived off the board.
 *
 * The cascade is authorized by USER_DELETE alone, never by the acting admin's own demand
 * permissions: an Administrador who may exclude a user is not thereby asked to also hold
 * DEMAND_DELETE or DEMAND_ARCHIVE, because this is not the admin *acting on* those
 * demands as their own — it is a consequence of a user-management decision, scoped and
 * authorized entirely within that decision.
 */
export class DeleteUser {
  constructor(
    private readonly users: UserRepository,
    private readonly queries: UserQueries,
    private readonly demands: DemandRepository,
    private readonly demandQueries: DemandQueries,
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStoragePort,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
    private readonly demandActivity: DemandActivityLog,
    private readonly systemLogger: SystemLogger,
  ) {}

  async execute(
    actor: Actor,
    userUuid: string,
    input: { demandAction: 'delete' | 'archive' },
  ): Promise<void> {
    actor.requireAll(['USER_UPDATE', 'USER_DELETE']);

    if (!Uuid.isValid(userUuid)) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    const uuid = Uuid.create(userUuid);

    // Excluding yourself is the same support ticket UpdateUser already refuses to create.
    if (uuid.equals(actor.userUuid)) {
      throw DomainError.validation(
        'CANNOT_DELETE_SELF',
        'Não é possível excluir o próprio usuário.',
      );
    }

    const user = await this.users.findByUuid(uuid);
    const view = await this.queries.findWithRole(uuid);
    if (!user || !view) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    // Every demand this person is responsible for, regardless of project, status or
    // current archive state — this is a cascade of the *exclusion*, not a board reading
    // scoped to whatever the acting admin happens to be allocated to.
    const cards = await this.demandQueries.listCards({ responsibleUuid: uuid });

    const filesToRemove: { demand: { uuid: string; title: string }; keys: string[] }[] = [];

    await this.uow.run(async () => {
      for (const card of cards) {
        const demandUuid = Uuid.create(card.uuid);
        if (input.demandAction === 'delete') {
          const keys = await this.attachments.findStorageKeysOfDemand(demandUuid);
          await this.demandActivity.record(actor, 'demand.deleted', card, {
            metadata: {
              status: card.status,
              responsible: card.responsible.name,
              attachments: keys.length,
              checklistItems: card.checklist.length,
              reason: 'user_deleted',
            },
          });
          await this.demands.delete(demandUuid);
          filesToRemove.push({
            demand: { uuid: card.uuid, title: card.title },
            keys: keys.flatMap((key) => [key.storageKey, ...(key.thumbnailKey ? [key.thumbnailKey] : [])]),
          });
        } else if (!card.archived) {
          const demand = await this.demands.findByUuid(demandUuid);
          if (demand) {
            demand.setArchived(true);
            await this.demands.update(demand);
            await this.demandActivity.record(actor, 'demand.archived', card);
          }
        }
      }

      user.setActive(false);
      user.markDeleted(new Date());
      await this.users.update(user);
      await this.activity.record(logActorOf(actor), {
        action: 'user.deleted',
        subject: userSubject(view),
        metadata: { demandAction: input.demandAction, demandsAffected: cards.length },
      });
    });

    // Storage cleanup happens after the transaction commits, the same ordering
    // `DeleteDemand` follows: rows are the system of record, and a failed file removal
    // must not roll back a write that already succeeded.
    for (const { demand, keys } of filesToRemove) {
      if (keys.length > 0) {
        await removeStoredFiles(this.storage, this.systemLogger, { actor, demand }, keys);
      }
    }
  }
}

/**
 * Undoes an exclusion — the counterpart `DeleteUser` implies just by being a soft delete.
 *
 * Deliberately narrow: it clears `deletedAt` and nothing else. `active` is left exactly
 * as the exclusion set it (`false`), so reverting never silently hands the account back
 * its access — the situação toggle stays the one control that decides that, the same way
 * it already does for a plain deactivation. What a demand cascade did — archived or, if
 * the admin chose "excluir", permanently deleted — is not undone either: an archive can
 * still be reversed from the board itself, but a deletion cannot, and pretending this
 * button un-deletes demands would be a promise it cannot keep.
 */
export class RestoreUser {
  constructor(
    private readonly users: UserRepository,
    private readonly queries: UserQueries,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(actor: Actor, userUuid: string): Promise<UserDTO> {
    actor.requireAll(['USER_UPDATE', 'USER_DELETE']);

    if (!Uuid.isValid(userUuid)) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    const uuid = Uuid.create(userUuid);
    const user = await this.users.findByUuid(uuid);
    if (!user) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    if (!user.deleted) {
      throw DomainError.validation(
        'USER_NOT_DELETED',
        'Este usuário não está excluído.',
      );
    }

    user.restore();

    const after = await this.uow.run(async () => {
      await this.users.update(user);
      const persisted = await this.queries.findWithRole(uuid);
      if (!persisted) {
        throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
      }
      await this.activity.record(logActorOf(actor), {
        action: 'user.restored',
        subject: userSubject(persisted),
      });
      return persisted;
    });

    return toDTO(after);
  }
}
