import { type Actor } from '../../../../shared/application/actor';
import {
  type ActivityRecorder,
  type FieldChange,
  logActorOf,
} from '../../../../shared/application/activity-log.port';
import { type UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import { Project } from '../../domain/project';
import { ProjectAccessPolicy } from '../../domain/project-access-policy';
import { type ProjectMemberRepository, type ProjectMemberView, type ProjectRepository } from '../ports/repositories';

export interface ProjectDTO {
  uuid: string;
  name: string;
  description: string;
  active: boolean;
  /**
   * Who is allocated here. Present on the listing — the Projetos screen draws an avatar
   * group on every card — and empty on the single-project reads, which have a dedicated
   * members endpoint with the fuller view.
   */
  members: { uuid: string; name: string; avatarUrl: string | null; active: boolean }[];
}

function toDTO(
  project: Project,
  members: ProjectDTO['members'] = [],
): ProjectDTO {
  return {
    uuid: project.uuid.toString(),
    name: project.name,
    description: project.description,
    active: project.active,
    members,
  };
}

/**
 * Project entries are scoped to the project itself: allocation changes are visible to the
 * people allocated there, which is exactly who needs to know about them.
 */
function projectContext(project: Project) {
  return {
    subject: { type: 'PROJECT' as const, uuid: project.uuid.toString(), label: project.name },
    project: { uuid: project.uuid.toString(), name: project.name },
  };
}

/**
 * Builds the access policy for a given actor.
 *
 * Every project-scoped use case starts here, which is what makes the isolation rule
 * impossible to forget: there is no path to a project that does not first pass through
 * a policy built from the actor's real allocations.
 */
export class ProjectAccessResolver {
  constructor(private readonly members: ProjectMemberRepository) {}

  async forActor(actor: Actor): Promise<ProjectAccessPolicy> {
    if (actor.hasGlobalProjectAccess()) {
      // No point querying allocations for an actor who bypasses them.
      return ProjectAccessPolicy.forMemberships([]);
    }
    return ProjectAccessPolicy.forMemberships(
      await this.members.listProjectUuidsOfUser(actor.userUuid),
    );
  }
}

export class ListProjects {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccessResolver,
    private readonly members: ProjectMemberRepository,
  ) {}

  async execute(actor: Actor, filter: { search?: string; activeOnly?: boolean } = {}): Promise<ProjectDTO[]> {
    actor.require('PROJECT_ACCESS');
    const policy = await this.access.forActor(actor);
    const projects = await this.projects.list({
      search: filter.search,
      activeOnly: filter.activeOnly ?? true,
      restrictToUuids: policy.visibleProjectUuids(actor),
    });

    // One query for every card's avatar group, rather than one per project.
    const membersByProject = await this.members.listMemberSummaries(
      projects.map((project) => project.uuid.toString()),
    );
    return projects.map((project) =>
      toDTO(project, membersByProject.get(project.uuid.toString()) ?? []),
    );
  }
}

