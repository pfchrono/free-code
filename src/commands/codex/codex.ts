import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import process from 'process'
import { CODEX_MODELS, DEFAULT_CODEX_MODEL } from '../../services/api/codex-fetch-adapter.js'
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

type StoredApiProvider = 'firstParty' | 'codex'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled', 'reset'])
const ENABLE_ARGS = new Set(['', 'on', 'enable', 'enabled'])

function getStoredProvider(): StoredApiProvider | null {
  const value = getSettingsForSource('projectSettings')?.apiProvider
  return value === 'codex' || value === 'firstParty' ? value : null
}

function buildStatusMessage(storedProvider: StoredApiProvider | null): string {
  const activeProvider = getAPIProvider()
  const storedText = storedProvider
    ? `Repo-local provider preference: ${storedProvider}.`
    : 'Repo-local provider preference: none.'

  return `${storedText} Current session provider: ${activeProvider}. Changes from /codex apply on the next launch.`
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
    const lines = [
      `Codex curated catalog (${CODEX_MODELS.length})`,
      ...CODEX_MODELS.map(model => {
        const suffix = model.id === DEFAULT_CODEX_MODEL ? ' [default]' : ''
        const features = [
          model.family,
          model.supportsVision ? 'vision' : null,
          model.supportsTools ? 'tools' : null,
        ]
          .filter(Boolean)
          .join(', ')
        return `  ${model.id}${suffix}: ${model.description}${features ? ` (${features})` : ''}`
      }),
      '',
      `Default model: ${DEFAULT_CODEX_MODEL}`,
      'Note: Codex availability is inferred from the web backend catalog used by this adapter.',
    ]
    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  if (!ENABLE_ARGS.has(normalizedArg) && !DISABLE_ARGS.has(normalizedArg)) {
    onDone('Usage: /codex [status|models|off]', { display: 'system' })
    return null
  }

  const nextProvider: StoredApiProvider = DISABLE_ARGS.has(normalizedArg)
    ? 'firstParty'
    : 'codex'
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
      'codex_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  if (nextProvider === 'codex') {
    onDone(
      'Stored repo-local ChatGPT Codex mode in .claude/settings.json. This session must end now to avoid mixed provider state. Restart free-code in this repo to continue with Codex. Use /codex status after relaunch to confirm.',
      { display: 'system' },
    )
    process.exit(0)
  }

  onDone(
    'Stored repo-local first-party mode in .claude/settings.json. This session must end now to avoid mixed provider state. Restart free-code in this repo to continue with first-party mode. Use /codex status after relaunch to confirm.',
    { display: 'system' },
  )
  process.exit(0)
}
