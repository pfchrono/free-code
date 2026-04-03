import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { probeCopilotChatCompletionsModels } from '../../services/api/copilot-client.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

type StoredApiProvider = 'firstParty' | 'copilot'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

function getStoredProvider(): StoredApiProvider | null {
  const value = getSettingsForSource('projectSettings')?.apiProvider
  return value === 'copilot' || value === 'firstParty' ? value : null
}

function buildStatusMessage(storedProvider: StoredApiProvider | null): string {
  const activeProvider = getAPIProvider()
  const storedText = storedProvider
    ? `Repo-local provider preference: ${storedProvider}.`
    : 'Repo-local provider preference: none.'

  return `${storedText} Current session provider: ${activeProvider}. Changes from /copilot apply on the next launch.`
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
      const results = await probeCopilotChatCompletionsModels()
      const supported = results
        .filter((result) => result.supported)
        .map((result) => result.model)
      const unsupported = results.filter((result) => !result.supported)

      const supportedLine = supported.length
        ? `Supported on /chat/completions (${supported.length}): ${supported.join(', ')}`
        : 'Supported on /chat/completions (0): none'

      const unsupportedLine = unsupported.length
        ? `Not supported (${unsupported.length}): ${unsupported
            .map((result) =>
              `${result.model}${result.code ? ` [${result.code}]` : ''}`,
            )
            .join(', ')}`
        : 'Not supported (0): none'

      onDone(`${supportedLine}\n${unsupportedLine}`, { display: 'system' })
      return null
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown probe failure'
      onDone(`Failed to probe Copilot model support: ${message}`, {
        display: 'system',
      })
      return null
    }
  }

  if (!ENABLE_ARGS.has(normalizedArg) && !DISABLE_ARGS.has(normalizedArg)) {
    onDone('Usage: /copilot [status|models|off]', { display: 'system' })
    return null
  }

  const nextProvider: StoredApiProvider = DISABLE_ARGS.has(normalizedArg)
    ? 'firstParty'
    : 'copilot'
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
      'copilot_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  if (nextProvider === 'copilot') {
    onDone(
      'Stored repo-local GitHub Copilot mode in .claude/settings.json. Restart free-code in this repo to use Copilot without changing your global environment. Use /copilot status to check the stored preference.',
      { display: 'system' },
    )
    return null
  }

  onDone(
    'Stored repo-local first-party mode in .claude/settings.json. Restart free-code in this repo to stop using Copilot here. Use /copilot status to check the stored preference.',
    { display: 'system' },
  )
  return null
}