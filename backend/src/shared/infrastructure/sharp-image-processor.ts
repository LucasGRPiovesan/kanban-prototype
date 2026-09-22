import sharp from 'sharp';
import { type ImageProcessorPort } from '../application/file-storage.port';
import { IMAGE_MIME_TYPES } from '../../modules/demands/domain/demand-attachment';
import { DomainError } from '../domain/errors';

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 200;

/** Below this, a logo is unreadable at the sizes `BrandMark` renders it — see AppLayout. */
const LOGO_MIN_WIDTH = 64;
const LOGO_MIN_HEIGHT = 32;

/**
 * Thumbnails are generated once at upload time and stored alongside the original.
 * The board renders dozens of cards at once; serving full-size uploads there would
 * dominate page weight for a 40x40 preview.
 */
export class SharpImageProcessor implements ImageProcessorPort {
  isSupported(mimeType: string): boolean {
    return (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
  }

  async createThumbnail(content: Buffer): Promise<{ content: Buffer; contentType: string }> {
    const output = await sharp(content)
      .rotate() // honours EXIF orientation before the metadata is stripped
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 78 })
      .toBuffer();

    return { content: output, contentType: 'image/webp' };
  }

  async validateLogo(
    content: Buffer,
  ): Promise<{ content: Buffer; contentType: string; width: number; height: number }> {
    const image = sharp(content).rotate();
    let metadata: Awaited<ReturnType<typeof image.metadata>>;
    try {
      metadata = await image.metadata();
    } catch {
      throw DomainError.validation('LOGO_FILE_UNREADABLE', 'Não foi possível ler esta imagem.');
    }
    const { width, height } = metadata;
    if (!width || !height || width < LOGO_MIN_WIDTH || height < LOGO_MIN_HEIGHT) {
      throw DomainError.validation(
        'LOGO_RESOLUTION_TOO_LOW',
        `Envie uma imagem com pelo menos ${LOGO_MIN_WIDTH}x${LOGO_MIN_HEIGHT} pixels.`,
      );
    }
    // Lossless re-encode: strips EXIF/metadata and normalizes to PNG without recompressing
    // away quality, regardless of how the original PNG was produced.
    const output = await image.png({ compressionLevel: 9 }).toBuffer();
    return { content: output, contentType: 'image/png', width, height };
  }
}
