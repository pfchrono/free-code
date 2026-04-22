/**
 * Persistent Memory System - Phase 1 Implementation
 * Enhanced memory management inspired by SoulForge and oh-my-openagent
 */

import { z } from 'zod'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { ArchivistMemoryProvider } from '../providers/archivist/archivistMemoryProvider.js'
import { isArchivistClientAvailable } from '../providers/archivist/archivistClient.js'

export const memoryEntryTypeSchema = z.enum([
  'conversation',
  'task',
  'session',
  'context',
  'insight',
])

export const memoryProviderSchema = z.enum(['native', 'archivist'])

export const memorySourceSchema = z.enum(['manual', 'session-continuity', 'resume', 'system'])

export const memoryMetadataSchema = z.record(z.string(), z.unknown())

// Memory Entry Schema
const memoryEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  type: memoryEntryTypeSchema,
  content: z.string(),
  summary: z.string().optional(),
  provider: memoryProviderSchema.default('native'),
  source: memorySourceSchema.default('manual'),
  metadata: memoryMetadataSchema.optional(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(0).max(1).optional(), // 0-1 importance score
  ttl: z.number().optional(), // TTL in milliseconds
  sessionId: z.string().optional(),
  projectPath: z.string().optional(),
  lastAccess: z.number().optional(),
})

const memoryStoreSchema = z.object({
  version: z.string(),
  entries: z.array(memoryEntrySchema),
  lastCompaction: z.number().optional(),
  stats: z.object({
    totalEntries: z.number(),
    totalSize: z.number(),
    lastAccess: z.number(),
  }).optional(),
})

