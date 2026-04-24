import { describe, expect, it } from 'bun:test'

import { isRtkRewriteEnabled, rewriteWithRtk } from './rtkRewrite.js'

describe('isRtkRewriteEnabled', () => {
  it('reads FREE_CODE_RTK truthy values', () => {
    expect(isRtkRewriteEnabled({ FREE_CODE_RTK: 'true' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isRtkRewriteEnabled({ FREE_CODE_RTK: '1' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isRtkRewriteEnabled({ FREE_CODE_RTK: 'false' } as NodeJS.ProcessEnv)).toBe(false)
  })
})

describe('rewriteWithRtk', () => {
  it('returns original command when disabled', async () => {
    await expect(
      rewriteWithRtk('ls', {
        enabled: false,
        runRewrite: async () => {
          throw new Error('should not run')
        },
      }),
    ).resolves.toBe('ls')
  })

  it('skips multiline commands', async () => {
    await expect(
      rewriteWithRtk('printf hi\nprintf bye', {
        enabled: true,
        runRewrite: async () => {
          throw new Error('should not run')
        },
      }),
    ).resolves.toBe('printf hi\nprintf bye')
  })

  it('skips direct rtk commands', async () => {
    await expect(
      rewriteWithRtk('rtk rewrite ls', {
        enabled: true,
        runRewrite: async () => {
          throw new Error('should not run')
        },
      }),
    ).resolves.toBe('rtk rewrite ls')
  })

  it('skips direct calls to custom rtk binary', async () => {
    await expect(
      rewriteWithRtk('/usr/local/bin/rtk rewrite ls', {
        enabled: true,
        rtkBinary: '/usr/local/bin/rtk',
        runRewrite: async () => {
          throw new Error('should not run')
        },
      }),
    ).resolves.toBe('/usr/local/bin/rtk rewrite ls')
  })

  it('returns rewritten command on success', async () => {
    await expect(
      rewriteWithRtk('ls', {
        enabled: true,
        cwd: '/tmp/project',
        env: { FREE_CODE_RTK: 'true' } as NodeJS.ProcessEnv,
        runRewrite: async (binary, args, options) => {
          expect(binary).toBe('rtk')
          expect(args).toEqual(['rewrite', 'ls'])
          expect(options.cwd).toBe('/tmp/project')
          expect(options.env?.FREE_CODE_RTK).toBe('true')
          expect(options.timeoutMs).toBe(750)
          return {
            exitCode: 0,
            stdout: 'eza',
          }
        },
      }),
    ).resolves.toBe('eza')
  })

  it('falls back when rewrite fails', async () => {
    await expect(
      rewriteWithRtk('ls', {
        enabled: true,
        runRewrite: async () => {
          throw new Error('rtk missing')
        },
      }),
    ).resolves.toBe('ls')
  })

  it('falls back on empty rewrite output', async () => {
    await expect(
      rewriteWithRtk('ls', {
        enabled: true,
        runRewrite: async () => ({
          exitCode: 0,
          stdout: '   ',
        }),
      }),
    ).resolves.toBe('ls')
  })
})
