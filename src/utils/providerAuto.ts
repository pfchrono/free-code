import { getAnthropicApiKey, getAuthTokenSource, getCodexOAuthTokens, getCopilotOAuthTokens } from './auth.js'
import { listOpenAICompatibleModels, listZenModels } from './providerDiscovery.js'
import { getSettingsForSource } from './settings/settings.js'
import type { APIProvider } from './model/providers.js'

export type RecommendationGoal = 'latency' | 'balanced' | 'coding'

export type ProviderAvailability = {
  firstParty: boolean
  codex: boolean
  openai: boolean
  openrouter: boolean
  copilot: boolean
  lmstudio: boolean
  zen: boolean
  minimax: boolean
}

export type ProviderRecommendation = {
  provider: APIProvider
  reason: string
  goal: RecommendationGoal
}

const PRIORITY_BY_GOAL: Record<RecommendationGoal, Array<{
  provider: APIProvider
  reason: string
}>> = {
  coding: [
    { provider: 'codex', reason: 'codex auth available for coding-first flow' },
    { provider: 'copilot', reason: 'copilot auth available for coding flow' },
    { provider: 'openai', reason: 'openai api key available for coding preset' },
    { provider: 'openrouter', reason: 'openrouter key available for coding preset' },
    { provider: 'lmstudio', reason: 'local LM Studio models available' },
    { provider: 'zen', reason: 'zen models available for coding preset' },
    { provider: 'minimax', reason: 'minimax key available as coding fallback' },
    { provider: 'firstParty', reason: 'falling back to first-party provider' },
  ],
  latency: [
    { provider: 'lmstudio', reason: 'local LM Studio models available for low latency' },
    { provider: 'zen', reason: 'zen available for fast preset' },
    { provider: 'openai', reason: 'openai api key available for fast preset' },
    { provider: 'openrouter', reason: 'openrouter key available for fast preset' },
    { provider: 'copilot', reason: 'copilot auth available for fast preset' },
    { provider: 'codex', reason: 'codex auth available for fast preset' },
    { provider: 'minimax', reason: 'minimax key available for fast preset' },
    { provider: 'firstParty', reason: 'falling back to first-party provider' },
  ],
  balanced: [
    { provider: 'codex', reason: 'codex auth available for balanced default' },
    { provider: 'openai', reason: 'openai api key available for balanced default' },
    { provider: 'openrouter', reason: 'openrouter key available for balanced default' },
    { provider: 'copilot', reason: 'copilot auth available for balanced default' },
    { provider: 'lmstudio', reason: 'local LM Studio models available' },
    { provider: 'zen', reason: 'zen available for balanced default' },
    { provider: 'minimax', reason: 'minimax key available as balanced fallback' },
    { provider: 'firstParty', reason: 'falling back to first-party provider' },
  ],
}

export function normalizeRecommendationGoal(
  value: string | null | undefined,
): RecommendationGoal {
  const normalized = value?.trim().toLowerCase()
  if (
    normalized === 'latency' ||
    normalized === 'balanced' ||
    normalized === 'coding'
  ) {
    return normalized
  }
  return 'balanced'
}

export function recommendProvider(
  availability: ProviderAvailability,
  goal: RecommendationGoal,
): ProviderRecommendation {
  const order = PRIORITY_BY_GOAL[goal]
  for (const candidate of order) {
    if (availability[candidate.provider]) {
      return {
        provider: candidate.provider,
        reason: candidate.reason,
        goal,
      }
    }
  }

  return {
    provider: 'firstParty',
    reason: 'default first-party fallback',
    goal,
  }
}

export async function discoverProviderAvailability(): Promise<ProviderAvailability> {
  const localSettings = getSettingsForSource('localSettings')
  const openrouterKey =
    process.env.OPENROUTER_API_KEY?.trim() ||
    localSettings?.openrouterApiKey
  const minimaxKey =
    process.env.MINIMAX_API_KEY?.trim() ||
    localSettings?.minimaxApiKey
  const firstPartyAuth = Boolean(
    getAuthTokenSource().hasToken || getAnthropicApiKey(),
  )
  const lmstudioModels = await listOpenAICompatibleModels({
    baseUrl: process.env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234/v1',
    apiKey: process.env.LMSTUDIO_API_KEY || 'lmstudio',
  })
  const zenModels = await listZenModels({
    apiKey: process.env.OPENCODE_API_KEY,
  })

  return {
    firstParty: firstPartyAuth,
    codex: Boolean(getCodexOAuthTokens()?.accessToken),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    openrouter: Boolean(openrouterKey),
    copilot: Boolean(getCopilotOAuthTokens()?.githubToken),
    lmstudio: Boolean(lmstudioModels && lmstudioModels.length > 0),
    zen: Boolean(zenModels && zenModels.length > 0),
    minimax: Boolean(minimaxKey),
  }
}
