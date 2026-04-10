export const PROVIDER_PROFILE_FILE_NAME = '.free-code-provider.json';

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

export const DEFAULT_OLLAMA_MODEL = 'llama3.1:8b';

export type ProviderType = 'openai' | 'ollama' | 'gemini' | 'custom';

export type RecommendationGoal = 'latency' | 'balanced' | 'coding';

export type ProfileEnv = {
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_AUTH_MODE?: 'api-key' | 'access-token' | 'adc';
  GEMINI_MODEL?: string;
  GEMINI_BASE_URL?: string;
};

export type ProviderProfile = {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type ProviderProfileFile = {
  profile: ProviderProfile;
  createdAt: string;
};

export type OllamaModelInfo = {
  name: string;
  size?: number;
  family?: string;
  parameterSize?: string;
  quantizationLevel?: string;
};

export type LMStudioModelInfo = {
  id: string;
  owned_by?: string;
};

export const DEFAULT_LMSTUDIO_BASE_URL = 'http://127.0.0.1:1234/v1';

export type RankedOllamaModel = OllamaModelInfo & {
  score: number;
  reasons: string[];
  summary: string;
};

export const PROVIDER_PRESETS: Record<ProviderType, {
  name: string;
  baseUrl: string;
  model: string;
  requiresApiKey: boolean;
}> = {
  openai: {
    name: 'OpenAI',
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    model: 'gpt-4o',
    requiresApiKey: true,
  },
  ollama: {
    name: 'Ollama',
    baseUrl: DEFAULT_OLLAMA_BASE_URL,
    model: DEFAULT_OLLAMA_MODEL,
    requiresApiKey: false,
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: DEFAULT_GEMINI_BASE_URL,
    model: DEFAULT_GEMINI_MODEL,
    requiresApiKey: true,
  },
  custom: {
    name: 'Custom OpenAI-compatible',
    baseUrl: process.env.OPENAI_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    model: process.env.OPENAI_MODEL ?? DEFAULT_OLLAMA_MODEL,
    requiresApiKey: false,
  },
};
