import { afterAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { installHooks, resolveHooksDir } from './setup-git-hooks.ts'

const testRoot = mkdtempSync(join(tmpdir(), 'free-code-setup-git-hooks-'))

function runGit(cwd: string, args: string[]) {
  const result = Bun.spawnSync(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim() || `git ${args.join(' ')} failed`)
  }

  return new TextDecoder().decode(result.stdout).trim()
}

function createRepo(name: string) {
  const repoDir = join(testRoot, name)
  mkdirSync(repoDir, { recursive: true })
  runGit(testRoot, ['init', repoDir])
  runGit(repoDir, ['config', 'user.name', 'Free Code Test'])
  runGit(repoDir, ['config', 'user.email', 'test@example.com'])
  writeFileSync(join(repoDir, 'README.md'), '# test\n')
  runGit(repoDir, ['add', 'README.md'])
  runGit(repoDir, ['commit', '-m', 'init'])
  return repoDir
}

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

describe('setup-git-hooks', () => {
  test('installs commit-msg hook and removes prepare-commit-msg hook', () => {
    const repoDir = createRepo('repo-basic')
    const hooksDir = resolveHooksDir(repoDir)
    const staleHook = join(hooksDir, 'prepare-commit-msg')

    writeFileSync(staleHook, '#!/bin/sh\nexit 0\n')
    installHooks(repoDir)

    expect(existsSync(staleHook)).toBe(false)
    expect(readdirSync(hooksDir)).toEqual(expect.arrayContaining(['pre-commit', 'commit-msg', 'post-commit']))
    expect(readFileSync(join(hooksDir, 'pre-commit'), 'utf-8')).not.toContain('release:metadata:pre-commit')
    expect(readFileSync(join(hooksDir, 'commit-msg'), 'utf-8')).toContain('release:metadata:commit-msg')
  })

  test('worktree resolves shared hooks dir and installs commit-msg hook', () => {
    const repoDir = createRepo('repo-worktree')
    const worktreeDir = join(testRoot, 'repo-worktree-feature')

    runGit(repoDir, ['worktree', 'add', '-b', 'feature', worktreeDir, 'HEAD'])

    const repoHooksDir = resolveHooksDir(repoDir)
    const worktreeHooksDir = resolveHooksDir(worktreeDir)

    expect(worktreeHooksDir).toBe(repoHooksDir)

    installHooks(worktreeDir)

    expect(readdirSync(worktreeHooksDir)).toEqual(expect.arrayContaining(['pre-commit', 'commit-msg', 'post-commit']))
    expect(readFileSync(join(repoHooksDir, 'commit-msg'), 'utf-8')).toContain('release:metadata:commit-msg')
  })
})
