import { describe, expect, it } from 'bun:test'

import type { Message } from './mailbox.js'
import {
  pruneMessagesForTokens,
  pruneOldMessages,
  stripStaleToolResults,
} from './messagePruning.js'

describe('pruneOldMessages', () => {
  it('returns empty array unchanged', () => {
    expect(pruneOldMessages([], 10)).toEqual([])
  })

  it('returns messages unchanged when below keepRecent threshold', () => {
    const messages: Message[] = [
      { id: '1', source: 'user', content: 'hello', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'teammate', content: 'hi', timestamp: '2024-01-01T00:01:00Z' },
    ]
    expect(pruneOldMessages(messages, 5)).toEqual(messages)
  })

  it('keeps all system messages regardless of age', () => {
    const messages: Message[] = [
      { id: '1', source: 'system', content: 'old system', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'user', content: 'msg1', timestamp: '2024-01-01T00:01:00Z' },
      { id: '3', source: 'user', content: 'msg2', timestamp: '2024-01-01T00:02:00Z' },
    ]
    const result = pruneOldMessages(messages, 1)
    expect(result).toContainEqual(messages[0]) // system message kept
    expect(result).toContainEqual(messages[2]) // most recent user message kept
    expect(result.length).toBe(2)
  })

  it('keeps all system messages plus the last N-message recency window', () => {
    const messages: Message[] = [
      { id: '1', source: 'user', content: 'old1', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'system', content: 'system1', timestamp: '2024-01-01T00:01:00Z' },
      { id: '3', source: 'user', content: 'msg1', timestamp: '2024-01-01T00:02:00Z' },
      { id: '4', source: 'user', content: 'msg2', timestamp: '2024-01-01T00:03:00Z' },
      { id: '5', source: 'system', content: 'system2', timestamp: '2024-01-01T00:04:00Z' },
      { id: '6', source: 'user', content: 'msg3', timestamp: '2024-01-01T00:05:00Z' },
    ]
    const result = pruneOldMessages(messages, 2)

    // Should keep: systems (2,5), and the last two messages in the timeline (5,6)
    expect(result.length).toBe(3)
    expect(result.map(m => m.id)).toEqual(['2', '5', '6'])
  })

  it('preserves message order after pruning', () => {
    const messages: Message[] = [
      { id: '1', source: 'system', content: 'sys', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'user', content: 'm1', timestamp: '2024-01-01T00:01:00Z' },
      { id: '3', source: 'user', content: 'm2', timestamp: '2024-01-01T00:02:00Z' },
      { id: '4', source: 'user', content: 'm3', timestamp: '2024-01-01T00:03:00Z' },
    ]
    const result = pruneOldMessages(messages, 2)
    const ids = result.map(m => m.id)
    expect(ids).toEqual(['1', '3', '4']) // system, then chronological user order
  })

  it('keeps the last N messages by recency window plus all system messages', () => {
    const messages: Message[] = [
      { id: '1', source: 'user', content: 'old-user', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'system', content: 'old-system', timestamp: '2024-01-01T00:01:00Z' },
      { id: '3', source: 'system', content: 'recent-system-a', timestamp: '2024-01-01T00:02:00Z' },
      { id: '4', source: 'system', content: 'recent-system-b', timestamp: '2024-01-01T00:03:00Z' },
      { id: '5', source: 'user', content: 'recent-user', timestamp: '2024-01-01T00:04:00Z' },
    ]

    const result = pruneOldMessages(messages, 2)

    expect(result.map(m => m.id)).toEqual(['2', '3', '4', '5'])
    expect(result.map(m => m.id)).not.toContain('1')
  })

  it('handles all non-system message types equally', () => {
    const messages: Message[] = [
      { id: '1', source: 'user', content: 'old', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'teammate', content: 'tm1', timestamp: '2024-01-01T00:01:00Z' },
      { id: '3', source: 'tick', content: 'tk1', timestamp: '2024-01-01T00:02:00Z' },
      { id: '4', source: 'task', content: 'ts1', timestamp: '2024-01-01T00:03:00Z' },
    ]
    const result = pruneOldMessages(messages, 2)
    expect(result.length).toBe(2)
    expect(result.map(m => m.id)).toContain('3') // recent
    expect(result.map(m => m.id)).toContain('4') // recent
  })
})

