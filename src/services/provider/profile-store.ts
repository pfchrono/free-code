import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ProviderProfile, ProviderProfileFile, ProviderType } from './types.js';
import { PROVIDER_PROFILE_FILE_NAME } from './types.js';

function resolveProfileFilePath(cwd?: string): string {
  return resolve(cwd ?? process.cwd(), PROVIDER_PROFILE_FILE_NAME);
}

function sanitizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : undefined;
}

function sanitizeProfile(profile: Partial<ProviderProfile>): ProviderProfile | null {
  const id = sanitizeString(profile.id);
  const name = sanitizeString(profile.name);
  const baseUrl = sanitizeString(profile.baseUrl);
  const model = sanitizeString(profile.model);
  const type = profile.type;
  const apiKey = sanitizeString(profile.apiKey);

  if (!id || !name || !baseUrl || !model || !type) {
    return null;
  }

  return {
    id,
    name,
    type,
    baseUrl,
    model,
    apiKey,
  };
}

function generateProfileId(): string {
  return `profile_${randomBytes(6).toString('hex')}`;
}

export function loadProfile(cwd?: string): ProviderProfile | null {
  const filePath = resolveProfileFilePath(cwd);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<ProviderProfileFile>;
    if (!parsed.profile || typeof parsed.profile !== 'object') {
      return null;
    }

    const profile = sanitizeProfile(parsed.profile);
    return profile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: ProviderProfile, cwd?: string): string {
  const filePath = resolveProfileFilePath(cwd);
  const profileFile: ProviderProfileFile = {
    profile,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(filePath, JSON.stringify(profileFile, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return filePath;
}

export function deleteProfile(cwd?: string): string {
  const filePath = resolveProfileFilePath(cwd);
  rmSync(filePath, { force: true });
  return filePath;
}

export function createProfile(
  type: ProviderType,
  options: {
    name?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  },
  cwd?: string,
): ProviderProfile | null {
  const defaults = getPresetDefaults(type);
  const profile: ProviderProfile = {
    id: generateProfileId(),
    name: options.name ?? defaults.name,
    type,
    baseUrl: options.baseUrl ?? defaults.baseUrl,
    model: options.model ?? defaults.model,
    apiKey: options.apiKey,
  };

  const sanitized = sanitizeProfile(profile);
  if (!sanitized) {
    return null;
  }

  saveProfile(sanitized, cwd);
  return sanitized;
}

export function getPresetDefaults(type: ProviderType): {
  name: string;
  baseUrl: string;
  model: string;
  requiresApiKey: boolean;
} {
  switch (type) {
    case 'openai':
      return {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        requiresApiKey: true,
      };
    case 'ollama':
      return {
        name: 'Ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.1:8b',
        requiresApiKey: false,
      };
    case 'gemini':
      return {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-2.0-flash',
        requiresApiKey: true,
      };
    case 'custom':
    default:
      return {
        name: 'Custom Provider',
        baseUrl: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
        model: process.env.OPENAI_MODEL ?? 'llama3.1:8b',
        requiresApiKey: false,
      };
  }
}

export function applyProfileToEnv(profile: ProviderProfile): void {
  process.env.OPENAI_BASE_URL = profile.baseUrl;
  process.env.OPENAI_MODEL = profile.model;

  if (profile.apiKey) {
    process.env.OPENAI_API_KEY = profile.apiKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }

  if (profile.type === 'gemini') {
    process.env.GEMINI_BASE_URL = profile.baseUrl;
    process.env.GEMINI_MODEL = profile.model;
    if (profile.apiKey) {
      process.env.GEMINI_API_KEY = profile.apiKey;
    }
  }
}

export function clearProfileFromEnv(): void {
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_BASE_URL;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_API_KEY;
}
