// `||`, not `??`: an empty value (a blank variable in a hosting dashboard) must fall back too.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';

/**
 * Absolute URL of an API path, for the few consumers that cannot go through `request` —
 * an EventSource opens its own connection and only accepts a URL.
 */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

/**
 * Carries the backend's structured error through to the UI.
 *
 * The API is the authority on authorization and on domain rules, so its `code` is what
 * screens branch on — the frontend never re-derives a rule to decide what went wrong.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorDetail[],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level messages, ready to be handed to React Hook Form. */
  get fieldErrors(): ApiErrorDetail[] {
    return this.details ?? [];
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

/**
 * Listeners notified when the server answers "not authenticated".
 *
 * A session can end without the user pressing anything — the cookie simply expires.
 * Without a central signal, every screen would keep rendering its error state inside an
 * application shell the user is no longer entitled to. The transport reports it once and
 * AuthProvider turns it into "you are signed out".
 */
type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** FormData bypasses JSON encoding so the browser can set the multipart boundary. */
  formData?: FormData;
}

/**
 * `null` for an empty body, `undefined` when the body is not JSON. Errors raised before a
 * request reaches the API — a platform's 413 for an oversized upload, a gateway's 502 page —
 * arrive as HTML or plain text, and must still become a readable ApiError instead of a
 * SyntaxError the screens do not know how to show.
 */
function parseJson(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function fallbackCode(status: number): string {
  return status === 413 ? 'PAYLOAD_TOO_LARGE' : 'UNKNOWN_ERROR';
}

function fallbackMessage(status: number): string {
  if (status === 413) {
    return 'O envio excede o tamanho máximo permitido. Envie arquivos menores ou em menos quantidade.';
  }
  if (status >= 500) {
    return 'O servidor está indisponível no momento. Tente novamente em instantes.';
  }
  return 'Não foi possível concluir a operação.';
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, formData } = options;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    // The session lives in an HttpOnly cookie, so every request must carry credentials.
    credentials: 'include',
    headers: formData || body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = parseJson(text);

  if (!response.ok) {
    if (response.status === 401) {
      for (const listener of unauthorizedListeners) {
        listener();
      }
    }
    const error = (
      payload as {
        error?: { code: string; message: string; details?: ApiErrorDetail[]; requestId?: string };
      } | null
    )?.error;
    throw new ApiError(
      response.status,
      error?.code ?? fallbackCode(response.status),
      error?.message ?? fallbackMessage(response.status),
      error?.details,
      error?.requestId,
    );
  }

  if (payload === undefined) {
    // A 2xx that is not JSON — a proxy or platform page, never this API.
    throw new ApiError(response.status, 'UNEXPECTED_RESPONSE', 'Resposta inesperada do servidor.');
  }
  return (payload as { data: T } | null)?.data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
};
