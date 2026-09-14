import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';

/**
 * Name rule from the specification: letters only, accented characters accepted,
 * single spaces between words. Enforced here so it holds regardless of which
 * entry point (HTTP, seed, future import) creates the user.
 */
const NAME_PATTERN = /^[\p{L}]+(?:[ '\u2019-][\p{L}]+)*$/u;
const NAME_MIN = 2;
const NAME_MAX = 160;

export interface UserProps {
  uuid: Uuid;
  name: string;
  /** Absolute URL of a profile picture, or `null`. Purely a decoration — see Avatar. */
  avatarUrl: string | null;
  roleUuid: Uuid;
  active: boolean;
  /** Soft-delete marker, independent of `active` — see `deleted`. */
  deletedAt: Date | null;
}

export class User {
  private constructor(private props: UserProps) {}

  static create(input: { name: string; roleUuid: Uuid }): User {
    return new User({
      uuid: Uuid.generate(),
      name: User.assertName(input.name),
      avatarUrl: null,
      roleUuid: input.roleUuid,
      active: true,
      deletedAt: null,
    });
  }

  static rehydrate(props: UserProps): User {
    return new User(props);
  }

  get uuid(): Uuid {
    return this.props.uuid;
  }
  get name(): string {
    return this.props.name;
  }
  get avatarUrl(): string | null {
    return this.props.avatarUrl;
  }
  get roleUuid(): Uuid {
    return this.props.roleUuid;
  }
  get active(): boolean {
    return this.props.active;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  /** Excluded, in the soft-delete sense — distinct from merely being inactive. */
  get deleted(): boolean {
    return this.props.deletedAt !== null;
  }

  rename(name: string): void {
    this.props.name = User.assertName(name);
  }

  /** `null` removes the picture; the UI falls back to the initials either way. */
  changeAvatar(url: string | null): void {
    this.props.avatarUrl = url ? User.assertAvatarUrl(url) : null;
  }

  changeRole(roleUuid: Uuid): void {
    this.props.roleUuid = roleUuid;
  }

  /**
   * An excluded account cannot be reactivated directly: its exclusion has to be reverted
   * first (`restore`). The profile screen already disables the toggle in that state; this
   * makes the rule hold for every caller of the API, not only for that screen — otherwise
   * a single PATCH would let an excluded person sign in again while still listed as excluded.
   */
  setActive(active: boolean): void {
    if (active && this.deleted) {
      throw DomainError.conflict(
        'USER_DELETED',
        'Usuário excluído: reverta a exclusão antes de reativá-lo.',
      );
    }
    this.props.active = active;
  }

  /** Soft delete: marks the account excluded. Callers still decide `active` themselves. */
  markDeleted(at: Date): void {
    this.props.deletedAt = at;
  }

  /**
   * Undoes exclusion, and only that: `active` is left exactly as the exclusion set it, so
   * the situação toggle remains the one place that decides whether the account is live
   * again — reverting never silently reactivates it.
   */
  restore(): void {
    this.props.deletedAt = null;
  }

  static assertName(value: string): string {
    const name = value.trim().replace(/\s+/g, ' ');
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw DomainError.validation(
        'INVALID_USER_NAME',
        `O nome deve ter entre ${NAME_MIN} e ${NAME_MAX} caracteres.`,
      );
    }
    if (!NAME_PATTERN.test(name)) {
      throw DomainError.validation(
        'INVALID_USER_NAME',
        'O nome deve conter apenas letras, com ou sem acentuação.',
      );
    }
    return name;
  }

  /** Shape only — the picture itself is fetched by the browser, not by this server. */
  private static assertAvatarUrl(value: string): string {
    const url = value.trim();
    if (url.length > 500) {
      throw DomainError.validation('INVALID_AVATAR_URL', 'O link da foto é muito longo.');
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('not http(s)');
      }
    } catch {
      throw DomainError.validation('INVALID_AVATAR_URL', 'Informe um link válido (http ou https).');
    }
    return url;
  }
}
