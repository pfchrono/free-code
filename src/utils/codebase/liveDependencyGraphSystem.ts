import { watch, type FSWatcher } from 'chokidar'
import { readFile } from 'fs/promises'
import { resolve, relative } from 'path'
import { logForDebugging } from '../debug.js'
import { getCwd } from '../cwd.js'
import { getLiveDependencyGraphDB, type LiveDependencyGraphDB } from './liveDependencyGraphDB.js'
import { getDependencyParser, type DependencyParser } from './dependencyParser.js'
import { createPageRankCalculator, type PageRankCalculator } from './pageRank.js'

/**
 * Live Dependency Graph System Coordinator
 * Orchestrates real-time codebase analysis with SQLite-backed PageRank
 * Inspired by SoulForge's Soul Map architecture
 */

export interface LiveDependencyGraphConfig {
  enabled: boolean
  watchPatterns: string[]
  ignorePatterns: string[]
  pageRankConfig: {
    dampingFactor: number
    maxIterations: number
    convergenceThreshold: number
    recencyBoost: number
    recencyWindow: number
  }
  semanticSummaries: {
    enabled: boolean
    maxTokensPerSummary: number
    cacheTtlHours: number
  }
  contextSelection: {
    maxFiles: number
    relevanceWeight: number
    pageRankWeight: number
    recencyWeight: number
  }
  batchProcessing: {
    enabled: boolean
    batchSize: number
    debounceMs: number
  }
}

const DEFAULT_CONFIG: LiveDependencyGraphConfig = {
  enabled: true,
  watchPatterns: [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.py',
    '**/*.go',
    '**/*.rs',
    '**/*.java',
    '**/*.cpp',
    '**/*.hpp',
    '**/*.c',
    '**/*.h',
  ],
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.test.*',
    '**/*.spec.*',
  ],
  pageRankConfig: {
    dampingFactor: 0.85,
    maxIterations: 100,
    convergenceThreshold: 0.0001,
    recencyBoost: 1.5,
    recencyWindow: 7 * 24 * 60 * 60, // 7 days
  },
  semanticSummaries: {
    enabled: false, // Disabled by default to avoid API calls
    maxTokensPerSummary: 100,
    cacheTtlHours: 24,
  },
  contextSelection: {
    maxFiles: 50,
    relevanceWeight: 0.3,
    pageRankWeight: 0.4,
    recencyWeight: 0.3,
  },
  batchProcessing: {
    enabled: true,
    batchSize: 10,
    debounceMs: 1000,
  },
}

export class LiveDependencyGraphSystem {
  private config: LiveDependencyGraphConfig
  private db: LiveDependencyGraphDB
  private parser: DependencyParser
  private pageRank: PageRankCalculator
  private watcher: FSWatcher | null = null
  private isInitialized = false
  private processingQueue: Set<string> = new Set()
  private debounceTimer: NodeJS.Timeout | null = null
  private recentlyEditedFiles: number[] = []

  constructor(config: Partial<LiveDependencyGraphConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.db = getLiveDependencyGraphDB()
    this.parser = getDependencyParser()
    this.pageRank = createPageRankCalculator(this.db, this.config.pageRankConfig)
  }

  /**
   * Initialize the Live Dependency Graph system
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logForDebugging('[LiveDependencyGraph] System disabled in config')
      return
    }

    if (this.isInitialized) {
      logForDebugging('[LiveDependencyGraph] Already initialized')
      return
    }

    const startTime = Date.now()
    const cwd = getCwd()

    try {
      // Start file watching
      await this.startFileWatcher(cwd)

      // Perform initial scan of existing files
      await this.performInitialScan(cwd)

      // Calculate initial PageRank scores
      await this.pageRank.calculatePageRank()

      this.isInitialized = true
      const duration = Date.now() - startTime

      const stats = this.db.getStats()
      logForDebugging(
        `[LiveDependencyGraph] Initialized in ${duration}ms - ${stats.files} files, ${stats.dependencies} dependencies, ${stats.symbols} symbols`
      )
    } catch (error) {
      logForDebugging('[LiveDependencyGraph] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Shutdown the system and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this.isInitialized = false
    logForDebugging('[LiveDependencyGraph] System shutdown complete')
  }

  /**
   * Get recommended files for context based on PageRank and relevance
   */
  getRecommendedContext(
    conversationTerms: string[] = [],
    limit: number = this.config.contextSelection.maxFiles
  ): Array<{ path: string; score: number; rank: number; summary?: string }> {
    if (!this.isInitialized) {
      return []
    }

    const recommendations = this.pageRank.getRecommendedFiles(
      conversationTerms,
      this.recentlyEditedFiles,
      limit
    )

    return recommendations.map(file => ({
      path: file.path,
      score: file.score,
      rank: file.rank,
      summary: this.getSemanticSummary(file.id!),
    }))
  }

  /**
   * Get dependency information for a file
   */
  getFileDependencies(filePath: string): {
    dependencies: string[]
    dependents: string[]
    symbols: Array<{ name: string; type: string; line: number }>
    blastRadius: number
  } {
    const file = this.db.getFileByPath(resolve(filePath))
    if (!file) {
      return { dependencies: [], dependents: [], symbols: [], blastRadius: 0 }
    }

    const dependencies = this.db.getDependenciesForFile(file.id!)
      .map(dep => {
        const targetFile = this.db.getFileById(dep.to_file_id)
        return targetFile ? targetFile.path : ''
      })
      .filter(Boolean)

    const dependents = this.db.getDependents(file.id!)
      .map(dep => {
        const sourceFile = this.db.getFileById(dep.from_file_id)
        return sourceFile ? sourceFile.path : ''
      })
      .filter(Boolean)

    const symbols = this.db.getSymbolsForFile(file.id!)
      .map(symbol => ({
        name: symbol.name,
        type: symbol.type,
        line: symbol.start_line,
      }))

    const blastRadius = this.pageRank.calculateBlastRadius(file.id!)

    return {
      dependencies,
      dependents,
      symbols,
      blastRadius: blastRadius.totalImpact,
    }
  }

