import { afterEach, describe, expect, it } from 'bun:test'

import { HookCommandSchema } from '../schemas/hooks.js'
import { setIsInteractive } from '../bootstrap/state.js'
import type { AppState } from '../state/AppState.js'
import type { ToolUseContext } from '../Tool.js'
import { executePreToolHooks, getEffectiveCommandHookCommand } from './hooks.js'

afterEach(() => {
  setIsInteractive(true)
})

describe('hook command Windows override', () => {
  it('keeps the default command on non-Windows platforms', () => {
    const hook = {
      type: 'command',
      command: 'bash ./hooks/pre.sh',
      commandWindows: 'powershell -File .\\hooks\\pre.ps1',
    } as const

    expect(getEffectiveCommandHookCommand(hook, false)).toBe(
      'bash ./hooks/pre.sh',
    )
  })

  it('uses commandWindows on Windows platforms', () => {
    const hook = {
      type: 'command',
      command: 'bash ./hooks/pre.sh',
      commandWindows: 'powershell -File .\\hooks\\pre.ps1',
    } as const

    expect(getEffectiveCommandHookCommand(hook, true)).toBe(
      'powershell -File .\\hooks\\pre.ps1',
    )
  })

  it('accepts snake_case command_windows for config parity', () => {
    const parsed = HookCommandSchema().parse({
      type: 'command',
      command: 'bash ./hooks/pre.sh',
      command_windows: 'powershell -File .\\hooks\\pre.ps1',
    })

    expect(getEffectiveCommandHookCommand(parsed, true)).toBe(
      'powershell -File .\\hooks\\pre.ps1',
    )
  })
})

describe('PreToolUse updatedInput aggregation', () => {
  it('preserves earlier updatedInput when a later allow hook has no rewrite', async () => {
    setIsInteractive(false)

    const sessionId = 'test-pretool-updated-input'
    const appState = {
      sessionHooks: new Map([
        [
          sessionId,
          {
            hooks: {
              PreToolUse: [
                {
                  matcher: 'Bash',
                  hooks: [
                    {
                      hook: {
                        type: 'command',
                        command:
                          'printf \'%s\\n\' \'{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"command":"echo rewritten"}}}\'',
                      },
                    },
                    {
                      hook: {
                        type: 'command',
                        command:
                          'sleep 0.05; printf \'%s\\n\' \'{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\'',
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      ]),
    } as unknown as AppState
    const toolUseContext = {
      agentId: sessionId,
      getAppState: () => appState,
      abortController: new AbortController(),
      options: {
        isNonInteractiveSession: true,
        tools: [],
      },
    } as unknown as ToolUseContext

    const permissionResults = []
    for await (const result of executePreToolHooks(
      'Bash',
      'toolu_test',
      { command: 'echo original' },
      toolUseContext,
    )) {
      if (result.permissionBehavior !== undefined) {
        permissionResults.push(result)
      }
    }

    expect(permissionResults.at(-1)).toMatchObject({
      permissionBehavior: 'allow',
      updatedInput: { command: 'echo rewritten' },
    })
  })
})
