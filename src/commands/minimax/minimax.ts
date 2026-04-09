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
import { getMinimaxBaseUrl } from '../../services/api/providerConfig.js'

type StoredApiProvider = 'firstParty' | 'minimax'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

// Known MiniMax models from https://platform.minimax.io/docs/api-reference/text-anthropic-api
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

function buildStatusMessage(storedProvider: StoredApiProvider | null): string {
  const activeProvider = getAPIProvider()
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
    `${storedText} Current session provider: ${activeProvider}. Changes from /minimax apply on the next launch.`,
    keyText,
    regionNote,
    ` Endpoint: ${endpoint}.`,
    ` Timeout: ${timeoutMin}min (override with MINIMAX_API_TIMEOUT_MS).`,
    ' All model variants (opus/sonnet/haiku) remap to MiniMax-M2.7.',
    ' ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL are cleared automatically when MiniMax is active.',
  ].join('')
}

function usage(): string {
  return 'Usage: /minimax [status|models|off|<api-key>]'
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const trimmedArgs = args.trim()
  const normalizedArg = trimmedArgs.toLowerCase()

  if (normalizedArg === 'status') {
    onDone(buildStatusMessage(getStoredProvider()), { display: 'system' })
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
    const result = updateSettingsForSource('projectSettings', {
      apiProvider: 'firstParty',
    })

    if (result.error) {
      onDone(
        `Failed to update repo-local provider preference: ${result.error.message}`,
        { display: 'system' },
      )
      return null
    }

    logEvent('tengu_api_provider_preference_changed', {
      provider: 'firstParty' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: 'minimax_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    const localSettingsResult = updateSettingsForSource('localSettings', {
      minimaxApiKey: undefined,
    })

    if (localSettingsResult.error) {
      onDone(
        `Stored repo-local first-party mode, but failed to clear repo-local MiniMax key: ${localSettingsResult.error.message}`,
        { display: 'system' },
      )
      return null
    }

    onDone(
      'Stored repo-local first-party mode in .claude/settings.json and cleared any repo-local MiniMax key from .claude/settings.local.json. This session must end now to avoid mixed provider state. Restart free-code in this repo to continue with first-party mode. Use /minimax status after relaunch to confirm.',
      { display: 'system' },
    )
    process.exit(0)
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

    onDone(
      'Stored repo-local MiniMax mode in .claude/settings.json. This session must end now to avoid mixed provider state. Restart free-code in this repo with MINIMAX_API_KEY set to continue with MiniMax. Use /minimax status after relaunch to confirm.',
      { display: 'system' },
    )
    process.exit(0)
  }

  if (trimmedArgs.includes(' ')) {
    onDone(usage(), { display: 'system' })
    return null
  }

  // Treat single-word arg as API key
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

  logEvent('tengu_api_provider_preference_changed', {
    provider: 'minimax' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    source: 'minimax_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  onDone(
    'Stored repo-local MiniMax mode in .claude/settings.json and saved the API key in .claude/settings.local.json for this repo. Restart free-code in this repo to use the persisted key, or continue in this session with the loaded key. Use /minimax status to confirm.',
    { display: 'system' },
  )
  return null
}
