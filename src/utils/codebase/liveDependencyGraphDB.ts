import { Database } from 'bun:sqlite'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { logForDebugging } from '../debug.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'

/**
 * Live Dependency Graph Database
 * SQLite-backed codebase intelligence inspired by SoulForge's Soul Map
 */

export interface FileRecord {
  id?: number
  path: string
  hash: string
  size: number
  mtime: number
  language: string | null
  created_at?: number
  updated_at?: number
}

export interface DependencyRecord {
  id?: number
  from_file_id: number
  to_file_id: number
  dependency_type: 'import' | 'require' | 'include' | 'reference'
  line_number: number | null
  created_at?: number
}

export interface SymbolRecord {
  id?: number
  file_id: number
  name: string
  type: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'export'
  start_line: number
  end_line: number | null
  scope: string | null
  exported: boolean
  created_at?: number
}

export interface PageRankScore {
  file_id: number
  score: number
  rank: number
  calculated_at: number
}

export interface SemanticSummary {
  file_id: number
  summary: string
  tokens_used: number
  model_version: string
  created_at: number
}

export interface GitCoChange {
  id?: number
  file1_id: number
  file2_id: number
  cochange_count: number
  last_commit_hash: string
  updated_at: number
}

class LiveDependencyGraphDB {
  private db: Database
  private dbPath: string

  constructor(dbPath?: string) {
    this.dbPath = dbPath || this.getDefaultDbPath()
    this.db = new Database(this.dbPath)
    this.initializeSchema()
  }

  private getDefaultDbPath(): string {
    const cacheDir = join(getClaudeConfigHomeDir(), 'cache', 'dependency-graph')
    if (!existsSync(cacheDir)) {
      mkdir(cacheDir, { recursive: true }).catch(console.error)
    }
    return join(cacheDir, 'live-dependency-graph.db')
  }

  private initializeSchema(): void {
    // Enable WAL mode for better concurrency
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA cache_size = 10000')
    this.db.exec('PRAGMA foreign_keys = ON')

    // Create core tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        hash TEXT,
        size INTEGER,
        mtime INTEGER,
        language TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        to_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        dependency_type TEXT NOT NULL CHECK (dependency_type IN ('import', 'require', 'include', 'reference')),
        line_number INTEGER,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(from_file_id, to_file_id, dependency_type, line_number)
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('function', 'class', 'variable', 'interface', 'type', 'export')),
        start_line INTEGER NOT NULL,
        end_line INTEGER,
        scope TEXT,
        exported BOOLEAN DEFAULT FALSE,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pagerank_scores (
        file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        score REAL NOT NULL,
        rank INTEGER,
        calculated_at INTEGER DEFAULT (unixepoch())
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_summaries (
        file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        tokens_used INTEGER,
        model_version TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS git_cochange (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file1_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        file2_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        cochange_count INTEGER DEFAULT 1,
        last_commit_hash TEXT,
        updated_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(file1_id, file2_id)
      )
    `)

    // Create indexes for performance
    this.createIndexes()

    // Create FTS5 table for full-text search
    this.createFtsTable()

    logForDebugging('[LiveDependencyGraph] Database schema initialized')
  }

  private createIndexes(): void {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)',
      'CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime DESC)',
      'CREATE INDEX IF NOT EXISTS idx_files_language ON files(language)',
      'CREATE INDEX IF NOT EXISTS idx_dependencies_from ON dependencies(from_file_id)',
      'CREATE INDEX IF NOT EXISTS idx_dependencies_to ON dependencies(to_file_id)',
      'CREATE INDEX IF NOT EXISTS idx_dependencies_type ON dependencies(dependency_type)',
      'CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id)',
      'CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)',
      'CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type)',
      'CREATE INDEX IF NOT EXISTS idx_symbols_exported ON symbols(exported)',
      'CREATE INDEX IF NOT EXISTS idx_pagerank_score ON pagerank_scores(score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_pagerank_rank ON pagerank_scores(rank)',
      'CREATE INDEX IF NOT EXISTS idx_git_cochange_files ON git_cochange(file1_id, file2_id)',
      'CREATE INDEX IF NOT EXISTS idx_git_cochange_count ON git_cochange(cochange_count DESC)',
    ]

    for (const indexSql of indexes) {
      this.db.exec(indexSql)
    }
  }

  private createFtsTable(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        path,
        symbols,
        summary,
        content=''
      )
    `)
  }

