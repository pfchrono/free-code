import { createHash } from 'crypto'
import { mkdir, readFile, stat } from 'fs/promises'
import { isAbsolute, join, relative } from 'path'
import { Database } from 'bun:sqlite'

import { getClaudeConfigHomeDir } from './envUtils.js'
import { logForDebugging } from './debug.js'
import { ripGrep } from './ripgrep.js'

const MAX_INDEXED_FILES = 10_000
const MAX_INDEXED_FILE_BYTES = 512 * 1024

export type ContentSearchIndexOptions = {
  root: string
  query: string
  glob?: string
  globs?: string[]
  type?: string
  limit: number
  offset: number
  outputMode: 'content' | 'files_with_matches' | 'count'
  abortSignal: AbortSignal
}

export type ContentSearchIndexMatch = {
  path: string
  line: number
  text: string
}

export type ContentSearchIndexResult =
  | {
      mode: 'content'
      matches: ContentSearchIndexMatch[]
      appliedLimit?: number
    }
  | {
      mode: 'files_with_matches'
      paths: string[]
      appliedLimit?: number
    }
  | {
      mode: 'count'
      counts: Array<{ path: string; count: number }>
      numMatches: number
      appliedLimit?: number
    }

type FileRow = {
  id: number
  path: string
  size: number
  mtime: number
}

let dbCache: { key: string; db: Database } | null = null

function dbKeyForRoot(root: string): string {
  return createHash('sha256').update(root).digest('hex').slice(0, 24)
}

async function openContentSearchDb(root: string): Promise<Database> {
  const key = dbKeyForRoot(root)
  if (dbCache?.key === key) return dbCache.db

  dbCache?.db.close()
  const dir = join(getClaudeConfigHomeDir(), 'cache', 'content-search')
  await mkdir(dir, { recursive: true })
  const db = new Database(join(dir, `${key}.db`))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      size INTEGER NOT NULL,
      mtime REAL NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      path,
      content,
      content=''
    )
  `)
  dbCache = { key, db }
  return db
}

function ftsTokens(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}_]+/u)
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .slice(0, 8)
}

function ftsQuery(tokens: string[]): string {
  return tokens.map(token => `"${token.replaceAll('"', '""')}"`).join(' ')
}

function containsAllTokens(line: string, tokens: string[]): boolean {
  const lower = line.toLowerCase()
  return tokens.every(token => lower.includes(token.toLowerCase()))
}

function sliceByLimit<T>(
  items: T[],
  offset: number,
  limit: number,
): { items: T[]; appliedLimit?: number } {
  if (limit === 0) {
    return { items: items.slice(offset) }
  }

  const sliced = items.slice(offset, offset + limit)
  const appliedLimit = items.length - offset > limit ? limit : undefined
  return { items: sliced, appliedLimit }
}

function buildFileListArgs(options: ContentSearchIndexOptions): string[] {
  const args = [
    '--files',
    '--hidden',
    '--glob',
    '!.git',
    '--glob',
    '!.svn',
    '--glob',
    '!.hg',
    '--glob',
    '!.bzr',
    '--glob',
    '!.jj',
    '--glob',
    '!.sl',
  ]
  if (options.type) args.push('--type', options.type)
  for (const globPattern of options.globs ?? []) {
    args.push('--glob', globPattern)
  }
  if (options.glob) {
    for (const globPattern of options.glob.split(/\s+/).filter(Boolean)) {
      args.push('--glob', globPattern)
    }
  }
  return args
}