  /**
   * Search files using FTS
   */
  searchFiles(query: string, limit: number = 20): Array<{ path: string; score?: number }> {
    if (!this.isInitialized) {
      return []
    }

    const results = this.db.searchFiles(query, limit)
    return results.map(file => ({
      path: file.path,
      score: undefined, // TODO: Implement search scoring
    }))
  }

  /**
   * Get system statistics
   */
  getStats(): {
    files: number
    dependencies: number
    symbols: number
    isInitialized: boolean
    lastPageRankCalculation?: number
  } {
    const dbStats = this.db.getStats()

    return {
      ...dbStats,
      isInitialized: this.isInitialized,
      lastPageRankCalculation: undefined, // TODO: Track this
    }
  }

  private async startFileWatcher(cwd: string): Promise<void> {
    this.watcher = watch(this.config.watchPatterns, {
      cwd,
      ignored: this.config.ignorePatterns,
      ignoreInitial: false,
      persistent: true,
    })

    this.watcher.on('add', (filePath) => this.handleFileChange(filePath, 'add'))
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath, 'change'))
    this.watcher.on('unlink', (filePath) => this.handleFileChange(filePath, 'unlink'))

    logForDebugging('[LiveDependencyGraph] File watcher started')
  }

  private async performInitialScan(cwd: string): Promise<void> {
    logForDebugging('[LiveDependencyGraph] Starting initial scan...')

    // The file watcher with ignoreInitial: false will trigger add events
    // for all existing files, so we don't need a separate scan
  }

  private async handleFileChange(filePath: string, event: 'add' | 'change' | 'unlink'): Promise<void> {
    const fullPath = resolve(filePath)

    if (!this.parser.isSupported(fullPath)) {
      return
    }

    if (event === 'unlink') {
      // Handle file deletion
      const file = this.db.getFileByPath(fullPath)
      if (file) {
        // TODO: Implement file deletion handling
        logForDebugging(`[LiveDependencyGraph] File deleted: ${filePath}`)
      }
      return
    }

    // Add to processing queue
    this.processingQueue.add(fullPath)

    // Track recently edited files
    const file = this.db.getFileByPath(fullPath)
    if (file && event === 'change') {
      this.recentlyEditedFiles = [file.id!, ...this.recentlyEditedFiles.slice(0, 9)] // Keep last 10
    }

    // Debounced batch processing
    if (this.config.batchProcessing.enabled) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }

      this.debounceTimer = setTimeout(() => {
        this.processBatch()
      }, this.config.batchProcessing.debounceMs)
    } else {
      await this.processFile(fullPath)
    }
  }

  private async processBatch(): Promise<void> {
    if (this.processingQueue.size === 0) return

    const filesToProcess = Array.from(this.processingQueue)
    this.processingQueue.clear()

    logForDebugging(`[LiveDependencyGraph] Processing batch of ${filesToProcess.length} files`)

    const changedFileIds: number[] = []

    // Process files in smaller chunks
    for (let i = 0; i < filesToProcess.length; i += this.config.batchProcessing.batchSize) {
      const chunk = filesToProcess.slice(i, i + this.config.batchProcessing.batchSize)

      for (const filePath of chunk) {
        const fileId = await this.processFile(filePath)
        if (fileId) {
          changedFileIds.push(fileId)
        }
      }
    }

    // Recalculate PageRank for changed files
    if (changedFileIds.length > 0) {
      await this.pageRank.calculateIncrementalUpdate(changedFileIds)
    }
  }

  private async processFile(filePath: string): Promise<number | null> {
    try {
      const content = await readFile(filePath, 'utf-8')
      const parsed = this.parser.parseFile(filePath, content)

      if (!parsed) {
        return null
      }

      // Update file record
      const fileId = this.db.upsertFile(parsed.file)

      // Clear and update symbols
      this.db.clearSymbolsForFile(fileId)
      for (const symbol of parsed.symbols) {
        this.db.addSymbol({ ...symbol, file_id: fileId })
      }

      // Process dependencies
      for (const dep of parsed.dependencies) {
        // Try to resolve the dependency path to a file ID
        const depFile = this.db.getFileByPath(dep.path)
        if (depFile) {
          this.db.addDependency({
            from_file_id: fileId,
            to_file_id: depFile.id!,
            dependency_type: dep.type,
            line_number: dep.line,
          })
        }
      }

      return fileId
    } catch (error) {
      logForDebugging(`[LiveDependencyGraph] Error processing file ${filePath}:`, error)
      return null
    }
  }

  private getSemanticSummary(fileId: number): string | undefined {
    if (!this.config.semanticSummaries.enabled) {
      return undefined
    }

    const summary = this.db.getSemanticSummary(fileId)
    return summary?.summary
  }
}

// Singleton instance
let systemInstance: LiveDependencyGraphSystem | null = null

export function getLiveDependencyGraphSystem(): LiveDependencyGraphSystem {
  if (!systemInstance) {
    systemInstance = new LiveDependencyGraphSystem()
  }
  return systemInstance
}