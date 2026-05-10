import { describe, expect, test } from 'bun:test'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { processUserInput } from './processUserInput.js'
import type { Command } from '../../commands.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'

function promptSkill(name: string, body: string): Command {
  return {
    type: 'prompt',
    name,
    description: `${name} skill`,
    progressMessage: `loading ${name}`,
    contentLength: body.length,
    source: 'userSettings',
    loadedFrom: 'skills',
    async getPromptForCommand(args: string): Promise<ContentBlockParam[]> {
      return [
        {
          type: 'text',
          text: `${body}\nARGS:${args}`,
        },
      ]
    },
  }
}

function textFromMessage(message: unknown): string {
  const msg = message as { message?: { content?: unknown } }
  const content = msg.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(block => {
        const b = block as { text?: unknown }
        return typeof b.text === 'string' ? b.text : ''
      })
      .join('\n')
  }
  return ''
}

describe('processUserInput inline skill mentions', () => {
  test('expands every $skill mention before the user prompt', async () => {
    const result = await processUserInput({
      input: 'Use $foo and $bar before finishing',
      mode: 'prompt',
      setToolJSX: () => {},
      context: {
        messages: [],
        setMessages: () => {},
        onChangeAPIKey: () => {},
        options: {
          commands: [
            promptSkill('foo', 'FOO_SKILL_BODY'),
            promptSkill('bar', 'BAR_SKILL_BODY'),
          ],
          debug: false,
          mainLoopModel: 'test-model',
          tools: [],
          verbose: false,
          thinkingConfig: { type: 'disabled' },
          mcpClients: [],
          mcpResources: {},
          isNonInteractiveSession: true,
          agentDefinitions: { activeAgents: [], allAgents: [] },
          theme: 'dark',
          ideInstallationStatus: null,
        },
        getAppState: () => ({
          toolPermissionContext: getEmptyToolPermissionContext(),
          mcp: { commands: [], clients: [] },
        }),
        setAppState: () => {},
        abortController: new AbortController(),
        readFileState: {},
        setToolJSX: () => {},
        setResponseLength: () => {},
        updateFileHistoryState: () => {},
        updateAttributionState: () => {},
      } as never,
      messages: [],
      querySource: 'repl',
      skipAttachments: true,
    })

    const text = result.messages.map(textFromMessage).join('\n')

    expect(result.shouldQuery).toBe(true)
    expect(text).toContain('FOO_SKILL_BODY')
    expect(text).toContain('BAR_SKILL_BODY')
    expect(text).toContain('Use $foo and $bar before finishing')
  })

  test('places $handoff after as a finalizer after the user prompt', async () => {
    const result = await processUserInput({
      input: '$foo do work then $handoff after',
      mode: 'prompt',
      setToolJSX: () => {},
      context: {
        messages: [],
        setMessages: () => {},
        onChangeAPIKey: () => {},
        options: {
          commands: [
            promptSkill('foo', 'FOO_SKILL_BODY'),
            promptSkill('handoff', 'HANDOFF_SKILL_BODY'),
          ],
          debug: false,
          mainLoopModel: 'test-model',
          tools: [],
          verbose: false,
          thinkingConfig: { type: 'disabled' },
          mcpClients: [],
          mcpResources: {},
          isNonInteractiveSession: true,
          agentDefinitions: { activeAgents: [], allAgents: [] },
          theme: 'dark',
          ideInstallationStatus: null,
        },
        getAppState: () => ({
          toolPermissionContext: getEmptyToolPermissionContext(),
          mcp: { commands: [], clients: [] },
        }),
        setAppState: () => {},
        abortController: new AbortController(),
        readFileState: {},
        setToolJSX: () => {},
        setResponseLength: () => {},
        updateFileHistoryState: () => {},
        updateAttributionState: () => {},
      } as never,
      messages: [],
      querySource: 'repl',
      skipAttachments: true,
    })

    const messageTexts = result.messages.map(textFromMessage)
    const text = messageTexts.join('\n')
    const fooIndex = messageTexts.findIndex(value =>
      value.includes('FOO_SKILL_BODY'),
    )
    const promptIndex = messageTexts.findIndex(
      value => value === '$foo do work then $handoff after',
    )
    const handoffIndex = messageTexts.findIndex(value =>
      value.includes('HANDOFF_SKILL_BODY'),
    )

    expect(fooIndex).toBeGreaterThanOrEqual(0)
    expect(promptIndex).toBeGreaterThan(fooIndex)
    expect(handoffIndex).toBeGreaterThan(promptIndex)
    expect(text).toContain('Finalizer skill requested')
  })

  test('treats $handover /command as handoff finalizer command intent', async () => {
    const result = await processUserInput({
      input: '$foo do work then $handover /goal complete',
      mode: 'prompt',
      setToolJSX: () => {},
      context: {
        messages: [],
        setMessages: () => {},
        onChangeAPIKey: () => {},
        options: {
          commands: [
            promptSkill('foo', 'FOO_SKILL_BODY'),
            promptSkill('handoff', 'HANDOFF_SKILL_BODY'),
          ],
          debug: false,
          mainLoopModel: 'test-model',
          tools: [],
          verbose: false,
          thinkingConfig: { type: 'disabled' },
          mcpClients: [],
          mcpResources: {},
          isNonInteractiveSession: true,
          agentDefinitions: { activeAgents: [], allAgents: [] },
          theme: 'dark',
          ideInstallationStatus: null,
        },
        getAppState: () => ({
          toolPermissionContext: getEmptyToolPermissionContext(),
          mcp: { commands: [], clients: [] },
        }),
        setAppState: () => {},
        abortController: new AbortController(),
        readFileState: {},
        setToolJSX: () => {},
        setResponseLength: () => {},
        updateFileHistoryState: () => {},
        updateAttributionState: () => {},
      } as never,
      messages: [],
      querySource: 'repl',
      skipAttachments: true,
    })

    const text = result.messages.map(textFromMessage).join('\n')

    expect(text).toContain('HANDOFF_SKILL_BODY')
    expect(text).toContain(
      'apply this follow-up command intent using that handoff path/content as context: /goal complete',
    )
  })
})
