import { z } from 'zod';
import { type Actor } from '../../../shared/application/actor';
import {
  type ActivityRecorder,
  type FieldChange,
  type SystemLogger,
  logActorOf,
} from '../../../shared/application/activity-log.port';
import { type RateLimiter } from '../../../shared/application/rate-limiter.port';
import { type SecretCipher } from '../../../shared/application/secret-cipher.port';
import { type UnitOfWork } from '../../../shared/application/unit-of-work.port';
import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import {
  type DashboardDTO,
  type DemandFlowQueries,
  type GetDashboard,
} from '../../dashboard/application/get-dashboard';
import { calendarDateIn } from '../../dashboard/domain/dashboard-metrics';
import {
  type AssigneeDirectory,
  type DemandQueries,
} from '../../demands/application/ports/repositories';
import { type DemandAccessGuard } from '../../demands/application/use-cases/demand.use-cases';
import { type ProjectRepository } from '../../projects/application/ports/repositories';
import { type ProjectAccessResolver } from '../../projects/application/use-cases/project.use-cases';
import {
  ACTION_LABELS,
  ACTION_PERMISSIONS,
  ASSISTANT_ACTIONS,
  type AssistantAction,
  type WrittenAction,
  isWrittenAction,
} from '../domain/assistant-actions';
import {
  ASSISTANT_MODELS,
  ASSISTANT_PROVIDER_NAME,
  type AssistantSettingsState,
  isAssistantModel,
  isPlausibleApiKey,
  modelLabel,
  previewOf,
} from '../domain/assistant-settings';
import {
  type BoardContext,
  PRIORITY_LABELS,
  STATUS_LABELS,
  buildBoardContext,
  describeDemand,
  formatDayMonth,
  formatFullDate,
  plural,
  previousBusinessDay,
  startOfDayIn,
  weekdayOf,
} from '../domain/board-context';
import { type ChecklistPlan, resolveChecklistPlan } from '../domain/checklist-plan';
import { type Citation, resolveCitations } from '../domain/citations';
import {
  type DemandDraft,
  type DraftPerson,
  type DraftProject,
  resolveDemandDraft,
} from '../domain/demand-draft';
import { clip, dataCell, plainText } from '../domain/text';
import {
  type AssistantSettingsRepository,
  type DemandActivityQueries,
  type LanguageModel,
  LanguageModelError,
  type LanguageModelProvider,
  type LanguageModelRequest,
} from './ports';
import {
  CHECKLIST_SCHEMA,
  CLASSIFY_SCHEMA,
  DRAFT_SCHEMA,
  checklistSystem,
  classifySystem,
  draftSystem,
  userTurn,
  writtenSystem,
} from './prompts';

type Ref = { uuid: string; name: string };

// --- status and configuration ----------------------------------------------------------

export interface AssistantStatusDTO {
  enabled: boolean;
  /** A key is stored. Whether the provider accepts it is only known when it is used. */
  configured: boolean;
  provider: string;
  model: { id: string; label: string };
  /** Only for ASSISTANT_MANAGE — everyone else needs to know whether it works, not how. */
  management: {
    apiKeyPreview: string | null;
    models: { id: string; label: string; description: string }[];
    updatedAt: string | null;
    updatedBy: Ref | null;
  } | null;
}

function toStatusDTO(settings: AssistantSettingsState, actor: Actor): AssistantStatusDTO {
  return {
    enabled: settings.enabled,
    configured: settings.apiKeyCiphertext !== null,
    provider: ASSISTANT_PROVIDER_NAME,
    model: { id: settings.model, label: modelLabel(settings.model) },
    management: actor.can('ASSISTANT_MANAGE')
      ? {
          apiKeyPreview: settings.apiKeyPreview,
          models: ASSISTANT_MODELS.map((model) => ({ ...model })),
          updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null,
          updatedBy: settings.updatedBy,
        }
      : null,
  };
}

export class GetAssistantStatus {
  constructor(private readonly settings: AssistantSettingsRepository) {}

  async execute(actor: Actor): Promise<AssistantStatusDTO> {
    actor.require('ASSISTANT_ACCESS');
    return toStatusDTO(await this.settings.get(), actor);
  }
}

