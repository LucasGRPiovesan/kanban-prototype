import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';

const BODY_MAX = 5000;
const EXCERPT_LENGTH = 140;

export interface DemandCommentProps {
  uuid: Uuid;
  demandUuid: Uuid;
  authorUuid: Uuid;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
}

/**
 * A comment on a demand — an aggregate of its own.
 *
 * Not part of the Demand aggregate, deliberately. A conversation is unbounded and written
 * by several people at once; none of the demand's invariants depend on it; and routing
 * every new line through the demand root would mean loading the demand, and every other
 * comment, to append one sentence.
 *
 * Its one real rule is authorship: only the person who wrote a comment may change or
 * remove it. That lives here, not in a controller, so no future endpoint can skip it.
 *
 * Comments are also allowed on a demand in production. Production freezes a demand's
 * *scope* — what it is, what it delivers. Conversation about a delivered demand is not
 * scope, and forbidding it would push post-release feedback somewhere untracked.
 */
export class DemandComment {
  private constructor(private props: DemandCommentProps) {}

  static create(input: { demandUuid: Uuid; authorUuid: Uuid; body: string }): DemandComment {
    return new DemandComment({
      uuid: Uuid.generate(),
      demandUuid: input.demandUuid,
      authorUuid: input.authorUuid,
      body: DemandComment.assertBody(input.body),
      createdAt: new Date(),
      editedAt: null,
    });
  }

  static rehydrate(props: DemandCommentProps): DemandComment {
    return new DemandComment(props);
  }

  get uuid(): Uuid {
    return this.props.uuid;
  }
  get demandUuid(): Uuid {
    return this.props.demandUuid;
  }
  get authorUuid(): Uuid {
    return this.props.authorUuid;
  }
  get body(): string {
    return this.props.body;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get editedAt(): Date | null {
    return this.props.editedAt;
  }

  isAuthoredBy(userUuid: Uuid): boolean {
    return this.props.authorUuid.equals(userUuid);
  }

  /** @returns whether the body actually changed — an identical save is not an edit. */
  edit(editorUuid: Uuid, body: string): boolean {
    this.assertAuthor(editorUuid);
    const next = DemandComment.assertBody(body);
    if (next === this.props.body) {
      return false;
    }
    this.props.body = next;
    this.props.editedAt = new Date();
    return true;
  }

  assertCanDelete(userUuid: Uuid): void {
    this.assertAuthor(userUuid);
  }

  /** A short, single-line quote for places that must not reproduce the whole body. */
  excerpt(): string {
    const flat = this.props.body.replace(/\s+/g, ' ').trim();
    return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
  }

  private assertAuthor(userUuid: Uuid): void {
    if (!this.isAuthoredBy(userUuid)) {
      throw DomainError.forbidden(
        'COMMENT_NOT_AUTHOR',
        'Apenas o autor pode alterar ou excluir este comentário.',
      );
    }
  }

  private static assertBody(value: string): string {
    const body = value.replace(/\r\n?/g, '\n').trim();
    if (body.length === 0 || body.length > BODY_MAX) {
      throw DomainError.validation(
        'INVALID_COMMENT',
        `O comentário deve ter entre 1 e ${BODY_MAX} caracteres.`,
      );
    }
    return body;
  }
}
