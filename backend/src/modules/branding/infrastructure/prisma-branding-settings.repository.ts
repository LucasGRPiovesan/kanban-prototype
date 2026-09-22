import { Uuid } from '../../../shared/domain/identifier';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { type BrandingSettingsRepository, type SaveBrandingSettings } from '../application/ports';
import { type BrandingSettingsState, defaultBranding } from '../domain/branding-settings';

/** The installation has one configuration; the unique `scope` column is what makes it one. */
const SCOPE = 'GLOBAL';

const include = { updatedBy: { select: { uuid: true, name: true } } } as const;

export class PrismaBrandingSettingsRepository implements BrandingSettingsRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async get(): Promise<BrandingSettingsState> {
    const row = await this.database.client.brandingSettings.findUnique({
      where: { scope: SCOPE },
      include,
    });
    return row ? toState(row) : defaultBranding();
  }

  async save(input: SaveBrandingSettings): Promise<BrandingSettingsState> {
    const data = {
      logoLightStorageKey: input.logoLightStorageKey,
      logoDarkStorageKey: input.logoDarkStorageKey,
      updatedBy: { connect: { uuid: input.updatedByUserUuid } },
    };
    const row = await this.database.client.brandingSettings.upsert({
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
  logoLightStorageKey: string | null;
  logoDarkStorageKey: string | null;
  updatedAt: Date;
  updatedBy: { uuid: string; name: string } | null;
}): BrandingSettingsState {
  return {
    uuid: row.uuid,
    logoLightStorageKey: row.logoLightStorageKey,
    logoDarkStorageKey: row.logoDarkStorageKey,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}
