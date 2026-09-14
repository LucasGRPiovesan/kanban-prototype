import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import { type PermissionCode } from './permission';
import { PermissionSet } from './permission-set';

export interface RoleProps {
  uuid: Uuid;
  name: string;
  slug: string;
  isSystem: boolean;
  active: boolean;
  permissions: PermissionSet;
}

const NAME_MIN = 3;
const NAME_MAX = 120;

export class Role {
  private constructor(private props: RoleProps) {}

  static create(input: { name: string; permissions: readonly string[] }): Role {
    const name = Role.assertName(input.name);
    return new Role({
      uuid: Uuid.generate(),
      name,
      slug: Role.slugify(name),
      isSystem: false,
      active: true,
      permissions: PermissionSet.fromCodes(PermissionSet.normalize(input.permissions)),
    });
  }

  static rehydrate(props: RoleProps): Role {
    return new Role(props);
  }

  get uuid(): Uuid {
    return this.props.uuid;
  }
  get name(): string {
    return this.props.name;
  }
  get slug(): string {
    return this.props.slug;
  }
  get isSystem(): boolean {
    return this.props.isSystem;
  }
  get active(): boolean {
    return this.props.active;
  }
  get permissions(): PermissionSet {
    return this.props.permissions;
  }

  rename(name: string): void {
    this.props.name = Role.assertName(name);
  }

  /**
   * System roles keep their identity (slug/active) but remain permission-editable:
   * the evaluator must be able to experiment with the matrix without the seed roles
   * being frozen, while `is_system` still protects them from being renamed away or
   * deactivated into an unusable state.
   */
  changePermissions(codes: readonly string[]): void {
    this.props.permissions = PermissionSet.fromCodes(PermissionSet.normalize(codes));
  }

  deactivate(): void {
    if (this.props.isSystem) {
      throw DomainError.forbidden(
        'SYSTEM_ROLE_IMMUTABLE',
        'Perfis de sistema não podem ser desativados.',
      );
    }
    this.props.active = false;
  }

  activate(): void {
    this.props.active = true;
  }

  grants(code: PermissionCode): boolean {
    return this.props.permissions.has(code);
  }

  private static assertName(value: string): string {
    const name = value.trim().replace(/\s+/g, ' ');
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw DomainError.validation(
        'INVALID_ROLE_NAME',
        `O nome do perfil deve ter entre ${NAME_MIN} e ${NAME_MAX} caracteres.`,
      );
    }
    return name;
  }

  private static slugify(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }
}
