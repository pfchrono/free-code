import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

type RepoLocalApiProvider = 'firstParty' | 'openai' | 'copilot'

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
      parsed.apiProvider === 'openai' ||
      parsed.apiProvider === 'copilot'
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
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_COPILOT
}

export function applyRepoLocalApiProviderOverride(): void {
  const apiProvider = readRepoLocalApiProvider()

  if (!apiProvider) {
    return
  }

  clearProviderFlags()

  if (apiProvider === 'openai') {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    return
  }

  if (apiProvider === 'copilot') {
    process.env.CLAUDE_CODE_USE_COPILOT = '1'
  }
}