import { afterEach, describe, expect, it, mock } from 'bun:test'

import type { MCPServerConnection } from '../../context.js'
import { getPromptCachingEnabled } from './claude.js'
import {
  getServerCacheKey,
  isMcpSessionExpiredError,
  wrapFetchWithTimeout,
} from '../mcp/client.js'

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

describe('MCP client helpers', () => {
  it('detects expired MCP sessions only for 404 plus session-not-found JSON-RPC errors', () => {
    const expired = Object.assign(new Error('{"error":{"code":-32001,"message":"Session not found"}}'), { code: 404 })
    const generic404 = Object.assign(new Error('404 page not found'), { code: 404 })
    const wrongStatus = Object.assign(new Error('{"error":{"code":-32001,"message":"Session not found"}}'), { code: 500 })

    expect(isMcpSessionExpiredError(expired)).toBe(true)
    expect(isMcpSessionExpiredError(generic404)).toBe(false)
    expect(isMcpSessionExpiredError(wrongStatus)).toBe(false)
  })

  it('adds streamable-http accept header and timeout signal for non-GET requests', async () => {
    const response = new Response(null, { status: 204 })
    const baseFetch = mock(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(init?.headers).toBeInstanceOf(Headers)
      const headers = init?.headers as Headers
      expect(headers.get('accept')).toBe('application/json, text/event-stream')
      expect(headers.get('x-test')).toBe('1')
      return response
    })

    const wrappedFetch = wrapFetchWithTimeout(baseFetch)
    const result = await wrappedFetch('https://example.com/mcp', {
      method: 'POST',
      headers: { 'x-test': '1' },
    })

    expect(result).toBe(response)
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })

  it('leaves GET requests untouched so SSE streams can stay open', async () => {
    const response = new Response('ok')
    const baseFetch = mock(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.signal).toBeUndefined()
      expect(init?.headers).toBeUndefined()
      return response
    })

    const wrappedFetch = wrapFetchWithTimeout(baseFetch)
    const result = await wrappedFetch('https://example.com/mcp')

    expect(result).toBe(response)
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })

  it('builds stable cache keys from server name and config', () => {
    const serverRef = { type: 'http', url: 'https://example.com/mcp', headers: { authorization: 'Bearer token' } }

    expect(getServerCacheKey('demo', serverRef)).toBe(
      'demo-{"type":"http","url":"https://example.com/mcp","headers":{"authorization":"Bearer token"}}',
    )
  })
})

