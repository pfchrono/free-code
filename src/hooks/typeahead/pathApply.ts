import type { SuggestionItem } from 'src/components/PromptInput/PromptInputFooterSuggestions.js'

export type CompletionToken = {
  token: string
  startPos: number
}

export function applyDirectorySuggestion(
  input: string,
  suggestionId: string,
  tokenStartPos: number,
  tokenLength: number,
  isDirectory: boolean,
  hasAtPrefix = true,
): { newInput: string; cursorPos: number } {
  const suffix = isDirectory ? '/' : ' '
  const before = input.slice(0, tokenStartPos)
  const after = input.slice(tokenStartPos + tokenLength)
  const replacement = `${hasAtPrefix ? '@' : ''}${suggestionId}${suffix}`
  const newInput = before + replacement + after
  return {
    newInput,
    cursorPos: before.length + replacement.length,
  }
}

export function applyDirectorySuggestionFromToken(
  input: string,
  suggestion: SuggestionItem,
  completionToken: CompletionToken,
  isDirectory: boolean,
): { newInput: string; cursorPos: number } {
  return applyDirectorySuggestion(
    input,
    suggestion.id,
    completionToken.startPos,
    completionToken.token.length,
    isDirectory,
    completionToken.token.startsWith('@'),
  )
}
