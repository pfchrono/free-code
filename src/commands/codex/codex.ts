import chalk from 'chalk'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { CODEX_MODELS, DEFAULT_CODEX_MODEL } from '../../services/api/codex-fetch-adapter.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getAPIProvider, type APIProvider } from '../../utils/model/providers.js'
import { switchProviderDirectly } from '../../hooks/useProviderSwitch.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

type StoredApiProvider = 'firstParty' | 'codex'
type RestoredApiProvider = Exclude<ReturnType<typeof getAPIProvider>, 'codex'>

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

function getStoredProvider(): StoredApiProvider | null {
  const value = getSettingsForSource('projectSettings')?.apiProvider
  return value === 'codex' || value === 'firstParty' ? value : null
}

function getRestoredProvider(): RestoredApiProvider {
  const storedProvider = getStoredProvider()
  if (storedProvider === 'firstParty') {
    return 'firstParty'
  }

  const activeProvider = getAPIProvider()
  return activeProvider === 'codex' ? 'firstParty' : activeProvider
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
    const lines = [
      `Codex curated catalog (${CODEX_MODELS.length})`,
      ...CODEX_MODELS.map(model => {
        const suffix = model.id === DEFAULT_CODEX_MODEL ? ' [default]' : ''
        const features = [
          model.family,
          model.supportsVision ? 'vision' : 'text-only',
          model.supportsTools ? 'tools' : null,
          model.supportedInApi ? 'api' : 'chatgpt-only',
          `reasoning:${model.defaultReasoningEffort}`,
          `ctx:${model.contextWindow}`,
          model.additionalSpeedTiers?.length ? `speed:${model.additionalSpeedTiers.join('/')}` : null,
          model.upgrade ? `upgrade:${model.upgrade}` : null,
        ]
          .filter(Boolean)
          .join(', ')
        return `  ${model.id}${suffix}: ${model.description}${features ? ` (${features})` : ''}`
      }),
      '',
      `Default model: ${DEFAULT_CODEX_MODEL}`,
      'Note: For up-to-date OpenAI model docs, see developers.openai.com/api/docs/models.',
    ]
    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  if (!ENABLE_ARGS.has(normalizedArg) && !DISABLE_ARGS.has(normalizedArg)) {
    onDone('Usage: /codex [status|models|off]', { display: 'system' })
    return null
  }

  const enablingCodex = ENABLE_ARGS.has(normalizedArg)
  const nextProvider: APIProvider = enablingCodex ? 'codex' : getRestoredProvider()

  switchProviderDirectly(nextProvider)
  updateSettingsForSource('projectSettings', {
    apiProvider: nextProvider,
  })

  logEvent('tengu_api_provider_preference_changed', {
    provider: nextProvider as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    source:
      'codex_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  if (nextProvider === 'codex') {
    onDone(
      `Switched to ${chalk.bold('ChatGPT Codex')}. Changes apply immediately.`,
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