describe('stripStaleToolResults', () => {
  it('returns empty array unchanged', () => {
    expect(stripStaleToolResults([], 10)).toEqual([])
  })

  it('keeps recent messages with tool results', () => {
    const messages: Message[] = [
      {
        id: '1',
        source: 'user',
        content: '[tool result: something]',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ]
    expect(stripStaleToolResults(messages, 1)).toEqual(messages)
  })

  it('replaces old messages containing only tool results with placeholder', () => {
    const messages: Message[] = [
      {
        id: '1',
        source: 'user',
        content: '[tool result: old data here]',
        timestamp: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        source: 'user',
        content: 'recent message',
        timestamp: '2024-01-01T00:01:00Z',
      },
    ]
    const result = stripStaleToolResults(messages, 1)
    expect(result[0].content).toBe('[tool result omitted for context length]')
  })

  it('preserves old messages with prose content around tool results', () => {
    const messages: Message[] = [
      {
        id: '1',
        source: 'user',
        content: 'Here is the context: [tool result: data] and some analysis',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ]
    const result = stripStaleToolResults(messages, 10)
    expect(result[0].content).toBe('Here is the context: [tool result: data] and some analysis')
  })

  it('handles messages with multiple tool results correctly', () => {
    const messages: Message[] = [
      {
        id: '1',
        source: 'user',
        content: '[tool result: data1]\n[tool result: data2]',
        timestamp: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        source: 'user',
        content: 'recent message',
        timestamp: '2024-01-01T00:01:00Z',
      },
    ]
    const result = stripStaleToolResults(messages, 1)
    expect(result[0].content).toBe('[tool result omitted for context length]')
  })

  it('leaves non-user messages unchanged', () => {
    const messages: Message[] = [
      {
        id: '1',
        source: 'system',
        content: '[tool result: something]',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ]
    const result = stripStaleToolResults(messages, 10)
    expect(result[0].content).toBe('[tool result: something]')
  })

  it('marks messages at threshold index as recent', () => {
    const messages: Message[] = [
      {
        id: '1',
        source: 'user',
        content: '[tool result: old]',
        timestamp: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        source: 'user',
        content: '[tool result: exactly at threshold]',
        timestamp: '2024-01-01T00:01:00Z',
      },
      {
        id: '3',
        source: 'user',
        content: '[tool result: recent]',
        timestamp: '2024-01-01T00:02:00Z',
      },
    ]
    const result = stripStaleToolResults(messages, 2) // keep last 2
    expect(result[0].content).toBe('[tool result omitted for context length]')
    expect(result[1].content).toBe('[tool result: exactly at threshold]')
    expect(result[2].content).toBe('[tool result: recent]')
  })

  it('preserves other message properties when stripping results', () => {
    const messages: Message[] = [
      {
        id: '123',
        source: 'user',
        content: '[tool result: data]',
        from: 'alice',
        color: 'blue',
        timestamp: '2024-01-01T00:00:00Z',
      },
      {
        id: '124',
        source: 'user',
        content: 'recent message',
        timestamp: '2024-01-01T00:01:00Z',
      },
    ]
    const result = stripStaleToolResults(messages, 1)
    expect(result[0].id).toBe('123')
    expect(result[0].source).toBe('user')
    expect(result[0].from).toBe('alice')
    expect(result[0].color).toBe('blue')
    expect(result[0].timestamp).toBe('2024-01-01T00:00:00Z')
  })

  it('handles messages with no tool results', () => {
    const messages: Message[] = [
      {
        id: '1',
        source: 'user',
        content: 'Regular prose message',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ]
    const result = stripStaleToolResults(messages, 10)
    expect(result[0].content).toBe('Regular prose message')
  })
})

describe('pruneMessagesForTokens', () => {
  it('combines pruneOldMessages and stripStaleToolResults', () => {
    const messages: Message[] = [
      { id: '1', source: 'user', content: '[tool result: old]', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'system', content: 'keep always', timestamp: '2024-01-01T00:01:00Z' },
      { id: '3', source: 'user', content: 'recent', timestamp: '2024-01-01T00:02:00Z' },
    ]
    const result = pruneMessagesForTokens(messages, 1, 2)
    // Should prune to keep 1 non-system + all systems, then strip old tool results
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles empty message array', () => {
    expect(pruneMessagesForTokens([], 5, 5)).toEqual([])
  })

  it('applies both strategies correctly for complex case', () => {
    const messages: Message[] = [
      { id: '1', source: 'user', content: '[tool result: old data]', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'user', content: 'text with [tool result: embedded]', timestamp: '2024-01-01T00:01:00Z' },
      { id: '3', source: 'user', content: '[tool result: mid]', timestamp: '2024-01-01T00:02:00Z' },
      { id: '4', source: 'system', content: 'system msg', timestamp: '2024-01-01T00:03:00Z' },
      { id: '5', source: 'user', content: '[tool result: recent]', timestamp: '2024-01-01T00:04:00Z' },
    ]
    const result = pruneMessagesForTokens(messages, 2, 2)
    // Should keep: system (4), and 2 most recent user messages (3,5)
    // Then strip tool results from old ones kept but not in recent list
    expect(result.length).toBeLessThanOrEqual(3)
    expect(result.map(m => m.id)).toContain('4') // system kept
  })

  it('preserves message with mixed prose and tool result', () => {
    const messages: Message[] = [
      {
        id: '1',
        source: 'user',
        content: 'Here is analysis: [tool result: data] and conclusion',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ]
    const result = pruneMessagesForTokens(messages, 5, 5)
    expect(result[0].content).toContain('Here is analysis')
    expect(result[0].content).toContain('and conclusion')
  })

  it('handles edge case where keepRecent is 0', () => {
    const messages: Message[] = [
      { id: '1', source: 'user', content: 'msg', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'system', content: 'sys', timestamp: '2024-01-01T00:01:00Z' },
    ]
    // Keeps system messages and zero recent non-system messages
    const result = pruneMessagesForTokens(messages, 0, 10)
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('2')
  })

  it('handles edge case where keepToolResultsCount is 0', () => {
    const messages: Message[] = [
      { id: '1', source: 'user', content: '[tool result: data]', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', source: 'user', content: 'text', timestamp: '2024-01-01T00:01:00Z' },
    ]
    const result = pruneMessagesForTokens(messages, 5, 0)
    // All tool results should be stripped
    expect(result.some(m => m.content === '[tool result omitted for context length]')).toBe(true)
  })

  it('respects both thresholds independently', () => {
    const messages: Message[] = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      source: i % 2 === 0 ? 'user' : 'system',
      content: i < 10 ? '[tool result: data]' : 'recent',
      timestamp: new Date(2024, 0, 1, 0, i, 0).toISOString(),
    }))

    const result = pruneMessagesForTokens(messages, 3, 10)
    expect(result.length).toBeLessThan(messages.length)
  })
})
