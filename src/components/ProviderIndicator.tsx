import * as React from 'react'
import { useMemo } from 'react'
import { Box, Text } from '../ink.js'
import { useAppState } from '../state/AppState.js'
import { getAPIProvider } from '../utils/model/providers.js'

const PROVIDER_COLORS: Record<string, string> = {
  firstParty: 'red',
  openai: 'green',
  copilot: 'blue',
  codex: 'green',
  ollama: 'yellow',
  lmstudio: 'yellow',
  minimax: 'cyan',
  zen: 'magenta',
  openrouter: 'cyan',
}

const PROVIDER_LABELS: Record<string, string> = {
  firstParty: 'Claude',
  openai: 'OpenAI',
  copilot: 'Copilot',
  codex: 'Codex',
  ollama: 'Ollama',
  lmstudio: 'LM St.',
  minimax: 'MiniMax',
  zen: 'Zen',
  openrouter: 'OpenRouter',
}

export type ProviderIndicatorVariant = 'compact' | 'full' | 'minimal'

interface ProviderIndicatorProps {
  variant?: ProviderIndicatorVariant
  onClick?: () => void
}

export function ProviderIndicator({
  variant = 'compact',
  onClick,
}: ProviderIndicatorProps): React.ReactNode {
  const appProvider = useAppState(s => s.provider)
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const currentProvider = getAPIProvider()

  const color = PROVIDER_COLORS[currentProvider] ?? 'cyan'
  const label = PROVIDER_LABELS[currentProvider] ?? currentProvider

  const indicator = useMemo(() => {
    switch (variant) {
      case 'minimal':
        return (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text dimColor={true}>[</Text>
            <Text color={color} bold={true}>{label}</Text>
            <Text dimColor={true}>]</Text>
          </Box>
        )

      case 'full':
        return (
          <Box
            flexDirection="row"
            gap={1}
            alignItems="center"
            borderStyle="round"
            borderColor={color}
            paddingX={1}
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : undefined }}
          >
            <Text color={color} bold={true}>{label}</Text>
            <Text dimColor={true}>·</Text>
            <Text dimColor={true}>{mainLoopModel}</Text>
          </Box>
        )

      case 'compact':
      default:
        return (
          <Box
            flexDirection="row"
            gap={1}
            alignItems="center"
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : undefined }}
          >
            <Text dimColor={true}>[</Text>
            <Text color={color} bold={true}>{label}</Text>
            <Text dimColor={true}>:</Text>
            <Text dimColor={true}>{mainLoopModel.split('-').pop()}</Text>
            <Text dimColor={true}>]</Text>
          </Box>
        )
    }
  }, [variant, color, label, mainLoopModel, onClick])

  return indicator
}

interface ProviderStatusBarItemsProps {
  onProviderClick?: () => void
}

export function ProviderStatusBarItems({
  onProviderClick,
}: ProviderStatusBarItemsProps): React.ReactNode {
  const appProvider = useAppState(s => s.provider)
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const currentProvider = getAPIProvider()

  const color = PROVIDER_COLORS[currentProvider] ?? 'cyan'
  const label = PROVIDER_LABELS[currentProvider] ?? currentProvider

  return (
    <Box flexDirection="row" gap={2} alignItems="center">
      <Box
        flexDirection="row"
        gap={1}
        alignItems="center"
        borderStyle="round"
        borderColor={color}
        paddingX={1}
        onClick={onProviderClick}
        style={{ cursor: onProviderClick ? 'pointer' : undefined }}
      >
        <Text color={color} bold={true}>{label}</Text>
        <Text dimColor={true}>·</Text>
        <Text dimColor={true}>{mainLoopModel}</Text>
      </Box>

      <Text dimColor={true} onClick={onProviderClick}>
        /provider
      </Text>
    </Box>
  )
}
