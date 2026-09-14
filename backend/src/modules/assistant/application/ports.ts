import { type AssistantSettingsState } from '../domain/assistant-settings';

export interface LanguageModelRequest {
  /** Rules and task — what the model must follow. */
  system: string;
  /** Data and the person's request — what the model works on. */
  prompt: string;
  /** JSON Schema. When present, the answer must be a JSON document matching it. */
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LanguageModelResult {
  text: string;
  /** The model version that actually answered, as the provider reports it. */
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export type LanguageModelFailure =
  /** The provider refused the key. */
  | 'AUTH'
  /** Provider quota or rate limit. */
  | 'QUOTA'
  /** The configured model does not exist or is closed to this key. */
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  /** Refused by the provider's content policy. */
  | 'BLOCKED'
  | 'UNAVAILABLE'
  /** An answer arrived but is not in the shape that was asked for. */
  | 'INVALID_OUTPUT';

/** A provider failure, classified — the application decides what each one means to a user. */
export class LanguageModelError extends Error {
  constructor(
    readonly reason: LanguageModelFailure,
    message: string,
    readonly extra: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = 'LanguageModelError';
    Object.setPrototypeOf(this, LanguageModelError.prototype);
  }
}

export interface LanguageModel {
  readonly model: string;
  generate(request: LanguageModelRequest): Promise<LanguageModelResult>;
}

/**
 * Builds a model client for the current configuration.
 *
 * A factory rather than a single client because the configuration is data: an
 * administrator can switch the model or replace the key while the server runs, and the
 * very next request must use it.
 */
export interface LanguageModelProvider {
  connect(settings: AssistantSettingsState): LanguageModel;
}

export interface SaveAssistantSettings {
  enabled: boolean;
  model: string;
  apiKeyCiphertext: string | null;
  apiKeyPreview: string | null;
  updatedByUserUuid: string;
}

export interface AssistantSettingsRepository {
  /** The installation's configuration, or an unconfigured default when none was saved. */
  get(): Promise<AssistantSettingsState>;
  save(input: SaveAssistantSettings): Promise<AssistantSettingsState>;
}

export interface RecentDemandActivity {
  occurredAt: Date;
  action: string;
  summary: string;
  actorName: string | null;
  demandUuid: string;
}

/**
 * What happened to a set of demands recently — the same entries each demand's
 * "Atualizações" tab shows under DEMAND_ACCESS, gathered for the daily summary.
 */
export interface DemandActivityQueries {
  recentActivity(
    demandUuids: readonly string[],
    since: Date,
    limit: number,
  ): Promise<RecentDemandActivity[]>;
}
