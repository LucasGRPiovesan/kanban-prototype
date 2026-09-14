import { z } from 'zod';

/**
 * Configuration is validated once, at startup. A misconfigured deployment fails
 * immediately and loudly instead of throwing on the first request that happens to
 * need the missing value.
 */
/** `"true"`/`"false"`/`"1"`/`"0"` from the environment — `z.coerce.boolean()` reads "false" as true. */
const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const schema = z
  .object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  /**
   * CA certificate of a managed MySQL that requires verified TLS (Aiven, for instance),
   * as the PEM text or its base64. Optional: when present, the connection URL is extended
   * with `sslaccept=strict` pointing at it — see `database-url.ts`.
   */
  DATABASE_CA_CERT: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  /** Cookie name for the session token. */
  AUTH_COOKIE_NAME: z.string().default('kanban_session'),
  /**
   * `lax` by default, in every environment: the frontend reaches the API same-site (the
   * Docker ports on one host, or a same-origin rewrite on Vercel), and Lax is what keeps a
   * third-party page from riding the session with a forged POST. `none` is only for an API
   * deliberately served from another site, and then requires `AUTH_COOKIE_SECURE`.
   */
  AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Defaults to true in production. Browsers treat http://localhost as secure, so Docker keeps working. */
  AUTH_COOKIE_SECURE: booleanFlag.optional(),
  /**
   * How many reverse proxies sit in front of the app — what `req.ip` (rate limiting) is
   * derived from. 1 for Docker behind a single proxy and for Vercel.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),

  /**
   * Lifetime of a demand-integration access token, exchanged for an API key/secret
   * pair. Short by design: the credential itself is what a project's owner can revoke
   * instantly, but a token already issued only stops working this soon after — unless
   * its credential is rotated or revoked first, which invalidates it immediately.
   */
  INTEGRATION_TOKEN_EXPIRES_IN: z.string().default('1h'),

  /**
   * The business calendar the Dashboard counts days in. "Overdue", "delivered this
   * week" and "on time" are calendar questions, and a server clock in UTC would move a
   * delivery made at 22:00 in São Paulo into the next day.
   */
  APP_TIMEZONE: z
    .string()
    .default('America/Sao_Paulo')
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'APP_TIMEZONE deve ser um fuso IANA válido, ex.: America/Sao_Paulo'),

  /**
   * Browser origins allowed to call the API, comma-separated. Also the allowlist the
   * origin guard checks state-changing requests against (CSRF defence).
   */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /**
   * `local` writes to disk and serves `/files` (Docker, local development). `vercel-blob`
   * stores attachments in Vercel Blob — required on Vercel, whose filesystem is ephemeral.
   */
  STORAGE_DRIVER: z.enum(['local', 'vercel-blob']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  STORAGE_PUBLIC_BASE_URL: z.string().default('http://localhost:3333/files'),
  /**
   * Id of the connected Blob store. Vercel adds it when a store is connected to the
   * project; on Vercel the SDK pairs it with the per-request OIDC token (no secret at all).
   */
  BLOB_STORE_ID: z.string().optional(),
  /**
   * Long-lived read-write token — only for code running outside Vercel (Docker, CI). On
   * Vercel, OIDC takes precedence whenever BLOB_STORE_ID is present.
   */
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  /**
   * Public base URL of the Blob store (`https://<store-id>.public.blob.vercel-storage.com`).
   * Optional: derived from BLOB_STORE_ID (or from the read-write token) when absent.
   */
  BLOB_PUBLIC_BASE_URL: z.string().url().optional(),
  /** Set by Vercel in builds and functions. Used only to validate platform limits. */
  VERCEL: z.string().optional(),
  /** Present outside Vercel after `vercel env pull` — OIDC for local development. */
  VERCEL_OIDC_TOKEN: z.string().optional(),

  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
  UPLOAD_MAX_FILES_PER_REQUEST: z.coerce.number().int().positive().default(10),

  /**
   * Seconds a notification stream stays open before the server ends it and the browser
   * reconnects (which also re-checks the session). 0 = no limit. On Vercel keep it below
   * the function's maximum duration (300 s) so the stream closes cleanly — e.g. 240.
   */
  NOTIFICATION_STREAM_MAX_SECONDS: z.coerce.number().int().min(0).default(1800),
  /**
   * How often an open stream also checks the database for notifications it has not
   * delivered. The in-process push covers a single instance instantly; this covers
   * notifications created by another instance (serverless, horizontal scaling).
   */
  NOTIFICATION_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(2).default(15),

  /** Swagger UI at /docs and the spec at /openapi.json. */
  API_DOCS_ENABLED: booleanFlag.default('true'),

  LOG_FORMAT: z.string().default('dev'),
  })
  .superRefine((value, context) => {
    const onVercel = Boolean(value.VERCEL);
    if (value.STORAGE_DRIVER === 'vercel-blob') {
      if (!value.BLOB_STORE_ID && !value.BLOB_READ_WRITE_TOKEN) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BLOB_STORE_ID'],
          message:
            'STORAGE_DRIVER=vercel-blob exige BLOB_STORE_ID (conecte o Blob store ao projeto na Vercel — OIDC) ou, fora da Vercel, BLOB_READ_WRITE_TOKEN',
        });
      } else if (!onVercel && !value.BLOB_READ_WRITE_TOKEN && !value.VERCEL_OIDC_TOKEN) {
        // Outside Vercel there is no per-request OIDC token: the SDK could not authenticate.
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BLOB_STORE_ID'],
          message:
            'Fora da Vercel, BLOB_STORE_ID precisa de credencial: rode `vercel env pull` (VERCEL_OIDC_TOKEN) ou defina BLOB_READ_WRITE_TOKEN',
        });
      }
    }
    if (onVercel) {
      // Platform limits, checked at boot rather than discovered as failures in production.
      if (value.STORAGE_DRIVER === 'local') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message: 'Na Vercel o disco é efêmero e /files não é servido: use STORAGE_DRIVER=vercel-blob',
        });
      }
      if (value.UPLOAD_MAX_FILE_SIZE_MB > 4.5) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['UPLOAD_MAX_FILE_SIZE_MB'],
          message: 'Na Vercel o corpo da requisição é limitado a 4,5 MB: use no máximo 4',
        });
      }
      if (value.NOTIFICATION_STREAM_MAX_SECONDS === 0 || value.NOTIFICATION_STREAM_MAX_SECONDS >= 300) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['NOTIFICATION_STREAM_MAX_SECONDS'],
          message: 'Na Vercel a função dura no máximo 300 s: use um valor entre 1 e 299 (recomendado 240)',
        });
      }
    }
    const secure = value.AUTH_COOKIE_SECURE ?? value.NODE_ENV === 'production';
    if (value.AUTH_COOKIE_SAMESITE === 'none' && !secure) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_COOKIE_SECURE'],
        message: 'AUTH_COOKIE_SAMESITE=none exige AUTH_COOKIE_SECURE=true (os navegadores recusam o cookie)',
      });
    }
  });

