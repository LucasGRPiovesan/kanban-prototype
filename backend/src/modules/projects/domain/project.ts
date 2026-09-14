import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';

const NAME_MIN = 3;
const NAME_MAX = 160;
const DESCRIPTION_MAX = 500;

export interface ProjectProps {
  uuid: Uuid;
  name: string;
  description: string;
  active: boolean;
  createdByUserUuid: Uuid;
}

export class Project {
  private constructor(private props: ProjectProps) {}

  static create(input: { name: string; description: string; createdByUserUuid: Uuid }): Project {
    return new Project({
      uuid: Uuid.generate(),
      name: Project.assertName(input.name),
      description: Project.assertDescription(input.description),
      active: true,
      createdByUserUuid: input.createdByUserUuid,
    });
  }

  static rehydrate(props: ProjectProps): Project {
    return new Project(props);
  }

  get uuid(): Uuid {
    return this.props.uuid;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string {
    return this.props.description;
  }
  get active(): boolean {
    return this.props.active;
  }
  get createdByUserUuid(): Uuid {
    return this.props.createdByUserUuid;
  }

  rename(name: string): void {
    this.props.name = Project.assertName(name);
  }

  changeDescription(description: string): void {
    this.props.description = Project.assertDescription(description);
  }

  setActive(active: boolean): void {
    this.props.active = active;
  }

  private static assertName(value: string): string {
    const name = value.trim().replace(/\s+/g, ' ');
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw DomainError.validation(
        'INVALID_PROJECT_NAME',
        `O nome do projeto deve ter entre ${NAME_MIN} e ${NAME_MAX} caracteres.`,
      );
    }
    return name;
  }

  private static assertDescription(value: string): string {
    const description = value.trim();
    if (description.length === 0 || description.length > DESCRIPTION_MAX) {
      throw DomainError.validation(
        'INVALID_PROJECT_DESCRIPTION',
        `A descrição do projeto é obrigatória e deve ter no máximo ${DESCRIPTION_MAX} caracteres.`,
      );
    }
    return description;
  }
}
