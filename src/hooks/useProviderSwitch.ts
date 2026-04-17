import type { APIProvider } from '../utils/model/providers.js'
import { applyRepoLocalApiProviderOverride } from '../utils/model/bootstrapProviderOverride.js'

/**
 * Non-hook version for use in commands that have access to context
 */
function clearRuntimeProviderFlags(): void {
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.CLAUDE_CODE_USE_FOUNDRY
  delete process.env.CLAUDE_CODE_USE_CODEX
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_OPENROUTER
  delete process.env.CLAUDE_CODE_USE_COPILOT
  delete process.env.CLAUDE_CODE_USE_LMSTUDIO
  delete process.env.CLAUDE_CODE_USE_MINIMAX
  delete process.env.CLAUDE_CODE_USE_ZEN
}

function applyRuntimeProvider(provider: APIProvider): void {
  clearRuntimeProviderFlags()

  if (provider === 'bedrock') {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    return
  }

  if (provider === 'vertex') {
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    return
  }

  if (provider === 'foundry') {
    process.env.CLAUDE_CODE_USE_FOUNDRY = '1'
    return
  }

  if (provider === 'minimax') {
    process.env.CLAUDE_CODE_USE_MINIMAX = '1'
    return
  }

  if (provider === 'firstParty') {
    return
  }

  if (provider === 'codex') {
    process.env.CLAUDE_CODE_USE_CODEX = '1'
    return
  }

  if (provider === 'openai') {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    return
  }

  if (provider === 'openrouter') {
    process.env.CLAUDE_CODE_USE_OPENROUTER = '1'
    return
  }

  if (provider === 'copilot') {
    process.env.CLAUDE_CODE_USE_COPILOT = '1'
    return
  }

  if (provider === 'lmstudio') {
    process.env.CLAUDE_CODE_USE_LMSTUDIO = '1'
    return
  }

  if (provider === 'zen') {
    process.env.CLAUDE_CODE_USE_ZEN = '1'
  }
}

export function switchProviderDirectly(
  provider: APIProvider,
  setAppState?: (updater: (prev: { provider: APIProvider }) => { provider: APIProvider }) => void,
): void {
  applyRuntimeProvider(provider)
  if (setAppState) {
    setAppState(prev => ({ ...prev, provider }))
  }
}
