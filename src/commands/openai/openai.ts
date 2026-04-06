import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import process from 'process'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import {
  getOpenAIModelCapability,
  type OpenAIModelCapability,
  getOpenAIModelCapabilities,
  refreshOpenAIModelCapabilities,
  selectOpenAIModelForTask,
  getOpenAIModelCost,
  type TaskCategory,
} from '../../utils/model/openaiCapabilities.js'

type StoredApiProvider = 'firstParty' | 'openai'
type OpenAICapabilityFlags = NonNullable<OpenAIModelCapability['capabilities']>

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

function getStoredProvider(): StoredApiProvider | null {
  const value = getSettingsForSource('projectSettings')?.apiProvider
  return value === 'openai' || value === 'firstParty' ? value : null
}

function buildStatusMessage(storedProvider: StoredApiProvider | null): string {
  const activeProvider = getAPIProvider()
  const storedText = storedProvider
    ? `Repo-local provider preference: ${storedProvider}.`
    : 'Repo-local provider preference: none.'

  return `${storedText} Current session provider: ${activeProvider}. Changes from /openai apply on the next launch.`
}

function getCapabilityFlags(
  capability: OpenAIModelCapability | undefined,
): OpenAICapabilityFlags {
  return (
    capability?.capabilities ?? {
      reasoning: false,
      vision: false,
      function_calling: false,
      json_mode: false,
      streaming: false,
      code_generation: false,
    }
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const normalizedArg = args.trim().toLowerCase()

  if (normalizedArg === 'status') {
    onDone(buildStatusMessage(getStoredProvider()), { display: 'system' })
    return null
  }

  if (normalizedArg === 'models') {
    try {
      await refreshOpenAIModelCapabilities()

      const models = getOpenAIModelCapabilities()
      const capabilityLines = models
        .map(modelId => {
          const capability = getOpenAIModelCapability(modelId.id)
          if (!capability) return null

          const caps = getCapabilityFlags(capability)
          const cost = capability.cost_per_1k_tokens
          const costStr = cost
            ? `$${cost.input?.toFixed(4) || '?'}/$${cost.output?.toFixed(4) || '?'}`
            : 'cost unknown'
          const features = [
            caps.reasoning && 'reasoning',
            caps.vision && 'vision',
            caps.function_calling && 'functions',
            caps.json_mode && 'json',
            capability.preferredTokenParameter,
            capability.performance_tier,
          ]
            .filter(Boolean)
            .join(', ')

          return `  ${capability.id}: ${features} (${costStr} per 1K tokens)`
        })
        .filter(Boolean)

      const taskCategories: TaskCategory[] = [
        'reasoning',
        'vision',
        'code_generation',
        'fast_completion',
        'function_calling',
        'json_structured',
      ]
      const recommendations = taskCategories
        .map(category => {
          const recommended = selectOpenAIModelForTask(category)
          return recommended ? `  ${category}: ${recommended}` : null
        })
        .filter(Boolean)

      const output = [
        `Native OpenAI models (${models.length}):`,
        ...capabilityLines,
        '',
        'Recommended models by task:',
        ...recommendations,
        '',
        'Use /openai capabilities <model> for detailed info',
      ].join('\n')

      onDone(output, { display: 'system' })
      return null
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown capability fetch failure'
      onDone(`Failed to fetch OpenAI model capabilities: ${message}`, {
        display: 'system',
      })
      return null
    }
  }

  if (normalizedArg.startsWith('capabilities ')) {
    const modelId = normalizedArg.replace('capabilities ', '').trim()
    const capability = getOpenAIModelCapability(modelId)

    if (!capability) {
      onDone(`Model "${modelId}" not found in OpenAI capabilities`, {
        display: 'system',
      })
      return null
    }

    const caps = getCapabilityFlags(capability)
    const cost = getOpenAIModelCost(modelId)
    const lines = [
      `OpenAI Model: ${capability.id}`,
      `Max Input Tokens: ${capability.max_input_tokens || 'unknown'}`,
      `Max Output Tokens: ${capability.max_tokens || 'unknown'}`,
      `Performance Tier: ${capability.performance_tier || 'unknown'}`,
      '',
      'Capabilities:',
      `  Reasoning: ${caps.reasoning ? 'Yes' : 'No'}`,
      `  Vision: ${caps.vision ? 'Yes' : 'No'}`,
      `  Function Calling: ${caps.function_calling ? 'Yes' : 'No'}`,
      `  JSON Mode: ${caps.json_mode ? 'Yes' : 'No'}`,
      `  Streaming: ${caps.streaming ? 'Yes' : 'No'}`,
      `  Code Generation: ${caps.code_generation ? 'Yes' : 'No'}`,
    ]

    if (cost) {
      lines.push(
        '',
        'Pricing (per 1K tokens):',
        `  Input: $${cost.input?.toFixed(4) || 'unknown'}`,
        `  Output: $${cost.output?.toFixed(4) || 'unknown'}`,
      )
    }

    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  const validCommands = ['status', 'models', 'capabilities <model>', 'off']
  if (!ENABLE_ARGS.has(normalizedArg) && !DISABLE_ARGS.has(normalizedArg)) {
    onDone(`Usage: /openai [${validCommands.join('|')}]`, { display: 'system' })
    return null
  }

  const nextProvider: StoredApiProvider = DISABLE_ARGS.has(normalizedArg)
    ? 'firstParty'
    : 'openai'
  const result = updateSettingsForSource('projectSettings', {
    apiProvider: nextProvider,
  })

  if (result.error) {
    onDone(
      `Failed to update repo-local provider preference: ${result.error.message}`,
      { display: 'system' },
    )
    return null
  }

  logEvent('tengu_api_provider_preference_changed', {
    provider: nextProvider as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    source:
      'openai_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  if (nextProvider === 'openai') {
    onDone(
      'Stored repo-local native OpenAI API mode in .claude/settings.json. This session must end now to avoid mixed provider state. Restart free-code in this repo to continue with OpenAI. Use /openai status after relaunch to confirm.',
      { display: 'system' },
    )
    process.exit(0)
  }

  onDone(
    'Stored repo-local first-party mode in .claude/settings.json. This session must end now to avoid mixed provider state. Restart free-code in this repo to continue with first-party mode. Use /openai status after relaunch to confirm.',
    { display: 'system' },
  )
  process.exit(0)
}
