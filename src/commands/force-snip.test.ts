import { describe, expect, it } from 'bun:test'

import { compactMessagesForForceSnip } from './force-snip.js'
import type { Message } from '../types/message.js'

describe('compactMessagesForForceSnip', () => {
  it('keeps snip boundary before retained messages', async () => {
    const messages: Message[] = [
      { type: 'user', message: { content: 'old' } },
      { type: 'assistant', message: { content: 'also old' } },
      { type: 'user', message: { content: 'recent' } },
    ]
    const boundary = {
      type: 'system',
      subtype: 'snip_boundary',
      summary: 'old context summary',
    }

    const result = await compactMessagesForForceSnip(messages, undefined, async () => ({
      messages: [messages[2]!],
      tokensFreed: 1200,
      boundaryMessage: boundary,
      executed: true,
    }))

    expect(result.executed).toBe(true)
    expect(result.nextMessages).toEqual([boundary, messages[2]])
    expect(result.displayText).toBe('Snipped 2 old messages; freed ~1200 tokens.')
  })

  it('leaves messages alone when snip cannot execute', async () => {
    const messages: Message[] = [{ type: 'user', message: { content: 'recent' } }]

    const result = await compactMessagesForForceSnip(messages, undefined, async input => ({
      messages: [...input],
      tokensFreed: 0,
      executed: false,
    }))

    expect(result.executed).toBe(false)
    expect(result.nextMessages).toEqual(messages)
    expect(result.displayText).toContain('No history snipped.')
  })
})
