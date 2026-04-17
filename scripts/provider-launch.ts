import { spawn } from 'node:child_process'
import { getSettingsForSource } from '../src/utils/settings/settings.js'
import { applyRepoLocalApiProviderOverride } from '../src/utils/model/bootstrapProviderOverride.js'
import { getAPIProvider, type APIProvider } from '../src/utils/model/providers.js'
import {
  discoverProviderAvailability,
  normalizeRecommendationGoal,
  recommendProvider,
  type RecommendationGoal,
} from '../src/utils/providerAuto.js'

type LaunchProvider =
  | 'auto'
  | 'firstParty'
  | 'codex'
  | 'openai'
  | 'openrouter'
  | 'copilot'
  | 'lmstudio'
  | 'zen'
  | 'minimax'

type LaunchOptions = {
  provider: LaunchProvider
  recommend: boolean
  goal: RecommendationGoal
  fast: boolean
  passthroughArgs: string[]
}

const VALID_PROVIDERS = new Set<LaunchProvider>([
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
    'Usage: bun run dev:profile -- [provider|auto] [--recommend] [--goal <latency|balanced|coding>] [--fast] [-- <cli args>]',
    '',
    'Examples:',
    '  bun run dev:profile -- auto',
    '  bun run dev:profile -- codex',
    '  bun run dev:profile -- openrouter -- --print',
  ].join('\n')
}

function parseArgs(argv: string[]): LaunchOptions {
  let provider: LaunchProvider = 'auto'
  let recommend = false
  let goal: RecommendationGoal = normalizeRecommendationGoal(undefined)
  let fast = false
  const passthroughArgs: string[] = []
  let passthrough = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (passthrough) {
      passthroughArgs.push(arg)
      continue
    }

    if (arg === '--') {
      passthrough = true
      continue
    }

    if (arg === '--fast') {
      fast = true
      continue
    }

    if (arg === '--recommend') {
      recommend = true
      continue
    }

    if (arg === '--goal') {
      goal = normalizeRecommendationGoal(argv[i + 1] ?? null)
      i += 1
      continue
    }

    if (!arg.startsWith('-') && VALID_PROVIDERS.has(arg as LaunchProvider)) {
      provider = arg as LaunchProvider
      continue
    }

    passthroughArgs.push(arg)
  }

  return { provider, recommend, goal, fast, passthroughArgs }
}

async function resolveProvider(
  requested: LaunchProvider,
  recommend: boolean,
  goal: RecommendationGoal,
): Promise<{ provider: APIProvider; reason?: string }> {
  if (recommend) {
    const availability = await discoverProviderAvailability()
    const recommendation = recommendProvider(availability, goal)
    return {
      provider: recommendation.provider,
      reason: recommendation.reason,
    }
  }

  if (requested !== 'auto') {
    return { provider: requested }
  }

  applyRepoLocalApiProviderOverride()
  return { provider: getAPIProvider() }
}

function applyProviderFlag(provider: APIProvider, env: NodeJS.ProcessEnv): void {
  delete env.CLAUDE_CODE_USE_BEDROCK
  delete env.CLAUDE_CODE_USE_VERTEX
  delete env.CLAUDE_CODE_USE_FOUNDRY
  delete env.CLAUDE_CODE_USE_CODEX
  delete env.CLAUDE_CODE_USE_OPENAI
  delete env.CLAUDE_CODE_USE_OPENROUTER
  delete env.CLAUDE_CODE_USE_COPILOT
  delete env.CLAUDE_CODE_USE_LMSTUDIO
  delete env.CLAUDE_CODE_USE_ZEN
  delete env.CLAUDE_CODE_USE_MINIMAX

  switch (provider) {
    case 'codex':
      env.CLAUDE_CODE_USE_CODEX = '1'
      break
    case 'openai':
      env.CLAUDE_CODE_USE_OPENAI = '1'
      break
    case 'openrouter':
      env.CLAUDE_CODE_USE_OPENROUTER = '1'
      break
    case 'copilot':
      env.CLAUDE_CODE_USE_COPILOT = '1'
      break
    case 'lmstudio':
      env.CLAUDE_CODE_USE_LMSTUDIO = '1'
      break
    case 'zen':
      env.CLAUDE_CODE_USE_ZEN = '1'
      break
    case 'minimax':
      env.CLAUDE_CODE_USE_MINIMAX = '1'
      break
    case 'firstParty':
    case 'bedrock':
    case 'vertex':
    case 'foundry':
      break
  }
}

function applyFastFlags(env: NodeJS.ProcessEnv): void {
  env.CLAUDE_CODE_SIMPLE ??= '1'
  env.CLAUDE_CODE_DISABLE_THINKING ??= '1'
  env.DISABLE_INTERLEAVED_THINKING ??= '1'
  env.DISABLE_AUTO_COMPACT ??= '1'
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY ??= '1'
  env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS ??= '1'
}

function summarize(
  provider: APIProvider,
  fast: boolean,
  goal: RecommendationGoal,
  reason?: string,
): void {
  const storedProvider = getSettingsForSource('projectSettings')?.apiProvider ?? 'none'
  console.log(`provider=${provider}`)
  console.log(`storedProvider=${storedProvider}`)
  console.log(`goal=${goal}`)
  if (reason) {
    console.log(`reason=${reason}`)
  }
  console.log(`fast=${fast ? 'yes' : 'no'}`)
}

async function main(): Promise<void> {
  try {
    const { enableConfigs } = await import('../src/utils/config.js')
    enableConfigs()
    const { applySafeConfigEnvironmentVariables } = await import(
      '../src/utils/managedEnv.js'
    )
    applySafeConfigEnvironmentVariables()

    const options = parseArgs(process.argv.slice(2))
    const resolved = await resolveProvider(
      options.provider,
      options.recommend,
      options.goal,
    )
    const env = { ...process.env }
    applyProviderFlag(resolved.provider, env)
    if (options.fast) {
      applyFastFlags(env)
    }

    summarize(resolved.provider, options.fast, options.goal, resolved.reason)

    const child = spawn(
      'bun',
      ['run', './src/entrypoints/cli.tsx', ...options.passthroughArgs],
      {
        cwd: process.cwd(),
        env,
        stdio: 'inherit',
      },
    )

    child.on('exit', code => {
      process.exit(code ?? 0)
    })
    child.on('error', error => {
      console.error(`Failed to launch free-code: ${error.message}`)
      process.exit(1)
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error('')
    console.error(usage())
    process.exit(1)
  }
}

void main()