export class UpdateAssistantSettings {
  constructor(
    private readonly settings: AssistantSettingsRepository,
    private readonly cipher: SecretCipher,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(
    actor: Actor,
    input: { enabled?: boolean; model?: string; apiKey?: string },
  ): Promise<AssistantStatusDTO> {
    actor.requireAll(['ASSISTANT_ACCESS', 'ASSISTANT_MANAGE']);
    const current = await this.settings.get();

    const model = input.model ?? current.model;
    if (!isAssistantModel(model)) {
      throw DomainError.validation('ASSISTANT_MODEL_UNKNOWN', 'Modelo não suportado pelo assistente.');
    }
    const enabled = input.enabled ?? current.enabled;

    // An empty key means "keep the current one": the form never receives the stored key
    // back, so it has nothing to resend.
    const apiKey = input.apiKey?.trim() || null;
    if (apiKey !== null && !isPlausibleApiKey(apiKey)) {
      throw DomainError.validation(
        'ASSISTANT_API_KEY_INVALID',
        'A chave de API deve ter entre 20 e 512 caracteres, sem espaços.',
      );
    }

    // The log records that the key changed and which one is active now — by its last four
    // characters, never the key.
    const changes: FieldChange[] = [];
    if (enabled !== current.enabled) {
      changes.push({ field: 'enabled', from: stateLabel(current.enabled), to: stateLabel(enabled) });
    }
    if (model !== current.model) {
      changes.push({ field: 'model', from: modelLabel(current.model), to: modelLabel(model) });
    }
    if (apiKey !== null) {
      changes.push({
        field: 'apiKey',
        from: current.apiKeyPreview ? `…${current.apiKeyPreview}` : null,
        to: `…${previewOf(apiKey)}`,
      });
    }
    if (changes.length === 0) {
      return toStatusDTO(current, actor);
    }

    const saved = await this.uow.run(async () => {
      const next = await this.settings.save({
        enabled,
        model,
        apiKeyCiphertext: apiKey !== null ? this.cipher.encrypt(apiKey) : current.apiKeyCiphertext,
        apiKeyPreview: apiKey !== null ? previewOf(apiKey) : current.apiKeyPreview,
        updatedByUserUuid: actor.userUuid.toString(),
      });
      await this.activity.record(logActorOf(actor), {
        action: 'assistant.settings_updated',
        subject: { type: 'SETTING', uuid: next.uuid!, label: 'Assistente de IA' },
        changes,
      });
      return next;
    });
    return toStatusDTO(saved, actor);
  }
}

const stateLabel = (enabled: boolean): string => (enabled ? 'Ativo' : 'Desativado');

// --- commands ---------------------------------------------------------------------------

export interface AssistantCommandInput {
  /** Omitted for free text: the model classifies the request first. */
  action?: AssistantAction;
  prompt?: string;
  projectUuid?: string;
  demandUuid?: string;
}

export type AssistantAnswerDTO =
  | { action: 'CREATE_DEMAND'; draft: DemandDraft }
  | { action: WrittenAction; title: string; markdown: string; citations: Citation[] }
  | {
      action: 'PLAN_CHECKLIST';
      demand: { uuid: string; title: string; project: Ref | null };
      plan: ChecklistPlan;
    }
  /** The request maps to nothing the asker may do — said in words instead of an error. */
  | { action: 'CLARIFY'; message: string; suggestedAction: AssistantAction | null };

export type AssistantCommandDTO = AssistantAnswerDTO & {
  meta: {
    model: string;
    latencyMs: number;
    classified: boolean;
    project: Ref | null;
    generatedAt: string;
  };
};

export interface RunAssistantCommandDeps {
  settings: AssistantSettingsRepository;
  models: LanguageModelProvider;
  rateLimiter: RateLimiter;
  demands: DemandQueries;
  flow: DemandFlowQueries;
  activity: DemandActivityQueries;
  projects: ProjectRepository;
  projectAccess: ProjectAccessResolver;
  assignees: AssigneeDirectory;
  demandGuard: DemandAccessGuard;
  dashboard: GetDashboard;
  systemLogger: SystemLogger;
  timeZone: string;
  clock?: () => Date;
}

const WRITTEN_TITLES: Record<WrittenAction, string> = {
  EXECUTIVE_REPORT: 'Relatório executivo',
  DAILY_SUMMARY: 'Resumo para a daily',
  RISK_ANALYSIS: 'Riscos e prioridades',
  ASK_BOARD: 'Resposta',
};

const OUT_OF_SCOPE =
  'Isso está fora do que eu faço por aqui. Posso preparar uma demanda nova, escrever o relatório executivo, o resumo da daily ou a análise de riscos, planejar o checklist de uma demanda e responder perguntas sobre o quadro.';

const NOT_ALLOWED: Partial<Record<AssistantAction, string>> = {
  CREATE_DEMAND:
    'Seu perfil não pode cadastrar demandas, então não preparo esse rascunho. Posso gerar relatórios ou responder perguntas sobre as demandas.',
  PLAN_CHECKLIST:
    'Seu perfil não pode editar demandas, então não planejo o checklist. Posso analisar riscos ou responder perguntas sobre as demandas.',
};

/** Projects offered to a draft — far more than any person is allocated to. */
const DRAFT_PROJECTS_MAX = 40;
const DAILY_ACTIVITY_MAX = 80;

const nullableText = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

const classifyOutput = z.object({
  action: z.enum([...ASSISTANT_ACTIONS, 'OTHER'] as const),
  demandRef: nullableText,
});

const draftOutput = z.object({
  title: z.string(),
  description: z.string().default(''),
  projectRef: nullableText,
  responsibleRef: nullableText,
  dueDate: nullableText,
  checklist: z.array(z.string()).default([]),
  priority: nullableText,
  assumptions: z.array(z.string()).default([]),
});

const checklistOutput = z.object({
  items: z.array(z.string()),
  rationale: z.string().default(''),
});

interface Scope {
  visible: readonly string[] | null;
  project: Ref | null;
}

interface RunState {
  actor: Actor;
  scope: Scope;
  session: ModelSession;
  now: Date;
  action: AssistantAction | null;
  board?: Promise<BoardContext>;
}

/**
 * The "Ação rápida" assistant: one request in, one reviewed-before-use answer out.
 *
 * The shape of every run is the same, and each step is there for a reason:
 *
 * 1. Authorization first, before any cost is incurred — ASSISTANT_ACCESS, plus the
 *    permission the action's result would be applied under.
 * 2. Grounding through the same doors the screens use: ListDemands' visibility, the
 *    Dashboard's metrics, each demand's own history. The model receives only what the asker
 *    could already read, with every figure precomputed.
 * 3. The model answers in a constrained form — a JSON Schema for proposals, a narrow
 *    Markdown dialect with `[[D4]]` citations for texts.
 * 4. The answer is checked against the facts: references resolved server-side, links the
 *    model wrote stripped, a draft's project, responsible and date re-validated.
 * 5. Nothing is written. A draft becomes a demand, and a plan becomes checklist items, only
 *    when a person confirms — through the ordinary endpoints and their permissions.
 */
export class RunAssistantCommand {
  private readonly clock: () => Date;

