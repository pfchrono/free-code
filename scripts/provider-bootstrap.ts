import { getSettingsForSource, updateSettingsForSource } from '../src/utils/settings/settings.js'
import type { APIProvider } from '../src/utils/model/providers.js'
import {
  discoverProviderAvailability,
  normalizeRecommendationGoal,
  recommendProvider,
  type RecommendationGoal,
} from '../src/utils/providerAuto.js'

type BootstrapProvider =
  | 'auto'
  | 'firstParty'
  | 'codex'
  | 'openai'
  | 'openrouter'
  | 'copilot'
  | 'lmstudio'
  | 'zen'
  | 'minimax'

type ParsedArgs = {
  provider: BootstrapProvider
  apiKey?: string
  goal: RecommendationGoal
}

const VALID_PROVIDERS = new Set<BootstrapProvider>([
  'auto',
  'firstParty',
  'codex',
  'openai',
  'openrouter',
  'copilot',
  'lmstudio',
  'zen',
  'minimax',
])

function usage(): string {
  return [
    'Usage: bun run profile:init -- --provider <provider> [--api-key <key>] [--goal <latency|balanced|coding>]',
    '',
    'Providers:',
    '  auto | firstParty | codex | openai | openrouter | copilot | lmstudio | zen | minimax',
    '',
    'Notes:',
    '  --api-key only stored repo-local for openrouter and minimax.',
    '  openai/codex/copilot/zen/lmstudio use existing env/OAuth/local server flows.',
  ].join('\n')
}

function parseArgs(argv: string[]): ParsedArgs {
  let provider: BootstrapProvider | null = null
  let apiKey: string | undefined
  let goal: RecommendationGoal = normalizeRecommendationGoal(undefined)

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--provider') {
      const value = argv[i + 1] as BootstrapProvider | undefined
      if (!value || !VALID_PROVIDERS.has(value)) {
        throw new Error('Invalid or missing --provider value.')
      }
      provider = value
      i += 1
      continue
    }

    if (arg === '--api-key') {
      const value = argv[i + 1]
      if (!value) {
        throw new Error('Missing value for --api-key.')
      }
      apiKey = value
      i += 1
      continue
    }

    if (arg === '--goal') {
      goal = normalizeRecommendationGoal(argv[i + 1] ?? null)
      i += 1
      continue
    }
  }

  if (!provider) {
    throw new Error('Missing required --provider.')
  }

  return { provider, apiKey, goal }
}

function setProjectProvider(provider: APIProvider): void {
  const result = updateSettingsForSource('projectSettings', { apiProvider: provider })
  if (result.error) {
    throw result.error
  }
}

function setLocalKeys(provider: BootstrapProvider, apiKey?: string): void {
  if (provider === 'openrouter') {
    const result = updateSettingsForSource('localSettings', {
      openrouterApiKey: apiKey,
    })
    if (result.error) {
      throw result.error
    }
    return
  }

  if (provider === 'minimax') {
    const result = updateSettingsForSource('localSettings', {
      minimaxApiKey: apiKey,
    })
    if (result.error) {
      throw result.error
    }
    return
  }

  if (provider !== 'auto' && apiKey) {
    throw new Error(`--api-key not supported for provider ${provider}.`)
  }
}

function summarize(provider: BootstrapProvider, goal: RecommendationGoal, reason?: string): string {
  const projectProvider = getSettingsForSource('projectSettings')?.apiProvider ?? 'none'
  const localSettings = getSettingsForSource('localSettings')
  const localKeySummary =
    provider === 'openrouter'
      ? localSettings?.openrouterApiKey
        ? 'openrouterApiKey=saved'
        : 'openrouterApiKey=none'
      : provider === 'minimax'
        ? localSettings?.minimaxApiKey
          ? 'minimaxApiKey=saved'
          : 'minimaxApiKey=none'
        : 'localKey=n/a'

  return [
    `provider=${provider}`,
    `goal=${goal}`,
    `projectSettings.apiProvider=${projectProvider}`,
    ...(reason ? [`reason=${reason}`] : []),
    localKeySummary,
  ].join('\n')
}

async function main(): Promise<void> {
  try {
    const { enableConfigs } = await import('../src/utils/config.js')
    enableConfigs()
    const { applySafeConfigEnvironmentVariables } = await import(
      '../src/utils/managedEnv.js'
    )
    applySafeConfigEnvironmentVariables()

    const parsed = parseArgs(process.argv.slice(2))
    let provider = parsed.provider as APIProvider
    let reason: string | undefined
    if (parsed.provider === 'auto') {
      const availability = await discoverProviderAvailability()
      const recommendation = recommendProvider(availability, parsed.goal)
      provider = recommendation.provider
      reason = recommendation.reason
    }
    setProjectProvider(provider)
    setLocalKeys(provider, parsed.apiKey)
    console.log(summarize(provider, parsed.goal, reason))
    console.log('next=bun run dev:profile')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error('')
    console.error(usage())
    process.exit(1)
  }
}

void main()
