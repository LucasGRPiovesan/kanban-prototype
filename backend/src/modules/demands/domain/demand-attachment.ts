import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Allowlist — anything outside it is rejected before a byte reaches storage. */
export const ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function isImageMimeType(value: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export interface DemandAttachmentProps {
  uuid: Uuid;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  /** Application-generated opaque key. The original filename is never part of a path. */
  storageKey: string;
  thumbnailKey: string | null;
  createdByUserUuid: Uuid;
  createdAt: Date;
}

export class DemandAttachment {
  private constructor(private readonly props: DemandAttachmentProps) {}

  static create(input: Omit<DemandAttachmentProps, 'uuid' | 'createdAt'>): DemandAttachment {
    if (!isAllowedMimeType(input.mimeType)) {
      throw DomainError.validation(
        'UNSUPPORTED_MIME_TYPE',
        `Tipo de arquivo não suportado: ${input.mimeType}.`,
      );
    }
    if (input.sizeBytes <= 0) {
      throw DomainError.validation('EMPTY_FILE', 'Arquivo vazio.');
    }
    return new DemandAttachment({
      ...input,
      uuid: Uuid.generate(),
      createdAt: new Date(),
    });
  }

  static rehydrate(props: DemandAttachmentProps): DemandAttachment {
    return new DemandAttachment(props);
  }

  get uuid(): Uuid {
    return this.props.uuid;
  }
  get originalName(): string {
    return this.props.originalName;
  }
  get mimeType(): string {
    return this.props.mimeType;
  }
  get sizeBytes(): number {
    return this.props.sizeBytes;
  }
  get storageKey(): string {
    return this.props.storageKey;
  }
  get thumbnailKey(): string | null {
    return this.props.thumbnailKey;
  }
  get createdByUserUuid(): Uuid {
    return this.props.createdByUserUuid;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  isImage(): boolean {
    return isImageMimeType(this.props.mimeType);
  }
}
