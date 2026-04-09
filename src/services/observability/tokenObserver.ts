/**
 * Token Observer — integrates with Token Monitor MCP
 * Records API request metrics for real-time monitoring and anomaly detection
 */

interface TokenObserverEvent {
  requestId: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  model: string
  duration: number
  timestamp?: number
}

interface TokenMetrics {
  totalRequests: number
  totalTokensUsed: number
  avgTokensPerRequest: number
  peakTokensPerRequest: number
  peakTokensPerSecond: number
  requestsPerSecond: number
  cacheHitRate: number
  spikesDetected: Array<{ timestamp: number; spike: number; baseline: number }>
}

class TokenObserver {
  private mcpClient: any // Will be injected by container
  private requestIdCounter = 0
  private localBuffer: TokenObserverEvent[] = []
  private readonly maxLocalBuffer = 100

  setMcpClient(client: any): void {
    this.mcpClient = client
  }

  generateRequestId(): string {
    return `req-${Date.now()}-${this.requestIdCounter++}`
  }

  async recordEvent(event: TokenObserverEvent): Promise<void> {
    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp || Date.now(),
    }

    // Store locally for fallback
    this.localBuffer.push(eventWithTimestamp)
    if (this.localBuffer.length > this.maxLocalBuffer) {
      this.localBuffer.shift()
    }

    // Try to send to MCP if available
    if (this.mcpClient) {
      try {
        await this.mcpClient.callTool('token-monitor', 'record_token_event', {
          requestId: event.requestId,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheCreationTokens: event.cacheCreationTokens,
          model: event.model,
          duration: event.duration,
        })
      } catch (err) {
        console.error('Failed to record token event to MCP:', err)
        // Continue — local buffer is fallback
      }
    }
  }

  async getMetrics(): Promise<TokenMetrics | null> {
    if (!this.mcpClient) {
      console.warn('MCP client not available — returning null metrics')
      return null
    }

    try {
      const result = await this.mcpClient.callTool(
        'token-monitor',
        'get_metrics',
        {}
      )
      return result
    } catch (err) {
      console.error('Failed to fetch metrics from MCP:', err)
      return null
    }
  }

  getLocalBuffer(): TokenObserverEvent[] {
    return [...this.localBuffer]
  }

  async checkForAnomalies(): Promise<boolean> {
    const metrics = await this.getMetrics()
    if (!metrics) return false

    const hasSpikes = metrics.spikesDetected.length > 0
    const highTokenRate = metrics.peakTokensPerSecond > 50000 // tokens/sec
    const anomaly = hasSpikes || highTokenRate

    if (anomaly) {
      console.warn('Token anomaly detected:', {
        spikes: metrics.spikesDetected.length,
        peakRps: metrics.peakTokensPerSecond,
        cacheHitRate: metrics.cacheHitRate,
      })
    }

    return anomaly
  }
}

export const tokenObserver = new TokenObserver()
