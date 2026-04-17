import type { OllamaModelInfo, ProviderProfile, ProviderType, RecommendationGoal, RankedOllamaModel, LMStudioModelInfo } from './types.js';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_LMSTUDIO_BASE_URL } from './types.js';
import {
  loadProfile,
  saveProfile,
  deleteProfile,
  createProfile,
  applyProfileToEnv,
  clearProfileFromEnv,
  getPresetDefaults,
} from './profile-store.js';
import { recommendOllamaModel, rankOllamaModels, normalizeGoal } from './recommendation.js';

export type ProviderStatus = {
  currentProfile: ProviderProfile | null;
  ollamaAvailable: boolean;
  ollamaModels: OllamaModelInfo[];
};

export type DiscoveryResult = {
  available: boolean;
  models: OllamaModelInfo[];
  error?: string;
};

export async function checkOllamaAvailable(baseUrl?: string): Promise<boolean> {
  const url = baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${url}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(baseUrl?: string): Promise<OllamaModelInfo[]> {
  const url = baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${url}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { models?: Array<{ name: string; size?: number; model?: string }> };
    if (!data.models || !Array.isArray(data.models)) {
      return [];
    }

    return data.models.map((m) => ({
      name: m.name,
      size: m.size,
    }));
  } catch {
    return [];
  }
}

export async function discoverOllama(goal?: RecommendationGoal): Promise<DiscoveryResult> {
  const available = await checkOllamaAvailable();
  if (!available) {
    return {
      available: false,
      models: [],
      error: 'Ollama not available at http://localhost:11434. Start Ollama first.',
    };
  }

  const models = await listOllamaModels();
  if (models.length === 0) {
    return {
      available: true,
      models: [],
      error: 'Ollama is running but no models are installed. Pull a model with `ollama pull <model>`.',
    };
  }

  return {
    available: true,
    models,
  };
}

export type LMStudioDiscoveryResult = {
  available: boolean;
  models: LMStudioModelInfo[];
  endpoint: string;
  error?: string;
};

async function checkLMStudioAvailable(baseUrl?: string): Promise<boolean> {
  const url = baseUrl ?? DEFAULT_LMSTUDIO_BASE_URL;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${url}/models`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function listLMStudioModels(baseUrl?: string): Promise<LMStudioModelInfo[]> {
  const url = baseUrl ?? DEFAULT_LMSTUDIO_BASE_URL;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${url}/models`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      data?: Array<{ id?: string; owned_by?: string }>;
    };
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data
      .map((m) => ({
        id: m.id ?? '',
        owned_by: m.owned_by,
      }))
      .filter((m) => m.id.length > 0);
  } catch {
    return [];
  }
}

async function discoverLMStudio(): Promise<LMStudioDiscoveryResult> {
  const endpoint = DEFAULT_LMSTUDIO_BASE_URL;
  const available = await checkLMStudioAvailable(endpoint);
  if (!available) {
    return {
      available: false,
      models: [],
      endpoint,
      error: `LM Studio not available at ${endpoint}. Start LM Studio first.`,
    };
  }

  const models = await listLMStudioModels(endpoint);
  if (models.length === 0) {
    return {
      available: true,
      models: [],
      endpoint,
      error: 'LM Studio is running but no models are loaded. Load a model in LM Studio.',
    };
  }

  return {
    available: true,
    models,
    endpoint,
  };
}

export async function recommendModelForGoal(
  goal: RecommendationGoal,
): Promise<RankedOllamaModel | null> {
  const discovery = await discoverOllama(goal);
  if (!discovery.available || discovery.models.length === 0) {
    return null;
  }
  return recommendOllamaModel(discovery.models, goal);
}

export function getCurrentProviderStatus(): ProviderStatus {
  const profile = loadProfile();
  return {
    currentProfile: profile,
    ollamaAvailable: false,
    ollamaModels: [],
  };
}

export async function getProviderStatus(): Promise<ProviderStatus> {
  const profile = loadProfile();
  const ollamaAvailable = await checkOllamaAvailable();
  const ollamaModels = ollamaAvailable ? await listOllamaModels() : [];

  return {
    currentProfile: profile,
    ollamaAvailable,
    ollamaModels,
  };
}

export function saveProviderProfile(
  type: ProviderType,
  options: {
    name?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  },
): ProviderProfile | null {
  const profile = createProfile(type, options);
  return profile;
}

export function loadProviderProfile(): ProviderProfile | null {
  return loadProfile();
}

export function removeProviderProfile(): string {
  return deleteProfile();
}

export function useProviderProfile(profile: ProviderProfile): void {
  applyProfileToEnv(profile);
}

export function clearProviderProfile(): void {
  clearProfileFromEnv();
}

export function formatProviderSummary(profile: ProviderProfile | null): string {
  if (!profile) {
    return 'No saved provider profile';
  }

  const lines = [
    `Provider: ${profile.name}`,
    `Type: ${profile.type}`,
    `Model: ${profile.model}`,
    `Endpoint: ${profile.baseUrl}`,
  ];

  if (profile.apiKey) {
    lines.push('API Key: configured');
  }

  return lines.join('\n');
}

export {
  createProfile,
  loadProfile,
  saveProfile,
  deleteProfile,
  applyProfileToEnv,
  clearProfileFromEnv,
  getPresetDefaults,
  normalizeGoal,
  rankOllamaModels,
  discoverLMStudio,
  listLMStudioModels,
  checkLMStudioAvailable,
};
