import * as React from 'react'
import { useState, useCallback } from 'react'
import { Box, Text, useInput } from '../ink.js'
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useRegisterKeybindingContext } from '../keybindings/KeybindingContext.js'
import { Pane } from './design-system/Pane.js'

export type CommandItem = {
  id: string
  name: string
  description: string
  category?: string
}

interface CommandPaletteProps {
  commands: CommandItem[]
  onSelect: (command: CommandItem) => void
  onCancel: () => void
  title?: string
}

export function CommandPalette({
  commands,
  onSelect,
  onCancel,
  title = 'Command Palette',
}: CommandPaletteProps): React.ReactNode {
  useRegisterKeybindingContext('CommandPalette', true)
  useExitOnCtrlCDWithKeybindings(onCancel)
  const [cursor, setCursor] = useState(0)

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
    } else if (key.downArrow) {
      setCursor(c => Math.min(c + 1, commands.length - 1))
    } else if (key.upArrow) {
      setCursor(c => Math.max(c - 1, 0))
    } else if (key.return) {
      if (commands[cursor]) {
        onSelect(commands[cursor])
      }
    }
  })

  return (
    <Pane>
      <Box
        flexDirection="column"
        gap={1}
        borderStyle="round"
        borderColor="cyan"
      >
        <Box flexDirection="column" gap={0} paddingX={1}>
          <Text bold={true}>{title}</Text>
          <Text dimColor={true}>Use ↑↓ to navigate, Enter to select</Text>
        </Box>

        <Box flexDirection="column" gap={0}>
          {commands.map((command, idx) => (
            <Box
              key={command.id}
              flexDirection="row"
              justifyContent="space-between"
              paddingX={1}
              backgroundColor={cursor === idx ? 'cyan' : undefined}
              onClick={() => onSelect(command)}
              onMouseEnter={() => setCursor(idx)}
            >
              <Box flexDirection="column">
                <Text
                  color={cursor === idx ? 'black' : undefined}
                  bold={cursor === idx}
                >
                  {cursor === idx ? '▶ ' : '  '}{command.name}
                </Text>
                {command.description && (
                  <Text
                    dimColor={cursor === idx ? undefined : true}
                    color={cursor === idx ? 'black' : undefined}
                    fontSize={10}
                  >
                    {command.description}
                  </Text>
                )}
              </Box>
              {command.category && (
                <Text
                  dimColor={cursor === idx ? 'black' : true}
                  fontSize={10}
                >
                  {command.category}
                </Text>
              )}
            </Box>
          ))}
        </Box>

        <Box flexDirection="row" gap={2} paddingX={1}>
          <Text dimColor={true}>↑↓ navigate</Text>
          <Text dimColor={true}>Enter select</Text>
          <Text dimColor={true}>Esc cancel</Text>
        </Box>
      </Box>
    </Pane>
  )
}

export const DEFAULT_PROVIDER_COMMANDS: CommandItem[] = [
  {
    id: 'provider-picker',
    name: '/provider picker',
    description: 'Open provider & model picker',
    category: 'Provider',
  },
  {
    id: 'provider-status',
    name: '/provider status',
    description: 'Show current provider status',
    category: 'Provider',
  },
  {
    id: 'provider-discover',
    name: '/provider discover',
    description: 'Discover available models',
    category: 'Provider',
  },
  {
    id: 'model',
    name: '/model',
    description: 'Switch model',
    category: 'Model',
  },
  {
    id: 'sidebar',
    name: '/sidebar',
    description: 'Open sidebar panel',
    category: 'UI',
  },
  {
    id: 'help',
    name: '/help',
    description: 'Show help',
    category: 'General',
  },
  {
    id: 'clear',
    name: '/clear',
    description: 'Clear conversation',
    category: 'General',
  },
  {
    id: 'compact',
    name: '/compact',
    description: 'Compact context',
    category: 'Context',
  },
]
