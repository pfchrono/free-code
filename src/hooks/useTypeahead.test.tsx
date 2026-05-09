import { describe, expect, it, mock } from 'bun:test'

import type { Command } from '../commands.js'
import { generateSkillShortcutSuggestions } from '../utils/suggestions/commandSuggestions.js'
import { applyDirectorySuggestion, applyMidInputSkillSuggestion } from './useTypeahead.js'

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

describe('applyDirectorySuggestion', () => {
  it('preserves @ prefix for @-style path completions', () => {
    const result = applyDirectorySuggestion('open @./src/fi', './src/file.ts', 5, '@./src/fi'.length, false, true)

    expect(result).toEqual({
      newInput: 'open @./src/file.ts ',
      cursorPos: 'open @./src/file.ts '.length,
    })
  })

  it('does not add @ prefix for bare path completions', () => {
    const result = applyDirectorySuggestion('open ./src/fi', './src/file.ts', 5, './src/fi'.length, false, false)

    expect(result).toEqual({
      newInput: 'open ./src/file.ts ',
      cursorPos: 'open ./src/file.ts '.length,
    })
  })
})

describe('applyMidInputSkillSuggestion', () => {
  it('inserts command name instead of matched alias display text', () => {
    const suggestion = generateSkillShortcutSuggestions('$g', [
      command({ name: 'gsd-code', aliases: ['g'] }),
    ])[0]
    const onInputChange = mock(() => {})
    const setCursorOffset = mock(() => {})

    applyMidInputSkillSuggestion(
      suggestion,
      'do it $g',
      'do it $g'.length,
      onInputChange,
      setCursorOffset,
    )

    expect(onInputChange).toHaveBeenCalledWith('do it $gsd-code ')
    expect(setCursorOffset).toHaveBeenCalledWith('do it $gsd-code '.length)
  })
})
