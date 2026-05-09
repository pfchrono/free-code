import { describe, expect, it, mock } from 'bun:test'

import type { Command } from '../../commands.js'
import {
  applySkillShortcutSuggestion,
  findMidInputSkillShortcut,
  generateCommandSuggestions,
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

describe('command suggestion ids', () => {
  it('suffixes duplicate suggestion ids to keep them unique', () => {
    const suggestions = generateCommandSuggestions('/', [
      command({ name: 'dup', source: 'projectSettings' }),
      command({ name: 'dup', source: 'projectSettings' }),
    ])

    expect(suggestions).toHaveLength(2)
    expect(new Set(suggestions.map(suggestion => suggestion.id)).size).toBe(2)
    expect(suggestions.map(suggestion => suggestion.id)).toEqual([
      'dup:projectSettings',
      'dup:projectSettings#2',
    ])
  })

  it('shows an explicit fallback for commands without descriptions', () => {
    const suggestions = generateCommandSuggestions('/fast', [
      command({ name: 'fast', description: '' }),
    ])

    expect(suggestions[0]?.description).toBe('No description provided')
  })
})

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

  it('does not suggest hidden commands for $ shortcuts even on exact match', () => {
    const suggestions = generateSkillShortcutSuggestions('$secret', [
      command({ name: 'secret', isHidden: true }),
      command({ name: 'second' }),
    ])

    expect(suggestions.map(suggestion => suggestion.displayText)).not.toContain('$secret')
  })

  it('finds mid-input skill shortcuts at cursor', () => {
    expect(findMidInputSkillShortcut('fix this with $com', 'fix this with $com'.length)).toEqual({
      token: '$com',
      startPos: 'fix this with '.length,
      partialCommand: 'com',
    })
  })

  it('finds hyphenated mid-input skill shortcuts at cursor', () => {
    expect(findMidInputSkillShortcut('fix this with $gsd-code', 'fix this with $gsd-code'.length)).toEqual({
      token: '$gsd-code',
      startPos: 'fix this with '.length,
      partialCommand: 'gsd-code',
    })
  })

  it('ignores top-level and completed mid-input shortcuts', () => {
    expect(findMidInputSkillShortcut('$com', '$com'.length)).toBeNull()
    expect(findMidInputSkillShortcut('fix $commit later', 'fix $commit later'.length)).toBeNull()
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
