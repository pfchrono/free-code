import { afterEach, describe, expect, it, mock } from 'bun:test'

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
  async function buildPrompt(options?: {
    lean?: boolean
    cavemanModeEnabled?: boolean
    deadpoolModeEnabled?: boolean
  }) {
    const mcpClients: MCPServerConnection[] = []
    process.env.ANTHROPIC_API_KEY = 'test-key'

    mock.module('src/commands.js', () => ({
      getSkillToolCommands: async () => [],
    }))
    mock.module('../../constants/outputStyles.js', () => ({
      getOutputStyleConfig: async () => null,
    }))
    mock.module('../../memdir/memdir.js', () => ({
      loadMemoryPrompt: async () => 'MEMORY SECTION',
    }))
    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings: () => ({
        cavemanModeEnabled: options?.cavemanModeEnabled === true,
        deadpoolModeEnabled: options?.deadpoolModeEnabled === true,
      }),
    }))
    mock.module('../../constants/systemPromptSections.js', () => ({
      systemPromptSection: (_id: string, compute: () => unknown) => ({ compute }),
      DANGEROUS_uncachedSystemPromptSection: (
        _id: string,
        compute: () => unknown,
      ) => ({ compute }),
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
    }))

    const { getSystemPrompt } = await import('../../constants/prompts.js')
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
    expect(joined).toContain('Give a brief pre-tool update before substantial work.')
    expect(joined).not.toContain('Caveman Mode')
  })

  it('adds non-lean codex-style sections', async () => {
    const prompt = await buildPrompt()
    const joined = prompt.join('\n\n')

    expect(joined).toContain('# Responsiveness')
    expect(joined).toContain('AGENTS.md files provide repository instructions.')
    expect(joined).toContain('# Final responses')
    expect(joined).toContain('# Free-code guidance')
    expect(joined).not.toContain('# Tone and style')
    expect(joined).not.toContain('# Output efficiency')
  })

  it('keeps caveman and deadpool guidance together when both modes are enabled', async () => {
    const prompt = await buildPrompt({
      cavemanModeEnabled: true,
      deadpoolModeEnabled: true,
    })
    const joined = prompt.join('\n\n')

    expect(joined).toContain('# Communication Style: Caveman Mode')
    expect(joined).toContain('# Communication Style: Deadpool Mode')
    expect(joined).toContain('keep the antihero voice but compress it hard and keep jokes terse')
    expect(joined).toContain('keep jokes short, compressed, and secondary to technical clarity')
  })

  it('makes deadpool mode override plain-language tone guidance', async () => {
    const prompt = await buildPrompt({
      deadpoolModeEnabled: true,
    })
    const joined = prompt.join('\n\n')

    expect(joined).toContain(
      'This mode overrides the default plain-language tone guidance for all user-visible prose.',
    )
    expect(joined).toContain(
      'it MUST sound recognizably Deadpool-flavored unless the task is serious enough to reduce joke density',
    )
    expect(joined).toContain(
      'Deadpool mode: "Parser had a null-check faceplant. I patched it and chained a regression test to the radiator."',
    )
  })
})
