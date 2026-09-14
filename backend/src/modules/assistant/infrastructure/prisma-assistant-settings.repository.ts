import { Uuid } from '../../../shared/domain/identifier';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import {
  type AssistantSettingsRepository,
  type SaveAssistantSettings,
} from '../application/ports';
import {
  ASSISTANT_PROVIDER,
  type AssistantSettingsState,
  unconfiguredAssistant,
} from '../domain/assistant-settings';

/** The installation has one configuration; the unique `scope` column is what makes it one. */
const SCOPE = 'GLOBAL';

const include = { updatedBy: { select: { uuid: true, name: true } } } as const;

export class PrismaAssistantSettingsRepository implements AssistantSettingsRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async get(): Promise<AssistantSettingsState> {
    const row = await this.database.client.assistantSettings.findUnique({
      where: { scope: SCOPE },
      include,
    });
    return row ? toState(row) : unconfiguredAssistant();
  }

  async save(input: SaveAssistantSettings): Promise<AssistantSettingsState> {
    const data = {
      enabled: input.enabled,
      provider: ASSISTANT_PROVIDER,
      model: input.model,
      apiKeyCiphertext: input.apiKeyCiphertext,
      apiKeyPreview: input.apiKeyPreview,
      updatedBy: { connect: { uuid: input.updatedByUserUuid } },
    };
    const row = await this.database.client.assistantSettings.upsert({
      where: { scope: SCOPE },
      create: { uuid: Uuid.generate().toString(), scope: SCOPE, ...data },
      update: data,
      include,
    });
    return toState(row);
  }
}

function toState(row: {
  uuid: string;
  enabled: boolean;
  model: string;
  apiKeyCiphertext: string | null;
  apiKeyPreview: string | null;
  updatedAt: Date;
  updatedBy: { uuid: string; name: string } | null;
}): AssistantSettingsState {
  return {
    uuid: row.uuid,
    enabled: row.enabled,
    model: row.model,
    apiKeyCiphertext: row.apiKeyCiphertext,
    apiKeyPreview: row.apiKeyPreview,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}
