import { mkdtemp, rm, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { expect, test } from 'bun:test'

import { searchContentIndex } from './contentSearchIndex.js'

test('searchContentIndex returns matching file lines from SQLite FTS cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'free-code-fts-'))
  try {
    await writeFile(join(root, 'a.txt'), 'alpha beta\nnope\nalpha beta again\n')
    await writeFile(join(root, 'b.txt'), 'alpha gamma\n')

    const result = await searchContentIndex({
      root,
      query: 'alpha beta',
      limit: 5,
      offset: 0,
      outputMode: 'content',
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(result).toEqual({
      mode: 'content',
      matches: [
        {
          path: join(root, 'a.txt'),
          line: 1,
          text: 'alpha beta',
        },
        {
          path: join(root, 'a.txt'),
          line: 3,
          text: 'alpha beta again',
        },
      ],
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('searchContentIndex returns all matches when limit is 0', async () => {
  const root = await mkdtemp(join(tmpdir(), 'free-code-fts-'))
  try {
    await writeFile(join(root, 'a.txt'), 'alpha beta\nalpha beta again\n')
    await writeFile(join(root, 'b.txt'), 'alpha beta\n')

    const result = await searchContentIndex({
      root,
      query: 'alpha beta',
      limit: 0,
      offset: 0,
      outputMode: 'content',
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(result).toEqual({
      mode: 'content',
      matches: [
        { path: join(root, 'a.txt'), line: 1, text: 'alpha beta' },
        { path: join(root, 'a.txt'), line: 2, text: 'alpha beta again' },
        { path: join(root, 'b.txt'), line: 1, text: 'alpha beta' },
      ],
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('searchContentIndex count mode reports per-file counts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'free-code-fts-'))
  try {
    await writeFile(join(root, 'a.txt'), 'alpha beta\nalpha beta again\n')
    await writeFile(join(root, 'b.txt'), 'alpha beta\n')

    const result = await searchContentIndex({
      root,
      query: 'alpha beta',
      limit: 5,
      offset: 0,
      outputMode: 'count',
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(result).toEqual({
      mode: 'count',
      counts: [
        { path: join(root, 'a.txt'), count: 2 },
        { path: join(root, 'b.txt'), count: 1 },
      ],
      numMatches: 3,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('searchContentIndex files_with_matches mode returns all files when limit is 0', async () => {
  const root = await mkdtemp(join(tmpdir(), 'free-code-fts-'))
  try {
    const aPath = join(root, 'a.txt')
    const bPath = join(root, 'b.txt')
    await writeFile(aPath, 'alpha beta\n')
    await writeFile(bPath, 'alpha beta\n')

    const result = await searchContentIndex({
      root,
      query: 'alpha beta',
      limit: 0,
      offset: 0,
      outputMode: 'files_with_matches',
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(result.mode).toBe('files_with_matches')
    expect((result as any).paths.toSorted()).toEqual([aPath, bPath])
    expect(result.appliedLimit).toBeUndefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('searchContentIndex count mode returns all files when limit is 0', async () => {
  const root = await mkdtemp(join(tmpdir(), 'free-code-fts-'))
  try {
    const aPath = join(root, 'a.txt')
    const bPath = join(root, 'b.txt')
    await writeFile(aPath, 'alpha beta\nalpha beta\n')
    await writeFile(bPath, 'alpha beta\n')

    const result = await searchContentIndex({
      root,
      query: 'alpha beta',
      limit: 0,
      offset: 0,
      outputMode: 'count',
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(result).toEqual({
      mode: 'count',
      counts: [
        { path: aPath, count: 2 },
        { path: bPath, count: 1 },
      ],
      numMatches: 3,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('searchContentIndex content mode reports appliedLimit when truncated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'free-code-fts-'))
  try {
    const aPath = join(root, 'a.txt')
    await writeFile(aPath, 'alpha beta\nalpha beta again\nalpha beta third\n')

    const result = await searchContentIndex({
      root,
      query: 'alpha beta',
      limit: 2,
      offset: 0,
      outputMode: 'content',
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(result).toEqual({
      mode: 'content',
      matches: [
        { path: aPath, line: 1, text: 'alpha beta' },
        { path: aPath, line: 2, text: 'alpha beta again' },
      ],
      appliedLimit: 2,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('searchContentIndex skips stale indexed paths after files disappear', async () => {
  const root = await mkdtemp(join(tmpdir(), 'free-code-fts-'))
  try {
    const stalePath = join(root, 'stale.txt')
    const freshPath = join(root, 'fresh.txt')
    await writeFile(stalePath, 'alpha beta\n')
    await writeFile(freshPath, 'alpha beta\n')

    await searchContentIndex({
      root,
      query: 'alpha beta',
      limit: 5,
      offset: 0,
      outputMode: 'files_with_matches',
      abortSignal: AbortSignal.timeout(5_000),
    })

    await unlink(stalePath)

    const result = await searchContentIndex({
      root,
      query: 'alpha beta',
      limit: 5,
      offset: 0,
      outputMode: 'files_with_matches',
      abortSignal: AbortSignal.timeout(5_000),
    })

    expect(result).toEqual({
      mode: 'files_with_matches',
      paths: [freshPath],
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
