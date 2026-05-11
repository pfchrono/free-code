import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockExecFileNoThrowWithCwd = mock()
const mockFindExecutable = mock()

mock.module('./execFileNoThrow.js', () => ({
  execFileNoThrowWithCwd: mockExecFileNoThrowWithCwd,
}))

mock.module('./findExecutable.js', () => ({
  findExecutable: mockFindExecutable,
}))

describe('searchWithAstGrep', () => {
  beforeEach(() => {
    mock.restore()
    mockExecFileNoThrowWithCwd.mockReset()
    mockFindExecutable.mockReset()
  })

  afterEach(() => {
    mock.restore()
  })

  test('returns unavailable message when ast-grep is not installed', async () => {
    mockFindExecutable.mockImplementation((command: string) => ({ cmd: command }))

    const { searchWithAstGrep } = await import(`./structuralSearch.ts?missing=${Date.now()}`)
    const result = await searchWithAstGrep({
      root: '/tmp/project',
      pattern: 'function $NAME() { $$$ }',
      limit: 10,
      offset: 0,
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(result).toEqual({
      matches: [],
      unavailable:
        'Structural search requires ast-grep (`sg` or `ast-grep`) on PATH.',
    })
  })

  test('applies offset and limit to parsed ast-grep matches', async () => {
    mockFindExecutable.mockImplementation((command: string) => ({
      cmd: command === 'ast-grep' ? '/usr/bin/ast-grep' : command,
    }))
    mockExecFileNoThrowWithCwd.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          file: '/tmp/project/a.ts',
          range: { start: { line: 0 } },
          lines: 'first()\n',
        },
        {
          file: '/tmp/project/b.ts',
          range: { start: { line: 4 } },
          lines: 'second()\n',
        },
        {
          file: '/tmp/project/c.ts',
          range: { start: { line: 9 } },
          lines: 'third()\n',
        },
      ]),
      stderr: '',
      error: '',
    })

    const { searchWithAstGrep } = await import(`./structuralSearch.ts?limit=${Date.now()}`)
    const result = await searchWithAstGrep({
      root: '/tmp/project',
      pattern: 'function $NAME() { $$$ }',
      language: 'ts',
      globs: ['src/**/*.ts'],
      glob: '!**/*.test.ts',
      limit: 1,
      offset: 1,
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(mockExecFileNoThrowWithCwd).toHaveBeenCalledWith(
      '/usr/bin/ast-grep',
      [
        '--json',
        '-p',
        'function $NAME() { $$$ }',
        '-l',
        'ts',
        '--globs',
        'src/**/*.ts',
        '--globs',
        '!**/*.test.ts',
        '/tmp/project',
      ],
      {
        cwd: '/tmp/project',
        abortSignal: expect.any(AbortSignal),
        timeout: 20_000,
        maxBuffer: 2_000_000,
      },
    )

    expect(result).toEqual({
      matches: [{ path: '/tmp/project/b.ts', line: 5, text: 'second()' }],
      appliedLimit: 1,
    })
  })
})
