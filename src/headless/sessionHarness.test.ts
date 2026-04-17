import { describe, expect, it } from 'bun:test'
import type { Command } from '../types/command.js'
import type { QueryEngineConfig } from '../QueryEngine.js'
import deadpoolMode from '../commands/deadpoolmode/index.ts'
import { createHeadlessHarnessFileCache, createHeadlessSessionHarness } from './sessionHarness.js'

class FakeQueryEngine {
  private interrupted = false

  constructor(
    private readonly submitImpl: (
      prompt: string,
      engine: FakeQueryEngine,
    ) => AsyncGenerator<any, void, unknown>,
  ) {}

  submitMessage(prompt: string): AsyncGenerator<any, void, unknown> {
    return this.submitImpl(prompt, this)
  }

  interrupt(): void {
    this.interrupted = true
  }

  isInterrupted(): boolean {
    return this.interrupted
  }

  getMessages(): any[] {
    return []
  }

  getReadFileState() {
    return createHeadlessHarnessFileCache()
  }
}

async function collectEvents(turn: Awaited<ReturnType<ReturnType<typeof createHeadlessSessionHarness>['submit']>>) {
  const events = []
  for await (const event of turn.events()) {
    events.push(event)
  }
  await turn.done
  return events
}

describe('HeadlessSessionHarness', () => {
  it('runs local slash commands through shared harness events', async () => {
    const harness = createHeadlessSessionHarness({
      cwd: process.cwd(),
      commands: [deadpoolMode],
    })

    const turn = await harness.submit('/deadpoolmode status')
    const events = await collectEvents(turn)

    expect(events[0]).toMatchObject({
      type: 'message',
      role: 'user',
      content: '/deadpoolmode status',
    })
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message',
        role: 'assistant',
        content: expect.stringContaining('Deadpool mode'),
      }),
    )
    expect(events.at(-1)).toMatchObject({
      type: 'completion',
      status: 'success',
    })
  })

  it('supports scripted permission responses for local slash commands', async () => {
    const permissionCommand = {
      type: 'local',
      name: 'needs-permission',
      description: 'requests one permission',
      supportsNonInteractive: true,
      load: async () => ({
        call: async (_args: string, context: any) => {
          const decision = await context.canUseTool?.(
            { name: 'Bash' },
            { command: 'echo hi' },
            {},
            {},
            'tool-permission-1',
          )

          return {
            type: 'text' as const,
            value:
              decision?.behavior === 'allow'
                ? 'Permission granted.'
                : `Permission denied: ${decision?.reason ?? 'none'}`,
          }
        },
      }),
    } satisfies Command

    const harness = createHeadlessSessionHarness({
      cwd: process.cwd(),
      commands: [permissionCommand],
    })

    const turn = await harness.submit('/needs-permission', {
      permissionMode: 'ask',
    })
    const iterator = turn.events()[Symbol.asyncIterator]()

    const first = await iterator.next()
    const second = await iterator.next()
    const third = await iterator.next()

    expect(first.value).toMatchObject({
      type: 'message',
      role: 'user',
    })
    expect(second.value).toMatchObject({
      type: 'tool_use',
      tool: 'Bash',
      toolUseId: 'tool-permission-1',
    })
    expect(third.value).toMatchObject({
      type: 'permission_request',
      tool: 'Bash',
      toolUseId: 'tool-permission-1',
    })

    const requestId = (third.value as { requestId: string }).requestId
    expect(
      harness.respondToPermission(requestId, {
        behavior: 'allow',
      }),
    ).toBe(true)

    const remaining = []
    while (true) {
      const next = await iterator.next()
      if (next.done) {
        break
      }
      remaining.push(next.value)
    }

    expect(remaining).toContainEqual(
      expect.objectContaining({
        type: 'message',
        role: 'assistant',
        content: 'Permission granted.',
      }),
    )
    expect(remaining.at(-1)).toMatchObject({
      type: 'completion',
      status: 'success',
    })
    await turn.done
  })

  it('maps prompt turns into streamed deltas and completion events', async () => {
    const harness = createHeadlessSessionHarness({
      cwd: process.cwd(),
      commands: [],
      createQueryEngine: (_config: QueryEngineConfig) =>
        new FakeQueryEngine(async function* () {
          yield {
            type: 'assistant_partial',
            delta: 'Hello',
          }
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello world' }],
            },
          }
          yield {
            type: 'result',
            subtype: 'success',
            result: 'Hello world',
            duration_ms: 12,
            usage: {
              input_tokens: 3,
              output_tokens: 2,
            },
          }
        }),
    })

    const turn = await harness.submit('say hello')
    const events = await collectEvents(turn)

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message_delta',
        delta: 'Hello',
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message',
        role: 'assistant',
        content: 'Hello world',
      }),
    )
    expect(events.at(-1)).toMatchObject({
      type: 'completion',
      status: 'success',
      output: 'Hello world',
      inputTokens: 3,
      outputTokens: 2,
    })
  })

  it('emits interrupted completion when active prompt turn is interrupted', async () => {
    const harness = createHeadlessSessionHarness({
      cwd: process.cwd(),
      commands: [],
      createQueryEngine: (_config: QueryEngineConfig) =>
        new FakeQueryEngine(async function* (_prompt, engine) {
          yield {
            type: 'assistant_partial',
            delta: 'Working',
          }

          while (!engine.isInterrupted()) {
            await Bun.sleep(5)
          }
        }),
    })

    const turn = await harness.submit('long running task')
    const iterator = turn.events()[Symbol.asyncIterator]()

    const first = await iterator.next()
    const second = await iterator.next()
    expect(first.value).toMatchObject({
      type: 'message',
      role: 'user',
    })
    expect(second.value).toMatchObject({
      type: 'message_delta',
      delta: 'Working',
    })

    expect(harness.interrupt()).toBe(true)

    const remaining = []
    while (true) {
      const next = await iterator.next()
      if (next.done) {
        break
      }
      remaining.push(next.value)
    }

    expect(remaining.at(-1)).toMatchObject({
      type: 'completion',
      status: 'interrupted',
    })
    await turn.done
  })
})
