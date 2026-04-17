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
import { getMinimaxBaseUrl } from '../../services/api/providerConfig.js'

type StoredApiProvider = 'firstParty' | 'minimax'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

const MINIMAX_MODELS = [
  { id: 'MiniMax-M2.7', context: '204.8K', speed: '~60 tps' },
  { id: 'MiniMax-M2.7-highspeed', context: '204.8K', speed: '~100 tps' },
  { id: 'MiniMax-M2.5', context: '204.8K', speed: '~60 tps' },
  { id: 'MiniMax-M2.5-highspeed', context: '204.8K', speed: '~100 tps' },
  { id: 'MiniMax-M2.1', context: '204.8K', speed: '~60 tps' },
  { id: 'MiniMax-M2.1-highspeed', context: '204.8K', speed: '~100 tps' },
  { id: 'MiniMax-M2', context: '204.8K', speed: 'agentic' },
]

function getStoredProvider(): StoredApiProvider | null {
  const value = getSettingsForSource('projectSettings')?.apiProvider
  return value === 'minimax' || value === 'firstParty' ? value : null
}

async function buildStatusMessage(): Promise<string> {
  const activeProvider = await getAPIProvider()
  const storedProvider = getStoredProvider()
  const storedText = storedProvider
    ? `Repo-local provider preference: ${storedProvider}.`
    : 'Repo-local provider preference: none.'
  const localKey = getSettingsForSource('localSettings')?.minimaxApiKey

  const keyText = process.env.MINIMAX_API_KEY
    ? ' MINIMAX_API_KEY is set in this session.'
    : localKey
      ? ' MINIMAX_API_KEY is stored in local settings for this repo.'
      : ' MINIMAX_API_KEY is not set.'

  const endpoint = getMinimaxBaseUrl()
  const regionNote = process.env.MINIMAX_API_REGION?.toLowerCase() === 'china'
    ? ' Region: China (api.minimaxi.com).'
    : ' Region: International (api.minimax.io).'

  const timeoutMs = process.env.MINIMAX_API_TIMEOUT_MS || '3000000'
  const timeoutMin = Math.round(parseInt(timeoutMs, 10) / 60000)

  return [
    `${storedText} Current session provider: ${activeProvider}.`,
    keyText,
    regionNote,
    ` Endpoint: ${endpoint}.`,
    ` Timeout: ${timeoutMin}min (override with MINIMAX_API_TIMEOUT_MS).`,
    ' All model variants (opus/sonnet/haiku) remap to MiniMax-M2.7.',
    ' ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL are cleared automatically when MiniMax is active.',
  ].join('')
}

function usage(): string {
  return 'Usage: /minimax [status|models|usage|off|<api-key>]'
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const trimmedArgs = args.trim()
  const normalizedArg = trimmedArgs.toLowerCase()

  if (normalizedArg === 'status') {
    onDone(await buildStatusMessage(), { display: 'system' })
    return null
  }

  if (normalizedArg === 'models') {
    const lines = [
      `MiniMax models (${MINIMAX_MODELS.length}):`,
      ...MINIMAX_MODELS.map(m => `  ${m.id} (${m.context} context, ${m.speed})`),
      '',
      'Default model when using /minimax: MiniMax-M2.7 (all Claude model aliases remap to this).',
      'Note: MiniMax does not support image/document inputs — text and tool calls only.',
      'Note: Token Plan API Key cannot select MiniMax-M2.7-highspeed.',
      '',
      'Get your API key at https://platform.minimax.io',
    ]
    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  if (DISABLE_ARGS.has(normalizedArg)) {
    switchProviderDirectly('firstParty')
    updateSettingsForSource('projectSettings', { apiProvider: 'firstParty' })

    logEvent('tengu_api_provider_preference_changed', {
      provider: 'firstParty' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: 'minimax_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    const localSettingsResult = updateSettingsForSource('localSettings', {
      minimaxApiKey: undefined,
    })

    if (localSettingsResult.error) {
      onDone(
        `Switched to ${chalk.bold('first-party mode')}, but failed to clear repo-local MiniMax key: ${localSettingsResult.error.message}`,
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

  // /minimax on or /minimax (no arg) — require a key to be set
  if (!trimmedArgs || ENABLE_ARGS.has(normalizedArg)) {
    const hasKey =
      process.env.MINIMAX_API_KEY ||
      getSettingsForSource('localSettings')?.minimaxApiKey

    if (!hasKey) {
      onDone(
        'MiniMax mode requires an API key. Run /minimax <api-key> to store the provider preference for the next launch. Get your key at https://platform.minimax.io',
        { display: 'system' },
      )
      return null
    }

    const result = updateSettingsForSource('projectSettings', {
      apiProvider: 'minimax',
    })

    if (result.error) {
      onDone(
        `Failed to update repo-local provider preference: ${result.error.message}`,
        { display: 'system' },
      )
      return null
    }

    logEvent('tengu_api_provider_preference_changed', {
      provider: 'minimax' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: 'minimax_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    switchProviderDirectly('minimax')

    onDone(
      `Switched to ${chalk.bold('MiniMax')}. Changes apply immediately.`,
      { display: 'system' },
    )
    return null
  }

  if (trimmedArgs.includes(' ')) {
    onDone(usage(), { display: 'system' })
    return null
  }

  // Treat single-word arg as API key
  updateSettingsForSource('projectSettings', { apiProvider: 'minimax' })

  const localSettingsResult = updateSettingsForSource('localSettings', {
    minimaxApiKey: trimmedArgs,
  })

  if (localSettingsResult.error) {
    onDone(
      `Failed to store repo-local MiniMax API key: ${localSettingsResult.error.message}`,
      { display: 'system' },
    )
    return null
  }

  process.env.MINIMAX_API_KEY = trimmedArgs
  switchProviderDirectly('minimax')

  logEvent('tengu_api_provider_preference_changed', {
    provider: 'minimax' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    source: 'minimax_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  onDone(
    `Switched to ${chalk.bold('MiniMax')} with API key. Changes apply immediately.`,
    { display: 'system' },
  )
  return null
}
