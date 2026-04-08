import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

type RepoLocalApiProvider = 'firstParty' | 'codex' | 'openai' | 'openrouter' | 'copilot' | 'lmstudio' | 'zen'

type RepoLocalProviderSettings = {
  apiProvider?: RepoLocalApiProvider
}

function getRepoLocalSettingsPath(): string {
  return join(process.cwd(), '.claude', 'settings.json')
}

function readRepoLocalApiProvider(): RepoLocalApiProvider | null {
  const settingsPath = getRepoLocalSettingsPath()

  if (!existsSync(settingsPath)) {
    return null
  }

  try {
    const parsed = JSON.parse(
      readFileSync(settingsPath, 'utf8'),
    ) as RepoLocalProviderSettings

    return parsed.apiProvider === 'firstParty' ||
      parsed.apiProvider === 'codex' ||
      parsed.apiProvider === 'openai' ||
      parsed.apiProvider === 'openrouter' ||
      parsed.apiProvider === 'copilot' ||
      parsed.apiProvider === 'lmstudio' ||
      parsed.apiProvider === 'zen'
      ? parsed.apiProvider
      : null
  } catch {
    return null
  }
}

function clearProviderFlags(): void {
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.CLAUDE_CODE_USE_FOUNDRY
  delete process.env.CLAUDE_CODE_USE_CODEX
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_OPENROUTER
  delete process.env.CLAUDE_CODE_USE_COPILOT
  delete process.env.CLAUDE_CODE_USE_LMSTUDIO
  delete process.env.CLAUDE_CODE_USE_ZEN
}

export function applyRepoLocalApiProviderOverride(): void {
  const apiProvider = readRepoLocalApiProvider()

  if (!apiProvider) {
    return
  }

  clearProviderFlags()

  if (apiProvider === 'codex') {
    process.env.CLAUDE_CODE_USE_CODEX = '1'
    return
  }

  if (apiProvider === 'openai') {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    return
  }

  if (apiProvider === 'openrouter') {
    process.env.CLAUDE_CODE_USE_OPENROUTER = '1'
    return
  }

  if (apiProvider === 'copilot') {
    process.env.CLAUDE_CODE_USE_COPILOT = '1'
    return
  }

  if (apiProvider === 'lmstudio') {
    process.env.CLAUDE_CODE_USE_LMSTUDIO = '1'
    return
  }

  if (apiProvider === 'zen') {
    process.env.CLAUDE_CODE_USE_ZEN = '1'
  }
}
