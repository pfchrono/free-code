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
import { Pane } from '../../components/design-system/Pane.js'
import { Select } from '../../components/CustomSelect/index.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { getFavoriteModels, getRecentModels } from '../../utils/modelPreferences.js'

const PROVIDER_INFO: Record<string, { label: string; description: string }> = {
  firstParty: { label: 'Claude (Anthropic)', description: 'Official Anthropic API' },
  openai: { label: 'OpenAI', description: 'GPT models' },
  copilot: { label: 'GitHub Copilot', description: 'Copilot Chat API' },
  codex: { label: 'Codex (ChatGPT)', description: 'OpenAI Codex API' },
  ollama: { label: 'Ollama', description: 'Local models' },
  lmstudio: { label: 'LM Studio', description: 'Local LM Studio' },
  minimax: { label: 'MiniMax', description: 'MiniMax AI platform' },
  zen: { label: 'Zen', description: 'OpenCode Zen' },
  openrouter: { label: 'OpenRouter', description: 'Unified API gateway' },
}

interface SidebarPanelProps {
  onClose: () => void
}

function SidebarPanel({ onClose }: SidebarPanelProps): React.ReactNode {
  const provider = useAppState(s => s.provider)
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const favorites = getFavoriteModels(provider)
  const recent = getRecentModels(provider).slice(0, 5)

  const providerInfo = PROVIDER_INFO[provider] ?? {
    label: provider,
    description: 'Unknown provider',
  }

  return (
    <Pane>
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text bold={true}>Sidebar</Text>
          <Text dimColor={true} onClick={onClose}>[Esc]</Text>
        </Box>

        <Box flexDirection="column" gap={0}>
          <Text dimColor={true} fontSize={10}>PROVIDER</Text>
          <Text bold={true}>{providerInfo.label}</Text>
          <Text dimColor={true}>{providerInfo.description}</Text>
        </Box>

        <Box flexDirection="column" gap={0}>
          <Text dimColor={true} fontSize={10}>MODEL</Text>
          <Text>{mainLoopModel}</Text>
        </Box>

        {favorites.length > 0 && (
          <Box flexDirection="column" gap={0}>
            <Text dimColor={true} fontSize={10}>FAVORITES</Text>
            {favorites.slice(0, 5).map(fav => (
              <Text key={fav.model} dimColor={true}>
                ★ {fav.model}
              </Text>
            ))}
          </Box>
        )}

        {recent.length > 0 && (
          <Box flexDirection="column" gap={0}>
            <Text dimColor={true} fontSize={10}>RECENT</Text>
            {recent.map(rec => (
              <Text key={rec.model} dimColor={true}>
                › {rec.model}
              </Text>
            ))}
          </Box>
        )}

        <Box marginTop={1} flexDirection="column" gap={0}>
          <Text dimColor={true} fontSize={10}>QUICK ACTIONS</Text>
          <Text dimColor={true}>  /provider picker</Text>
          <Text dimColor={true}>  /provider discover</Text>
          <Text dimColor={true}>  /model</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor={true} italic={true}>
            Press Esc or click outside to close
          </Text>
        </Box>
      </Box>
    </Pane>
  )
}

export const call: LocalJSXCommandCall = async (
  onDone,
  _context,
  args,
) => {
  const normalizedArgs = args.trim().toLowerCase()

  if (normalizedArgs === 'toggle' || normalizedArgs === '' || normalizedArgs === 'open') {
    return <SidebarPanel onClose={() => onDone('Sidebar closed', { display: 'system' })} />
  }

  if (normalizedArgs === 'provider') {
    const provider = getAPIProvider()
    const info = PROVIDER_INFO[provider] ?? { label: provider, description: '' }

    const lines = [
      'Provider Info',
      '─'.repeat(40),
      `Current: ${info.label}`,
      `Type: ${provider}`,
      info.description ? `Description: ${info.description}` : '',
    ].filter(Boolean)

    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  const helpText = [
    'Usage: /sidebar [toggle|open|provider]',
    '',
    'Commands:',
    '  toggle, open    Open the sidebar panel',
    '  provider        Show current provider info',
    '',
    'The sidebar shows:',
    '  - Current provider and model',
    '  - Favorite models',
    '  - Recent models',
    '  - Quick actions',
  ].join('\n')

  onDone(helpText, { display: 'system' })
  return null
}
