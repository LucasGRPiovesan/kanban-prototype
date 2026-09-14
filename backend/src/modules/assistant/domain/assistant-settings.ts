export const ASSISTANT_PROVIDER = 'GEMINI';
export const ASSISTANT_PROVIDER_NAME = 'Google Gemini';

/**
 * The models an administrator may choose — a closed list, not free text.
 *
 * Every entry was verified to accept the request this module sends (JSON Schema output and
 * `thinkingLevel`). The list is what keeps a typo, or a model Google has retired for new
 * keys (gemini-2.5-flash-lite, at the time of writing), from reaching production.
 */
export const ASSISTANT_MODELS = [
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    description: 'Rápido e com cota gratuita — o padrão.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    description: 'Geração anterior do Flash-Lite, como alternativa.',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    description: 'Textos mais elaborados, com mais latência e cota menor.',
  },
] as const;

export type AssistantModelId = (typeof ASSISTANT_MODELS)[number]['id'];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = 'gemini-3.5-flash-lite';

export function isAssistantModel(value: string): value is AssistantModelId {
  return ASSISTANT_MODELS.some((model) => model.id === value);
}

export function modelLabel(id: string): string {
  return ASSISTANT_MODELS.find((model) => model.id === id)?.label ?? id;
}

export interface AssistantSettingsState {
  /** `null` until the configuration is first saved. */
  uuid: string | null;
  enabled: boolean;
  model: string;
  apiKeyCiphertext: string | null;
  apiKeyPreview: string | null;
  updatedAt: Date | null;
  updatedBy: { uuid: string; name: string } | null;
}

/** An installation that was never configured: enabled, as the product ships, but keyless. */
export function unconfiguredAssistant(): AssistantSettingsState {
  return {
    uuid: null,
    enabled: true,
    model: DEFAULT_ASSISTANT_MODEL,
    apiKeyCiphertext: null,
    apiKeyPreview: null,
    updatedAt: null,
    updatedBy: null,
  };
}

const API_KEY = /^[\x21-\x7E]{20,512}$/;

/** Printable, no whitespace, a plausible length — the provider remains the real judge. */
export function isPlausibleApiKey(value: string): boolean {
  return API_KEY.test(value);
}

export function previewOf(apiKey: string): string {
  return apiKey.slice(-4);
}
