import { getCodexOAuthTokens, getCopilotOAuthTokens, getAuthTokenSource, getAnthropicApiKey } from './auth.js'
import { isEnvTruthy } from './envUtils.js'
import { hydrateGithubModelsTokenFromSecureStorage } from './githubModelsCredentials.js'
import { getMainLoopModel } from './model/model.js'
import { applyRepoLocalApiProviderOverride } from './model/bootstrapProviderOverride.js'
import { getAPIProvider, type APIProvider } from './model/providers.js'
import { getSettingsForSource } from './settings/settings.js'
import {
  getConfiguredOpenAIBaseUrl,
  getMinimaxBaseUrl,
  getZenBaseUrl,
} from '../services/api/providerConfig.js'

export type ProviderRuntimeStatus = {
  provider: APIProvider
  model: string
  baseUrl?: string
  auth: string
  validationError: string | null
}

function getAuthSummary(provider: APIProvider, env: NodeJS.ProcessEnv): string {
  switch (provider) {
    case 'codex': {
      const tokens = getCodexOAuthTokens()
      return tokens?.accessToken ? 'codex-oauth' : 'missing'
    }
    case 'copilot': {
      const tokens = getCopilotOAuthTokens()
      if (tokens?.copilotToken) return 'copilot-session'
      if (tokens?.githubToken) return 'github-oauth'
      return 'missing'
    }
    case 'openai':
      return env.OPENAI_API_KEY?.trim() ? 'OPENAI_API_KEY' : 'missing'
    case 'openrouter':
      return env.OPENROUTER_API_KEY?.trim() ||
        getSettingsForSource('localSettings')?.openrouterApiKey
        ? 'openrouter-api-key'
        : 'missing'
    case 'minimax':
      return env.MINIMAX_API_KEY?.trim() ||
        getSettingsForSource('localSettings')?.minimaxApiKey
        ? 'minimax-api-key'
        : 'missing'
    case 'lmstudio':
      return 'local-server'
    case 'zen':
      return env.OPENCODE_API_KEY?.trim() ? 'OPENCODE_API_KEY' : 'public'
    case 'firstParty': {
      const authSource = getAuthTokenSource()
      if (authSource.hasToken) return authSource.source
      if (getAnthropicApiKey()) return 'ANTHROPIC_API_KEY'
      return 'none'
    }
    case 'bedrock':
      return env.AWS_BEARER_TOKEN_BEDROCK?.trim() ? 'AWS_BEARER_TOKEN_BEDROCK' : 'aws-sdk'
    case 'vertex':
      return env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ? 'GOOGLE_APPLICATION_CREDENTIALS' : 'google-auth'
    case 'foundry':
      return env.ANTHROPIC_FOUNDRY_API_KEY?.trim() ? 'ANTHROPIC_FOUNDRY_API_KEY' : 'azure-ad'
    default:
      return 'unknown'
  }
}

function getBaseUrl(provider: APIProvider, env: NodeJS.ProcessEnv): string | undefined {
  switch (provider) {
    case 'openai':
    case 'codex':
      return getConfiguredOpenAIBaseUrl(env)
    case 'openrouter':
      return env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    case 'lmstudio':
      return env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234/v1'
    case 'zen':
      return getZenBaseUrl()
    case 'minimax':
      return getMinimaxBaseUrl()
    default:
      return undefined
  }
}

export function applyProviderRuntimeBootstrap(env: NodeJS.ProcessEnv = process.env): void {
  void env
  applyRepoLocalApiProviderOverride()
  hydrateGithubModelsTokenFromSecureStorage()
}

export function getProviderRuntimeValidationError(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const provider = getAPIProvider()

  switch (provider) {
    case 'codex':
      return getCodexOAuthTokens()?.accessToken
        ? null
        : 'Codex provider active but no Codex OAuth token available.'
    case 'copilot': {
      const tokens = getCopilotOAuthTokens()
      return tokens?.githubToken
        ? null
        : 'Copilot provider active but no GitHub OAuth token available.'
    }
    case 'openai':
      return env.OPENAI_API_KEY?.trim()
        ? null
        : 'OpenAI provider active but OPENAI_API_KEY missing.'
    case 'openrouter':
      return env.OPENROUTER_API_KEY?.trim() ||
        getSettingsForSource('localSettings')?.openrouterApiKey
        ? null
        : 'OpenRouter provider active but OPENROUTER_API_KEY missing.'
    case 'minimax':
      return env.MINIMAX_API_KEY?.trim() ||
        getSettingsForSource('localSettings')?.minimaxApiKey
        ? null
        : 'MiniMax provider active but MINIMAX_API_KEY missing.'
    case 'lmstudio':
      return null
    case 'zen':
      return null
    case 'bedrock':
    case 'vertex':
    case 'foundry':
    case 'firstParty':
      return null
    default:
      return null
  }
}

export function getProviderRuntimeStatus(
  env: NodeJS.ProcessEnv = process.env,
): ProviderRuntimeStatus {
  const provider = getAPIProvider()
  return {
    provider,
    model: getMainLoopModel(),
    baseUrl: getBaseUrl(provider, env),
    auth: getAuthSummary(provider, env),
    validationError: getProviderRuntimeValidationError(env),
  }
}

export function formatProviderRuntimeStatus(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const status = getProviderRuntimeStatus(env)
  const lines = [
    `provider=${status.provider}`,
    `model=${status.model}`,
    `auth=${status.auth}`,
  ]
  if (status.baseUrl) {
    lines.push(`baseUrl=${status.baseUrl}`)
  }
  lines.push(`valid=${status.validationError ? 'no' : 'yes'}`)
  if (status.validationError) {
    lines.push(`error=${status.validationError}`)
  }
  if (status.provider === 'firstParty' && !isEnvTruthy(env.CLAUDE_CODE_USE_OPENAI)) {
    lines.push('note=firstParty auth may come from OAuth or Anthropic API key')
  }
  return lines.join('\n')
}
