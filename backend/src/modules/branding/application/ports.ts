import { type BrandingSettingsState } from '../domain/branding-settings';

export interface SaveBrandingSettings {
  logoLightStorageKey: string | null;
  logoDarkStorageKey: string | null;
  updatedByUserUuid: string;
}

export interface BrandingSettingsRepository {
  /** The installation's configuration, or the default (no custom logos) when none was saved. */
  get(): Promise<BrandingSettingsState>;
  save(input: SaveBrandingSettings): Promise<BrandingSettingsState>;
}
