import chalk from 'chalk'
import * as React from 'react'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
  LocalJSXCommandCall,
} from '../../types/command.js'
import { useAppState } from '../../state/AppState.js'
import { Box, Text } from '../../ink.js'
import useInput from '../../ink/hooks/use-input.js'
import { Pane } from '../../components/design-system/Pane.js'
import { ProviderPicker } from '../../components/ProviderPicker.js'
import { getAPIProvider, type APIProvider } from '../../utils/model/providers.js'
import { getDefaultMainLoopModelSetting, parseUserSpecifiedModel } from '../../utils/model/model.js'
import { switchProviderDirectly } from '../../hooks/useProviderSwitch.js'
import { setInitialMainLoopModel, setMainLoopModelOverride } from '../../bootstrap/state.js'
import { getFavoriteModels, getRecentModels } from '../../utils/modelPreferences.js'
import { useRegisterKeybindingContext } from '../../keybindings/KeybindingContext.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'

const PROVIDER_INFO: Record<string, { label: string; description: string; color?: string }> = {
  firstParty: { label: 'Free-Code Hosted', description: 'Default hosted API', color: 'red' },
  openai: { label: 'OpenAI', description: 'GPT models', color: 'green' },
  copilot: { label: 'Copilot', description: 'GitHub Copilot', color: 'blue' },
  codex: { label: 'Codex', description: 'OpenAI Codex', color: 'green' },
  ollama: { label: 'Ollama', description: 'Local models', color: 'yellow' },
  lmstudio: { label: 'LM Studio', description: 'Local LM Studio', color: 'yellow' },
  minimax: { label: 'MiniMax', description: 'MiniMax AI', color: 'cyan' },
  zen: { label: 'Zen', description: 'OpenCode Zen', color: 'magenta' },
  openrouter: { label: 'OpenRouter', description: 'Multi-provider', color: 'cyan' },
}

interface ProviderStatusBarProps {
  onClose: () => void
}

function ProviderStatusBar({ onClose }: ProviderStatusBarProps): React.ReactNode {
  useRegisterKeybindingContext('ProviderStatusBar', true)
  useExitOnCtrlCDWithKeybindings(onClose)
  const appProvider = useAppState(s => s.provider)
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const provider = getAPIProvider()

  useInput((input, key) => {
    if (key.escape) {
      onClose()
    }
  })

  const info = PROVIDER_INFO[provider] ?? { label: provider, description: '' }

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text bold={true}>Provider</Text>
        <Box flexDirection="row" gap={2}>
          <Text dimColor={true} onClick={onClose}>[x]</Text>
        </Box>
      </Box>

      <Box flexDirection="row" gap={2} alignItems="center">
        <Box
          backgroundColor={info.color ?? 'cyan'}
          paddingX={1}
        >
          <Text bold={true}>{info.label}</Text>
        </Box>
        <Text dimColor={true}>{info.description}</Text>
      </Box>

      <Box flexDirection="column" gap={0}>
        <Text dimColor={true} fontSize={10}>CURRENT MODEL</Text>
        <Text>{mainLoopModel}</Text>
      </Box>

      <ProviderModelsList provider={provider} onClose={onClose} />
    </Box>
  )
}

