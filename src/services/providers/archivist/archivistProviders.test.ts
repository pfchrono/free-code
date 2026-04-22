import { afterEach, describe, expect, it, mock } from 'bun:test'

import type { MemoryEntry, MemoryProviderAdapter } from '../../memory/persistentMemorySystem.js'
import { ArchivistCheckpointProvider } from './archivistCheckpointProvider.js'
import { createArchivistClient, setArchivistClient, syncArchivistClient } from './archivistClient.js'
import { ArchivistCodeIntelProvider } from './archivistCodeIntelProvider.js'
import { ArchivistMemoryProvider } from './archivistMemoryProvider.js'

function createFallbackMemoryProvider(searchResults: Partial<MemoryEntry>[] = []): MemoryProviderAdapter {
  return {
    addEntry: mock(async () => {}),
    getEntries: mock(async () => []),
    searchEntries: mock(async () => searchResults as MemoryEntry[]),
    updateEntry: mock(async () => true),
    deleteEntry: mock(async () => true),
    compact: mock(async () => {}),
    flush: mock(async () => {}),
  }
}

afterEach(() => {
  setArchivistClient(null)
})

describe('Archivist providers', () => {
  it('uses Archivist tools for memory save/search when client is available', async () => {
    const callTool = mock(async (toolName: string) => {
      if (toolName === 'memory_search') {
        return [{
          memory_id: 'mem-1',
          created_at: Date.now(),
          type: 'context',
          text: 'remembered result',
          relevance: 0.9,
        }]
      }
      return { ok: true }
    })
    setArchivistClient({ callTool })

    const fallback = createFallbackMemoryProvider([
      { id: 'local-1', content: 'local fallback result' },
    ])
    const provider = new ArchivistMemoryProvider({ fallback })

    await provider.addEntry({
      id: 'mem-1',
      timestamp: Date.now(),
      provider: 'archivist',
      source: 'manual',
      type: 'context',
      content: 'remember this',
    })
    const results = await provider.searchEntries('remember', { limit: 2 })

    expect(callTool).toHaveBeenCalledWith('memory_save', expect.objectContaining({
      id: 'mem-1',
      content: 'remember this',
    }))
    expect(callTool).toHaveBeenCalledWith('memory_search', {
      query: 'remember',
      limit: 2,
      type: undefined,
    })
    expect(results).toEqual([
      { id: 'local-1', content: 'local fallback result' },
      expect.objectContaining({
        id: 'mem-1',
        provider: 'archivist',
        source: 'manual',
        type: 'context',
        content: 'remembered result',
        metadata: expect.objectContaining({ remoteScore: 0.9 }),
      }),
    ])
    expect(fallback.searchEntries).toHaveBeenCalledWith('remember', { limit: 2 })
  })

  it('falls back cleanly when Archivist client is unavailable', async () => {
    const fallback = createFallbackMemoryProvider()
    const provider = new ArchivistMemoryProvider({ fallback })

    await provider.searchEntries('fallback', { limit: 1 })

    expect(fallback.searchEntries).toHaveBeenCalledWith('fallback', { limit: 1 })
    expect(provider.getProviderInfo()).toEqual({
      provider: 'archivist',
      available: false,
      mode: 'fallback',
    })
  })

  it('routes code-intel and checkpoint calls through Archivist client', async () => {
    const callTool = mock(async (toolName: string) => {
      switch (toolName) {
        case 'search_codebase':
          return [{ source_file: 'src/query.ts', summary: 'semantic match' }]
        case 'get_change_impact':
          return { changed_files: ['a.ts'], affected_files: ['b.ts'], affected_symbols: ['x'], impacted_tests: ['x.test.ts'], summary: 'impact' }
        case 'list_checkpoints':
          return [{ checkpoint_id: 'cp1', name: 'before', created_at: 1 }]
        case 'compare_checkpoint_by_symbol':
          return 'diff summary'
        default:
          return null
      }
    })
    setArchivistClient({ callTool })

    const codeIntel = new ArchivistCodeIntelProvider()
    const checkpoints = new ArchivistCheckpointProvider()

    await expect(codeIntel.search('resume', 3)).resolves.toEqual([
      { file: 'src/query.ts', reason: 'semantic match', snippet: undefined, symbol: undefined },
    ])
    await expect(codeIntel.getImpact(['src/query.ts'])).resolves.toEqual({
      changedFiles: ['a.ts'],
      affectedFiles: ['b.ts'],
      affectedSymbols: ['x'],
      impactedTests: ['x.test.ts'],
      summary: 'impact',
    })
    await expect(checkpoints.list(5)).resolves.toEqual([
      { id: 'cp1', label: 'before', createdAt: 1, branchRef: undefined, note: undefined },
    ])
    await expect(checkpoints.compare('cp1', 'cp2')).resolves.toBe('diff summary')
  })

  it('creates Archivist client from MCP connection and syncs by server name', async () => {
    const callTool = mock(async () => ({
      content: [{ type: 'text', text: '{"ok":true}' }],
      structuredContent: undefined,
    }))
    const connection = {
      type: 'connected',
      name: 'token-savior',
      client: { callTool },
    } as never

    const client = createArchivistClient(connection)
    expect(client).not.toBeNull()
    await expect(client!.callTool('memory_search', { query: 'resume' })).resolves.toEqual({ ok: true })

    syncArchivistClient([connection])
    expect(new ArchivistCodeIntelProvider().isAvailable()).toBe(true)
  })
})
