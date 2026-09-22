export interface BrandingSettingsState {
  /** `null` until the configuration is first saved. */
  uuid: string | null;
  logoLightStorageKey: string | null;
  logoDarkStorageKey: string | null;
  updatedAt: Date | null;
  updatedBy: { uuid: string; name: string } | null;
}

export type LogoVariant = 'light' | 'dark';

export const LOGO_VARIANTS: readonly LogoVariant[] = ['light', 'dark'];

export function isLogoVariant(value: string): value is LogoVariant {
  return LOGO_VARIANTS.includes(value as LogoVariant);
}

/** An installation whose logos were never customized: both themes use the bundled mark. */
export function defaultBranding(): BrandingSettingsState {
  return {
    uuid: null,
    logoLightStorageKey: null,
    logoDarkStorageKey: null,
    updatedAt: null,
    updatedBy: null,
  };
}

export function storageKeyField(variant: LogoVariant): 'logoLightStorageKey' | 'logoDarkStorageKey' {
  return variant === 'light' ? 'logoLightStorageKey' : 'logoDarkStorageKey';
}
