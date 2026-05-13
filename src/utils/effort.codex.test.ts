import { afterEach, describe, expect, test } from 'bun:test'
import { executeEffort } from '../commands/effort/effort.js'
import {
  openAIEffortToStandard,
  standardEffortToOpenAI,
} from './effort.js'

const originalUserType = process.env.USER_TYPE
const originalEffortEnv = process.env.CLAUDE_CODE_EFFORT_LEVEL

afterEach(() => {
  if (originalUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalUserType
  }
  if (originalEffortEnv === undefined) {
    delete process.env.CLAUDE_CODE_EFFORT_LEVEL
  } else {
    process.env.CLAUDE_CODE_EFFORT_LEVEL = originalEffortEnv
  }
})

describe('OpenAI/Codex effort aliases', () => {
  test('maps standard max to OpenAI xhigh', () => {
    expect(standardEffortToOpenAI('low')).toBe('low')
    expect(standardEffortToOpenAI('medium')).toBe('medium')
    expect(standardEffortToOpenAI('high')).toBe('high')
    expect(standardEffortToOpenAI('max')).toBe('xhigh')
  })

  test('maps OpenAI xhigh to standard max', () => {
    expect(openAIEffortToStandard('xhigh')).toBe('max')
  })

  test('/effort xhigh applies max as a session-safe alias', () => {
    delete process.env.USER_TYPE
    delete process.env.CLAUDE_CODE_EFFORT_LEVEL

    const result = executeEffort('xhigh')

    expect(result.effortUpdate?.value).toBe('max')
    expect(result.message).toContain('Set effort level to max')
  })
})
