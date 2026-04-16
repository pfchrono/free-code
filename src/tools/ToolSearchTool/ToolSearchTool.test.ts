import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'
import { buildTool, type Tools } from '../../Tool.js'
import { ToolSearchTool } from './ToolSearchTool.js'

describe('ToolSearchTool', () => {
  it('does not fail keyword search when one deferred tool prompt throws', async () => {
    const healthyTool = buildTool({
      name: 'mcp__slack__send_message',
      isMcp: true,
      searchHint: 'slack send message',
      async description() {
        return 'healthy'
      },
      async prompt() {
        return 'Send Slack messages to channels and users'
      },
      inputSchema: z.object({}),
      outputSchema: z.string(),
      async call() {
        return { data: 'ok' }
      },
    })

    const brokenTool = buildTool({
      name: 'mcp__broken__explode',
      isMcp: true,
      searchHint: 'broken explode',
      async description() {
        return 'broken'
      },
      async prompt() {
        throw new Error('prompt boom')
      },
      inputSchema: z.object({}),
      outputSchema: z.string(),
      async call() {
        return { data: 'ok' }
      },
    })

    const tools: Tools = [ToolSearchTool, healthyTool, brokenTool]
    const result = await ToolSearchTool.call(
      { query: 'slack send', max_results: 5 },
      {
        options: { tools },
        getAppState: () =>
          ({
            mcp: { clients: [] },
          }) as never,
      } as never,
      undefined as never,
      undefined as never,
    )

    expect(result.data.matches).toEqual(['mcp__slack__send_message'])
    expect(result.data.total_deferred_tools).toBe(2)
  })
})