export type AppEnv = z.infer<typeof schema> & {
  isProduction: boolean;
  isTest: boolean;
  uploadMaxFileSizeBytes: number;
  corsOrigins: string[];
  authCookieSecure: boolean;
};

let cached: AppEnv | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (cached) {
    return cached;
  }
  // Platform-aware defaults: on Vercel the safe values are applied when the variable is
  // absent, so a project with no explicit setting already respects the platform limits.
  const onVercel = Boolean(source.VERCEL);
  const withDefaults: NodeJS.ProcessEnv = {
    ...(onVercel ? { UPLOAD_MAX_FILE_SIZE_MB: '4', NOTIFICATION_STREAM_MAX_SECONDS: '240', NOTIFICATION_POLL_INTERVAL_SECONDS: '5' } : {}),
    ...definedOnly(source),
  };
  const parsed = schema.safeParse(withDefaults);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  const value = parsed.data;
  cached = {
    ...value,
    isProduction: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
    uploadMaxFileSizeBytes: value.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024,
    corsOrigins: value.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
    authCookieSecure: value.AUTH_COOKIE_SECURE ?? value.NODE_ENV === 'production',
  };
  return cached;
}

/** Drops empty values, so a blank variable in a hosting dashboard falls back to its default. */
function definedOnly(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ''));
}

/** Test seam — lets a suite rebuild configuration from a different environment. */
export function resetEnvCache(): void {
  cached = null;
}
