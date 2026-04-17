/**
 * Enhanced Memory Command Registration
 * Replaces the default memory command with enhanced functionality
 */

import { type Command } from '../../types/command.js'
import { call } from './enhancedMemory.tsx'

const enhancedMemoryCommand: Command = {
  type: 'jsx-local',
  name: 'memory+',
  aliases: ['mem+', 'memory-enhanced'],
  description: 'Enhanced memory system with persistence and session continuity',
  source: 'builtin',
  call,
}

export default enhancedMemoryCommand