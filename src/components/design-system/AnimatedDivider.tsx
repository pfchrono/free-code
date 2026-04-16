import React from 'react'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Text, useAnimationFrame } from '../../ink.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { getRainbowColor } from '../../utils/thinking.js'
import type { Theme } from '../../utils/theme.js'

type Props = {
  width?: number
  color?: keyof Theme
  padding?: number
  char?: string
}

export function AnimatedDivider({
  width,
  color,
  padding = 0,
  char = '─',
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  const [, time] = useAnimationFrame(80)
  const effectiveWidth = Math.max(0, (width ?? columns) - padding)
  const phase = Math.floor(time / 240) % 7
  const line = char.repeat(effectiveWidth)

  return (
    <>
      {[...line].map((ch, i) => (
        <Text
          key={i}
          color={ch === '─' ? getRainbowColor(i + phase, true) : color}
          dimColor={ch !== '─' && !color}
        >
          {ch}
        </Text>
      ))}
    </>
  )
}
