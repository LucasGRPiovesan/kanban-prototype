import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { type CommentRepository, type DemandCommentView } from '../application/ports/repositories';
import { DemandComment } from '../domain/demand-comment';

/** Hard ceiling on one thread per request. A demand with more is an outlier worth paging. */
const THREAD_LIMIT = 500;

const WITH_REFS = {
  demand: { select: { uuid: true } },
  author: { select: { uuid: true, name: true, avatarUrl: true } },
  parentComment: { select: { uuid: true } },
} as const;

export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly database: PrismaDatabase) {}

  private get prisma() {
    return this.database.client;
  }

  async findByUuid(uuid: Uuid): Promise<DemandComment | null> {
    const row = await this.prisma.demandComment.findUnique({
      where: { uuid: uuid.toString() },
      include: WITH_REFS,
    });
    if (!row) {
      return null;
    }
    return DemandComment.rehydrate({
      uuid: Uuid.create(row.uuid),
      demandUuid: Uuid.create(row.demand.uuid),
      authorUuid: Uuid.create(row.author.uuid),
      parentCommentUuid: row.parentComment ? Uuid.create(row.parentComment.uuid) : null,
      body: row.body,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
    });
  }

  async findView(uuid: Uuid): Promise<DemandCommentView | null> {
    const row = await this.prisma.demandComment.findUnique({
      where: { uuid: uuid.toString() },
      include: WITH_REFS,
    });
    return row ? toView(row) : null;
  }

  async listByDemand(demandUuid: Uuid): Promise<DemandCommentView[]> {
    const rows = await this.prisma.demandComment.findMany({
      where: { demand: { uuid: demandUuid.toString() } },
      include: WITH_REFS,
      // Newest first: the composer sits above the thread, so the latest reply is the
      // one next to where the user is about to type.
      orderBy: [{ createdAt: 'desc' }, { uuid: 'desc' }],
      take: THREAD_LIMIT,
    });
    return rows.map(toView);
  }

  async create(comment: DemandComment): Promise<void> {
    const [demand, author, parent] = await Promise.all([
      this.prisma.demand.findUnique({
        where: { uuid: comment.demandUuid.toString() },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { uuid: comment.authorUuid.toString() },
        select: { id: true },
      }),
      comment.parentCommentUuid
        ? this.prisma.demandComment.findUnique({
            where: { uuid: comment.parentCommentUuid.toString() },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!demand) {
      throw DomainError.notFound('DEMAND_NOT_FOUND', 'Demanda não encontrada.');
    }
    if (!author) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    if (comment.parentCommentUuid && !parent) {
      throw DomainError.notFound('COMMENT_NOT_FOUND', 'Comentário não encontrado.');
    }
    await this.prisma.demandComment.create({
      data: {
        uuid: comment.uuid.toString(),
        demandId: demand.id,
        authorUserId: author.id,
        parentCommentId: parent?.id ?? null,
        body: comment.body,
        createdAt: comment.createdAt,
      },
    });
  }

  async update(comment: DemandComment): Promise<void> {
    await this.prisma.demandComment.update({
      where: { uuid: comment.uuid.toString() },
      data: { body: comment.body, editedAt: comment.editedAt },
    });
  }

  async delete(uuid: Uuid): Promise<void> {
    await this.prisma.demandComment.delete({ where: { uuid: uuid.toString() } });
  }
}

function toView(row: {
  uuid: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  demand: { uuid: string };
  author: { uuid: string; name: string; avatarUrl: string | null };
  parentComment: { uuid: string } | null;
}): DemandCommentView {
  return {
    uuid: row.uuid,
    demandUuid: row.demand.uuid,
    parentUuid: row.parentComment?.uuid ?? null,
    body: row.body,
    author: { uuid: row.author.uuid, name: row.author.name, avatarUrl: row.author.avatarUrl },
    createdAt: row.createdAt,
    editedAt: row.editedAt,
  };
}
