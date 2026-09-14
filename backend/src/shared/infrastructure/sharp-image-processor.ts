import sharp from 'sharp';
import { type ImageProcessorPort } from '../application/file-storage.port';
import { IMAGE_MIME_TYPES } from '../../modules/demands/domain/demand-attachment';

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 200;

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
}
