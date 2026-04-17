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
  getDefaultLMStudioModel,
  getLMStudioModelCapabilities,
  refreshLMStudioModelCapabilities,
} from '../../utils/model/lmstudioCapabilities.js'

type StoredApiProvider = 'firstParty' | 'lmstudio'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

function getStoredProvider(): StoredApiProvider | null {
  const value = getSettingsForSource('projectSettings')?.apiProvider
  return value === 'lmstudio' || value === 'firstParty' ? value : null
}

function buildStatusMessage(storedProvider: StoredApiProvider | null): string {
  const activeProvider = getAPIProvider()
  const storedText = storedProvider
    ? `Repo-local provider preference: ${storedProvider}.`
    : 'Repo-local provider preference: none.'

  return `${storedText} Current session provider: ${activeProvider}. Changes from /lmstudio apply on the next launch.`
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
      await refreshLMStudioModelCapabilities()
      const models = getLMStudioModelCapabilities()
      const activeModel = getDefaultLMStudioModel()

      if (models.length === 0) {
        onDone(
          'No LM Studio models were discovered from http://127.0.0.1:1234/v1/models. Make sure the local server is running and a model is loaded.',
          { display: 'system' },
        )
        return null
      }

      const lines = [
        `LM Studio local models (${models.length}):`,
        ...models.map((model, index) => {
          const suffix = index === 0 ? ' [default loaded model]' : ''
          const features = [
            model.performance_tier,
            model.capabilities?.reasoning ? 'reasoning' : null,
            model.capabilities?.vision ? 'vision' : null,
            model.capabilities?.function_calling ? 'functions' : null,
          ]
            .filter(Boolean)
            .join(', ')
          return `  ${model.id}${suffix}${features ? ` (${features})` : ''}`
        }),
        '',
        `Default model: ${activeModel || 'none detected'}`,
        'Source: local LM Studio /v1/models',
      ]

      onDone(lines.join('\n'), { display: 'system' })
      return null
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown LM Studio discovery failure'
      onDone(`Failed to fetch LM Studio models: ${message}`, {
        display: 'system',
      })
      return null
    }
  }

  if (!ENABLE_ARGS.has(normalizedArg) && !DISABLE_ARGS.has(normalizedArg)) {
    onDone('Usage: /lmstudio [status|models|off]', { display: 'system' })
    return null
  }

  const nextProvider: StoredApiProvider = DISABLE_ARGS.has(normalizedArg)
    ? 'firstParty'
    : 'lmstudio'
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
      'lmstudio_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  if (nextProvider === 'lmstudio') {
    onDone(
      'Stored repo-local LM Studio mode in .claude/settings.json. This session must end now to avoid mixed provider state. Restart free-code in this repo to continue with LM Studio. Use /lmstudio status after relaunch to confirm.',
      { display: 'system' },
    )
    process.exit(0)
  }

  onDone(
    'Stored repo-local first-party mode in .claude/settings.json. This session must end now to avoid mixed provider state. Restart free-code in this repo to continue with first-party mode. Use /lmstudio status after relaunch to confirm.',
    { display: 'system' },
  )
  process.exit(0)
}
