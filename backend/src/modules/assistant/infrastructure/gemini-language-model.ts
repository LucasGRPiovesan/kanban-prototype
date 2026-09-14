import { type SecretCipher } from '../../../shared/application/secret-cipher.port';
import { DomainError } from '../../../shared/domain/errors';
import {
  type LanguageModel,
  LanguageModelError,
  type LanguageModelProvider,
  type LanguageModelRequest,
  type LanguageModelResult,
} from '../application/ports';
import { type AssistantSettingsState } from '../domain/assistant-settings';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Finish reasons that mean the provider withheld the answer on policy grounds. */
const POLICY_STOPS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GeminiOptions {
  timeoutMs: number;
  fetch?: FetchLike;
  /** Wait before the single retry of a transient provider failure. */
  retryDelayMs?: number;
}

function isTransient(error: unknown): boolean {
  return (
    error instanceof LanguageModelError &&
    error.reason === 'UNAVAILABLE' &&
    (error.extra.status ?? 0) >= 500
  );
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
}

interface GeminiErrorBody {
  error?: {
    message?: string;
    status?: string;
    details?: { retryDelay?: string; reason?: string }[];
  };
}

/**
 * Google's Gemini Developer API (`generateContent`), over plain `fetch`.
 *
 * No SDK: the surface used is one endpoint, and owning the request is what makes the
 * failure mapping below exact and testable with a fake `fetch`. Structured answers use
 * `responseJsonSchema`, so the provider itself constrains the output to the schema the
 * application then validates again.
 */
export class GeminiLanguageModel implements LanguageModel {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly options: GeminiOptions,
  ) {}

  async generate(request: LanguageModelRequest): Promise<LanguageModelResult> {
    const controller = new AbortController();
    // One deadline for the whole exchange — body and retry included: a response that starts
    // and then stalls is as useless to the person waiting as one that never starts.
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      try {
        return await this.attempt(request, controller.signal);
      } catch (error) {
        // Google reports a momentary overload ("model is experiencing high demand") as a
        // 5xx. That one is worth a single retry within the same deadline; a quota, a refusal
        // or a rejected key is not — retrying those only makes the person wait longer.
        if (!isTransient(error) || controller.signal.aborted) {
          throw error;
        }
        await pause(this.options.retryDelayMs ?? 800, controller.signal);
        return await this.attempt(request, controller.signal);
      }
    } catch (error) {
      if (error instanceof LanguageModelError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new LanguageModelError('TIMEOUT', `Sem resposta do Gemini em ${this.options.timeoutMs} ms.`);
      }
      throw new LanguageModelError(
        'UNAVAILABLE',
        `Falha de rede ao chamar o Gemini: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async attempt(request: LanguageModelRequest, signal: AbortSignal): Promise<LanguageModelResult> {
    const response = await (this.options.fetch ?? fetch)(
      `${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        // In a header, never in the query string, where proxies and access logs keep URLs.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(requestBody(request)),
        signal,
      },
    );
    if (!response.ok) {
      throw failureOf(response.status, await readJson<GeminiErrorBody>(response));
    }
    return this.read(await readJson<GeminiResponse>(response), request);
  }

  private read(payload: GeminiResponse | null, request: LanguageModelRequest): LanguageModelResult {
    if (!payload) {
      throw new LanguageModelError('INVALID_OUTPUT', 'Resposta do Gemini ilegível.');
    }
    if (payload.promptFeedback?.blockReason) {
      throw new LanguageModelError('BLOCKED', `Pedido bloqueado pelo provedor (${payload.promptFeedback.blockReason}).`);
    }
    const candidate = payload.candidates?.[0];
    const finish = candidate?.finishReason ?? '';
    if (POLICY_STOPS.has(finish)) {
      throw new LanguageModelError('BLOCKED', `Resposta retida pelo provedor (${finish}).`);
    }
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) {
      throw new LanguageModelError('INVALID_OUTPUT', 'O Gemini respondeu sem texto.');
    }
    // Truncated prose is still readable; truncated JSON is not.
    if (finish === 'MAX_TOKENS' && request.responseSchema) {
      throw new LanguageModelError('INVALID_OUTPUT', 'Resposta estruturada cortada pelo limite de tokens.');
    }
    return {
      text,
      model: payload.modelVersion ?? this.model,
      usage: {
        inputTokens: payload.usageMetadata?.promptTokenCount ?? null,
        outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
      },
    };
  }
}

function requestBody(request: LanguageModelRequest) {
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    generationConfig: {
      temperature: request.temperature ?? 0.3,
      maxOutputTokens: request.maxOutputTokens ?? 1024,
      // Reports and drafts over data already computed need no long reasoning pass; the
      // minimal level keeps a Flash-Lite answer around one second.
      thinkingConfig: { thinkingLevel: 'minimal' },
      ...(request.responseSchema
        ? { responseMimeType: 'application/json', responseJsonSchema: request.responseSchema }
        : {}),
    },
  };
}

function failureOf(status: number, body: GeminiErrorBody | null): LanguageModelError {
  const message = body?.error?.message ?? `HTTP ${status}`;
  const details = body?.error?.details ?? [];
  if (status === 429) {
    const delay = details.find((detail) => detail.retryDelay)?.retryDelay;
    const seconds = delay ? Math.ceil(Number.parseFloat(delay)) : Number.NaN;
    return new LanguageModelError('QUOTA', message, {
      status,
      retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
    });
  }
  if (
    status === 401 ||
    status === 403 ||
    details.some((detail) => detail.reason === 'API_KEY_INVALID') ||
    /api key/i.test(message)
  ) {
    return new LanguageModelError('AUTH', message, { status });
  }
  if (status === 404) {
    return new LanguageModelError('MODEL_UNAVAILABLE', message, { status });
  }
  return new LanguageModelError('UNAVAILABLE', message, { status });
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Decrypts the stored key and hands out a client for the configured model. */
export class GeminiLanguageModels implements LanguageModelProvider {
  constructor(
    private readonly cipher: SecretCipher,
    private readonly options: GeminiOptions,
  ) {}

  connect(settings: AssistantSettingsState): LanguageModel {
    const apiKey = settings.apiKeyCiphertext ? this.cipher.decrypt(settings.apiKeyCiphertext) : null;
    if (!apiKey) {
      throw DomainError.conflict(
        'ASSISTANT_KEY_UNREADABLE',
        'A chave de API salva não pode ser lida com o segredo atual do servidor. Um administrador precisa cadastrá-la de novo.',
      );
    }
    return new GeminiLanguageModel(apiKey, settings.model, this.options);
  }
}