  // File operations
  upsertFile(file: Omit<FileRecord, 'id' | 'created_at' | 'updated_at'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO files (path, hash, size, mtime, language)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        hash = excluded.hash,
        size = excluded.size,
        mtime = excluded.mtime,
        language = excluded.language,
        updated_at = unixepoch()
      RETURNING id
    `)

    const result = stmt.get(file.path, file.hash, file.size, file.mtime, file.language) as { id: number }
    return result.id
  }

  getFileByPath(path: string): FileRecord | null {
    const stmt = this.db.prepare('SELECT * FROM files WHERE path = ?')
    return stmt.get(path) as FileRecord | null
  }

  getFileById(id: number): FileRecord | null {
    const stmt = this.db.prepare('SELECT * FROM files WHERE id = ?')
    return stmt.get(id) as FileRecord | null
  }

  // Dependency operations
  addDependency(dep: Omit<DependencyRecord, 'id' | 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO dependencies (from_file_id, to_file_id, dependency_type, line_number)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(dep.from_file_id, dep.to_file_id, dep.dependency_type, dep.line_number)
  }

  getDependenciesForFile(fileId: number): DependencyRecord[] {
    const stmt = this.db.prepare('SELECT * FROM dependencies WHERE from_file_id = ?')
    return stmt.all(fileId) as DependencyRecord[]
  }

  getDependents(fileId: number): DependencyRecord[] {
    const stmt = this.db.prepare('SELECT * FROM dependencies WHERE to_file_id = ?')
    return stmt.all(fileId) as DependencyRecord[]
  }

  // Symbol operations
  addSymbol(symbol: Omit<SymbolRecord, 'id' | 'created_at'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO symbols (file_id, name, type, start_line, end_line, scope, exported)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `)
    const result = stmt.get(
      symbol.file_id, symbol.name, symbol.type, symbol.start_line,
      symbol.end_line, symbol.scope, symbol.exported
    ) as { id: number }
    return result.id
  }

  getSymbolsForFile(fileId: number): SymbolRecord[] {
    const stmt = this.db.prepare('SELECT * FROM symbols WHERE file_id = ? ORDER BY start_line')
    return stmt.all(fileId) as SymbolRecord[]
  }

  clearSymbolsForFile(fileId: number): void {
    const stmt = this.db.prepare('DELETE FROM symbols WHERE file_id = ?')
    stmt.run(fileId)
  }

  // PageRank operations
  updatePageRankScore(fileId: number, score: number, rank: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pagerank_scores (file_id, score, rank, calculated_at)
      VALUES (?, ?, ?, unixepoch())
    `)
    stmt.run(fileId, score, rank)
  }

  getTopRankedFiles(limit: number = 50): Array<FileRecord & PageRankScore> {
    const stmt = this.db.prepare(`
      SELECT f.*, p.score, p.rank, p.calculated_at
      FROM files f
      JOIN pagerank_scores p ON f.id = p.file_id
      ORDER BY p.rank ASC
      LIMIT ?
    `)
    return stmt.all(limit) as Array<FileRecord & PageRankScore>
  }

  // Semantic summary operations
  updateSemanticSummary(fileId: number, summary: string, tokensUsed: number, modelVersion: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO semantic_summaries (file_id, summary, tokens_used, model_version, created_at)
      VALUES (?, ?, ?, ?, unixepoch())
    `)
    stmt.run(fileId, summary, tokensUsed, modelVersion)
  }

  getSemanticSummary(fileId: number): SemanticSummary | null {
    const stmt = this.db.prepare('SELECT * FROM semantic_summaries WHERE file_id = ?')
    return stmt.get(fileId) as SemanticSummary | null
  }

  // Git co-change operations
  updateCoChange(file1Id: number, file2Id: number, commitHash: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO git_cochange (file1_id, file2_id, cochange_count, last_commit_hash, updated_at)
      VALUES (?, ?, 1, ?, unixepoch())
      ON CONFLICT(file1_id, file2_id) DO UPDATE SET
        cochange_count = cochange_count + 1,
        last_commit_hash = excluded.last_commit_hash,
        updated_at = unixepoch()
    `)
    stmt.run(Math.min(file1Id, file2Id), Math.max(file1Id, file2Id), commitHash)
  }

  getCoChangedFiles(fileId: number, limit: number = 10): Array<FileRecord & { cochange_count: number }> {
    const stmt = this.db.prepare(`
      SELECT f.*, gc.cochange_count
      FROM files f
      JOIN git_cochange gc ON (f.id = gc.file1_id OR f.id = gc.file2_id)
      WHERE (gc.file1_id = ? OR gc.file2_id = ?) AND f.id != ?
      ORDER BY gc.cochange_count DESC
      LIMIT ?
    `)
    return stmt.all(fileId, fileId, fileId, limit) as Array<FileRecord & { cochange_count: number }>
  }

  // Search operations
  searchFiles(query: string, limit: number = 20): FileRecord[] {
    const stmt = this.db.prepare(`
      SELECT f.*
      FROM files_fts fts
      JOIN files f ON f.rowid = fts.rowid
      WHERE files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)
    return stmt.all(query, limit) as FileRecord[]
  }

  // Utility operations
  getStats(): { files: number; dependencies: number; symbols: number } {
    const fileCount = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }
    const depCount = this.db.prepare('SELECT COUNT(*) as count FROM dependencies').get() as { count: number }
    const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM symbols').get() as { count: number }

    return {
      files: fileCount.count,
      dependencies: depCount.count,
      symbols: symbolCount.count
    }
  }

  close(): void {
    this.db.close()
  }
}

// Singleton instance
let dbInstance: LiveDependencyGraphDB | null = null

export function getLiveDependencyGraphDB(): LiveDependencyGraphDB {
  if (!dbInstance) {
    dbInstance = new LiveDependencyGraphDB()
  }
  return dbInstance
}

export { LiveDependencyGraphDB }