export class GetProject {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccessResolver,
  ) {}

  async execute(actor: Actor, projectUuid: string): Promise<ProjectDTO> {
    actor.require('PROJECT_ACCESS');
    const uuid = parseUuid(projectUuid, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    const policy = await this.access.forActor(actor);
    policy.assertAccess(actor, uuid);

    const project = await this.projects.findByUuid(uuid);
    if (!project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    return toDTO(project);
  }
}

export class CreateProject {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly members: ProjectMemberRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(
    actor: Actor,
    input: { name: string; description: string; memberUuids?: string[] },
  ): Promise<ProjectDTO> {
    actor.require('PROJECT_CREATE');
    // Checked before anything is written: a project created and then refused its members
    // would leave half an operation behind for someone to clean up.
    if (input.memberUuids?.length) {
      actor.require('PROJECT_MANAGE_MEMBERS');
    }

    const project = Project.create({
      name: input.name,
      description: input.description,
      createdByUserUuid: actor.userUuid,
    });

    if (await this.projects.existsByName(project.name)) {
      throw DomainError.conflict('PROJECT_ALREADY_EXISTS', 'Já existe um projeto com esse nome.');
    }

    const persisted = await this.uow.run(async () => {
      const created = await this.projects.create(project);
      const author = logActorOf(actor);
      await this.activity.record(author, {
        action: 'project.created',
        ...projectContext(created),
        metadata: { description: created.description },
      });

      if (input.memberUuids?.length) {
        await this.members.replaceMembers(
          created.uuid,
          input.memberUuids.map((uuid) => parseUuid(uuid, 'USER_NOT_FOUND', 'Usuário inválido.')),
        );
        for (const member of await this.members.listMembers(created.uuid)) {
          await this.activity.record(author, {
            action: 'project.member_added',
            ...projectContext(created),
            metadata: { member: { uuid: member.userUuid, name: member.name } },
          });
        }
      }
      return created;
    });

    return toDTO(persisted);
  }
}

export class UpdateProject {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccessResolver,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(
    actor: Actor,
    projectUuid: string,
    input: { name?: string; description?: string; active?: boolean },
  ): Promise<ProjectDTO> {
    actor.require('PROJECT_UPDATE');
    const uuid = parseUuid(projectUuid, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.');

    const policy = await this.access.forActor(actor);
    policy.assertAccess(actor, uuid);

    const project = await this.projects.findByUuid(uuid);
    if (!project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    const before = { name: project.name, description: project.description, active: project.active };

    if (input.name !== undefined) {
      project.rename(input.name);
      if (await this.projects.existsByName(project.name, uuid)) {
        throw DomainError.conflict('PROJECT_ALREADY_EXISTS', 'Já existe um projeto com esse nome.');
      }
    }
    if (input.description !== undefined) {
      project.changeDescription(input.description);
    }
    if (input.active !== undefined) {
      project.setActive(input.active);
    }

    const updated = await this.uow.run(async () => {
      const persisted = await this.projects.update(project);
      const author = logActorOf(actor);

      const changes: FieldChange[] = [];
      if (persisted.name !== before.name) {
        changes.push({ field: 'name', from: before.name, to: persisted.name });
      }
      if (persisted.description !== before.description) {
        changes.push({ field: 'description', from: before.description, to: persisted.description });
      }
      if (changes.length > 0) {
        await this.activity.record(author, {
          action: 'project.updated',
          ...projectContext(persisted),
          changes,
        });
      }
      if (persisted.active !== before.active) {
        await this.activity.record(author, {
          action: persisted.active ? 'project.activated' : 'project.deactivated',
          ...projectContext(persisted),
        });
      }
      return persisted;
    });

    return toDTO(updated);
  }
}

export class ListProjectMembers {
  constructor(
    private readonly members: ProjectMemberRepository,
    private readonly access: ProjectAccessResolver,
  ) {}

  async execute(actor: Actor, projectUuid: string): Promise<ProjectMemberView[]> {
    actor.require('PROJECT_ACCESS');
    const uuid = parseUuid(projectUuid, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    const policy = await this.access.forActor(actor);
    policy.assertAccess(actor, uuid);
    return this.members.listMembers(uuid);
  }
}

export class AddProjectMember {
  constructor(
    private readonly members: ProjectMemberRepository,
    private readonly projects: ProjectRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
    private readonly access: ProjectAccessResolver,
  ) {}

  async execute(actor: Actor, projectUuid: string, userUuid: string): Promise<void> {
    actor.require('PROJECT_MANAGE_MEMBERS');
    const uuid = parseUuid(projectUuid, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    // Managing members is not a way around project isolation: without PROJECT_ACCESS_ALL an
    // actor could otherwise allocate themselves to a project they cannot see — and gain it.
    (await this.access.forActor(actor)).assertAccess(actor, uuid);
    const project = await this.projects.findByUuid(uuid);
    if (!project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    const user = parseUuid(userUuid, 'USER_NOT_FOUND', 'Usuário não encontrado.');

    // Re-adding an existing member is a no-op, and a no-op is not an event.
    if (await this.members.isMember(uuid, user)) {
      return;
    }

    await this.uow.run(async () => {
      await this.members.add(uuid, user);
      const member = (await this.members.listMembers(uuid)).find(
        (candidate) => candidate.userUuid === user.toString(),
      );
      await this.activity.record(logActorOf(actor), {
        action: 'project.member_added',
        ...projectContext(project),
        metadata: { member: { uuid: user.toString(), name: member?.name ?? null } },
      });
    });
  }
}

export class RemoveProjectMember {
  constructor(
    private readonly members: ProjectMemberRepository,
    private readonly projects: ProjectRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
    private readonly access: ProjectAccessResolver,
  ) {}

  async execute(actor: Actor, projectUuid: string, userUuid: string): Promise<void> {
    actor.require('PROJECT_MANAGE_MEMBERS');
    const projectId = parseUuid(projectUuid, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    // Same isolation rule as AddProjectMember.
    (await this.access.forActor(actor)).assertAccess(actor, projectId);
    const user = parseUuid(userUuid, 'USER_NOT_FOUND', 'Usuário não encontrado.');

    const project = await this.projects.findByUuid(projectId);
    if (!project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }

    // Removing an allocation must not strand demands with a responsible who is no
    // longer allowed to act on the project — that would break the invariant
    // "responsible ∈ project.members" from the outside.
    const openDemands = await this.members.countDemandsOfMember(projectId, user);
    if (openDemands > 0) {
      throw DomainError.conflict(
        'MEMBER_HAS_DEMANDS',
        `Não é possível remover o usuário: ele é responsável por ${openDemands} demanda(s) neste projeto.`,
      );
    }

    // The name is read before the allocation goes; afterwards it is no longer reachable
    // through the project.
    const member = (await this.members.listMembers(projectId)).find(
      (candidate) => candidate.userUuid === user.toString(),
    );
    if (!member) {
      return;
    }

    await this.uow.run(async () => {
      await this.members.remove(projectId, user);
      await this.activity.record(logActorOf(actor), {
        action: 'project.member_removed',
        ...projectContext(project),
        metadata: { member: { uuid: member.userUuid, name: member.name } },
      });
    });
  }
}

function parseUuid(value: string, code: string, message: string): Uuid {
  if (!Uuid.isValid(value)) {
    throw DomainError.notFound(code, message);
  }
  return Uuid.create(value);
}
