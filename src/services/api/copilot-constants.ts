/**
 * Shared constants for GitHub Copilot API integration
 */

import { isGitHubEnterpriseHostname } from '../../utils/auth.js'
import { COPILOT_API_BASE_URL } from '../../constants/copilot-oauth.js'

// Version constants
export const COPILOT_EDITOR_VERSION = 'vscode/1.80.1'
export const COPILOT_PLUGIN_VERSION = 'copilot-chat/0.26.7'
export const COPILOT_USER_AGENT = 'GitHubCopilotChat/0.26.7'
export const COPILOT_API_VERSION = '2025-04-01'

// Cache and timeout constants
export const COPILOT_MODEL_CACHE_TTL_MS = 5 * 60_000 // 5 minutes
export const COPILOT_CAPABILITY_CACHE_TTL_MS = 30 * 60_000 // 30 minutes for probed results
export const COPILOT_REFRESH_BUFFER_MS = 60_000 // 1 minute
export const DEFAULT_COPILOT_REFRESH_TIMEOUT_MS = 15_000 // 15 seconds
export const DEFAULT_COPILOT_CONTEXT_WINDOW_SIZE = 256_000

// Model constants
export const DEFAULT_COPILOT_MODEL = 'claude-sonnet-4.6'

/**
 * Get the appropriate Copilot API base URL for the given enterprise URL
 */
export function getCopilotApiBaseUrl(enterpriseUrl?: string): string {
  if (!enterpriseUrl) {
    return COPILOT_API_BASE_URL
  }

  // Handle enterprise URLs - ensure proper format
  const cleanUrl = enterpriseUrl.includes('://')
    ? enterpriseUrl
    : `https://${enterpriseUrl}`

  try {
    const url = new URL(cleanUrl)

    if (isGitHubEnterpriseHostname(url.hostname)) {
      return `${url.protocol}//${url.hostname}/api/copilot`
    }
  } catch (error) {
    // Invalid URL format, fall back to default
    console.warn(`Invalid enterprise URL format: ${enterpriseUrl}, using default`)
  }

  return COPILOT_API_BASE_URL
}

/**
 * Build standard Copilot API headers with authentication and versioning
 */
export function buildCopilotHeaders(
  copilotToken: string,
  additionalHeaders?: Record<string, string>
): Record<string, string> {
  return {
    'Authorization': `Bearer ${copilotToken}`,
    'X-GitHub-Api-Version': COPILOT_API_VERSION,
    'Editor-Version': COPILOT_EDITOR_VERSION,
    'Editor-Plugin-Version': COPILOT_PLUGIN_VERSION,
    'User-Agent': COPILOT_USER_AGENT,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...additionalHeaders,
  }
}

/**
 * Static fallback models when API discovery fails
 * These should be updated periodically based on known Copilot models
 */
export const COPILOT_FALLBACK_MODELS = [
  {
    id: 'claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    description: 'Balanced Claude model for everyday coding tasks',
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Latest general-purpose GPT model',
  },
  {
    id: 'claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Fast Claude model optimized for lightweight tasks',
  },
  {
    id: 'claude-opus-4.6',
    label: 'Claude Opus 4.6',
    description: 'High-capability Claude model for complex reasoning and coding',
  },
] as const

/**
 * Models that require max_completion_tokens instead of max_tokens.
 * These are OpenAI o-series and newer GPT-5.x models.
 */
export const MODELS_USING_MAX_COMPLETION_TOKENS = new Set([
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'o1',
  'o1-mini',
  'o1-preview',
  'o3',
  'o3-mini',
  'o4-mini',
])

export function getCopilotTokenParameter(
  modelId: string,
  preferredTokenParameter?: 'max_tokens' | 'max_completion_tokens',
): 'max_tokens' | 'max_completion_tokens' {
  if (preferredTokenParameter) {
    return preferredTokenParameter
  }

  return MODELS_USING_MAX_COMPLETION_TOKENS.has(modelId)
    ? 'max_completion_tokens'
    : 'max_tokens'
}
