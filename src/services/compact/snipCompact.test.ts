import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import type { Message } from '../../types/message.js'
import {
  resetSnipConfig,
  setSnipConfig,
  snipCompactIfNeeded,
} from './snipCompact.js'

const queryHaikuMock = mock(async () => ({
  message: { content: 'archived summary' },
}))

mock.module('../api/claude.js', () => ({
  queryHaiku: queryHaikuMock,
  queryWithModel: queryHaikuMock,
}))

mock.module('../../utils/systemPrompt.js', () => ({
  asSystemPrompt: (prompts: string[]) => prompts.join('\n'),
}))

mock.module('../../utils/model/providers.js', () => ({
  getAPIProvider: () => 'firstParty',
}))

mock.module('./microCompact.js', () => ({
  estimateMessageTokens: (messages: Message[]) => {
    const [message] = messages
    if (!message) return 0
    return Number(message.uuid.split('-')[1]) * 100
  },
}))

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

describe('snipCompactIfNeeded', () => {
  beforeEach(() => {
    resetSnipConfig()
    setSnipConfig({
      thresholdTokens: 1,
      targetTokens: 1,
      minMessagesToKeep: 2,
      minMessagesToSnip: 1,
    })
    queryHaikuMock.mockClear()
  })

  afterEach(() => {
    resetSnipConfig()
  })

  it('awaits summary generation before returning boundary metadata', async () => {
    setSnipConfig({
      thresholdTokens: 1,
      targetTokens: 4000,
      minMessagesToKeep: 1,
      minMessagesToSnip: 1,
    })

    const messages = [
      createUserMessage(1, 'first '.repeat(200)),
      createUserMessage(2, 'second '.repeat(200)),
      createUserMessage(3, 'third '.repeat(120)),
      createUserMessage(4, 'fourth '.repeat(80)),
      createUserMessage(5, 'fifth '.repeat(80)),
      createUserMessage(6, 'sixth '.repeat(80)),
      createUserMessage(7, 'seventh '.repeat(80)),
      createUserMessage(8, 'eighth '.repeat(80)),
      createUserMessage(9, 'ninth '.repeat(80)),
      createUserMessage(10, 'tenth '.repeat(80)),
      createUserMessage(11, 'eleventh '.repeat(80)),
      createUserMessage(12, 'twelfth '.repeat(80)),
      createUserMessage(13, 'thirteenth '.repeat(80)),
      createUserMessage(14, 'fourteenth '.repeat(80)),
      createUserMessage(15, 'fifteenth '.repeat(80)),
      createUserMessage(16, 'sixteenth '.repeat(80)),
    ]

    const result = await snipCompactIfNeeded(messages, { force: true })

    expect(result.executed).toBe(true)
    expect(result.tokensFreed).toBeGreaterThan(0)
    expect(result.messages).toHaveLength(3)
    expect(result.messages.map(message => message.uuid)).toEqual([
      'user-14',
      'user-15',
      'user-16',
    ])
    expect(result.boundaryMessage?.compactMetadata.userContext).toBe(
      'archived summary',
    )
    expect(queryHaikuMock).toHaveBeenCalledTimes(1)
  })
})
