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
import { getAPIProvider } from '../../utils/model/providers.js'
import { switchProviderDirectly } from '../../hooks/useProviderSwitch.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

type StoredApiProvider = 'firstParty' | 'zen'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

function getStoredProvider(): StoredApiProvider | null {
  const value = getSettingsForSource('projectSettings')?.apiProvider
  return value === 'zen' || value === 'firstParty' ? value : null
}

function buildStatusMessage(): string {
  const activeProvider = getAPIProvider()
  const storedProvider = getStoredProvider()
  const storedText = storedProvider
    ? `Repo-local provider preference: ${storedProvider}.`
    : 'Repo-local provider preference: none.'

  return `${storedText} Current session provider: ${activeProvider}.`
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const normalizedArg = args.trim().toLowerCase()

  if (normalizedArg === 'status') {
    onDone(buildStatusMessage(), { display: 'system' })
    return null
  }

  if (normalizedArg === 'models') {
    const apiKey =
      process.env.OPENCODE_API_KEY ??
      getSettingsForSource('localSettings')?.opencodeApiKey

    const freeModels = [
      'big-pickle',
      'minimax-m2.5-free',
      'qwen3.6-plus-free',
      'nemotron-3-super-free',
    ]

    if (!apiKey) {
      onDone(
        `OpenCode Zen free models:\n${freeModels.map(id => `  ${id}`).join('\n')}\n\nSet OPENCODE_API_KEY env var to access more models. Get your key at https://opencode.ai/zen`,
        { display: 'system' },
      )
      return null
    }

    try {
      const models = await listZenModels({ apiKey })

      if (!models || models.length === 0) {
        onDone('No models found from OpenCode Zen API', { display: 'system' })
        return null
      }

      const lines = [
        `OpenCode Zen models (${models.length}):`,
        ...models.map(id => `  ${id}`),
        '',
        'Get your API key at https://opencode.ai/zen',
      ]

      onDone(lines.join('\n'), { display: 'system' })
      return null
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error fetching models'
      onDone(`Failed to fetch Zen models: ${message}`, { display: 'system' })
      return null
    }
  }

  if (!ENABLE_ARGS.has(normalizedArg) && !DISABLE_ARGS.has(normalizedArg)) {
    onDone('Usage: /zen [status|models|off]', { display: 'system' })
    return null
  }

  const nextProvider: StoredApiProvider = DISABLE_ARGS.has(normalizedArg)
    ? 'firstParty'
    : 'zen'

  switchProviderDirectly(nextProvider)
  updateSettingsForSource('projectSettings', { apiProvider: nextProvider })

  logEvent('tengu_api_provider_preference_changed', {
    provider: nextProvider as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    source: 'zen_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  if (nextProvider === 'zen') {
    onDone(
      `Switched to ${chalk.bold('OpenCode Zen')}. Changes apply immediately.`,
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
