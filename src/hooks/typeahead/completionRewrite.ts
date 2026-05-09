import type { Command } from 'src/commands.js'
import type { SuggestionItem } from 'src/components/PromptInput/PromptInputFooterSuggestions.js'
import { getCommandName } from 'src/commands.js'
import { findMidInputSkillShortcut } from 'src/utils/suggestions/commandSuggestions.js'

export function applyMidInputSkillSuggestion(
  suggestion: SuggestionItem,
  input: string,
  cursorOffset: number,
): { newInput: string; cursorPos: number } | null {
  const skillShortcut = findMidInputSkillShortcut(input, cursorOffset)
  if (!skillShortcut) return null

  const metadata = suggestion.metadata
  const commandName =
    typeof metadata === 'object' &&
    metadata !== null &&
    'name' in metadata &&
    'type' in metadata
      ? getCommandName(metadata as Command)
      : suggestion.displayText.replace(/^\$/, '').split(' ')[0]

  const before = input.slice(0, skillShortcut.startPos)
  const after = input.slice(skillShortcut.startPos + skillShortcut.token.length)
  const replacement = `$${commandName} `
  return {
    newInput: before + replacement + after,
    cursorPos: before.length + replacement.length,
  }
}
