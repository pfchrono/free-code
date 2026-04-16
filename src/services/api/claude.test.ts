import { afterEach, describe, expect, it, mock } from 'bun:test'

import { getSystemPrompt } from '../../constants/prompts.js'
import type { MCPServerConnection } from '../../context.js'
import { getPromptCachingEnabled } from './claude.js'

const noopTool = {
  name: 'Read',
  description: 'Read file',
  inputSchema: { type: 'object', properties: {} },
  async call() {
    return { content: [] }
  },
}

afterEach(() => {
  mock.restore()
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_OPENROUTER
  delete process.env.CLAUDE_CODE_USE_CODEX
  delete process.env.CLAUDE_CODE_USE_COPILOT
  delete process.env.CLAUDE_CODE_USE_LMSTUDIO
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.DISABLE_PROMPT_CACHING
  delete process.env.CLAUDE_CODE_SIMPLE
  delete process.env.USER_TYPE
  delete process.env.ANTHROPIC_API_KEY
})

describe('getPromptCachingEnabled', () => {
  it('disables prompt caching for third-party providers', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    expect(getPromptCachingEnabled('gpt-5.4')).toBe(false)

    delete process.env.CLAUDE_CODE_USE_OPENAI
    process.env.CLAUDE_CODE_USE_OPENROUTER = '1'
    expect(getPromptCachingEnabled('openai/gpt-4.1')).toBe(false)

    delete process.env.CLAUDE_CODE_USE_OPENROUTER
    process.env.CLAUDE_CODE_USE_COPILOT = '1'
    expect(getPromptCachingEnabled('claude-sonnet-4')).toBe(false)
  })

  it('keeps prompt caching enabled for explicitly Anthropic-compatible providers', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(getPromptCachingEnabled('claude-sonnet-4-6')).toBe(true)

    delete process.env.CLAUDE_CODE_USE_BEDROCK
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(getPromptCachingEnabled('claude-sonnet-4-6')).toBe(true)
  })
})

describe('getSystemPrompt', () => {
  async function buildPrompt(options?: { lean?: boolean }) {
    const mcpClients: MCPServerConnection[] = []
    process.env.ANTHROPIC_API_KEY = 'test-key'

    mock.module('../../utils/agent/skillToolCommands.js', () => ({
      getSkillToolCommands: async () => [],
    }))
    mock.module('../../utils/outputStyle.js', () => ({
      getOutputStyleConfig: async () => null,
    }))
    mock.module('../../services/memory/persistentMemorySystem.js', () => ({
      loadMemoryPrompt: async () => 'MEMORY SECTION',
    }))
    mock.module('../../constants/prompts.js', async () => {
      const actual = await import('../../constants/prompts.js')
      return {
        ...actual,
        getBasePrompt: () => 'Base prompt\nTo give feedback, users should open issue',
      }
    })
    mock.module('../../utils/systemPromptRegistry.js', async () => {
      const actual = await import('../../utils/systemPromptRegistry.js')
      return {
        ...actual,
        resolveSystemPromptSections: async (sections: unknown[]) => {
          const resolved: string[] = []
          for (const section of sections as Array<{ compute: () => unknown }>) {
            const value = await section.compute()
            if (value !== null) {
              resolved.push(value as string)
            }
          }
          return resolved
        },
      }
    })

    const prompt = await getSystemPrompt([noopTool], 'claude-sonnet-4', [], mcpClients, options)
    return prompt.concat('MEMORY SECTION')
  }

  it('adds lean sections without output style section', async () => {
    const prompt = await buildPrompt({ lean: true })
    const joined = prompt.join('\n\n')

    expect(joined).toContain('You are free-code, an engineering agent.')
    expect(joined).toContain('# Doing tasks')
    expect(joined).toContain('MEMORY SECTION')
    expect(joined).toContain('# Output')
    expect(joined).not.toContain('# Output style')
    expect(joined).not.toContain('Caveman Mode')
  })

  it('adds non-lean sections including output style and caveman mode', async () => {
    const prompt = await buildPrompt()
    const joined = prompt.join('\n\n')

    expect(joined).toContain('# Tone and style')
    expect(joined).toContain('# Output efficiency')
    expect(joined).toContain('Caveman Mode')
  })
})
