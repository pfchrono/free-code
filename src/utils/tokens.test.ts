import { describe, expect, test } from 'bun:test'

import { getTokenCountFromUsage, tokenCountWithEstimation } from './tokens.js'
import { IncrementalTokenCounter } from './incrementalTokenCounter.js'

describe('getTokenCountFromUsage', () => {
  test('includes input, output, and cache tokens', () => {
    expect(
      getTokenCountFromUsage({
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 25,
        cache_creation_input_tokens: 10,
      } as any),
    ).toBe(185)
  })
})

describe('IncrementalTokenCounter', () => {
  test('uses cached count for same messages', () => {
    const counter = new IncrementalTokenCounter()
    const messages = [{ type: 'user', message: { content: 'hello' } } as any]

    const count1 = counter.getCount(messages)
    const count2 = counter.getCount(messages)

    expect(count1).toBe(count2)
    expect(counter.getStats().hits).toBe(1)
  })

  test('increments for appended messages', () => {
    const counter = new IncrementalTokenCounter()

    const count1 = counter.getCount([
      { type: 'user', message: { content: 'hello' } } as any,
    ])

    const count2 = counter.getCount([
      { type: 'user', message: { content: 'hello' } } as any,
      { type: 'user', message: { content: 'world' } } as any,
    ])

    expect(count2).toBeGreaterThan(count1)
  })

  test('resets correctly', () => {
    const counter = new IncrementalTokenCounter()

    counter.getCount([{ type: 'user', message: { content: 'hello' } } as any])
    counter.reset()

    expect(counter.cachedCount).toBe(0)
    expect(counter.messageCount).toBe(0)
  })

  test('handles system-like messages without message content', () => {
    const counter = new IncrementalTokenCounter()

    expect(
      counter.getCount([
        { type: 'user', message: { content: 'hello' } } as any,
        { type: 'system', content: 'query augmentation' } as any,
      ]),
    ).toBeGreaterThan(0)
  })
})

describe('tokenCountWithEstimation', () => {
  test('falls back to estimation when no usage exists', () => {
    const messages = [{ type: 'user', message: { content: 'hello world' } } as any]
    expect(tokenCountWithEstimation(messages)).toBeGreaterThan(0)
  })
})
