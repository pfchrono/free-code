import * as React from 'react'
import { useState, useCallback } from 'react'
import { Box, Text } from '../ink.js'
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Pane } from './design-system/Pane.js'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}

export function ConfirmDialog({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps): React.ReactNode {
  const [focused, setFocused] = useState<'confirm' | 'cancel'>('confirm')
  const exitState = useExitOnCtrlCDWithKeybindings(onCancel)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      setFocused(f => f === 'confirm' ? 'cancel' : 'confirm')
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (focused === 'confirm') {
        onConfirm()
      } else {
        onCancel()
      }
    } else if (e.key === 'Escape') {
      onCancel()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      setFocused(f => f === 'confirm' ? 'cancel' : 'confirm')
    }
  }, [focused, onConfirm, onCancel])

  return (
    <Pane>
      <Box
        flexDirection="column"
        gap={1}
        borderStyle="round"
        borderColor={focused === 'confirm' ? 'cyan' : 'dimColor'}
        padding={1}
        onKeyDown={handleKeyDown}
      >
        <Box flexDirection="column" gap={0}>
          <Text bold={true}>{title}</Text>
          <Text dimColor={true}>{message}</Text>
        </Box>

        <Box flexDirection="row" gap={3} marginTop={1}>
          <Box
            flexDirection="row"
            gap={1}
            alignItems="center"
            onClick={() => {
              setFocused('confirm')
              onConfirm()
            }}
            onMouseEnter={() => setFocused('confirm')}
          >
            <Text color={focused === 'confirm' ? 'green' : 'dimColor'}>
              {focused === 'confirm' ? '▶ ' : '  '}
            </Text>
            <Text
              bold={focused === 'confirm'}
              color={focused === 'confirm' ? (destructive ? 'red' : 'green') : 'dimColor'}
            >
              {confirmText}
            </Text>
          </Box>

          <Box
            flexDirection="row"
            gap={1}
            alignItems="center"
            onClick={() => {
              setFocused('cancel')
              onCancel()
            }}
            onMouseEnter={() => setFocused('cancel')}
          >
            <Text color={focused === 'cancel' ? 'yellow' : 'dimColor'}>
              {focused === 'cancel' ? '▶ ' : '  '}
            </Text>
            <Text
              bold={focused === 'cancel'}
              color={focused === 'cancel' ? 'yellow' : 'dimColor'}
            >
              {cancelText}
            </Text>
          </Box>
        </Box>

        <Box flexDirection="row" gap={2} marginTop={1}>
          <Text dimColor={true}>Tab or ←→ switch</Text>
          <Text dimColor={true}>Enter select</Text>
          <Text dimColor={true}>Esc cancel</Text>
        </Box>
      </Box>
    </Pane>
  )
}
