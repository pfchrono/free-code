import React from 'react'
import { describe, expect, mock, test } from 'bun:test'

import enhancedMemoryCommand from './enhancedMemoryCommand.js'
import memory from './index.js'

describe('memory command registration', () => {
  test('registers /memory as a local JSX command', () => {
    expect(memory.name).toBe('memory')
    expect(memory.type).toBe('local-jsx')
  })

  test('registers /memory+ as a local JSX command with aliases', () => {
    expect(enhancedMemoryCommand.name).toBe('memory+')
    expect(enhancedMemoryCommand.type).toBe('local-jsx')
    expect(enhancedMemoryCommand.aliases).toEqual(['mem+', 'memory-enhanced'])
  })

  test('renders /memory+ without eager subsystem initialization', async () => {
    const initializeMemory = mock(async () => {})
    const initializeSession = mock(async () => {})

    mock.module('../../services/memory/persistentMemorySystem.js', () => ({
      getMemorySystem: () => ({ initialize: initializeMemory }),
    }))
    mock.module('../../services/memory/sessionContinuityManager.js', () => ({
      getSessionManager: () => ({ initialize: initializeSession }),
    }))

    const { call } = await import('./enhancedMemory.js')
    const result = await call(mock(() => {}) as never, {} as never, '')

    expect(React.isValidElement(result)).toBe(true)
    expect(initializeMemory).not.toHaveBeenCalled()
    expect(initializeSession).not.toHaveBeenCalled()
  })
})
