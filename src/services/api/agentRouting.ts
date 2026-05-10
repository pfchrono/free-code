import type { SettingsJson } from '../../utils/settings/types.js'

export interface ProviderOverride {
  model: string
  baseURL: string
  apiKey: string
}

function normalizeAgentRoutingKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '')
}

export function resolveAgentProvider(
  name: string | undefined,
  subagentType: string | undefined,
  settings: SettingsJson | null,
): ProviderOverride | null {
  if (!settings) return null

  const routing = settings.agentRouting
  const models = settings.agentModels
  if (!routing || !models) return null

  const normalizedRouting = new Map<string, string>()
  for (const [key, value] of Object.entries(routing)) {
    const normalizedKey = normalizeAgentRoutingKey(key)
    if (!normalizedRouting.has(normalizedKey)) {
      normalizedRouting.set(normalizedKey, value)
    }
  }

  const candidates = [name, subagentType, 'default'].filter(
    Boolean,
  ) as string[]
  let modelName: string | undefined

  for (const candidate of candidates) {
    const match = normalizedRouting.get(normalizeAgentRoutingKey(candidate))
    if (match) {
      modelName = match
      break
    }
  }

  if (!modelName) return null

  const modelConfig = models[modelName]
  if (!modelConfig) return null

  return {
    model: modelName,
    baseURL: modelConfig.base_url,
    apiKey: modelConfig.api_key,
  }
}