  constructor(private readonly deps: RunAssistantCommandDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async execute(actor: Actor, input: AssistantCommandInput): Promise<AssistantCommandDTO> {
    actor.require('ASSISTANT_ACCESS');
    if (input.action) {
      actor.requireAll(ACTION_PERMISSIONS[input.action]);
    }

    const settings = await this.deps.settings.get();
    if (!settings.enabled) {
      throw DomainError.conflict(
        'ASSISTANT_DISABLED',
        'O assistente de IA está desativado. Um administrador pode reativá-lo nas configurações do assistente.',
      );
    }
    if (!settings.apiKeyCiphertext) {
      throw DomainError.conflict(
        'ASSISTANT_NOT_CONFIGURED',
        'O assistente de IA ainda não tem uma chave de API. Um administrador precisa cadastrá-la.',
      );
    }

    const scope = await this.resolveScope(actor, input.projectUuid);

    const quota = this.deps.rateLimiter.consume(actor.userUuid.toString());
    if (!quota.allowed) {
      throw DomainError.rateLimited(
        'ASSISTANT_RATE_LIMITED',
        `Você fez muitos pedidos seguidos ao assistente. Tente de novo em ${quota.retryAfterSeconds} s.`,
        quota.retryAfterSeconds,
      );
    }

    const startedAt = this.clock();
    const state: RunState = {
      actor,
      scope,
      session: new ModelSession(this.deps.models.connect(settings)),
      now: startedAt,
      action: input.action ?? null,
    };

    try {
      const answer = await this.answer(state, input);
      const latencyMs = this.clock().getTime() - startedAt.getTime();
      this.deps.systemLogger.log({
        code: 'assistant.request_completed',
        message: `Assistente de IA respondeu (${answer.action === 'CLARIFY' ? 'pedido fora do alcance' : ACTION_LABELS[answer.action]}) em ${latencyMs} ms.`,
        actor: logActorOf(actor),
        metadata: {
          action: answer.action,
          model: state.session.answeredBy,
          latencyMs,
          classified: !input.action,
          ...state.session.usage,
        },
      });
      return {
        ...answer,
        meta: {
          model: modelLabel(settings.model),
          latencyMs,
          classified: !input.action,
          project: scope.project,
          generatedAt: startedAt.toISOString(),
        },
      };
    } catch (error) {
      if (!(error instanceof LanguageModelError)) {
        throw error;
      }
      this.deps.systemLogger.log({
        code: 'assistant.request_failed',
        message: `Assistente de IA falhou (${error.reason}): ${clip(error.message, 300)}`,
        actor: logActorOf(actor),
        metadata: {
          action: state.action ?? 'AUTO',
          model: settings.model,
          reason: error.reason,
          providerStatus: error.extra.status ?? null,
          latencyMs: this.clock().getTime() - startedAt.getTime(),
        },
      });
      throw toDomainError(error);
    }
  }

  private async answer(state: RunState, input: AssistantCommandInput): Promise<AssistantAnswerDTO> {
    let action = input.action;
    let demandUuid = input.demandUuid;

    if (!action) {
      const verdict = await this.classify(state, input.prompt ?? '');
      if (verdict.action === 'OTHER') {
        return { action: 'CLARIFY', message: OUT_OF_SCOPE, suggestedAction: null };
      }
      action = verdict.action;
      state.action = action;
      // Classified from free text: a missing permission is a misunderstanding to explain,
      // not an attack to refuse with a 403.
      if (!ACTION_PERMISSIONS[action].every((permission) => state.actor.can(permission))) {
        return {
          action: 'CLARIFY',
          message: NOT_ALLOWED[action] ?? 'Seu perfil não tem acesso às demandas.',
          suggestedAction: null,
        };
      }
      if (action === 'PLAN_CHECKLIST') {
        demandUuid = verdict.demandUuid ?? undefined;
        if (!demandUuid) {
          return {
            action: 'CLARIFY',
            message: 'Qual demanda você quer planejar? Use o atalho "Planejar checklist" e escolha a demanda.',
            suggestedAction: 'PLAN_CHECKLIST',
          };
        }
      }
    }

    if (action === 'CREATE_DEMAND') {
      return this.draftDemand(state, input.prompt ?? '');
    }
    if (action === 'PLAN_CHECKLIST') {
      return this.planChecklist(state, demandUuid!, input.prompt);
    }
    if (isWrittenAction(action)) {
      return this.write(state, action, input.prompt);
    }
    throw DomainError.invariant('ASSISTANT_ACTION_UNHANDLED', `Ação sem tratamento: ${action}`);
  }

  private async resolveScope(actor: Actor, projectUuid?: string): Promise<Scope> {
    const policy = await this.deps.projectAccess.forActor(actor);
    const visible = policy.visibleProjectUuids(actor);
    if (!projectUuid) {
      return { visible, project: null };
    }
    if (!Uuid.isValid(projectUuid)) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    const uuid = Uuid.create(projectUuid);
    policy.assertAccess(actor, uuid);
    const project = await this.deps.projects.findByUuid(uuid);
    if (!project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    return { visible, project: { uuid: project.uuid.toString(), name: project.name } };
  }

  /** The visible board, loaded once per run however many steps need it. */
  private board(state: RunState): Promise<BoardContext> {
    state.board ??= (async () => {
      const cards = await this.deps.demands.listCards({
        restrictToProjectUuids: state.scope.visible,
        // The assistant must never see more than the person asking: the same
        // DEMAND_VIEW_ALL rule the board itself applies, applied to its context too.
        restrictToOwnerUuid: state.actor.canViewAllDemands()
          ? undefined
          : state.actor.userUuid.toString(),
        projectUuid: state.scope.project ? Uuid.create(state.scope.project.uuid) : undefined,
      });
      const transitions = await this.deps.flow.statusTransitions(cards.map((card) => card.uuid));
      return buildBoardContext({
        demands: cards,
        transitions,
        now: state.now,
        timeZone: this.deps.timeZone,
      });
    })();
    return state.board;
  }

  private async classify(
    state: RunState,
    prompt: string,
  ): Promise<{ action: AssistantAction | 'OTHER'; demandUuid: string | null }> {
    const board = await this.board(state);
    const list = board.demands.length
      ? board.demands
          .map(
            (demand) =>
              `${demand.ref} | ${dataCell(demand.title)} | ${demand.project ? dataCell(demand.project.name) : 'sem projeto'}`,
          )
          .join('\n')
      : 'Nenhuma demanda visível.';
    const verdict = await state.session.structured(
      {
        system: classifySystem(board),
        prompt: userTurn(`Demandas:\n${list}`, prompt),
        responseSchema: CLASSIFY_SCHEMA,
        temperature: 0,
        maxOutputTokens: 200,
      },
      classifyOutput,
    );
    const ref = verdict.demandRef?.trim().toUpperCase();
    const demand = ref ? board.demands.find((candidate) => candidate.ref === ref) : undefined;
    return { action: verdict.action, demandUuid: demand?.uuid ?? null };
  }

  private async write(
    state: RunState,
    action: WrittenAction,
    request?: string,
  ): Promise<AssistantAnswerDTO> {
    const [board, dashboard] = await Promise.all([
      this.board(state),
      this.deps.dashboard.execute(state.actor, {
        projectUuid: state.scope.project?.uuid,
        periodDays: 30,
      }),
    ]);

    const sections = [
      `Escopo: ${state.scope.project ? `projeto ${dataCell(state.scope.project.name)}` : 'todos os projetos visíveis para quem pergunta'}.`,
      '',
      '## Indicadores',
      describeIndicators(dashboard),
      '',
      '## Demandas',
      board.demands.length ? board.demands.map(describeDemand).join('\n') : 'Nenhuma demanda.',
    ];
    if (board.omitted > 0) {
      sections.push(`(+${board.omitted} demandas entregues mais antigas omitidas)`);
    }

    let since: string | undefined;
    if (action === 'DAILY_SUMMARY') {
      const day = previousBusinessDay(board.today);
      since = `${weekdayOf(day)}, ${formatDayMonth(day)}`;
      const activity = await this.deps.activity.recentActivity(
        board.demands.map((demand) => demand.uuid),
        startOfDayIn(day, this.deps.timeZone),
        DAILY_ACTIVITY_MAX,
      );
      const refOf = new Map(board.demands.map((demand) => [demand.uuid, demand.ref]));
      const moment = new Intl.DateTimeFormat('pt-BR', {
        timeZone: this.deps.timeZone,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      sections.push(
        '',
        `## Movimentações desde ${since}`,
        activity.length
          ? activity
              .map((entry) => {
                const ref = refOf.get(entry.demandUuid);
                return `${moment.format(entry.occurredAt)} | ${dataCell(entry.actorName ?? 'Sistema')} | ${dataCell(entry.summary)}${ref ? ` (${ref})` : ''}`;
              })
              .join('\n')
          : 'Nenhuma movimentação registrada no período.',
      );
    }

    const text = await state.session.write({
      system: writtenSystem(action, { today: board.today, timeZone: board.timeZone, since }),
      prompt: userTurn(sections.join('\n'), request),
      temperature: 0.35,
      maxOutputTokens: 1400,
    });
    const { markdown, citations } = resolveCitations(text, board.demands);
    return { action, title: WRITTEN_TITLES[action], markdown, citations };
  }

  private async draftDemand(state: RunState, request: string): Promise<AssistantAnswerDTO> {
    const today = calendarDateIn(this.deps.timeZone)(state.now);
    const projects = (
      await this.deps.projects.list({ activeOnly: true, restrictToUuids: state.scope.visible })
    ).slice(0, DRAFT_PROJECTS_MAX);
    if (projects.length === 0) {
      return {
        action: 'CLARIFY',
        message: 'Você não participa de nenhum projeto ativo, então ainda não há onde cadastrar uma demanda.',
        suggestedAction: null,
      };
    }

    // One reference per person across projects, so "U3" means the same human everywhere.
    const eligible = await Promise.all(projects.map((project) => this.deps.assignees.listEligible(project.uuid)));
    const people = new Map<string, DraftPerson>();
    const draftProjects: DraftProject[] = projects.map((project, index) => ({
      ref: `P${index + 1}`,
      uuid: project.uuid.toString(),
      name: project.name,
      assignees: eligible[index]!.map((candidate) => {
        let person = people.get(candidate.uuid);
        if (!person) {
          person = { ref: `U${people.size + 1}`, uuid: candidate.uuid, name: candidate.name };
          people.set(candidate.uuid, person);
        }
        return person;
      }),
    }));
    const preferred = draftProjects.find((project) => project.uuid === state.scope.project?.uuid);

    const data = [
      'Projetos onde a demanda pode ser cadastrada, com as pessoas elegíveis como responsáveis:',
      ...draftProjects.map(
        (project) =>
          `${project.ref} | ${dataCell(project.name)} | elegíveis: ${
            project.assignees.length
              ? project.assignees.map((person) => `${person.ref} ${dataCell(person.name)}`).join(', ')
              : 'ninguém'
          }`,
      ),
      preferred
        ? `Projeto do filtro atual: ${preferred.ref} (${dataCell(preferred.name)}).`
        : 'Nenhum projeto filtrado.',
    ].join('\n');

    const raw = await state.session.structured(
      {
        system: draftSystem({ today, timeZone: this.deps.timeZone }),
        prompt: userTurn(data, request),
        responseSchema: DRAFT_SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 1200,
      },
      draftOutput,
    );
    return {
      action: 'CREATE_DEMAND',
      draft: resolveDemandDraft(raw, {
        projects: draftProjects,
        today,
        preferredProjectUuid: preferred?.uuid,
      }),
    };
  }

  private async planChecklist(
    state: RunState,
    demandUuid: string,
    guidance?: string,
  ): Promise<AssistantAnswerDTO> {
    const demand = await this.deps.demandGuard.loadAccessible(state.actor, demandUuid);
    if (demand.isTerminal) {
      throw DomainError.forbidden(
        'DEMAND_IN_PRODUCTION_IS_TERMINAL',
        'Demandas em produção não podem ser alteradas.',
      );
    }
    const card = await this.deps.demands.findCard(demand.uuid);
    if (!card) {
      throw DomainError.notFound('DEMAND_NOT_FOUND', 'Demanda não encontrada.');
    }

    const data = [
      `Demanda: ${dataCell(card.title)}`,
      `Projeto: ${card.project ? dataCell(card.project.name) : 'sem projeto'}`,
      `Status: ${STATUS_LABELS[card.status]}`,
      `Prioridade: ${PRIORITY_LABELS[card.priority]}`,
      `Prazo: ${formatFullDate(card.dueDate)}`,
      `Responsável: ${dataCell(card.responsible.name)}`,
      `Descrição: ${dataCell(plainText(card.description, 2000)) || '(sem descrição)'}`,
      card.checklist.length
        ? `Checklist atual:\n${card.checklist.map((item) => `- ${dataCell(item.title)}${item.done ? ' (concluído)' : ''}`).join('\n')}`
        : 'Checklist atual: vazio.',
    ].join('\n');

    const raw = await state.session.structured(
      {
        system: checklistSystem({ today: calendarDateIn(this.deps.timeZone)(state.now), timeZone: this.deps.timeZone }),
        prompt: userTurn(data, guidance),
        responseSchema: CHECKLIST_SCHEMA,
        temperature: 0.3,
        maxOutputTokens: 800,
      },
      checklistOutput,
    );
    return {
      action: 'PLAN_CHECKLIST',
      demand: { uuid: card.uuid, title: card.title, project: card.project },
      plan: resolveChecklistPlan(raw, card.checklist.map((item) => item.title)),
    };
  }
}

/** One model client for one run, adding up what the run cost. */
class ModelSession {
  answeredBy: string;
  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(private readonly model: LanguageModel) {
    this.answeredBy = model.model;
  }

  get usage(): { calls: number; inputTokens: number; outputTokens: number } {
    return { calls: this.calls, inputTokens: this.inputTokens, outputTokens: this.outputTokens };
  }

  async write(request: LanguageModelRequest): Promise<string> {
    const result = await this.model.generate(request);
    this.calls += 1;
    this.answeredBy = result.model;
    this.inputTokens += result.usage.inputTokens ?? 0;
    this.outputTokens += result.usage.outputTokens ?? 0;
    return result.text;
  }

  /** The provider already constrains the output to the schema; this does not take it on faith. */
  async structured<S extends z.ZodTypeAny>(request: LanguageModelRequest, schema: S): Promise<z.infer<S>> {
    const text = await this.write(request);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      throw new LanguageModelError('INVALID_OUTPUT', 'A resposta estruturada não é um JSON válido.');
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new LanguageModelError('INVALID_OUTPUT', 'A resposta estruturada não segue o esquema pedido.');
    }
    return result.data;
  }
}

function describeIndicators(dashboard: DashboardDTO): string {
  const { summary, flow } = dashboard;
  const decimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const days = (distribution: { median: number | null; p85: number | null; sample: number }) =>
    distribution.median === null || distribution.p85 === null
      ? 'sem entregas medidas'
      : `mediana ${decimal(distribution.median)} dias, p85 ${decimal(distribution.p85)} dias (${plural(distribution.sample, 'entrega', 'entregas')})`;

  const lines = [
    `Período: últimos ${dashboard.period.days} dias (${formatDayMonth(dashboard.period.from)} a ${formatDayMonth(dashboard.period.to)}), comparado aos ${dashboard.period.days} dias anteriores.`,
    `Em aberto: ${summary.open} | atrasadas: ${summary.overdue} | vencem hoje: ${summary.dueToday} | vencem em até 7 dias: ${summary.dueSoon} | paradas há 7+ dias no mesmo status: ${summary.stale} | entregues no total: ${summary.delivered}`,
    `Entregas no período: ${flow.throughput.current} (período anterior: ${flow.throughput.previous}) | novas demandas: ${flow.arrivals.current} (período anterior: ${flow.arrivals.previous})`,
    `Lead time, da criação à produção: ${days(flow.leadTimeDays)}`,
    `Cycle time, do início à produção: ${days(flow.cycleTimeDays)}`,
    `Entregas no prazo: ${
      flow.onTime.rate === null
        ? 'nenhuma entrega no período'
        : `${Math.round(flow.onTime.rate * 100)}% (${flow.onTime.onTime} no prazo, ${flow.onTime.late} com atraso)`
    }`,
  ];
  if (dashboard.workload.length > 0) {
    lines.push(
      'Carga por responsável (abertas / atrasadas / vencem em 7 dias):',
      ...dashboard.workload.map(
        (entry) => `- ${dataCell(entry.responsible.name)}: ${entry.open} / ${entry.overdue} / ${entry.dueSoon}`,
      ),
    );
  }
  if (dashboard.projects.length > 1) {
    lines.push(
      'Por projeto (abertas / atrasadas / paradas / entregues):',
      ...dashboard.projects.map(
        (entry) => `- ${dataCell(entry.project.name)}: ${entry.open} / ${entry.overdue} / ${entry.stale} / ${entry.delivered}`,
      ),
    );
  }
  return lines.join('\n');
}

/** What each provider failure means to the person who asked, and what they can do about it. */
function toDomainError(error: LanguageModelError): DomainError {
  switch (error.reason) {
    case 'QUOTA':
      return DomainError.rateLimited(
        'ASSISTANT_QUOTA_EXCEEDED',
        'A cota do modelo de IA foi atingida. Aguarde um pouco e tente de novo.',
        error.extra.retryAfterSeconds,
      );
    case 'AUTH':
      return DomainError.unavailable(
        'ASSISTANT_KEY_REJECTED',
        'O provedor de IA recusou a chave de API configurada. Um administrador precisa revisá-la.',
      );
    case 'MODEL_UNAVAILABLE':
      return DomainError.unavailable(
        'ASSISTANT_MODEL_UNAVAILABLE',
        'O modelo configurado não está disponível para esta chave. Um administrador pode escolher outro nas configurações.',
      );
    case 'TIMEOUT':
      return DomainError.unavailable('ASSISTANT_TIMEOUT', 'O modelo de IA demorou demais para responder. Tente de novo.');
    case 'BLOCKED':
      return DomainError.validation(
        'ASSISTANT_BLOCKED',
        'O provedor de IA recusou este pedido pela política de conteúdo. Reformule e tente de novo.',
      );
    case 'INVALID_OUTPUT':
      return DomainError.unavailable('ASSISTANT_INVALID_RESPONSE', 'A IA respondeu fora do formato esperado. Tente de novo.');
    default:
      return DomainError.unavailable(
        'ASSISTANT_UNAVAILABLE',
        'O serviço de IA está indisponível no momento. Tente de novo em instantes.',
      );
  }
}
