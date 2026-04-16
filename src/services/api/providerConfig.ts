const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
const DEFAULT_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';
const DEFAULT_MINIMAX_CHINA_BASE_URL = 'https://api.minimaxi.com/anthropic';

const CODEX_ALIAS_MODELS = new Set([
  'codexplan',
  'codexspark',
  'chatgpt-5.3-codex-spark',
  'gpt-5.3-codex-spark',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
]);

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function asEnvProviderBaseUrl(value: string | undefined): string | undefined {
  const trimmed = asTrimmedString(value);
  if (!trimmed || trimmed === 'undefined') {
    return undefined;
  }
  return trimmed;
}

export function getConfiguredOpenAIBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (
    asEnvProviderBaseUrl(env.OPENAI_BASE_URL) ??
    asEnvProviderBaseUrl(env.OPENAI_API_BASE)
  );
}

export function getOpenAIBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (getConfiguredOpenAIBaseUrl(env) ?? DEFAULT_OPENAI_BASE_URL).replace(
    /\/+$/,
    '',
  );
}

export function isCodexAlias(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  const baseModel = normalized.split('?', 1)[0] ?? normalized;
  return CODEX_ALIAS_MODELS.has(baseModel);
}

export function isCodexBaseUrl(baseUrl: string | undefined): boolean {
  const normalizedBaseUrl = asEnvProviderBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return false;
  }

  try {
    const parsed = new URL(normalizedBaseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return (
      parsed.hostname === 'chatgpt.com' &&
      (pathname === '/backend-api/codex' ||
        pathname === '/backend-api/codex/responses')
    );
  } catch {
    return false;
  }
}

export function shouldUseCodexTransport(
  model: string,
  baseUrl: string | undefined,
): boolean {
  const normalizedBaseUrl = asEnvProviderBaseUrl(baseUrl);
  return (
    isCodexBaseUrl(normalizedBaseUrl) ||
    (!normalizedBaseUrl && isCodexAlias(model))
  );
}

export function getZenBaseUrl(): string {
  return DEFAULT_ZEN_BASE_URL;
}

export function getMinimaxBaseUrl(): string {
  // Set MINIMAX_API_REGION=china to use the China endpoint (api.minimaxi.com)
  if (process.env.MINIMAX_API_REGION?.toLowerCase() === 'china') {
    return DEFAULT_MINIMAX_CHINA_BASE_URL;
  }
  return DEFAULT_MINIMAX_BASE_URL;
}

export { DEFAULT_CODEX_BASE_URL, DEFAULT_MINIMAX_BASE_URL, DEFAULT_MINIMAX_CHINA_BASE_URL, DEFAULT_OPENAI_BASE_URL, DEFAULT_ZEN_BASE_URL };
