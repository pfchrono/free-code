/**
 * High-performance token counter with cache invalidation on content change.
 */

import { createHash } from 'crypto'
import {
  roughTokenCountEstimation,
  roughTokenCountEstimationForMessages,
} from '../services/tokenEstimation.js'
import type { Message } from '../types/message.js'

export interface IncrementalCounterConfig {
  tokenBudget?: number
  autoInvalidate?: boolean
  estimationMultiplier?: number
}

export interface CounterStats {
  hits: number
  misses: number
  totalTokens: number
  averageTokens: number
  hitRate: number
}

function getMessageHash(messages: readonly Message[]): string {
  if (messages.length === 0) return 'empty'

  const fullContent = messages
    .map(message => {
      const content = message.message?.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) return JSON.stringify(content)
      return ''
    })
    .join('|')

  return createHash('sha256').update(fullContent).digest('hex').slice(0, 16)
}

export class IncrementalTokenCounter {
  private lastMessageCount = 0
  private lastTokenCount = 0
  private lastFullHash = ''
  private lastPrefixHash = ''
  private config: Required<IncrementalCounterConfig>
  private stats = {
    hits: 0,
    misses: 0,
    totalTokens: 0,
  }

  constructor(config: IncrementalCounterConfig = {}) {
    this.config = {
      tokenBudget: config.tokenBudget ?? 100000,
      autoInvalidate: config.autoInvalidate ?? true,
      estimationMultiplier: config.estimationMultiplier ?? 1,
    }
  }

  getCount(messages: readonly Message[]): number {
    if (messages.length === 0) {
      this.reset()
      return 0
    }

    const hash = getMessageHash(messages)

    if (messages.length === this.lastMessageCount && hash === this.lastFullHash) {
      this.stats.hits++
      this.stats.totalTokens += this.lastTokenCount
      return this.lastTokenCount
    }

    this.stats.misses++

    const isIncrementalSafe =
      messages.length > this.lastMessageCount &&
      this.config.autoInvalidate &&
      this.lastMessageCount > 0 &&
      this.lastFullHash.length > 0

    if (isIncrementalSafe) {
      const currentPrefixHash = getMessageHash(messages.slice(0, this.lastMessageCount))

      if (currentPrefixHash === this.lastPrefixHash) {
        const newMessages = messages.slice(this.lastMessageCount)
        const estimated = Math.round(
          roughTokenCountEstimationForMessages(newMessages) *
            this.config.estimationMultiplier,
        )
        this.lastTokenCount += estimated
      } else {
        this.lastTokenCount = roughTokenCountEstimationForMessages(messages)
      }
    } else {
      this.lastTokenCount = roughTokenCountEstimationForMessages(messages)
    }

    this.lastMessageCount = messages.length
    this.lastFullHash = hash
    this.lastPrefixHash = getMessageHash(messages)
    this.stats.totalTokens += this.lastTokenCount

    return this.lastTokenCount
  }

  invalidate(messages: readonly Message[]): number {
    this.lastMessageCount = messages.length
    this.lastFullHash = getMessageHash(messages)
    this.lastPrefixHash = messages.length > 0 ? getMessageHash(messages) : ''

    this.lastTokenCount =
      messages.length === 0 ? 0 : roughTokenCountEstimationForMessages(messages)

    this.stats.totalTokens += this.lastTokenCount
    this.stats.misses++

    return this.lastTokenCount
  }

  estimate(messages: readonly Message[]): number {
    return roughTokenCountEstimationForMessages(messages)
  }

  estimateMessage(message: Message): number {
    const content = message.message.content
    if (typeof content === 'string') {
      return roughTokenCountEstimation(content)
    }
    if (Array.isArray(content)) {
      return content.reduce((sum, block) => {
        if ('text' in block) return sum + roughTokenCountEstimation(block.text || '')
        if ('thinking' in block) {
          return sum + roughTokenCountEstimation(block.thinking || '')
        }
        return sum + 100
      }, 0)
    }
    return 100
  }

  estimateBatch(messages: Message[]): number {
    return messages.reduce((sum, message) => sum + this.estimateMessage(message), 0)
  }

  getRemainingBudget(messages: readonly Message[], contextWindow: number): number {
    const used = this.getCount(messages)
    return Math.max(0, contextWindow - used)
  }

  isApproachingLimit(messages: readonly Message[], threshold: number = 0.8): boolean {
    return this.getCount(messages) / this.config.tokenBudget > threshold
  }

  reset(): void {
    this.lastMessageCount = 0
    this.lastTokenCount = 0
    this.lastFullHash = ''
    this.lastPrefixHash = ''
    this.stats = { hits: 0, misses: 0, totalTokens: 0 }
  }

  get cachedCount(): number {
    return this.lastTokenCount
  }

  get messageCount(): number {
    return this.lastMessageCount
  }

  getStats(): CounterStats {
    const total = this.stats.hits + this.stats.misses
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalTokens: this.stats.totalTokens,
      averageTokens: total > 0 ? Math.round(this.stats.totalTokens / total) : 0,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
    }
  }

  updateConfig(config: Partial<IncrementalCounterConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      tokenBudget: config.tokenBudget ?? this.config.tokenBudget,
      autoInvalidate: config.autoInvalidate ?? this.config.autoInvalidate,
      estimationMultiplier:
        config.estimationMultiplier ?? this.config.estimationMultiplier,
    }
  }
}
