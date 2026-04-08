import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'
import { getAPIProvider, type APIProvider } from '../../utils/model/providers.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

const SUPPORTED_PROVIDERS: readonly APIProvider[] = [
  'firstParty',
  'codex',
  'openai',
  'openrouter',
  'copilot',
  'lmstudio',
]

function getHelpText(): string {
  return [
    'Usage: /provider [status|set <provider>|clear]',
    '',
    `Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
    '',
    'Examples:',
    '/provider status',
    '/provider set openrouter',
    '/provider clear',
  ].join('\n')
}

function normalizeProvider(value: string): APIProvider | null {
  const normalized = value.trim() as APIProvider
  return SUPPORTED_PROVIDERS.includes(normalized) ? normalized : null
}

function showStatus(onDone: LocalJSXCommandOnDone): null {
  onDone(`Current provider: ${getAPIProvider()}`, { display: 'system' })
  return null
}

export const call: LocalJSXCommandCall = async (
  onDone,
  _context,
  args,
) => {
  const input = args?.trim() ?? ''

  if (!input || COMMON_INFO_ARGS.includes(input) || input === 'status') {
    return showStatus(onDone)
  }

  if (COMMON_HELP_ARGS.includes(input)) {
    onDone(getHelpText(), { display: 'system' })
    return null
  }

  if (input === 'clear') {
    const result = updateSettingsForSource('localSettings', {
      apiProvider: undefined,
    })
    if (result.error) {
      onDone(`Failed to clear provider: ${result.error.message}`, {
        display: 'system',
      })
      return null
    }
    onDone('Cleared local provider override.', { display: 'system' })
    return null
  }

  const setMatch = /^set\s+(.+)$/.exec(input)
  if (!setMatch) {
    onDone(getHelpText(), { display: 'system' })
    return null
  }

  const provider = normalizeProvider(setMatch[1] ?? '')
  if (!provider) {
    onDone(
      `Unknown provider. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
      { display: 'system' },
    )
    return null
  }

  const result = updateSettingsForSource('localSettings', {
    apiProvider: provider,
  })
  if (result.error) {
    onDone(`Failed to set provider: ${result.error.message}`, {
      display: 'system',
    })
    return null
  }

  onDone(
    `Set local provider override to ${provider}. Restart free-code if this session does not pick it up automatically.`,
    { display: 'system' },
  )
  return null
}
