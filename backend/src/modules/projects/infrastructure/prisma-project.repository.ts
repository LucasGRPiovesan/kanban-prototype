import {
  type Prisma,
  type Project as PrismaProject,
  type ProjectIntegrationCredential as PrismaIntegrationCredential,
} from '@prisma/client';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import {
  type IntegrationCredentialRepository,
  type ProjectListFilter,
  type ProjectMemberRepository,
  type ProjectMemberSummary,
  type ProjectMemberView,
  type ProjectRepository,
} from '../application/ports/repositories';
import { ProjectIntegrationCredential } from '../domain/integration-credential';
import { Project } from '../domain/project';

const ProjectMapper = {
  toDomain(row: PrismaProject & { createdBy: { uuid: string } }): Project {
    return Project.rehydrate({
      uuid: Uuid.create(row.uuid),
      name: row.name,
      description: row.description,
      active: row.active,
      createdByUserUuid: Uuid.create(row.createdBy.uuid),
    });
  },
};

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly database: PrismaDatabase) {}

  /** The open unit of work's transaction when there is one; the root client otherwise. */
  private get prisma() {
    return this.database.client;
  }

  async findByUuid(uuid: Uuid): Promise<Project | null> {
    const row = await this.prisma.project.findUnique({
      where: { uuid: uuid.toString() },
      include: { createdBy: { select: { uuid: true } } },
    });
    return row ? ProjectMapper.toDomain(row) : null;
  }

  async list(filter: ProjectListFilter = {}): Promise<Project[]> {
    const where: Prisma.ProjectWhereInput = {};
    if (filter.activeOnly) {
      where.active = true;
    }
    if (filter.search?.trim()) {
      where.name = { contains: filter.search.trim() };
    }
    // `null` = unrestricted (PROJECT_ACCESS_ALL). An empty array means the actor is
    // allocated to nothing and must see nothing — not "no filter".
    if (filter.restrictToUuids != null) {
      where.uuid = { in: [...filter.restrictToUuids] };
    }

    const rows = await this.prisma.project.findMany({
      where,
      include: { createdBy: { select: { uuid: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(ProjectMapper.toDomain);
  }

  async create(project: Project): Promise<Project> {
    const creator = await this.requireUserId(project.createdByUserUuid);
    const row = await this.prisma.project.create({
      data: {
        uuid: project.uuid.toString(),
        name: project.name,
        description: project.description,
        active: project.active,
        createdByUserId: creator,
      },
      include: { createdBy: { select: { uuid: true } } },
    });
    return ProjectMapper.toDomain(row);
  }

  async update(project: Project): Promise<Project> {
    const row = await this.prisma.project.update({
      where: { uuid: project.uuid.toString() },
      data: {
        name: project.name,
        description: project.description,
        active: project.active,
      },
      include: { createdBy: { select: { uuid: true } } },
    });
    return ProjectMapper.toDomain(row);
  }

  async existsByName(name: string, exceptUuid?: Uuid): Promise<boolean> {
    const found = await this.prisma.project.findFirst({ where: { name }, select: { uuid: true } });
    if (!found) {
      return false;
    }
    return exceptUuid ? found.uuid !== exceptUuid.toString() : true;
  }

  private async requireUserId(userUuid: Uuid): Promise<bigint> {
    const user = await this.prisma.user.findUnique({
      where: { uuid: userUuid.toString() },
      select: { id: true },
    });
    if (!user) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    return user.id;
  }
}

const IntegrationCredentialMapper = {
  toDomain(
    row: PrismaIntegrationCredential & { project: { uuid: string } } & {
      createdBy: { uuid: string };
    },
  ): ProjectIntegrationCredential {
    return ProjectIntegrationCredential.rehydrate({
      uuid: Uuid.create(row.uuid),
      projectUuid: Uuid.create(row.project.uuid),
      apiKey: row.apiKey,
      secretHash: row.secretHash,
      secretPreview: row.secretPreview,
      createdByUserUuid: Uuid.create(row.createdBy.uuid),
      createdAt: row.createdAt,
      rotatedAt: row.rotatedAt,
    });
  },
};

export class PrismaIntegrationCredentialRepository implements IntegrationCredentialRepository {
  constructor(private readonly database: PrismaDatabase) {}

  private get prisma() {
    return this.database.client;
  }

  private static readonly include = {
    project: { select: { uuid: true } },
    createdBy: { select: { uuid: true } },
  } satisfies Prisma.ProjectIntegrationCredentialInclude;

  async findByProjectUuid(projectUuid: Uuid): Promise<ProjectIntegrationCredential | null> {
    const row = await this.prisma.projectIntegrationCredential.findFirst({
      where: { project: { uuid: projectUuid.toString() } },
      include: PrismaIntegrationCredentialRepository.include,
    });
    return row ? IntegrationCredentialMapper.toDomain(row) : null;
  }

  async findByApiKey(apiKey: string): Promise<ProjectIntegrationCredential | null> {
    const row = await this.prisma.projectIntegrationCredential.findUnique({
      where: { apiKey },
      include: PrismaIntegrationCredentialRepository.include,
    });
    return row ? IntegrationCredentialMapper.toDomain(row) : null;
  }

  async save(credential: ProjectIntegrationCredential): Promise<ProjectIntegrationCredential> {
    const [project, creator] = await Promise.all([
      this.prisma.project.findUnique({
        where: { uuid: credential.projectUuid.toString() },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { uuid: credential.createdByUserUuid.toString() },
        select: { id: true },
      }),
    ]);
    if (!project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    if (!creator) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    // Regenerating overwrites identity in place — same row, new uuid/apiKey/secret —
    // which is what lets `projectId` stay UNIQUE (one active credential per project)
    // while still recording when the project's integration was first configured.
    const row = await this.prisma.projectIntegrationCredential.upsert({
      where: { projectId: project.id },
      create: {
        uuid: credential.uuid.toString(),
        projectId: project.id,
        apiKey: credential.apiKey,
        secretHash: credential.secretHash,
        secretPreview: credential.secretPreview,
        createdByUserId: creator.id,
        createdAt: credential.createdAt,
        rotatedAt: null,
      },
      update: {
        uuid: credential.uuid.toString(),
        apiKey: credential.apiKey,
        secretHash: credential.secretHash,
        secretPreview: credential.secretPreview,
        rotatedAt: new Date(),
      },
      include: PrismaIntegrationCredentialRepository.include,
    });
    return IntegrationCredentialMapper.toDomain(row);
  }

  async deleteByProjectUuid(projectUuid: Uuid): Promise<void> {
    await this.prisma.projectIntegrationCredential.deleteMany({
      where: { project: { uuid: projectUuid.toString() } },
    });
  }
}

export class PrismaProjectMemberRepository implements ProjectMemberRepository {
  constructor(private readonly database: PrismaDatabase) {}

  /** The open unit of work's transaction when there is one; the root client otherwise. */
  private get prisma() {
    return this.database.client;
  }

  async listProjectUuidsOfUser(userUuid: Uuid): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { user: { uuid: userUuid.toString() } },
      select: { project: { select: { uuid: true } } },
    });
    return rows.map((row) => row.project.uuid);
  }

  async listMembers(projectUuid: Uuid): Promise<ProjectMemberView[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { project: { uuid: projectUuid.toString() } },
      select: {
        createdAt: true,
        user: {
          select: {
            uuid: true,
            name: true,
            avatarUrl: true,
            active: true,
            role: { select: { uuid: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });
    return rows.map((row) => ({
      userUuid: row.user.uuid,
      name: row.user.name,
      avatarUrl: row.user.avatarUrl,
      active: row.user.active,
      role: row.user.role,
      memberSince: row.createdAt,
    }));
  }

  /**
   * Allocations of several projects at once, keyed by project uuid.
   *
   * One query for the whole listing rather than one per card: the Projetos screen shows
   * an avatar group on every card, and a per-card call would turn a single screen into
   * as many round trips as there are projects.
   */
  async listMemberSummaries(
    projectUuids: readonly string[],
  ): Promise<Map<string, ProjectMemberSummary[]>> {
    if (projectUuids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.projectMember.findMany({
      where: { project: { uuid: { in: [...projectUuids] } } },
      select: {
        project: { select: { uuid: true } },
        user: { select: { uuid: true, name: true, avatarUrl: true, active: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });

    const byProject = new Map<string, ProjectMemberSummary[]>();
    for (const row of rows) {
      const list = byProject.get(row.project.uuid) ?? [];
      list.push({
        uuid: row.user.uuid,
        name: row.user.name,
        avatarUrl: row.user.avatarUrl,
        active: row.user.active,
      });
      byProject.set(row.project.uuid, list);
    }
    return byProject;
  }

  async isMember(projectUuid: Uuid, userUuid: Uuid): Promise<boolean> {
    const found = await this.prisma.projectMember.findFirst({
      where: {
        project: { uuid: projectUuid.toString() },
        user: { uuid: userUuid.toString() },
      },
      select: { projectId: true },
    });
    return found !== null;
  }

  async add(projectUuid: Uuid, userUuid: Uuid): Promise<void> {
    const { projectId, userId } = await this.resolveIds(projectUuid, userUuid);
    // Re-adding an existing member is a no-op rather than an error: allocation is a
    // set, and the caller's intent ("this user is on the project") is already true.
    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId },
      update: {},
    });
  }

  async remove(projectUuid: Uuid, userUuid: Uuid): Promise<void> {
    const { projectId, userId } = await this.resolveIds(projectUuid, userUuid);
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
  }

  async replaceMembers(projectUuid: Uuid, userUuids: readonly Uuid[]): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { uuid: projectUuid.toString() },
      select: { id: true },
    });
    if (!project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    const users = await this.prisma.user.findMany({
      where: { uuid: { in: userUuids.map((u) => u.toString()) } },
      select: { id: true, uuid: true },
    });
    if (users.length !== userUuids.length) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Um ou mais usuários não foram encontrados.');
    }

    // Wholesale replacement must be atomic: a partially applied allocation would
    // silently revoke access for users the operator never intended to remove.
    await this.database.transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId: project.id } });
      await tx.projectMember.createMany({
        data: users.map((user) => ({ projectId: project.id, userId: user.id })),
      });
    });
  }

  async countDemandsOfMember(projectUuid: Uuid, userUuid: Uuid): Promise<number> {
    return this.prisma.demand.count({
      where: {
        project: { uuid: projectUuid.toString() },
        responsible: { uuid: userUuid.toString() },
      },
    });
  }

  private async resolveIds(
    projectUuid: Uuid,
    userUuid: Uuid,
  ): Promise<{ projectId: bigint; userId: bigint }> {
    const [project, user] = await Promise.all([
      this.prisma.project.findUnique({
        where: { uuid: projectUuid.toString() },
        select: { id: true },
      }),
      this.prisma.user.findUnique({ where: { uuid: userUuid.toString() }, select: { id: true } }),
    ]);
    if (!project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    if (!user) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    return { projectId: project.id, userId: user.id };
  }
}
