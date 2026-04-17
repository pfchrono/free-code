import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isEnvTruthy } from '../envUtils.js'
import { getSettingsForSource } from '../settings/settings.js'

export type APIProvider =
  | 'firstParty'
  | 'zen'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'codex'
  | 'openai'
  | 'openrouter'
  | 'copilot'
  | 'lmstudio'
  | 'minimax'

function isSupportedProvider(
  provider: unknown,
): provider is 'firstParty' | 'zen' | 'codex' | 'openai' | 'openrouter' | 'copilot' | 'lmstudio' | 'minimax' {
  return (
    provider === 'firstParty' ||
    provider === 'zen' ||
    provider === 'codex' ||
    provider === 'openai' ||
    provider === 'openrouter' ||
    provider === 'copilot' ||
    provider === 'lmstudio' ||
    provider === 'minimax'
  )
}

function getProviderFromRepoLocalSettingsFile(): APIProvider | null {
  const settingsPath = join(process.cwd(), '.claude', 'settings.json')
  if (!existsSync(settingsPath)) {
    return null
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      apiProvider?: unknown
    }
    return isSupportedProvider(parsed.apiProvider) ? parsed.apiProvider : null
  } catch {
    return null
  }
}

function getProviderFromSettings(): APIProvider | null {
  const projectProvider = getSettingsForSource('projectSettings')?.apiProvider
  const userProvider = getSettingsForSource('userSettings')?.apiProvider
  const configuredProvider = projectProvider ?? userProvider

  if (isSupportedProvider(configuredProvider)) {
    return configuredProvider
  }

  // Early-start/headless fallback: read repo-local settings directly in case
  // settings bootstrap has not fully initialized yet.
  return getProviderFromRepoLocalSettingsFile()
}

export function getAPIProvider(): APIProvider {
  // Highest precedence: explicit runtime env switches.
  // These can come from CLI bootstrap or test drivers.
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_ZEN)) return 'zen'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) return 'bedrock'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) return 'vertex'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) return 'foundry'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_CODEX)) return 'codex'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)) return 'openai'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENROUTER)) return 'openrouter'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_COPILOT)) return 'copilot'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_LMSTUDIO)) return 'lmstudio'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_MINIMAX)) return 'minimax'

  // Fallback: persisted settings-based provider selection for headless and
  // early-start callsites where bootstrap env overrides may not have run yet.
  const settingsProvider = getProviderFromSettings()
  if (settingsProvider) return settingsProvider
  
  return 'firstParty'
}

export function shouldAllowAnthropicHostedServices(): boolean {
  return (
    getAPIProvider() === 'firstParty' &&
    isFirstPartyAnthropicBaseUrl()
  )
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

export function getCurrentAPIAdapterName(): string {
  return process.env.CLAUDE_CODE_API_PROVIDER ?? `${getAPIProvider()}-adapter`
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
