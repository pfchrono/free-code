import { roughTokenCountEstimation } from '../services/tokenEstimation.js'
import type { SDKAssistantMessage, SDKMessage } from '../types/message.js'
import { jsonStringify } from './slowOperations.js'

export interface ThinkingBlock {
  type: 'thinking' | 'redacted_thinking'
  content: string
  tokens: number
}

export interface OutputBlock {
  type: 'text' | 'tool_use'
  content: string
  tokens: number
}

export interface ThinkingTokenBreakdown {
  thinking: number
  output: number
  total: number
  thinkingBlocks: ThinkingBlock[]
  outputBlocks: OutputBlock[]
}

export interface ThinkingAnalysis {
  hasThinking: boolean
  thinkingPercentage: number
  outputPercentage: number
  blockCount: number
  avgThinkingBlockSize: number
  avgOutputBlockSize: number
  totalTextLength: number
  reasoningComplexity: 'low' | 'medium' | 'high'
}

export class ThinkingTokenAnalyzer {
  static extract(message: SDKAssistantMessage): ThinkingTokenBreakdown {
    const thinkingBlocks: ThinkingBlock[] = []
    const outputBlocks: OutputBlock[] = []
    let thinking = 0
    let output = 0

    for (const block of message.message.content) {
      if (!isContentBlock(block)) {
        continue
      }

      if (block.type === 'thinking' && typeof block.thinking === 'string') {
        const tokens = roughTokenCountEstimation(block.thinking)
        thinking += tokens
        thinkingBlocks.push({ type: 'thinking', content: block.thinking, tokens })
      } else if (
        block.type === 'redacted_thinking' &&
        typeof block.data === 'string'
      ) {
        const tokens = roughTokenCountEstimation(block.data)
        thinking += tokens
        thinkingBlocks.push({
          type: 'redacted_thinking',
          content: block.data,
          tokens,
        })
      } else if (block.type === 'text' && typeof block.text === 'string') {
        const tokens = roughTokenCountEstimation(block.text)
        output += tokens
        outputBlocks.push({ type: 'text', content: block.text, tokens })
      } else if (block.type === 'tool_use') {
        const content = jsonStringify(block.input ?? {})
        const tokens = roughTokenCountEstimation(content)
        output += tokens
        outputBlocks.push({ type: 'tool_use', content, tokens })
      }
    }

    return {
      thinking,
      output,
      total: thinking + output,
      thinkingBlocks,
      outputBlocks,
    }
  }

  static extractSimple(message: SDKAssistantMessage): ThinkingTokenBreakdown {
    return this.extract(message)
  }

  static analyze(message: SDKAssistantMessage): ThinkingAnalysis {
    const breakdown = this.extract(message)
    const { thinking, output, total, thinkingBlocks, outputBlocks } = breakdown

    const hasThinking = thinking > 0
    const thinkingPercentage = total > 0 ? (thinking / total) * 100 : 0
    const outputPercentage = total > 0 ? (output / total) * 100 : 0
    const avgThinkingBlockSize = averageBlockTokens(thinkingBlocks)
    const avgOutputBlockSize = averageBlockTokens(outputBlocks)
    const totalTextLength = [...thinkingBlocks, ...outputBlocks].reduce(
      (sum, block) => sum + block.content.length,
      0,
    )

    let reasoningComplexity: 'low' | 'medium' | 'high' = 'low'
    if (thinkingPercentage > 30 || thinkingBlocks.length > 5) {
      reasoningComplexity = 'high'
    } else if (thinkingPercentage > 10 || thinkingBlocks.length > 2) {
      reasoningComplexity = 'medium'
    }

    return {
      hasThinking,
      thinkingPercentage: Math.round(thinkingPercentage * 10) / 10,
      outputPercentage: Math.round(outputPercentage * 10) / 10,
      blockCount: thinkingBlocks.length + outputBlocks.length,
      avgThinkingBlockSize: Math.round(avgThinkingBlockSize),
      avgOutputBlockSize: Math.round(avgOutputBlockSize),
      totalTextLength,
      reasoningComplexity,
    }
  }

  static hasSignificantThinking(
    message: SDKAssistantMessage,
    thresholdPercent = 20,
  ): boolean {
    return this.analyze(message).thinkingPercentage >= thresholdPercent
  }

  static filterThinkingMessages(messages: SDKMessage[]): SDKAssistantMessage[] {
    return messages
      .filter((message): message is SDKAssistantMessage => {
        return message.type === 'assistant'
      })
      .filter(message => this.hasSignificantThinking(message))
  }

  static totalThinkingTokens(messages: SDKMessage[]): number {
    return messages
      .filter((message): message is SDKAssistantMessage => {
        return message.type === 'assistant'
      })
      .reduce((sum, message) => sum + this.extract(message).thinking, 0)
  }
}

export function extractThinkingTokens(message: SDKAssistantMessage): {
  thinking: number
  output: number
  total: number
} {
  const result = ThinkingTokenAnalyzer.extract(message)
  return {
    thinking: result.thinking,
    output: result.output,
    total: result.total,
  }
}

function isContentBlock(block: unknown): block is Record<string, unknown> & {
  type: string
} {
  return typeof block === 'object' && block !== null && 'type' in block
}

function averageBlockTokens(blocks: Array<{ tokens: number }>): number {
  if (blocks.length === 0) {
    return 0
  }
  return blocks.reduce((sum, block) => sum + block.tokens, 0) / blocks.length
}
