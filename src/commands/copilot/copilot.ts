import chalk from 'chalk'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  getCopilotModels,
  probeCopilotChatCompletionsModels,
} from '../../services/api/copilot-client.js'
import { getAPIProvider, setRuntimeProvider } from '../../utils/model/providers.js'
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
    try {
      const discovered = await getCopilotModels()
      const pickerEnabled = discovered.filter(model => model.modelPickerEnabled)
      const chatModels = pickerEnabled.filter(
        (model) =>
          (model.supportedEndpoints.length === 0 ||
            model.supportedEndpoints.includes('/chat/completions')),
      )
      const hidden = discovered.filter(model => !model.modelPickerEnabled)
      const completionTokenModels = chatModels.filter(
        (model) => model.preferredTokenParameter === 'max_completion_tokens',
      )
      const results = await probeCopilotChatCompletionsModels(
        chatModels.map((model) => model.id),
      )
      const supported = results
        .filter((result) => result.supported)
        .map((result) => result.model)
      const unsupported = results.filter((result) => !result.supported)
      const discoveredLine = `Discovered via /models (${discovered.length}): ${discovered.map((model) => model.id).join(', ')}`
      const pickerLine = `Picker-enabled (${pickerEnabled.length}): ${pickerEnabled.map((model) => model.id).join(', ') || 'none'}`
      const hiddenLine = `Hidden from picker (${hidden.length}): ${hidden.map((model) => model.id).join(', ') || 'none'}`
      const visionLine = `Vision-capable on /models (${chatModels.filter((model) => model.supportsVision).length}): ${chatModels
        .filter((model) => model.supportsVision)
        .map((model) => model.id)
        .join(', ') || 'none'}`
      const toolsLine = `Tool-calling on /models (${chatModels.filter((model) => model.supportsToolCalls).length}): ${chatModels
        .filter((model) => model.supportsToolCalls)
        .map((model) => model.id)
        .join(', ') || 'none'}`
      const tokenParamLine = `Uses max_completion_tokens (${completionTokenModels.length}): ${completionTokenModels
        .map((model) => model.id)
        .join(', ') || 'none'}`
      const supportedLine = supported.length
        ? `Supported on /chat/completions (${supported.length}): ${supported.join(', ')}`
        : 'Supported on /chat/completions (0): none'

      const unsupportedLine = unsupported.length
        ? `Not supported (${unsupported.length}): ${unsupported
            .map((result) =>
              `${result.model}${result.code ? ` [${result.code}]` : ''}${result.message ? ` - ${result.message}` : ''}`,
            )
            .join(', ')}`
        : 'Not supported (0): none'

      onDone(`${discoveredLine}\n${pickerLine}\n${hiddenLine}\n${visionLine}\n${toolsLine}\n${tokenParamLine}\n${supportedLine}\n${unsupportedLine}`, { display: 'system' })
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

  setRuntimeProvider(nextProvider)
  updateSettingsForSource('projectSettings', { apiProvider: nextProvider })

  logEvent('tengu_api_provider_preference_changed', {
    provider: nextProvider as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    source:
      'copilot_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  if (nextProvider === 'copilot') {
    onDone(
      `Switched to ${chalk.bold('GitHub Copilot')}. Changes apply immediately.`,
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
