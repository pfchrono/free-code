/**
 * Persistent Memory System - Phase 1 Implementation
 * Enhanced memory management inspired by SoulForge and oh-my-openagent
 */

import { z } from 'zod'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'

// Memory Entry Schema
const memoryEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  type: z.enum(['conversation', 'task', 'session', 'context', 'insight']),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(0).max(1).optional(), // 0-1 importance score
  ttl: z.number().optional(), // TTL in milliseconds
  sessionId: z.string().optional(),
  projectPath: z.string().optional(),
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

export type MemoryEntry = z.infer<typeof memoryEntrySchema>
export type MemoryStore = z.infer<typeof memoryStoreSchema>

interface MemorySystemConfig {
  maxEntries: number
  maxSizeBytes: number
  compactionInterval: number
  defaultTTL: number
  persistenceEnabled: boolean
  memoryDir: string
}

class PersistentMemorySystem {
  private config: MemorySystemConfig
  private memoryStore: MemoryStore
  private isDirty = false
  private saveTimeout: NodeJS.Timeout | null = null

  constructor(config: Partial<MemorySystemConfig> = {}) {
    this.config = {
      maxEntries: 10000,
      maxSizeBytes: 50 * 1024 * 1024, // 50MB
      compactionInterval: 24 * 60 * 60 * 1000, // 24 hours
      defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
      persistenceEnabled: true,
      memoryDir: join(process.env.CLAUDE_CONFIG_HOME || '~/.claude', 'memory'),
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
  }

  async initialize(): Promise<void> {
    if (!this.config.persistenceEnabled) return

    try {
      await mkdir(this.config.memoryDir, { recursive: true })
      await this.loadFromDisk()
      logForDebugging('[Memory] Persistent memory system initialized')
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

    const newEntry: MemoryEntry = {
      id,
      timestamp,
      ttl: this.config.defaultTTL,
      ...entry,
    }

    // Validate entry
    memoryEntrySchema.parse(newEntry)

    // Add to store
    this.memoryStore.entries.push(newEntry)
    this.updateStats()
    this.markDirty()

    // Auto-cleanup if needed
    await this.autoCleanup()

    logForDebugging(`[Memory] Added entry: ${id} (type: ${entry.type})`)
    return id
  }

  /**
   * Retrieve memory entries with filtering
   */
  async getEntries(options: {
    type?: MemoryEntry['type']
    tags?: string[]
    sessionId?: string
    projectPath?: string
    limit?: number
    since?: number
  } = {}): Promise<MemoryEntry[]> {
    let filtered = this.memoryStore.entries

    // Apply filters
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

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp)

    // Apply limit
    if (options.limit) {
      filtered = filtered.slice(0, options.limit)
    }

    // Update lastAccess for LRU tracking on returned entries
    for (const entry of filtered) {
      entry.lastAccess = Date.now()
    }

    this.updateAccessTime()
    return filtered
  }

  /**
   * Search memory entries by content
   */
  async searchEntries(query: string, options: {
    type?: MemoryEntry['type']
    limit?: number
  } = {}): Promise<MemoryEntry[]> {
    const queryLower = query.toLowerCase()

    let matches = this.memoryStore.entries.filter(entry =>
      entry.content.toLowerCase().includes(queryLower) ||
      entry.tags?.some(tag => tag.toLowerCase().includes(queryLower)) ||
      JSON.stringify(entry.metadata || {}).toLowerCase().includes(queryLower)
    )

    if (options.type) {
      matches = matches.filter(entry => entry.type === options.type)
    }

    // Sort by relevance (simple scoring)
    matches.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a, query)
      const scoreB = this.calculateRelevanceScore(b, query)
      return scoreB - scoreA
    })

    if (options.limit) {
      matches = matches.slice(0, options.limit)
    }

    this.updateAccessTime()
    return matches
  }

  /**
   * Update an existing memory entry
   */
  async updateEntry(id: string, updates: Partial<Omit<MemoryEntry, 'id' | 'timestamp'>>): Promise<boolean> {
    const index = this.memoryStore.entries.findIndex(entry => entry.id === id)
    if (index === -1) return false

    const entry = this.memoryStore.entries[index]
    this.memoryStore.entries[index] = {
      ...entry,
      ...updates,
      timestamp: Date.now(), // Update timestamp
    }

    this.markDirty()
    logForDebugging(`[Memory] Updated entry: ${id}`)
    return true
  }

  /**
   * Delete a memory entry
   */
  async deleteEntry(id: string): Promise<boolean> {
    const index = this.memoryStore.entries.findIndex(entry => entry.id === id)
    if (index === -1) return false

    this.memoryStore.entries.splice(index, 1)
    this.updateStats()
    this.markDirty()

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
    const now = Date.now()

    // Remove expired entries
    this.memoryStore.entries = this.memoryStore.entries.filter(entry => {
      if (!entry.ttl) return true
      return (entry.timestamp + entry.ttl) > now
    })

    // Remove low importance entries if over limits
    if (this.memoryStore.entries.length > this.config.maxEntries) {
      this.memoryStore.entries.sort((a, b) => (b.importance || 0) - (a.importance || 0))
      this.memoryStore.entries = this.memoryStore.entries.slice(0, this.config.maxEntries)
    }

    this.memoryStore.lastCompaction = now
    this.updateStats()
    this.markDirty()

    const afterCount = this.memoryStore.entries.length
    logForDebugging(`[Memory] Compacted: ${beforeCount} → ${afterCount} entries`)
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const filePath = join(this.config.memoryDir, 'store.json')
      const data = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(data)
      this.memoryStore = memoryStoreSchema.parse(parsed)

      // Auto-compact on load if needed
      const timeSinceCompaction = Date.now() - (this.memoryStore.lastCompaction || 0)
      if (timeSinceCompaction > this.config.compactionInterval) {
        await this.compact()
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logForDebugging(`[Memory] Failed to load from disk: ${error}`)
      }
      // Initialize empty store if file doesn't exist
    }
  }

  private async saveToDisk(): Promise<void> {
    if (!this.config.persistenceEnabled) return

    const filePath = join(this.config.memoryDir, 'store.json')
    const data = JSON.stringify(this.memoryStore, null, 2)

    await mkdir(this.config.memoryDir, { recursive: true })
    await writeFile(filePath, data, 'utf8')
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

  private calculateRelevanceScore(entry: MemoryEntry, query: string): number {
    const queryLower = query.toLowerCase()
    let score = 0

    // Content match
    const contentMatches = (entry.content.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length
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