async function indexFile(db: Database, root: string, path: string): Promise<void> {
  const fileStat = await stat(join(root, path)).catch(() => null)
  if (!fileStat?.isFile()) return
  if (fileStat.size > MAX_INDEXED_FILE_BYTES) return

  const existing = db
    .prepare('SELECT id, path, size, mtime FROM files WHERE path = ?')
    .get(path) as FileRow | null
  if (
    existing &&
    existing.size === fileStat.size &&
    existing.mtime === fileStat.mtimeMs
  ) {
    return
  }

  const content = await readFile(join(root, path), 'utf8').catch(() => null)
  if (content === null || content.includes('\0')) return

  const row = db
    .prepare(`
      INSERT INTO files (path, size, mtime)
      VALUES (?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        size = excluded.size,
        mtime = excluded.mtime,
        updated_at = unixepoch()
      RETURNING id
    `)
    .get(path, fileStat.size, fileStat.mtimeMs) as { id: number }

  db.prepare('DELETE FROM files_fts WHERE rowid = ?').run(row.id)
  db.prepare('INSERT INTO files_fts(rowid, path, content) VALUES (?, ?, ?)').run(
    row.id,
    path,
    content,
  )
}

export async function searchContentIndex(
  options: ContentSearchIndexOptions,
): Promise<ContentSearchIndexResult> {
  const tokens = ftsTokens(options.query)
  if (tokens.length === 0) {
    if (options.outputMode === 'content') {
      return { mode: 'content', matches: [] }
    }
    if (options.outputMode === 'count') {
      return { mode: 'count', counts: [], numMatches: 0 }
    }
    return { mode: 'files_with_matches', paths: [] }
  }

  const db = await openContentSearchDb(options.root)
  const files = await ripGrep(
    buildFileListArgs(options),
    options.root,
    options.abortSignal,
  )
  const indexedFiles = files
    .map(file => (isAbsolute(file) ? relative(options.root, file) : file))
    .slice(0, MAX_INDEXED_FILES)
  for (const file of indexedFiles) {
    if (options.abortSignal.aborted) break
    await indexFile(db, options.root, file)
  }

  logForDebugging(
    `[ContentSearchIndex] indexed/checked ${indexedFiles.length} file(s) for ${options.root}`,
  )

  const currentPaths = new Set(indexedFiles)
  const fileRows = (
    db
      .prepare(`
        SELECT files.path
        FROM files_fts
        JOIN files ON files.id = files_fts.rowid
        WHERE files_fts MATCH ?
        ORDER BY rank
      `)
      .all(ftsQuery(tokens)) as Array<{ path: string }>
  ).filter(row => currentPaths.has(row.path))

  if (options.outputMode === 'files_with_matches') {
    const { items, appliedLimit } = sliceByLimit(
      fileRows,
      options.offset,
      options.limit,
    )
    return {
      mode: 'files_with_matches',
      paths: items.map(row => join(options.root, row.path)),
      appliedLimit,
    }
  }

  if (options.outputMode === 'count') {
    const { items, appliedLimit } = sliceByLimit(
      fileRows,
      options.offset,
      options.limit,
    )
    const counts: Array<{ path: string; count: number }> = []
    let numMatches = 0
    for (const row of items) {
      const content = await readFile(join(options.root, row.path), 'utf8').catch(
        () => null,
      )
      if (content === null) continue
      let count = 0
      for (const line of content.split(/\r?\n/)) {
        if (containsAllTokens(line, tokens)) count += 1
      }
      if (count === 0) continue
      counts.push({ path: join(options.root, row.path), count })
      numMatches += count
    }
    return { mode: 'count', counts, numMatches, appliedLimit }
  }

  const matches: ContentSearchIndexMatch[] = []
  let skippedMatches = 0
  for (const row of fileRows) {
    const content = await readFile(join(options.root, row.path), 'utf8').catch(
      () => null,
    )
    if (content === null) continue
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (!containsAllTokens(line, tokens)) continue
      if (skippedMatches < options.offset) {
        skippedMatches += 1
        continue
      }
      if (options.limit !== 0 && matches.length >= options.limit) {
        return { mode: 'content', matches, appliedLimit: options.limit }
      }
      matches.push({ path: join(options.root, row.path), line: i + 1, text: line })
    }
  }

  return { mode: 'content', matches }
}