const legacyMemoryEntrySchema = z.object({
  id: z.string().optional(),
  timestamp: z.number().optional(),
  type: memoryEntryTypeSchema.optional(),
  content: z.string(),
  summary: z.string().optional(),
  metadata: memoryMetadataSchema.optional(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(0).max(1).optional(),
  ttl: z.number().optional(),
  sessionId: z.string().optional(),
  projectPath: z.string().optional(),
  lastAccess: z.number().optional(),
})

const legacySessionSnapshotSchema = z.object({
  sessionId: z.string(),
  projectPath: z.string().optional(),
  startedAt: z.number().optional(),
  lastActivity: z.number().optional(),
  status: z.string().optional(),
  activePlan: z.string().optional(),
  planName: z.string().optional(),
  completedTasks: z.array(z.string()).optional(),
  remainingTasks: z.array(z.string()).optional(),
  currentTask: z.string().optional(),
  workingFiles: z.array(z.string()).optional(),
  conversationSummary: z.string().optional(),
  keyInsights: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const legacySessionHistorySchema = z.object({
  sessions: z.array(legacySessionSnapshotSchema),
})

export type MemoryEntry = z.infer<typeof memoryEntrySchema>
export type MemoryStore = z.infer<typeof memoryStoreSchema>
export type MemoryType = z.infer<typeof memoryEntryTypeSchema>
export type MemoryProvider = z.infer<typeof memoryProviderSchema>
export type MemorySource = z.infer<typeof memorySourceSchema>
export type MemoryMetadata = z.infer<typeof memoryMetadataSchema>

export interface MemoryFilter {
  type?: MemoryType
  tags?: string[]
  sessionId?: string
  projectPath?: string
  limit?: number
  since?: number
}

export interface SearchOptions {
  type?: MemoryType
  limit?: number
}

export interface ProjectMemoryPayload {
  projectPath: string
  content: string
  summary?: string
  sessionId?: string
  tags?: string[]
  metadata?: MemoryMetadata
  importance?: number
  source?: MemorySource
}

export interface RelevantMemoryOptions {
  projectPath: string
  query?: string
  sessionId?: string
  limit?: number
  type?: MemoryType
}

export interface MemoryRecallExplanation {
  entry: MemoryEntry
  score: number
  reasons: string[]
}

export interface MemoryProviderAdapter {
  initialize?(): Promise<void>
  addEntry(entry: MemoryEntry): Promise<void>
  getEntries(filter?: MemoryFilter): Promise<MemoryEntry[]>
  searchEntries(query: string, options?: SearchOptions): Promise<MemoryEntry[]>
  updateEntry(id: string, updates: Partial<Omit<MemoryEntry, 'id' | 'timestamp'>>): Promise<boolean>
  deleteEntry(id: string): Promise<boolean>
  compact(): Promise<void>
  flush?(): Promise<void>
}

interface MemorySystemConfig {
  maxEntries: number
  maxSizeBytes: number
  compactionInterval: number
  defaultTTL: number
  persistenceEnabled: boolean
  memoryDir: string
  provider: MemoryProvider
}

function isArchivistMemoryProviderAvailable(): boolean {
  return isArchivistClientAvailable()
}

class NativeMemoryProvider implements MemoryProviderAdapter {
  constructor(
    private readonly store: MemoryStore,
    private readonly onMutation: () => void,
    private readonly updateStats: () => void,
    private readonly autoCleanup: () => Promise<void>,
    private readonly defaultTTL: number,
    private readonly maxEntries: number,
  ) {}

  async addEntry(entry: MemoryEntry): Promise<void> {
    this.store.entries.push({
      ...entry,
      provider: entry.provider || 'native',
      source: entry.source || 'manual',
      ttl: entry.ttl ?? this.defaultTTL,
    })
    this.updateStats()
    this.onMutation()
    await this.autoCleanup()
  }

  async getEntries(options: MemoryFilter = {}): Promise<MemoryEntry[]> {
    let filtered = this.store.entries

    if (options.type) {
      filtered = filtered.filter(entry => entry.type === options.type)
    }

    if (options.tags?.length) {
      filtered = filtered.filter(entry =>
        entry.tags?.some(tag => options.tags!.includes(tag))
      )
    }

    if (options.sessionId) {
      filtered = filtered.filter(entry => entry.sessionId === options.sessionId)
    }

    if (options.projectPath) {
      filtered = filtered.filter(entry => entry.projectPath === options.projectPath)
    }

    if (options.since) {
      filtered = filtered.filter(entry => entry.timestamp >= options.since!)
    }

    filtered = [...filtered].sort((a, b) => b.timestamp - a.timestamp)

    if (options.limit) {
      filtered = filtered.slice(0, options.limit)
    }

    return filtered
  }

  async searchEntries(query: string, options: SearchOptions = {}): Promise<MemoryEntry[]> {
    const queryLower = query.toLowerCase()

    let matches = this.store.entries.filter(entry =>
      entry.content.toLowerCase().includes(queryLower) ||
      entry.summary?.toLowerCase().includes(queryLower) ||
      entry.tags?.some(tag => tag.toLowerCase().includes(queryLower)) ||
      JSON.stringify(entry.metadata || {}).toLowerCase().includes(queryLower)
    )

    if (options.type) {
      matches = matches.filter(entry => entry.type === options.type)
    }

    return matches
  }

  async updateEntry(id: string, updates: Partial<Omit<MemoryEntry, 'id' | 'timestamp'>>): Promise<boolean> {
    const index = this.store.entries.findIndex(entry => entry.id === id)
    if (index === -1) return false

    const entry = this.store.entries[index]
    this.store.entries[index] = {
      ...entry,
      ...updates,
      timestamp: Date.now(),
    }

    this.updateStats()
    this.onMutation()
    return true
  }

  async deleteEntry(id: string): Promise<boolean> {
    const index = this.store.entries.findIndex(entry => entry.id === id)
    if (index === -1) return false

    this.store.entries.splice(index, 1)
    this.updateStats()
    this.onMutation()
    return true
  }

  async compact(): Promise<void> {
    const now = Date.now()

    this.store.entries = this.store.entries.filter(entry => {
      if (!entry.ttl) return true
      return (entry.timestamp + entry.ttl) > now
    })

    if (this.store.entries.length > this.maxEntries) {
      this.store.entries.sort((a, b) => (b.importance || 0) - (a.importance || 0))
      this.store.entries = this.store.entries.slice(0, this.maxEntries)
    }

    this.store.lastCompaction = now
    this.updateStats()
    this.onMutation()
  }

  async flush(): Promise<void> {
    return Promise.resolve()
  }
}

class PersistentMemorySystem {
  private config: MemorySystemConfig
  private memoryStore: MemoryStore
  private provider: MemoryProviderAdapter
  private isDirty = false
  private saveTimeout: NodeJS.Timeout | null = null

  constructor(config: Partial<MemorySystemConfig> = {}) {
    this.config = {
      maxEntries: 10000,
      maxSizeBytes: 50 * 1024 * 1024, // 50MB
      compactionInterval: 24 * 60 * 60 * 1000, // 24 hours
      defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
      persistenceEnabled: true,
      memoryDir: join(getClaudeConfigHomeDir(), 'memory'),
      provider: 'native',
      ...config,
    }

    this.memoryStore = {
      version: '1.0.0',
      entries: [],
      lastCompaction: Date.now(),
      stats: {
        totalEntries: 0,
        totalSize: 0,
        lastAccess: Date.now(),
      },
    }

    this.provider = this.createProvider(this.config.provider)
  }

  async initialize(): Promise<void> {
    if (!this.config.persistenceEnabled) return

    try {
      await mkdir(this.config.memoryDir, { recursive: true })
      await this.loadFromDisk()
      this.provider = this.createProvider(this.config.provider)
      await this.provider.initialize?.()
      logForDebugging(`[Memory] Persistent memory system initialized with ${this.config.provider} provider`)
    } catch (error) {
      logForDebugging(`[Memory] Failed to initialize: ${error}`)
    }
  }

  /**
   * Add a new memory entry
   */
  async addEntry(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<string> {
    const id = this.generateId()
    const timestamp = Date.now()

    const newEntry: MemoryEntry = memoryEntrySchema.parse({
      id,
      timestamp,
      provider: this.resolveEntryProvider(),
      source: 'manual',
      ttl: this.config.defaultTTL,
      ...entry,
    })

    await this.provider.addEntry(newEntry)

    logForDebugging(`[Memory] Added entry: ${id} (type: ${entry.type})`)
    return id
  }

  /**
   * Retrieve memory entries with filtering
   */
  async getEntries(options: MemoryFilter = {}): Promise<MemoryEntry[]> {
    const entries = await this.provider.getEntries(options)

    for (const entry of entries) {
      entry.lastAccess = Date.now()
    }

    this.updateAccessTime()
    return entries
  }

  /**
   * Search memory entries by content
   */
  async searchEntries(query: string, options: SearchOptions = {}): Promise<MemoryEntry[]> {
    const matches = await this.provider.searchEntries(query, options)

    matches.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a, query)
      const scoreB = this.calculateRelevanceScore(b, query)
      return scoreB - scoreA
    })

    const results = options.limit ? matches.slice(0, options.limit) : matches

    for (const entry of results) {
      entry.lastAccess = Date.now()
    }

    this.updateAccessTime()
    return results
  }

  async saveProjectMemory(entry: ProjectMemoryPayload): Promise<string> {
    return this.addEntry({
      type: 'context',
      source: entry.source ?? 'manual',
      projectPath: entry.projectPath,
      sessionId: entry.sessionId,
      content: entry.content,
      summary: entry.summary,
      tags: entry.tags,
      metadata: entry.metadata,
      importance: entry.importance,
    })
  }

  async getRecentRelevantMemory(options: RelevantMemoryOptions): Promise<MemoryEntry[]> {
    const limit = options.limit ?? 5
    const projectEntries = await this.getEntries({
      projectPath: options.projectPath,
      sessionId: options.sessionId,
      type: options.type,
    })

    if (!options.query?.trim()) {
      return projectEntries.slice(0, limit)
    }

    const query = options.query.trim()
    return projectEntries
      .map(entry => ({
        entry,
        score: this.calculateRelevanceScore(entry, query),
      }))
      .sort((a, b) => b.score - a.score || b.entry.timestamp - a.entry.timestamp)
      .slice(0, limit)
      .map(result => result.entry)
  }

  async explainRecall(options: RelevantMemoryOptions): Promise<MemoryRecallExplanation[]> {
    const query = options.query?.trim()
    const entries = await this.getRecentRelevantMemory(options)

    return entries.map(entry => {
      const reasons: string[] = []

      if (entry.projectPath === options.projectPath) {
        reasons.push('project path matched')
      }

      if (options.sessionId && entry.sessionId === options.sessionId) {
        reasons.push('session matched')
      }

      if (query) {
        const queryLower = query.toLowerCase()
        if (entry.content.toLowerCase().includes(queryLower)) {
          reasons.push('content matched query')
        }
        if (entry.summary?.toLowerCase().includes(queryLower)) {
          reasons.push('summary matched query')
        }
        if (entry.tags?.some(tag => tag.toLowerCase().includes(queryLower))) {
          reasons.push('tag matched query')
        }
        if (JSON.stringify(entry.metadata || {}).toLowerCase().includes(queryLower)) {
          reasons.push('metadata matched query')
        }
      } else {
        reasons.push('recent project memory')
      }

      if (entry.importance !== undefined && entry.importance >= 0.7) {
        reasons.push('high importance')
      }

      return {
        entry,
        score: query ? this.calculateRelevanceScore(entry, query) : entry.importance ?? 0,
        reasons,
      }
    })
  }

  /**
   * Update an existing memory entry
   */
  async updateEntry(id: string, updates: Partial<Omit<MemoryEntry, 'id' | 'timestamp'>>): Promise<boolean> {
    const updated = await this.provider.updateEntry(id, updates)
    if (!updated) return false

    logForDebugging(`[Memory] Updated entry: ${id}`)
    return true
  }

  /**
   * Delete a memory entry
   */
  async deleteEntry(id: string): Promise<boolean> {
    const deleted = await this.provider.deleteEntry(id)
    if (!deleted) return false

    logForDebugging(`[Memory] Deleted entry: ${id}`)
    return true
  }

  /**
   * Get memory system statistics
   */
  getStats(): MemoryStore['stats'] {
    return this.memoryStore.stats || {
      totalEntries: 0,
      totalSize: 0,
      lastAccess: Date.now(),
    }
  }

  /**
   * Force save to disk
   */
  async flush(): Promise<void> {
    if (!this.config.persistenceEnabled || !this.isDirty) return

    try {
      await this.provider.flush?.()
      await this.saveToDisk()
      this.isDirty = false
      logForDebugging('[Memory] Flushed to disk')
    } catch (error) {
      logForDebugging(`[Memory] Failed to flush: ${error}`)
    }
  }

  /**
   * Manual compaction - remove expired entries and optimize storage
   */
  async compact(): Promise<void> {
    const beforeCount = this.memoryStore.entries.length

    await this.provider.compact()

    const afterCount = this.memoryStore.entries.length
    logForDebugging(`[Memory] Compacted: ${beforeCount} → ${afterCount} entries`)
  }

  private async loadFromDisk(): Promise<void> {
    const filePath = join(this.config.memoryDir, 'store.json')

    try {
      const data = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(data)
      this.memoryStore = memoryStoreSchema.parse(parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const recoveredStore = await this.recoverLegacyStore()
        if (recoveredStore) {
          this.memoryStore = recoveredStore
          this.isDirty = true
        }
      } else {
        logForDebugging(`[Memory] Failed to load from disk: ${error}`)
      }
    }

    // Auto-compact on load if needed
    const timeSinceCompaction = Date.now() - (this.memoryStore.lastCompaction || 0)
    if (timeSinceCompaction > this.config.compactionInterval) {
      await this.compact()
    }
  }

  private async recoverLegacyStore(): Promise<MemoryStore | null> {
    const recoveredEntries = await Promise.all([
      this.loadLegacyEntriesFile(),
      this.loadLegacySessionHistory(),
    ])

    const entries = recoveredEntries
      .flat()
      .sort((a, b) => b.timestamp - a.timestamp)

    if (!entries.length) {
      return null
    }

    const recoveredStore: MemoryStore = {
      version: '1.0.0',
      entries,
      lastCompaction: Date.now(),
      stats: {
        totalEntries: entries.length,
        totalSize: JSON.stringify(entries).length,
        lastAccess: Date.now(),
      },
    }

    logForDebugging(`[Memory] Recovered ${entries.length} legacy memory entries`)
    return recoveredStore
  }

  private async loadLegacyEntriesFile(): Promise<MemoryEntry[]> {
    const filePath = join(this.config.memoryDir, 'entries.json')

    try {
      const data = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(data)
      const rawEntries = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.entries)
          ? parsed.entries
          : []

      return rawEntries
        .map((entry, index) => this.normalizeLegacyMemoryEntry(entry, index))
        .filter((entry): entry is MemoryEntry => entry !== null)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logForDebugging(`[Memory] Failed to recover legacy entries: ${error}`)
      }
      return []
    }
  }

  private async loadLegacySessionHistory(): Promise<MemoryEntry[]> {
    const filePath = join(this.config.memoryDir, 'history.json')

    try {
      const data = await readFile(filePath, 'utf8')
      const parsed = legacySessionHistorySchema.safeParse(JSON.parse(data))
      if (!parsed.success) {
        return []
      }

      return parsed.data.sessions.flatMap(session => this.normalizeLegacySessionEntries(session))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logForDebugging(`[Memory] Failed to recover legacy session history: ${error}`)
      }
      return []
    }
  }

  private normalizeLegacyMemoryEntry(entry: unknown, index: number): MemoryEntry | null {
    const parsed = legacyMemoryEntrySchema.safeParse(entry)
    if (!parsed.success) {
      return null
    }

    const normalized = parsed.data
    return memoryEntrySchema.parse({
      id: normalized.id ?? `legacy_mem_${index}_${Date.now()}`,
      timestamp: normalized.timestamp ?? Date.now(),
      type: normalized.type ?? 'context',
      provider: 'native',
      source: 'system',
      ...normalized,
    })
  }

  private normalizeLegacySessionEntries(session: z.infer<typeof legacySessionSnapshotSchema>): MemoryEntry[] {
    const entries: MemoryEntry[] = []
    const timestamp = session.lastActivity ?? session.startedAt ?? Date.now()
    const baseMetadata: MemoryMetadata = {
      legacyStatus: session.status,
      activePlan: session.activePlan,
      planName: session.planName,
      currentTask: session.currentTask,
      workingFiles: session.workingFiles,
      ...(session.metadata ?? {}),
    }

    if (session.conversationSummary?.trim()) {
      entries.push(memoryEntrySchema.parse({
        id: `legacy_session_summary_${session.sessionId}`,
        timestamp,
        type: 'session',
        provider: 'native',
        source: 'system',
        sessionId: session.sessionId,
        projectPath: session.projectPath,
        content: session.conversationSummary,
        summary: session.conversationSummary,
        tags: ['legacy', 'session-summary'],
        metadata: baseMetadata,
      }))
    }

    for (const [index, insight] of (session.keyInsights ?? []).entries()) {
      if (!insight.trim()) {
        continue
      }

      entries.push(memoryEntrySchema.parse({
        id: `legacy_session_insight_${session.sessionId}_${index}`,
        timestamp,
        type: 'insight',
        provider: 'native',
        source: 'system',
        sessionId: session.sessionId,
        projectPath: session.projectPath,
        content: insight,
        summary: session.conversationSummary,
        tags: ['legacy', 'session-insight'],
        metadata: baseMetadata,
      }))
    }

    for (const [index, task] of (session.completedTasks ?? []).entries()) {
      if (!task.trim()) {
        continue
      }

      entries.push(memoryEntrySchema.parse({
        id: `legacy_session_completed_${session.sessionId}_${index}`,
        timestamp,
        type: 'task',
        provider: 'native',
        source: 'system',
        sessionId: session.sessionId,
        projectPath: session.projectPath,
        content: task,
        tags: ['legacy', 'completed-task'],
        metadata: {
          ...baseMetadata,
          taskStatus: 'completed',
        },
      }))
    }

    for (const [index, task] of (session.remainingTasks ?? []).entries()) {
      if (!task.trim()) {
        continue
      }

      entries.push(memoryEntrySchema.parse({
        id: `legacy_session_remaining_${session.sessionId}_${index}`,
        timestamp,
        type: 'task',
        provider: 'native',
        source: 'system',
        sessionId: session.sessionId,
        projectPath: session.projectPath,
        content: task,
        tags: ['legacy', 'remaining-task'],
        metadata: {
          ...baseMetadata,
          taskStatus: 'remaining',
        },
      }))
    }

    return entries
  }

  private async saveToDisk(): Promise<void> {
    if (!this.config.persistenceEnabled) return

    const filePath = join(this.config.memoryDir, 'store.json')
    const data = JSON.stringify(this.memoryStore, null, 2)

    await mkdir(this.config.memoryDir, { recursive: true })
    await writeFile(filePath, data, 'utf8')
  }

  private createProvider(provider: MemoryProvider): MemoryProviderAdapter {
    const nativeProvider = new NativeMemoryProvider(
      this.memoryStore,
      () => this.markDirty(),
      () => this.updateStats(),
      () => this.autoCleanup(),
      this.config.defaultTTL,
      this.config.maxEntries,
    )

    switch (provider) {
      case 'archivist':
        return new ArchivistMemoryProvider({
          fallback: nativeProvider,
          isAvailable: isArchivistMemoryProviderAvailable,
        })
      case 'native':
      default:
        return nativeProvider
    }
  }

  private markDirty(): void {
    this.isDirty = true

    // Debounced save
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => {
      this.flush().catch(error =>
        logForDebugging(`[Memory] Auto-save failed: ${error}`)
      )
    }, 5000) // Save after 5 seconds of inactivity
  }

  private updateStats(): void {
    const totalSize = JSON.stringify(this.memoryStore.entries).length
    this.memoryStore.stats = {
      totalEntries: this.memoryStore.entries.length,
      totalSize,
      lastAccess: Date.now(),
    }
  }

  private updateAccessTime(): void {
    if (this.memoryStore.stats) {
      this.memoryStore.stats.lastAccess = Date.now()
    }
  }

  private async autoCleanup(): Promise<void> {
    const stats = this.getStats()

    // Check if cleanup is needed
    if (stats.totalEntries > this.config.maxEntries ||
        stats.totalSize > this.config.maxSizeBytes) {
      await this.compact()
    }
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private resolveEntryProvider(): MemoryProvider {
    if (this.config.provider === 'archivist' && !isArchivistMemoryProviderAvailable()) {
      return 'native'
    }

    return this.config.provider
  }

  private calculateRelevanceScore(entry: MemoryEntry, query: string): number {
    const queryLower = query.toLowerCase()
    let score = 0

    // Content match
    const contentMatches = queryLower
      ? entry.content.toLowerCase().split(queryLower).length - 1
      : 0
    score += contentMatches * 10

    // Tag matches
    if (entry.tags) {
      const tagMatches = entry.tags.filter(tag => tag.toLowerCase().includes(queryLower)).length
      score += tagMatches * 20
    }

    // Importance boost
    score *= (entry.importance || 0.5) + 0.5

    // Recent entries get boost
    const ageBoost = Math.max(0, 1 - (Date.now() - entry.timestamp) / (7 * 24 * 60 * 60 * 1000))
    score *= (1 + ageBoost)

    return score
  }
}

// Global instance
let globalMemorySystem: PersistentMemorySystem | null = null

/**
 * Get the global memory system instance
 */
export function getMemorySystem(config?: Partial<MemorySystemConfig>): PersistentMemorySystem {
  if (!globalMemorySystem) {
    globalMemorySystem = new PersistentMemorySystem(config)
  }
  return globalMemorySystem
}

/**
 * Initialize the global memory system
 */
export async function initializeMemorySystem(config?: Partial<MemorySystemConfig>): Promise<void> {
  const system = getMemorySystem(config)
  await system.initialize()
}

export { PersistentMemorySystem }
