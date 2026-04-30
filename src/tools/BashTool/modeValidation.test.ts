import { describe, expect, it } from 'bun:test'

import type { ToolPermissionContext } from '../../Tool.js'
import { checkPermissionMode } from './modeValidation.js'

const ACCEPT_EDITS_CONTEXT = {
  mode: 'acceptEdits',
} as ToolPermissionContext

describe('checkPermissionMode', () => {
  it('passes through read-only commands in acceptEdits mode', () => {
    const result = checkPermissionMode(
      { command: 'grep TODO src/file.ts' } as never,
      ACCEPT_EDITS_CONTEXT,
    )

    expect(result.behavior).toBe('passthrough')
  })

  it('does not auto-allow read-only commands with shell redirection', () => {
    const result = checkPermissionMode(
      { command: 'grep TODO src/file.ts > out.txt' } as never,
      ACCEPT_EDITS_CONTEXT,
    )

    expect(result.behavior).toBe('passthrough')
  })

  it('auto-allows filesystem commands in acceptEdits mode before path validation', () => {
    const result = checkPermissionMode(
      { command: 'rm -rf /' } as never,
      ACCEPT_EDITS_CONTEXT,
    )

    expect(result.behavior).toBe('allow')
  })
})
