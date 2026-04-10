import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

interface TokenEvent {
  timestamp: number
  requestId: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  totalTokens: number
  model: string
  duration: number // ms
}

interface TokenMetrics {
  totalRequests: number
  totalTokensUsed: number
  avgTokensPerRequest: number
  peakTokensPerRequest: number
  peakTokensPerSecond: number
  requestsPerSecond: number
  cacheHitRate: number
  recentEvents: TokenEvent[]
  spikesDetected: Array<{ timestamp: number; spike: number; baseline: number }>
}

class TokenMonitor {
  private events: TokenEvent[] = []
  private readonly maxHistorySize = 10000
  private readonly spikeThreshold = 2.0 // 2x baseline = spike
  private readonly windowSize = 60000 // 1 minute for baseline

  recordEvent(event: TokenEvent): void {
    this.events.push(event)
    if (this.events.length > this.maxHistorySize) {
      this.events.shift()
    }
  }

  getMetrics(): TokenMetrics {
    const now = Date.now()
    const recentWindow = now - this.windowSize
    const recent = this.events.filter(e => e.timestamp > recentWindow)

    const totalRequests = this.events.length
    const totalTokens = this.events.reduce((sum, e) => sum + e.totalTokens, 0)
    const avgTokens = totalRequests > 0 ? totalTokens / totalRequests : 0

    const peakTokens = Math.max(...this.events.map(e => e.totalTokens), 0)

    const recentDuration = (now - (recent[0]?.timestamp || now)) / 1000
    const recentRps = recentDuration > 0 ? recent.length / recentDuration : 0

    const recentTokenSum = recent.reduce((sum, e) => sum + e.totalTokens, 0)
    const peakRps =
      recentDuration > 0 ? recentTokenSum / recentDuration / 1000 : 0

    const cacheEvents = recent.filter(e => (e.cacheReadTokens || 0) > 0)
    const cacheHitRate =
      recent.length > 0 ? cacheEvents.length / recent.length : 0

    const baselineTokens =
      recent.length > 0 ? recent.reduce((sum, e) => sum + e.totalTokens, 0) / recent.length : 0

    const spikesDetected = recent
      .filter(e => e.totalTokens > baselineTokens * this.spikeThreshold)
      .map(e => ({
        timestamp: e.timestamp,
        spike: e.totalTokens,
        baseline: baselineTokens,
      }))

    return {
      totalRequests,
      totalTokensUsed: totalTokens,
      avgTokensPerRequest: avgTokens,
      peakTokensPerRequest: peakTokens,
      peakTokensPerSecond: peakRps,
      requestsPerSecond: recentRps,
      cacheHitRate,
      recentEvents: recent.slice(-20),
      spikesDetected,
    }
  }

  getRequestStats(requestId: string): TokenEvent | null {
    return this.events.find(e => e.requestId === requestId) || null
  }
}

const monitor = new TokenMonitor()

const recordTokenEventSchema = z.object({
  requestId: z.string().describe('Unique request identifier'),
  inputTokens: z.number().describe('Tokens in the input prompt'),
  outputTokens: z.number().describe('Tokens generated in response'),
  cacheReadTokens: z.number().optional().describe('Tokens read from cache (if applicable)'),
  cacheCreationTokens: z.number().optional().describe('Tokens created in cache (if applicable)'),
  model: z.string().describe('Model name (e.g. claude-opus-4-6)'),
  duration: z.number().describe('Request duration in milliseconds'),
})

const getRequestStatsSchema = z.object({
  requestId: z.string().describe('Request ID to look up'),
})

const server = new McpServer({
  name: 'token-monitor',
  version: '1.0.0',
})

server.registerTool(
  'record_token_event',
  {
    description: 'Record a token usage event for a completed request',
    inputSchema: recordTokenEventSchema,
  },
  async args => {
    const totalTokens =
      (args.inputTokens || 0) +
      (args.outputTokens || 0) +
      (args.cacheReadTokens || 0) +
      (args.cacheCreationTokens || 0)

    monitor.recordEvent({
      timestamp: Date.now(),
      requestId: args.requestId,
      inputTokens: args.inputTokens || 0,
      outputTokens: args.outputTokens || 0,
      cacheReadTokens: args.cacheReadTokens,
      cacheCreationTokens: args.cacheCreationTokens,
      totalTokens,
      model: args.model,
      duration: args.duration,
    })

    return {
      content: [
        {
          type: 'text' as const,
          text: `Recorded token event: ${totalTokens} tokens for request ${args.requestId}`,
        },
      ],
    }
  },
)

server.registerTool(
  'get_metrics',
  {
    description: 'Get current token usage metrics and anomalies',
    inputSchema: z.object({}),
  },
  async () => {
    const metrics = monitor.getMetrics()
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(metrics, null, 2),
        },
      ],
    }
  },
)

server.registerTool(
  'get_request_stats',
  {
    description: 'Get token stats for a specific request',
    inputSchema: getRequestStatsSchema,
  },
  async args => {
    const stats = monitor.getRequestStats(args.requestId)
    if (!stats) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No stats found for request ${args.requestId}`,
          },
        ],
      }
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(stats, null, 2),
        },
      ],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Token Monitor MCP server running on stdio')
}

main().catch(console.error)
