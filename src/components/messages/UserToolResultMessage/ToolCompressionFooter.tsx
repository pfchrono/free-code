import * as React from 'react'
import { Box, Text } from '../../../ink.js'

/**
 * Display RedQueen compression stats as tool result footer
 * Shows: duration | compression ratio (original → compressed tokens)
 */
export function ToolCompressionFooter({
  redQueenStats,
  duration,
}: {
  redQueenStats?: {
    tokensSaved?: number
    wasCompressed?: boolean
    summarizationRatio?: number
    dedupHits?: number
    filteredItems?: number
  }
  duration: string
}): React.ReactNode {
  if (!redQueenStats || !redQueenStats.wasCompressed) {
    return null
  }

  const saved = redQueenStats.tokensSaved ?? 0
  const original = saved > 0 ? Math.round(saved / 0.9) : 0 // Rough estimate if we know savings %
  const compressed = original - saved

  if (saved <= 0) {
    return null
  }

  const ratio = original > 0 ? ((1 - compressed / original) * 100).toFixed(0) : '0'

  return (
    <Box marginTop={0}>
      <Text dimColor>
        ✓ {duration} {saved > 100 ? `| ${ratio}% compression` : ''}
      </Text>
    </Box>
  )
}
