/**
 * The per-file upload limit as users read it.
 *
 * The API is the authority (UPLOAD_MAX_FILE_SIZE_MB); this only keeps the hint next to the
 * upload controls honest. It differs per environment — 10 MB by default, 4 MB on Vercel,
 * whose functions refuse request bodies above 4.5 MB — so it is a build-time setting.
 */
const configured = Number(import.meta.env.VITE_UPLOAD_MAX_FILE_SIZE_MB);

export const UPLOAD_MAX_FILE_SIZE_MB = Number.isFinite(configured) && configured > 0 ? configured : 10;

export const ATTACHMENT_HINT = `Imagens (JPEG, PNG, WEBP), PDF, documentos e planilhas. Até ${UPLOAD_MAX_FILE_SIZE_MB} MB por arquivo.`;
