import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'

import type { Tool } from '../../Tool.js'
import { checkRuleBasedPermissions } from './permissions.js'
import type { ToolPermissionContext } from '../../types/permissions.js'

function createPermissionContext(
  mode: ToolPermissionContext['mode'],
): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: mode === 'bypassPermissions',
  }
}

function createToolWithPermissionResult(
  permissionResult: Awaited<ReturnType<NonNullable<Tool['checkPermissions']>>>,
): Tool {
  return {
    name: 'test-tool',
    description: 'test',
    inputSchema: z.object({ value: z.string() }),
    async call() {
      return { type: 'result', data: '' }
    },
    async checkPermissions() {
      return permissionResult
    },
  } as Tool
}

function createContext(mode: ToolPermissionContext['mode']) {
  return {
    getAppState: () => ({
      toolPermissionContext: createPermissionContext(mode),
    }),
  } as Parameters<typeof checkRuleBasedPermissions>[2]
}

describe('checkRuleBasedPermissions bypass mode', () => {
  it('ignores content-specific ask rules in bypassPermissions mode', async () => {
    const tool = createToolWithPermissionResult({
      behavior: 'ask',
      message: 'ask',
      decisionReason: {
        type: 'rule',
        rule: {
          source: 'session',
          ruleBehavior: 'ask',
          ruleValue: {
            toolName: 'test-tool',
            ruleContent: 'dangerous:*',
          },
        },
      },
    })

    const result = await checkRuleBasedPermissions(
      tool,
      { value: 'x' },
      createContext('bypassPermissions'),
    )

    expect(result).toBeNull()
  })

  it('ignores non-deny safety prompts in bypassPermissions mode', async () => {
    const tool = createToolWithPermissionResult({
      behavior: 'ask',
      message: 'blocked',
      decisionReason: {
        type: 'safetyCheck',
        reason: 'suspicious path',
        classifierApprovable: false,
      },
    })

    const result = await checkRuleBasedPermissions(
      tool,
      { value: 'x' },
      createContext('bypassPermissions'),
    )

    expect(result).toBeNull()
  })

  it('still returns deny decisions in bypassPermissions mode', async () => {
    const tool = createToolWithPermissionResult({
      behavior: 'deny',
      message: 'hard block',
      decisionReason: {
        type: 'other',
        reason: 'protected system path',
      },
    })

    const result = await checkRuleBasedPermissions(
      tool,
      { value: 'x' },
      createContext('bypassPermissions'),
    )

    expect(result).not.toBeNull()
    expect(result?.behavior).toBe('deny')
  })
})
