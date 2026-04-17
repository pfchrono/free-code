import * as React from 'react'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
  LocalJSXCommandCall,
} from '../../types/command.js'
import {
  CommandPalette,
  DEFAULT_PROVIDER_COMMANDS,
  type CommandItem,
} from '../../components/CommandPalette.js'

export const call: LocalJSXCommandCall = async (
  onDone,
  _context,
  args,
) => {
  const handleSelect = (command: CommandItem) => {
    onDone(undefined, { nextInput: command.name, submitNextInput: true })
  }

  const handleCancel = () => {
    onDone('Command palette closed.', { display: 'system' })
  }

  return (
    <CommandPalette
      commands={DEFAULT_PROVIDER_COMMANDS}
      onSelect={handleSelect}
      onCancel={handleCancel}
      title="Quick Commands"
    />
  )
}
