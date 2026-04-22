import type {
  MemoryEntry,
  MemoryFilter,
  MemoryProviderAdapter,
  SearchOptions,
} from '../../memory/persistentMemorySystem.js'
import { getArchivistClient, isArchivistClientAvailable } from './archivistClient.js'

export interface ArchivistMemoryProviderOptions {
  fallback: MemoryProviderAdapter
  isAvailable?: () => boolean
}

function normalizeMemoryEntry(value: unknown): MemoryEntry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Record<string, unknown>
  const id = typeof item.id === 'string'
    ? item.id
    : typeof item.memory_id === 'string'
      ? item.memory_id
      : typeof item.entry_id === 'string'
        ? item.entry_id
        : null
  const content = typeof item.content === 'string'
    ? item.content
    : typeof item.text === 'string'
      ? item.text
      : typeof item.memory === 'string'
        ? item.memory
        : null
  const type = typeof item.type === 'string'
    ? item.type
    : typeof item.kind === 'string'
      ? item.kind
      : 'context'
  const timestamp = typeof item.timestamp === 'number'
    ? item.timestamp
    : typeof item.created_at === 'number'
      ? item.created_at
      : typeof item.updated_at === 'number'
        ? item.updated_at
        : Date.now()

  if (!id || !content) {
    return null
  }

  const metadata = {
    ...(item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {}),
    remoteScore: typeof item.score === 'number'
      ? item.score
      : typeof item.relevance === 'number'
        ? item.relevance
        : undefined,
  }

  return {
    id,
    content,
    type: type as MemoryEntry['type'],
    timestamp,
    provider: typeof item.provider === 'string' ? item.provider as MemoryEntry['provider'] : 'archivist',
    source: typeof item.source === 'string' ? item.source as MemoryEntry['source'] : 'manual',
    summary: typeof item.summary === 'string' ? item.summary : undefined,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
    importance: typeof item.importance === 'number' ? item.importance : undefined,
    sessionId: typeof item.sessionId === 'string' ? item.sessionId : typeof item.session_id === 'string' ? item.session_id : undefined,
    projectPath: typeof item.projectPath === 'string' ? item.projectPath : typeof item.project_path === 'string' ? item.project_path : undefined,
    metadata,
  }
}

function blendedScore(entry: MemoryEntry, query: string): number {
  const queryLower = query.toLowerCase()
  let score = 0
  const metadata = entry.metadata as Record<string, unknown> | undefined

  if (queryLower) {
    const contentMatches = entry.content.toLowerCase().split(queryLower).length - 1
    score += contentMatches * 10
    if (entry.summary?.toLowerCase().includes(queryLower)) {
      score += 6
    }
    if (entry.tags?.some(tag => tag.toLowerCase().includes(queryLower))) {
      score += 8
    }
  }

  if (typeof metadata?.remoteScore === 'number') {
    score += metadata.remoteScore * 25
  }

  score *= (entry.importance ?? 0.5) + 0.5
  const ageBoost = Math.max(0, 1 - (Date.now() - entry.timestamp) / (7 * 24 * 60 * 60 * 1000))
  return score * (1 + ageBoost)
}

export class ArchivistMemoryProvider implements MemoryProviderAdapter {
  constructor(private readonly options: ArchivistMemoryProviderOptions) {}

  private get fallback(): MemoryProviderAdapter {
    return this.options.fallback
  }

  private isAvailable(): boolean {
    return this.options.isAvailable?.() ?? isArchivistClientAvailable()
  }

  async initialize(): Promise<void> {
    await this.fallback.initialize?.()
  }

  async addEntry(entry: MemoryEntry): Promise<void> {
    const client = getArchivistClient()
    if (client) {
      await client.callTool('memory_save', {
        id: entry.id,
        content: entry.content,
        summary: entry.summary,
        tags: entry.tags,
        type: entry.type,
        sessionId: entry.sessionId,
        projectPath: entry.projectPath,
        importance: entry.importance,
        metadata: entry.metadata,
      })
    }

    await this.fallback.addEntry(entry)
  }

  async getEntries(filter?: MemoryFilter): Promise<MemoryEntry[]> {
    return this.fallback.getEntries(filter)
  }

  async searchEntries(query: string, options?: SearchOptions): Promise<MemoryEntry[]> {
    const fallbackResults = await this.fallback.searchEntries(query, options)
    const client = getArchivistClient()
    if (!client) {
      return fallbackResults
    }

    const result = await client.callTool<unknown>('memory_search', {
      query,
      limit: options?.limit,
      type: options?.type,
    })

    if (!Array.isArray(result)) {
      return fallbackResults
    }

    const mergedResults = [...fallbackResults]
    for (const entry of result.map(normalizeMemoryEntry).filter((entry): entry is MemoryEntry => entry !== null)) {
      if (!mergedResults.some(existing => existing.id === entry.id)) {
        mergedResults.push(entry)
      }
    }

    const rankedResults = mergedResults.sort((a, b) => blendedScore(b, query) - blendedScore(a, query) || b.timestamp - a.timestamp)
    return options?.limit ? rankedResults.slice(0, options.limit) : rankedResults
  }

  async updateEntry(id: string, updates: Partial<Omit<MemoryEntry, 'id' | 'timestamp'>>): Promise<boolean> {
    return this.fallback.updateEntry(id, updates)
  }

  async deleteEntry(id: string): Promise<boolean> {
    return this.fallback.deleteEntry(id)
  }

  async compact(): Promise<void> {
    await this.fallback.compact()
  }

  async flush(): Promise<void> {
    await this.fallback.flush?.()
  }

  getProviderInfo(): { provider: 'archivist'; available: boolean; mode: 'fallback' | 'native' } {
    return {
      provider: 'archivist',
      available: this.isAvailable(),
      mode: this.isAvailable() ? 'native' : 'fallback',
    }
  }
}
