/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Per-file upload limit shown to users; must match the API's UPLOAD_MAX_FILE_SIZE_MB. */
  readonly VITE_UPLOAD_MAX_FILE_SIZE_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
