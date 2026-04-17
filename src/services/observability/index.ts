/**
 * Observability Module — unified access to token monitoring and code summarization
 */

import { tokenObserver } from './tokenObserver'
import { codeSummarizer } from './codeSummarizer'

class Observability {
  tokens = tokenObserver
  code = codeSummarizer

  init(mcpClient: any): void {
    this.tokens.setMcpClient(mcpClient)
    this.code.setMcpClient(mcpClient)
    console.log('Observability module initialized with MCP client')
  }

  /**
   * Log an API call with token metrics
   */
  async logApiCall(args: {
    requestId?: string
    inputTokens: number
    outputTokens: number
    model: string
    duration: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
  }): Promise<void> {
    const requestId = args.requestId || this.tokens.generateRequestId()
    await this.tokens.recordEvent({
      requestId,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      model: args.model,
      duration: args.duration,
      cacheReadTokens: args.cacheReadTokens,
      cacheCreationTokens: args.cacheCreationTokens,
    })
  }

  /**
   * Prepare file for API submission — compress if beneficial
   */
  async prepareFileContent(filePath: string): Promise<string | null> {
    return this.code.getCompressedVersion(filePath, 0.2)
  }

  /**
   * Get full observability snapshot
   */
  async getSnapshot() {
    const [metrics, cacheStats] = await Promise.all([
      this.tokens.getMetrics(),
      Promise.resolve(this.code.getCacheStats()),
    ])

    return {
      timestamp: Date.now(),
      tokens: metrics,
      codeSummarizerCache: cacheStats,
      anomalyDetected: metrics ? metrics.spikesDetected.length > 0 : false,
    }
  }
}

export const observability = new Observability()

export type { TokenMetrics } from './tokenObserver'
export type { FileSummary, DirectorySummary } from './codeSummarizer'
