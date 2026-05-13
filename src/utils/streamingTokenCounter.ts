/**
 * Streaming Token Counter - Accurate token counting during generation
 *
 * Accumulates raw content and counts tokens at consistent boundaries
 * to avoid dependency on arbitrary chunk boundaries.
 */

import { roughTokenCountEstimation } from '../services/tokenEstimation.js'

export class StreamingTokenCounter {
  private inputTokens = 0
  private accumulatedContent = ''
  private lastCountedIndex = 0
  private cachedOutputTokens = 0
  private startTime = 0

  start(initialInputTokens?: number): void {
    this.reset()
    this.startTime = Date.now()
    this.inputTokens = initialInputTokens ?? 0
  }

  addChunk(deltaContent?: string): void {
    if (deltaContent) {
      this.accumulatedContent += deltaContent
      this.recountAtWordBoundary()
    }
  }

  private recountAtWordBoundary(): void {
    const content = this.accumulatedContent
    const unprocessedContent = content.slice(this.lastCountedIndex)

    const searchStart = unprocessedContent[0] === ' ' ? 1 : 0
    const nextSpaceIndex = unprocessedContent.indexOf(' ', searchStart)

    let boundaryIndex: number
    if (nextSpaceIndex > 0) {
      boundaryIndex = this.lastCountedIndex + nextSpaceIndex
    } else if (unprocessedContent.length > 50) {
      boundaryIndex = content.length
    } else {
      return
    }

    const toCount = content.slice(0, boundaryIndex)
    this.cachedOutputTokens = roughTokenCountEstimation(toCount)
    this.lastCountedIndex = boundaryIndex
  }

  finalize(): number {
    if (this.accumulatedContent.length > this.lastCountedIndex) {
      this.cachedOutputTokens = roughTokenCountEstimation(this.accumulatedContent)
      this.lastCountedIndex = this.accumulatedContent.length
    }
    return this.cachedOutputTokens
  }

  get total(): number {
    return this.inputTokens + this.cachedOutputTokens
  }

  get output(): number {
    return this.cachedOutputTokens
  }

  get elapsedMs(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0
  }

  get tokensPerSecond(): number {
    if (this.elapsedMs === 0) return 0
    return (this.cachedOutputTokens / this.elapsedMs) * 1000
  }

  getEstimatedGenerationTimeMs(): number {
    if (this.tokensPerSecond === 0) return 0
    return Math.round((this.cachedOutputTokens / this.tokensPerSecond) * 1000)
  }

  estimateRemainingTokens(targetOutputTokens: number): number {
    return Math.max(0, targetOutputTokens - this.cachedOutputTokens)
  }

  estimateRemainingTimeMs(targetOutputTokens: number): number {
    if (this.tokensPerSecond === 0) return 0
    const remaining = this.estimateRemainingTokens(targetOutputTokens)
    return Math.round((remaining / this.tokensPerSecond) * 1000)
  }

  get characterCount(): number {
    return this.accumulatedContent.length
  }

  reset(): void {
    this.inputTokens = 0
    this.accumulatedContent = ''
    this.lastCountedIndex = 0
    this.cachedOutputTokens = 0
    this.startTime = 0
  }
}
