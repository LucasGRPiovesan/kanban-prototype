import { type Actor } from '../../../../shared/application/actor';
import { type ActivityRecorder, logActorOf } from '../../../../shared/application/activity-log.port';
import { type UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import { type FileStoragePort, type ImageProcessorPort } from '../../../../shared/application/file-storage.port';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import {
  type BrandingSettingsState,
  type LogoVariant,
  storageKeyField,
} from '../../domain/branding-settings';
import { type BrandingSettingsRepository } from '../ports';

export interface BrandingStatusDTO {
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  updatedAt: string | null;
  updatedBy: { uuid: string; name: string } | null;
}

function toStatusDTO(settings: BrandingSettingsState, storage: FileStoragePort): BrandingStatusDTO {
  return {
    logoLightUrl: settings.logoLightStorageKey ? storage.resolveUrl(settings.logoLightStorageKey) : null,
    logoDarkUrl: settings.logoDarkStorageKey ? storage.resolveUrl(settings.logoDarkStorageKey) : null,
    updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null,
    updatedBy: settings.updatedBy,
  };
}

/** Public: the login page reads this before anyone is signed in. */
export class GetBrandingSettings {
  constructor(
    private readonly settings: BrandingSettingsRepository,
    private readonly storage: FileStoragePort,
  ) {}

  async execute(): Promise<BrandingStatusDTO> {
    return toStatusDTO(await this.settings.get(), this.storage);
  }
}

const VARIANT_LABEL: Record<LogoVariant, string> = { light: 'tema claro', dark: 'tema escuro' };

export class UploadBrandingLogo {
  constructor(
    private readonly settings: BrandingSettingsRepository,
    private readonly storage: FileStoragePort,
    private readonly images: ImageProcessorPort,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(
    actor: Actor,
    variant: LogoVariant,
    file: { mimeType: string; content: Buffer },
  ): Promise<BrandingStatusDTO> {
    actor.require('ASSISTANT_MANAGE');
    if (file.mimeType !== 'image/png') {
      throw DomainError.validation('LOGO_FILE_INVALID', 'Envie uma imagem PNG.');
    }

    const validated = await this.images.validateLogo(file.content);
    const current = await this.settings.get();
    const field = storageKeyField(variant);
    const previousKey = current[field];

    const storageKey = `branding/logo-${variant}-${Uuid.generate().toString()}.png`;
    await this.storage.upload({ storageKey, contentType: validated.contentType, content: validated.content });

    const saved = await this.uow.run(async () => {
      const next = await this.settings.save({
        logoLightStorageKey: variant === 'light' ? storageKey : current.logoLightStorageKey,
        logoDarkStorageKey: variant === 'dark' ? storageKey : current.logoDarkStorageKey,
        updatedByUserUuid: actor.userUuid.toString(),
      });
      await this.activity.record(logActorOf(actor), {
        action: 'branding.logo_updated',
        subject: { type: 'SETTING', uuid: next.uuid!, label: 'Marca do sistema' },
        changes: [{ field: 'logo', from: null, to: `logo do ${VARIANT_LABEL[variant]} atualizada` }],
      });
      return next;
    });

    if (previousKey) {
      await this.storage.delete(previousKey).catch(() => undefined);
    }

    return toStatusDTO(saved, this.storage);
  }
}

export class ResetBrandingLogo {
  constructor(
    private readonly settings: BrandingSettingsRepository,
    private readonly storage: FileStoragePort,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(actor: Actor, variant: LogoVariant): Promise<BrandingStatusDTO> {
    actor.require('ASSISTANT_MANAGE');
    const current = await this.settings.get();
    const field = storageKeyField(variant);
    const previousKey = current[field];
    if (!previousKey) {
      return toStatusDTO(current, this.storage);
    }

    const saved = await this.uow.run(async () => {
      const next = await this.settings.save({
        logoLightStorageKey: variant === 'light' ? null : current.logoLightStorageKey,
        logoDarkStorageKey: variant === 'dark' ? null : current.logoDarkStorageKey,
        updatedByUserUuid: actor.userUuid.toString(),
      });
      await this.activity.record(logActorOf(actor), {
        action: 'branding.logo_reset',
        subject: { type: 'SETTING', uuid: next.uuid!, label: 'Marca do sistema' },
        changes: [{ field: 'logo', from: `logo do ${VARIANT_LABEL[variant]} personalizada`, to: 'padrão' }],
      });
      return next;
    });

    await this.storage.delete(previousKey).catch(() => undefined);

    return toStatusDTO(saved, this.storage);
  }
}
