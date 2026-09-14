export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
}

export interface UploadInput {
  /** Opaque, application-generated key. Never derived from the original filename. */
  storageKey: string;
  contentType: string;
  content: Buffer;
}

/**
 * The only file-storage contract the application layer knows.
 *
 * Local disk today, S3-compatible object storage tomorrow: swapping the adapter in the
 * composition root is the entire migration, because nothing above infrastructure ever
 * learns where bytes actually live.
 */
export interface FileStoragePort {
  upload(input: UploadInput): Promise<StoredFile>;
  delete(storageKey: string): Promise<void>;
  /** Public or signed URL a browser can fetch. */
  resolveUrl(storageKey: string): string;
}

/** Produces the optimized preview the Kanban card renders instead of the full image. */
export interface ImageProcessorPort {
  isSupported(mimeType: string): boolean;
  createThumbnail(content: Buffer): Promise<{ content: Buffer; contentType: string }>;
}
