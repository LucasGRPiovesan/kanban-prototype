import { Actor } from '../../../../shared/application/actor';
import { type ActivityRecorder, logActorOf } from '../../../../shared/application/activity-log.port';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import { PermissionSet } from '../../domain/permission-set';
import { type EffectivePermissionsResolver, type UserQueries } from '../ports/repositories';
import { type TokenService } from '../ports/token-service';

export interface LoginCandidateDTO {
  uuid: string;
  name: string;
  avatarUrl: string | null;
  role: { uuid: string; name: string; slug: string };
}

/**
 * The specification asks for user selection rather than a password, so this is
 * deliberately not password authentication and no credential is invented. The
 * candidate list is therefore public by design — it is the login screen itself.
 */
export class ListLoginCandidates {
  constructor(private readonly users: UserQueries) {}

  async execute(): Promise<LoginCandidateDTO[]> {
    const users = await this.users.listWithRole({ activeOnly: true });
    return users.map((user) => ({
      uuid: user.userUuid,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    }));
  }
}

export interface SessionDTO {
  user: { uuid: string; name: string; avatarUrl: string | null };
  role: { uuid: string; slug: string; name: string };
  permissions: string[];
}

export class Login {
  constructor(
    private readonly permissions: EffectivePermissionsResolver,
    private readonly tokens: TokenService,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: { userUuid: string }): Promise<{ token: string; session: SessionDTO }> {
    if (!Uuid.isValid(input.userUuid)) {
      throw DomainError.validation('INVALID_USER', 'Usuário inválido.');
    }
    const resolved = await this.permissions.resolve(Uuid.create(input.userUuid));
    if (!resolved || !resolved.active) {
      throw DomainError.unauthorized('INVALID_USER', 'Usuário não encontrado ou inativo.');
    }

    const token = this.tokens.issue({ sub: resolved.userUuid });

    // Sessions are organization-scoped activity: who entered the system, as whom.
    await this.activity.record(
      { uuid: resolved.userUuid, name: resolved.name },
      {
        action: 'session.started',
        subject: { type: 'USER', uuid: resolved.userUuid, label: resolved.name },
        metadata: { role: resolved.roleName },
      },
    );

    return {
      token,
      session: {
        user: { uuid: resolved.userUuid, name: resolved.name, avatarUrl: resolved.avatarUrl },
        role: { uuid: resolved.roleUuid, slug: resolved.roleSlug, name: resolved.roleName },
        permissions: resolved.permissions,
      },
    };
  }
}

/**
 * Rebuilds the actor from a session token on every request. Because permissions are
 * re-read here, a role edited by an administrator affects live sessions immediately.
 */
export class ResolveActor {
  constructor(private readonly permissions: EffectivePermissionsResolver) {}

  async execute(userUuid: string): Promise<Actor> {
    if (!Uuid.isValid(userUuid)) {
      throw DomainError.unauthorized('INVALID_SESSION', 'Sessão inválida.');
    }
    const resolved = await this.permissions.resolve(Uuid.create(userUuid));
    if (!resolved || !resolved.active) {
      throw DomainError.unauthorized('SESSION_USER_UNAVAILABLE', 'Usuário da sessão indisponível.');
    }
    return new Actor(
      Uuid.create(resolved.userUuid),
      resolved.name,
      Uuid.create(resolved.roleUuid),
      resolved.roleSlug,
      resolved.roleName,
      PermissionSet.fromCodes(resolved.permissions),
      resolved.avatarUrl,
    );
  }
}

export class GetCurrentSession {
  execute(actor: Actor): SessionDTO {
    return {
      user: { uuid: actor.userUuid.toString(), name: actor.name, avatarUrl: actor.avatarUrl },
      role: { uuid: actor.roleUuid.toString(), slug: actor.roleSlug, name: actor.roleName },
      permissions: actor.permissions.toArray(),
    };
  }
}

/**
 * Ends a session, recording it when the session can still be identified.
 *
 * Never throws. Signing out must work with an expired, revoked or tampered cookie — those
 * are exactly the cases where someone most needs to get back to the login screen — and a
 * session that cannot be verified has nobody to attribute the event to.
 */
export class Logout {
  constructor(
    private readonly tokens: TokenService,
    private readonly resolveActor: ResolveActor,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(token: string | null): Promise<void> {
    if (!token) {
      return;
    }
    try {
      const claims = this.tokens.verify(token);
      const actor = await this.resolveActor.execute(claims.sub);
      await this.activity.record(logActorOf(actor), {
        action: 'session.ended',
        subject: { type: 'USER', uuid: actor.userUuid.toString(), label: actor.name },
      });
    } catch {
      // Unverifiable session: nothing to record, and nothing that should stop the sign-out.
    }
  }
}
