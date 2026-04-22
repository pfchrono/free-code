import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import type { Message } from '../../types/message.js'
import {
  calculateMessagesToKeepIndex,
  resetSessionMemoryCompactConfig,
  setSessionMemoryCompactConfig,
} from './sessionMemoryCompact.js'

function createUserMessage(index: number, text = `message ${index}`): Message {
  return {
    parentUuid: null,
    isSidechain: false,
    userType: 'external',
    cwd: '/tmp',
    sessionId: 'session-1',
    version: '1.0.0',
    type: 'user',
    uuid: `user-${index}`,
    timestamp: new Date(index * 1000).toISOString(),
    message: {
      role: 'user',
      content: text,
    },
  }
}

function createBoundaryMessage(index: number): Message {
  return {
    parentUuid: null,
    isSidechain: false,
    userType: 'external',
    cwd: '/tmp',
    sessionId: 'session-1',
    version: '1.0.0',
    type: 'system',
    subtype: 'compact_boundary',
    uuid: `boundary-${index}`,
    timestamp: new Date(index * 1000).toISOString(),
    message: {
      role: 'system',
      content: 'Compacted conversation summary',
    },
  }
}

describe('calculateMessagesToKeepIndex', () => {
  beforeEach(() => {
    resetSessionMemoryCompactConfig()
    setSessionMemoryCompactConfig({
      minTokens: 200,
      minTextBlockMessages: 4,
      maxTokens: 50000,
    })
  })

  afterEach(() => {
    resetSessionMemoryCompactConfig()
  })

  it('does not expand preserved messages across the last compact boundary', () => {
    setSessionMemoryCompactConfig({
      minTokens: 500,
      minTextBlockMessages: 4,
      maxTokens: 50000,
    })

    const messages = [
      createUserMessage(1, 'older context 1 '.repeat(80)),
      createUserMessage(2, 'older context 2 '.repeat(80)),
      createUserMessage(3, 'older context 3 '.repeat(80)),
      createBoundaryMessage(4),
      createUserMessage(5, 'kept context 1 '.repeat(80)),
      createUserMessage(6, 'kept context 2 '.repeat(80)),
      createUserMessage(7, 'kept context 3 '.repeat(80)),
    ]

    const startIndex = calculateMessagesToKeepIndex(messages, 3)

    expect(startIndex).toBe(4)

    const startIndexWithExpansion = calculateMessagesToKeepIndex(messages, 5)

    expect(startIndexWithExpansion).toBe(4)
  })
})
