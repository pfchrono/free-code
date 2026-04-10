import chalk from 'chalk'
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
import { getAPIProvider, setRuntimeProvider } from '../../utils/model/providers.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import {
  getOpenAIModelCapability,
  getOpenAIModelCapabilities,
  refreshOpenAIModelCapabilities,
} from '../../utils/model/openaiCapabilities.js'

type StoredApiProvider = 'firstParty' | 'openrouter'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

function getStoredProvider(): StoredApiProvider | null {
  const value = getSettingsForSource('projectSettings')?.apiProvider
  return value === 'openrouter' || value === 'firstParty' ? value : null
}

function buildStatusMessage(): string {
  const activeProvider = getAPIProvider()
  const storedProvider = getStoredProvider()
  const storedText = storedProvider
    ? `Repo-local provider preference: ${storedProvider}.`
    : 'Repo-local provider preference: none.'
  const localKey = getSettingsForSource('localSettings')?.openrouterApiKey

  const keyText = process.env.OPENROUTER_API_KEY
    ? ' OPENROUTER_API_KEY is set in this session.'
    : localKey
      ? ' OPENROUTER_API_KEY is stored in local settings for this repo.'
      : ' OPENROUTER_API_KEY is not set in this session.'

  return `${storedText} Current session provider: ${activeProvider}.${keyText}`
}

function usage(): string {
  return 'Usage: /openrouter [status|models|off|<api-key>]'
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const trimmedArgs = args.trim()
  const normalizedArg = trimmedArgs.toLowerCase()

  if (normalizedArg === 'status') {
    onDone(buildStatusMessage(), { display: 'system' })
    return null
  }

  if (normalizedArg === 'models') {
    const previousProviderFlag = process.env.CLAUDE_CODE_USE_OPENAI
    process.env.CLAUDE_CODE_USE_OPENAI = '1'

    try {
      await refreshOpenAIModelCapabilities()
      const models = getOpenAIModelCapabilities()

      if (models.length === 0) {
        onDone(
          'No OpenAI-compatible model capabilities are available yet. Restart in OpenRouter mode and use /model or make a request first, then run /openrouter models again.',
          { display: 'system' },
        )
        return null
      }

      const lines = [
        `OpenRouter model suggestions from OpenAI-compatible capabilities (${models.length} cached):`,
        ...models.map(modelId => {
          const capability = getOpenAIModelCapability(modelId.id)
          const features = [
            capability?.capabilities?.reasoning ? 'reasoning' : null,
            capability?.capabilities?.vision ? 'vision' : null,
            capability?.capabilities?.function_calling ? 'functions' : null,
            capability?.performance_tier,
          ]
            .filter(Boolean)
            .join(', ')
          return `  ${modelId.id}${features ? ` (${features})` : ''}`
        }),
        '',
        'Use OpenRouter model IDs such as openai/gpt-4.1, anthropic/claude-sonnet-4, or google/gemini-2.5-pro.',
      ]

      onDone(lines.join('\n'), { display: 'system' })
      return null
    } finally {
      if (!previousProviderFlag) {
        delete process.env.CLAUDE_CODE_USE_OPENAI
      }
    }
  }

  if (DISABLE_ARGS.has(normalizedArg)) {
    setRuntimeProvider('firstParty')
    updateSettingsForSource('projectSettings', { apiProvider: 'firstParty' })

    logEvent('tengu_api_provider_preference_changed', {
      provider: 'firstParty' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source:
        'openrouter_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    const localSettingsResult = updateSettingsForSource('localSettings', {
      openrouterApiKey: undefined,
    })

    if (localSettingsResult.error) {
      onDone(
        `Switched to ${chalk.bold('first-party mode')}, but failed to clear repo-local OpenRouter key: ${localSettingsResult.error.message}`,
        { display: 'system' },
      )
      return null
    }

    onDone(
      `Switched to ${chalk.bold('first-party mode')}. Changes apply immediately.`,
      { display: 'system' },
    )
    return null
  }

  if (!trimmedArgs || ENABLE_ARGS.has(normalizedArg)) {
    if (!process.env.OPENROUTER_API_KEY) {
      onDone(
        'OpenRouter mode requires an API key. Run /openrouter <api-key> to store the provider preference for the next launch and use the key in the restarted session.',
        { display: 'system' },
      )
      return null
    }

    setRuntimeProvider('openrouter')
    updateSettingsForSource('projectSettings', { apiProvider: 'openrouter' })

    logEvent('tengu_api_provider_preference_changed', {
      provider: 'openrouter' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source:
        'openrouter_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    onDone(
      `Switched to ${chalk.bold('OpenRouter')}. Changes apply immediately.`,
      { display: 'system' },
    )
    return null
  }

  if (trimmedArgs.includes(' ')) {
    onDone(usage(), { display: 'system' })
    return null
  }

  updateSettingsForSource('projectSettings', { apiProvider: 'openrouter' })

  const localSettingsResult = updateSettingsForSource('localSettings', {
    openrouterApiKey: trimmedArgs,
  })

  if (localSettingsResult.error) {
    onDone(
      `Failed to store repo-local OpenRouter API key: ${localSettingsResult.error.message}`,
      { display: 'system' },
    )
    return null
  }

  process.env.OPENROUTER_API_KEY = trimmedArgs
  setRuntimeProvider('openrouter')

  logEvent('tengu_api_provider_preference_changed', {
    provider: 'openrouter' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    source:
      'openrouter_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  onDone(
    `Switched to ${chalk.bold('OpenRouter')} with API key. Changes apply immediately.`,
    { display: 'system' },
  )
  return null
}
