import { describe, expect, test } from 'bun:test'

import { RemoteIO } from './remoteIO.js'
import { StructuredIO } from './structuredIO.js'
import { getStructuredIO } from './print.js'

describe('getStructuredIO', () => {
  test('wraps non-empty string input as a user message in StructuredIO', async () => {
    const structuredIO = getStructuredIO('hello world', {
      sdkUrl: undefined,
      replayUserMessages: true,
    })

    expect(structuredIO).toBeInstanceOf(StructuredIO)

    const first = await structuredIO.structuredInput.next()

    expect(first.done).toBe(false)
    expect(first.value).toEqual({
      type: 'user',
      session_id: '',
      message: { role: 'user', content: 'hello world' },
      parent_tool_use_id: null,
    })

    const second = await structuredIO.structuredInput.next()
    expect(second.done).toBe(true)
  })

  test('returns empty StructuredIO stream for empty string input', async () => {
    const structuredIO = getStructuredIO('', {
      sdkUrl: undefined,
      replayUserMessages: true,
    })

    expect(structuredIO).toBeInstanceOf(StructuredIO)

    const first = await structuredIO.structuredInput.next()
    expect(first.done).toBe(true)
  })

  test('uses RemoteIO when sdkUrl is provided', () => {
    const structuredIO = getStructuredIO('hello remote', {
      sdkUrl: 'ws://127.0.0.1:4010',
      replayUserMessages: false,
    })

    expect(structuredIO).toBeInstanceOf(RemoteIO)
  })

  test('yields stream-json user message from async iterable input', async () => {
    async function* input() {
      yield `${JSON.stringify({
        type: 'user',
        session_id: '',
        message: { role: 'user', content: '/memory+' },
        parent_tool_use_id: null,
      })}\n`
    }

    const structuredIO = getStructuredIO(input(), {
      sdkUrl: undefined,
      replayUserMessages: true,
    })

    expect(structuredIO).toBeInstanceOf(StructuredIO)

    const first = await structuredIO.structuredInput.next()

    expect(first.done).toBe(false)
    expect(first.value).toEqual({
      type: 'user',
      session_id: '',
      message: { role: 'user', content: '/memory+' },
      parent_tool_use_id: null,
    })

    const second = await structuredIO.structuredInput.next()
    expect(second.done).toBe(true)
  })
})