describe('getSystemPrompt', () => {
  function countOccurrences(haystack: string, needle: string) {
    return haystack.split(needle).length - 1
  }

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
    expect(joined).toContain('More deeply nested files override higher-level ones')
    expect(joined).toContain('# Final responses')
    expect(joined).toContain('# Free-code guidance')
    expect(joined).not.toContain('# Tone and style')
    expect(joined).not.toContain('# Output efficiency')
  })

  it('avoids reintroducing recently pruned prompt redundancy', async () => {
    const prompt = await buildPrompt()
    const joined = prompt.join('\n\n')

    expect(countOccurrences(joined, 'AGENTS.md files provide repository instructions.')).toBe(1)
    expect(countOccurrences(joined, 'Use the task-management tool when available for non-trivial work, multi-step requests, or work that benefits from visible checkpoints. Keep the plan high-signal and update it as steps complete.')).toBe(1)
    expect(countOccurrences(joined, 'Do NOT use the Bash to run commands when a relevant dedicated tool is provided. Using dedicated tools allows the user to better understand and review your work. This is CRITICAL to assisting the user:')).toBe(1)
    expect(joined).not.toContain('Use specialized agents when their domain fits the task better than the main conversation flow.')
  })

  it('includes prompt-guidance hit cases for immediate action and task tracking', async () => {
    const prompt = await buildPrompt()
    const joined = prompt.join('\n\n')

    expect(joined).toContain('Before a substantial batch of tool calls, briefly tell the user what you are about to do.')
    expect(joined).toContain('Use the task-management tool when available for non-trivial work, multi-step requests, or work that benefits from visible checkpoints. Keep the plan high-signal and update it as steps complete.')
    expect(joined).toContain('When a request is ambiguous but executable, inspect the codebase and act instead of only describing what could be done.')
    expect(joined).toContain("If an approach fails, diagnose why before switching tactics—read the error, check your assumptions, try a focused fix. Don't retry the identical action blindly, but don't abandon a viable approach after a single failure either. Escalate to the user with AskUserQuestion only when you're genuinely stuck after investigation, not as a first response to friction.")
    expect(joined).toContain('Do not create files unless they\'re absolutely necessary for achieving your goal. Generally prefer editing an existing file to creating a new one, as this prevents file bloat and builds on existing work more effectively.')
  })

  it('includes prompt-guidance miss guards against guessing and unverified claims', async () => {
    const prompt = await buildPrompt({ lean: true })
    const joined = prompt.join('\n\n')

    expect(joined).toContain('Read relevant files before editing.')
    expect(joined).toContain('Verify key assumptions before reporting completion.')
    expect(joined).toContain('Keep replies brief and actionable. Start with result, then verification or next step.')
    expect(joined).toContain('Show only what user needs: file path, command, test result.')
    expect(joined).not.toContain('Do not restate the request before acting.')
    expect(joined).not.toContain('Claim success without verification.')
  })

  it('includes agent guidance once when Agent tool is enabled', async () => {
    const agentTool = {
      ...noopTool,
      name: 'Agent',
    }
    const { getSystemPrompt } = await import('../../constants/prompts.js')
    const withAgent = await getSystemPrompt([noopTool, agentTool], 'claude-sonnet-4', [], [])
    const joined = withAgent.concat('MEMORY SECTION').join('\n\n')

    expect(joined).toContain('# Session-specific guidance')
    expect(countOccurrences(joined, 'Do NOT use the Bash to run commands when a relevant dedicated tool is provided. Using dedicated tools allows the user to better understand and review your work. This is CRITICAL to assisting the user:')).toBe(1)
    expect(countOccurrences(joined, 'You can call multiple tools in a single response. If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel. Maximize use of parallel tool calls where possible to increase efficiency. However, if some tool calls depend on previous calls to inform dependent values, do NOT call these tools in parallel and instead call them sequentially. For instance, if one operation must complete before another starts, run these operations sequentially instead.')).toBe(1)
  })

  it('keeps lean mode agent guidance compact', async () => {
    const agentTool = {
      ...noopTool,
      name: 'Agent',
    }
    const { getSystemPrompt } = await import('../../constants/prompts.js')
    const prompt = await getSystemPrompt(
      [noopTool, agentTool],
      'claude-sonnet-4',
      [],
      [],
      { lean: true },
    )
    const joined = prompt.concat('MEMORY SECTION').join('\n\n')

    expect(joined).not.toContain('# Session-specific guidance')
    expect(joined).toContain('Use dedicated tools first, then shell for unsupported workflows.')
    expect(joined).toContain('Run independent tool calls in parallel; run dependent ones in sequence.')
    expect(joined).toContain('MEMORY SECTION')
    expect(joined).not.toContain('Use foreground delegation when results are needed before proceeding')
    expect(joined).not.toContain('Do not delegate understanding: remain responsible for synthesis, decisions, and the final answer.')
  })

  it('does not duplicate expanded agent guidance lines', async () => {
    const agentTool = {
      ...noopTool,
      name: 'Agent',
    }
    const { getSystemPrompt } = await import('../../constants/prompts.js')
    const prompt = await getSystemPrompt([noopTool, agentTool], 'claude-sonnet-4', [], [])
    const joined = prompt.concat('MEMORY SECTION').join('\n\n')

    expect(joined).toContain('# Session-specific guidance')
    expect(countOccurrences(joined, 'Do NOT use the Bash to run commands when a relevant dedicated tool is provided. Using dedicated tools allows the user to better understand and review your work. This is CRITICAL to assisting the user:')).toBe(1)
    expect(countOccurrences(joined, 'You can call multiple tools in a single response. If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel. Maximize use of parallel tool calls where possible to increase efficiency. However, if some tool calls depend on previous calls to inform dependent values, do NOT call these tools in parallel and instead call them sequentially. For instance, if one operation must complete before another starts, run these operations sequentially instead.')).toBe(1)
  })

  it('keeps session guidance stable when Agent tool is absent', async () => {
    const { getSystemPrompt } = await import('../../constants/prompts.js')
    const prompt = await getSystemPrompt([noopTool], 'claude-sonnet-4', [], [])
    const joined = prompt.concat('MEMORY SECTION').join('\n\n')

    expect(joined).not.toContain('# Session-specific guidance')
    expect(joined).toContain('# Responsiveness')
    expect(joined).toContain('Before a substantial batch of tool calls, briefly tell the user what you are about to do.')
    expect(joined).not.toContain('Use foreground delegation when results are needed before proceeding')
    expect(joined).not.toContain('Do not delegate understanding: remain responsible for synthesis, decisions, and the final answer.')
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
    expect(joined).toContain('Respond in snarky, fast-talking antihero voice with playful self-awareness and quick sarcasm.')
    expect(joined).toContain('Keep jokes short and occasional. Engineer first, merc with a mouth and menace with jokes second')
  })
})