function ProviderModelsList({ provider, onClose }: { provider: string; onClose: () => void }): React.ReactNode {
  const favorites = getFavoriteModels(provider)
  const recent = getRecentModels(provider).slice(0, 5)

  const models = PROVIDER_INFO[provider]?.label
    ? getProviderModels(provider)
    : []

  if (models.length === 0 && favorites.length === 0 && recent.length === 0) {
    return (
      <Box flexDirection="column" gap={0}>
        <Text dimColor={true} fontSize={10}>MODELS</Text>
        <Text dimColor={true} italic={true}>Use /provider discover to see models</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {models.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text dimColor={true} fontSize={10}>AVAILABLE</Text>
          {models.slice(0, 5).map(m => (
            <Text key={m} dimColor={true}>· {m}</Text>
          ))}
        </Box>
      )}

      {favorites.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text dimColor={true} fontSize={10}>★ FAVORITES</Text>
          {favorites.slice(0, 3).map(fav => (
            <Text key={fav.model} dimColor={true}>★ {fav.model}</Text>
          ))}
        </Box>
      )}

      {recent.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text dimColor={true} fontSize={10}>RECENT</Text>
          {recent.slice(0, 3).map(rec => (
            <Text key={rec.model} dimColor={true}>› {rec.model}</Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

function getProviderModels(provider: string): string[] {
  switch (provider) {
    case 'firstParty':
      return ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5']
    case 'openai':
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
    case 'copilot':
      return ['gpt-4o', 'gpt-4-turbo', 'gpt-4']
    case 'codex':
      return ['gpt-4o', 'gpt-4-turbo', 'gpt-4']
    default:
      return []
  }
}

export const call: LocalJSXCommandCall = async (
  onDone,
  context,
  args,
) => {
  const rawArgs = args.trim()
  const normalizedArgs = rawArgs.toLowerCase()

  if (normalizedArgs === 'status' || normalizedArgs === 'info') {
    const provider = getAPIProvider()
    const info = PROVIDER_INFO[provider] ?? { label: provider, description: '' }
    const favorites = getFavoriteModels(provider)
    const recent = getRecentModels(provider).slice(0, 5)

    const lines = [
      `${chalk.bold('Provider Status')}`,
      `${chalk.dim('─'.repeat(40))}`,
      `${chalk.bold(info.label)} - ${info.description}`,
      ``,
      favorites.length > 0
        ? `Favorites:\n${favorites.map(f => `  ★ ${f.model}`).join('\n')}`
        : '',
      recent.length > 0
        ? `Recent:\n${recent.map(r => `  › ${r.model}`).join('\n')}`
        : '',
      ``,
      `Use ${chalk.bold('/provider picker')} to change`,
    ].filter(Boolean)

    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  if (normalizedArgs === 'panel' || normalizedArgs === '') {
    return <ProviderStatusBar onClose={() => onDone('Provider panel closed', { display: 'system' })} />
  }

  if (normalizedArgs === 'picker') {
    const currentProvider = getAPIProvider()

    const handleSelect = (provider: APIProvider, model?: string) => {
      switchProviderDirectly(provider)
      const nextModel = parseUserSpecifiedModel(
        model ?? getDefaultMainLoopModelSetting(),
      )
      setInitialMainLoopModel(nextModel)
      setMainLoopModelOverride(undefined)
      context.services?.setAppState?.(state => ({
        ...state,
        provider,
        mainLoopModel: nextModel,
        mainLoopModelForSession: null,
      }))
      onDone(
        `Switched to ${chalk.bold(provider)}${model ? ` with model ${chalk.bold(model)}` : ''}. Changes apply immediately.`,
        { display: 'system' },
      )
    }

    const handleCancel = () => {
      onDone('Provider selection cancelled.', { display: 'system' })
    }

    return (
      <ProviderPicker
        onSelect={handleSelect}
        onCancel={handleCancel}
        initialProvider={currentProvider}
      />
    )
  }

  if (normalizedArgs === 'indicator' || normalizedArgs === 'show') {
    const provider = getAPIProvider()
    const info = PROVIDER_INFO[provider] ?? { label: provider, description: '' }

    const lines = [
      '',
      `  [${info.label}] ${info.description}`,
      '',
    ]

    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  if (normalizedArgs.startsWith('set ')) {
    const providerInput = rawArgs.slice(4).trim()
    const providerKey = normalizedArgs.slice(4).trim()
    const provider = providerKey as APIProvider

    if (!PROVIDER_INFO[provider]) {
      onDone(`Unknown provider: ${providerInput}`, { display: 'system' })
      return null
    }

    switchProviderDirectly(provider)
    const nextModel = parseUserSpecifiedModel(getDefaultMainLoopModelSetting())
    setInitialMainLoopModel(nextModel)
    setMainLoopModelOverride(undefined)
    context.services?.setAppState?.(state => ({
      ...state,
      provider,
      mainLoopModel: nextModel,
      mainLoopModelForSession: null,
    }))

    onDone(`Switched to ${chalk.bold(provider)}. Changes apply immediately.`, { display: 'system' })
    return null
  }

  if (normalizedArgs === 'discover') {
    const providers = Object.entries(PROVIDER_INFO)
      .map(([key, info]) => `  ${key} - ${info.description}`)
      .join('\n')

    onDone([
      'Available providers:',
      providers,
      '',
      'Use /provider set <provider> to switch.',
    ].join('\n'), { display: 'system' })
    return null
  }

  const helpText = [
    'Usage: /provider [status|panel|picker|discover|indicator]',
    '',
    'Commands:',
    '  status     Show provider status as text',
    '  panel      Open provider panel (interactive)',
    '  picker     Open provider & model picker',
    '  discover   Discover available models',
    '  indicator  Show compact provider indicator',
    '  set <p>   Set provider (firstParty/openai/copilot/etc)',
    '',
    'Examples:',
    '  /provider status   # Text status',
    '  /provider panel    # Interactive panel',
    '  /provider indicator # Show compact indicator',
    '  /provider set openai',
  ].join('\n')

  onDone(helpText, { display: 'system' })
  return null
}
