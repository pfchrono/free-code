import * as React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { Box, Text } from '../ink.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Pane } from './design-system/Pane.js'

export type SidebarSlot = 'sidebar_title' | 'sidebar_content' | 'sidebar_footer'

export type SlotContent = {
  id: string
  slot: SidebarSlot
  content: React.ReactNode
  mode?: 'single_winner' | 'replace' | 'append'
}

interface SidebarProps {
  slots: SlotContent[]
  isOpen: boolean
  onToggle: () => void
  defaultWidth?: number
}

const SIDEBAR_MIN_WIDTH = 30
const SIDEBAR_MAX_WIDTH = 60

export function Sidebar({
  slots,
  isOpen,
  onToggle,
  defaultWidth = 40,
}: SidebarProps): React.ReactNode {
  const [width, setWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)
  const { columns } = useTerminalSize()

  const effectiveWidth = useMemo(() => {
    if (!isOpen) return 0
    const maxAllowed = Math.min(SIDEBAR_MAX_WIDTH, Math.floor(columns * 0.4))
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(width, maxAllowed))
  }, [isOpen, width, columns])

  const slotContent = useMemo(() => {
    const result: Record<SidebarSlot, React.ReactNode[]> = {
      sidebar_title: [],
      sidebar_content: [],
      sidebar_footer: [],
    }

    for (const slot of slots) {
      if (slot.mode === 'single_winner') {
        if (result[slot.slot].length === 0) {
          result[slot.slot].push(slot.content)
        }
      } else if (slot.mode === 'replace') {
        result[slot.slot] = [slot.content]
      } else {
        result[slot.slot].push(slot.content)
      }
    }

    return result
  }, [slots])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isResizing) return
    },
    [isResizing],
  )

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  if (!isOpen) {
    return (
      <Box
        onClick={onToggle}
        onMouseEnter={() => {}}
        style={{ cursor: 'pointer' }}
      >
        <Text dimColor={true}>‣</Text>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="row"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <Pane width={effectiveWidth}>
        <Box flexDirection="column" flexGrow={1}>
          {slotContent.sidebar_title.length > 0 && (
            <Box flexDirection="column" gap={0}>
              {slotContent.sidebar_title}
            </Box>
          )}

          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {slotContent.sidebar_content.length > 0 ? (
              slotContent.sidebar_content
            ) : (
              <Text dimColor={true} italic={true}>
                No sidebar content
              </Text>
            )}
          </Box>

          {slotContent.sidebar_footer.length > 0 && (
            <Box flexDirection="column" gap={0} flexShrink={0}>
              {slotContent.sidebar_footer}
            </Box>
          )}
        </Box>

        <Box
          position="absolute"
          top={0}
          right={0}
          bottom={0}
          width={1}
          backgroundColor="border"
          onMouseDown={() => setIsResizing(true)}
          style={{ cursor: 'col-resize' }}
        />
      </Pane>

      <Box onClick={onToggle} paddingLeft={1}>
        <Text dimColor={true}>◁</Text>
      </Box>
    </Box>
  )
}

interface ProviderSidebarContentProps {
  provider: string
  model?: string
  onProviderClick?: () => void
  onModelClick?: () => void
}

export function ProviderSidebarContent({
  provider,
  model,
  onProviderClick,
  onModelClick,
}: ProviderSidebarContentProps): React.ReactNode {
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="column">
        <Text dimColor={true} fontSize={10}>
          PROVIDER
        </Text>
        <Text
          bold={true}
          onClick={onProviderClick}
          style={{ cursor: onProviderClick ? 'pointer' : undefined }}
        >
          {provider}
        </Text>
      </Box>

      {model && (
        <Box flexDirection="column">
          <Text dimColor={true} fontSize={10}>
            MODEL
          </Text>
          <Text
            dimColor={true}
            onClick={onModelClick}
            style={{ cursor: onModelClick ? 'pointer' : undefined }}
          >
            {model}
          </Text>
        </Box>
      )}
    </Box>
  )
}

interface StatusSidebarContentProps {
  mcpStatus?: 'connected' | 'disconnected' | 'error'
  lspStatus?: 'active' | 'inactive'
  tokenUsage?: { used: number; limit: number }
}

export function StatusSidebarContent({
  mcpStatus,
  lspStatus,
  tokenUsage,
}: StatusSidebarContentProps): React.ReactNode {
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      {mcpStatus && (
        <Box flexDirection="row" gap={1}>
          <Text dimColor={true}>MCP:</Text>
          <Text
            color={
              mcpStatus === 'connected'
                ? 'success'
                : mcpStatus === 'error'
                  ? 'error'
                  : 'warning'
            }
          >
            {mcpStatus === 'connected' ? '●' : mcpStatus === 'error' ? '△' : '○'}
          </Text>
        </Box>
      )}

      {lspStatus && (
        <Box flexDirection="row" gap={1}>
          <Text dimColor={true}>LSP:</Text>
          <Text color={lspStatus === 'active' ? 'success' : 'warning'}>
            {lspStatus === 'active' ? '●' : '○'}
          </Text>
        </Box>
      )}

      {tokenUsage && (
        <Box flexDirection="column">
          <Text dimColor={true} fontSize={10}>
            TOKENS
          </Text>
          <Text dimColor={true}>
            {tokenUsage.used.toLocaleString()} / {tokenUsage.limit.toLocaleString()}
          </Text>
        </Box>
      )}
    </Box>
  )
}
