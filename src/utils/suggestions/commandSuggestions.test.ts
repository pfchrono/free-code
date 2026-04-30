import { describe, expect, it, mock } from 'bun:test'

import type { Command } from '../../commands.js'
import {
  applySkillShortcutSuggestion,
  generateSkillShortcutSuggestions,
  isSkillShortcutInput,
} from './commandSuggestions.js'

function command(overrides: Partial<Command> & { name: string }): Command {
  return {
    type: 'prompt',
    description: 'Test command',
    progressMessage: 'Running',
    contentLength: 0,
    source: 'builtin',
    getPromptForCommand: async () => [],
    ...overrides,
  } as Command
}

describe('skill shortcut suggestions', () => {
  it('detects inputs that start with $', () => {
    expect(isSkillShortcutInput('$commit')).toBe(true)
    expect(isSkillShortcutInput('/commit')).toBe(false)
  })

  it('suggests user-invocable prompt commands with $ display text', () => {
    const suggestions = generateSkillShortcutSuggestions('$com', [
      command({ name: 'commit', description: 'Create a git commit' }),
      command({ name: 'config', type: 'local' }),
      command({ name: 'hidden', userInvocable: false }),
    ])

    expect(suggestions.map(suggestion => suggestion.displayText)).toEqual([
      '$commit',
    ])
  })

  it('does not suggest once shortcut args are present', () => {
    const suggestions = generateSkillShortcutSuggestions('$commit now', [
      command({ name: 'commit' }),
    ])

    expect(suggestions).toEqual([])
  })

  it('applies a shortcut without submitting when command expects args', () => {
    const suggestion = generateSkillShortcutSuggestions('$cod', [
      command({ name: 'codex', argNames: ['prompt'] }),
    ])[0]
    const onInputChange = mock(() => {})
    const setCursorOffset = mock(() => {})
    const onSubmit = mock(() => {})

    applySkillShortcutSuggestion(
      suggestion,
      true,
      onInputChange,
      setCursorOffset,
      onSubmit,
    )

    expect(onInputChange).toHaveBeenCalledWith('$codex ')
    expect(setCursorOffset).toHaveBeenCalledWith('$codex '.length)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits slash command form when command has no args', () => {
    const suggestion = generateSkillShortcutSuggestions('$hel', [
      command({ name: 'help' }),
    ])[0]
    const onInputChange = mock(() => {})
    const setCursorOffset = mock(() => {})
    const onSubmit = mock(() => {})

    applySkillShortcutSuggestion(
      suggestion,
      true,
      onInputChange,
      setCursorOffset,
      onSubmit,
    )

    expect(onSubmit).toHaveBeenCalledWith('/help ', true)
  })
})
