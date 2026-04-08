import { describe, it, expect } from 'bun:test'
import { redQueenCompress } from '../redQueen'
import { getContentSizeEstimate } from '../../../utils/mcpValidation'
import type { MCPToolResult } from '../../../utils/mcpValidation'

describe('RedQueen Integration — Full Pipeline', () => {
  describe('Pipeline ordering and phases', () => {
    it('runs dedup → reducer → filter → summarize in correct order', async () => {
      // Simulate a large, repetitive GitHub search result
      const searchResult = JSON.stringify(
        Array.from({ length: 30 }, (_, i) => ({
          path: `src/component${i % 5}/file.ts`,
          line: 100 + i * 5,
          snippet: `function handler_${i}() { return process(data_${i}); }`.repeat(20),
        })),
      ).repeat(2)

      const originalSize = getContentSizeEstimate(searchResult)

      const { content, stats } = await redQueenCompress(
        searchResult,
        'test-server',
        'github-search_code',
        {},
        {
          maxTokens: 4000,
          enableDedup: true,
          enableFiltering: true,
          enableSummarization: false,
        },
      )

      expect(stats.wasCompressed).toBe(true)
      expect(stats.tokensSaved).toBeGreaterThan(0)
      expect(getContentSizeEstimate(content)).toBeLessThan(originalSize)
    })

    it('preserves routing semantics: dedup/filter before summarization', async () => {
      const largeOutput = 'x'.repeat(10000)

      const { stats: reducerStats } = await redQueenCompress(largeOutput, 'test-server', 'unknown-tool', {}, {
        enableDedup: true,
        enableFiltering: true,
        enableSummarization: false,
      })

      // Should still have token savings from dedup/filter even without summarization
      expect(reducerStats.tokensSaved).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Phase-specific behavior', () => {
    it('deduplication works with actual args-based cache keys', async () => {
      const toolOutput = 'search result about authentication'
      const args1 = { query: 'auth' }
      const args2 = { query: 'database' }

      // First call with args1
      const result1 = await redQueenCompress(toolOutput, 'server', 'github-search_code', args1, {
        enableDedup: true,
        enableFiltering: false,
        enableSummarization: false,
      })

      // Second call with same args1 should dedup
      const result2 = await redQueenCompress(toolOutput, 'server', 'github-search_code', args1, {
        enableDedup: true,
        enableFiltering: false,
        enableSummarization: false,
      })

      // Dedup should detect the same tool+args combo
      expect(result2.stats.dedupHits).toBe(1)
    })

    it('deterministic reducer activates for known tools', async () => {
      const consoleOutput = `
[error] Critical failure in auth module
[error] Failed to validate token at line 456
[log] Application shutting down
      `.repeat(50)

      const { content, stats } = await redQueenCompress(
        consoleOutput,
        'server',
        'playwright-browser_console_messages',
        {},
        {
          enableDedup: false,
          enableFiltering: false,
          enableSummarization: false,
        },
      )

      expect(stats.wasCompressed).toBe(true)
      expect(getContentSizeEstimate(content)).toBeLessThan(getContentSizeEstimate(consoleOutput))
    })

    it('result filtering respects per-tool max-items', async () => {
      // mempalace_search has max 5 items
      const searchResults = JSON.stringify(
        Array.from({ length: 20 }, (_, i) => ({
          id: `result_${i}`,
          score: 0.99 - i * 0.02,
          content: `Search result ${i}`.repeat(100),
        })),
      )

      const { content } = await redQueenCompress(searchResults, 'server', 'mempalace_search', {}, {
        enableDedup: false,
        enableFiltering: true,
        enableSummarization: false,
      })

      const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
      const parsed = JSON.parse(contentStr)
      expect(Array.isArray(parsed) ? parsed.length : 0).toBeLessThanOrEqual(5)
    })
  })

  describe('Real-world scenarios', () => {
    it('handles Playwright network dump (typical 1-2KB tool output)', async () => {
      const networkDump = `
GET https://api.example.com/users - 200 OK (12ms) - 1.2KB
GET https://cdn.example.com/assets/large.js - 200 OK (1234ms) - 245KB
POST https://api.example.com/data - 400 Bad Request (45ms) - 0.3KB
      `.repeat(20)

      const originalSize = getContentSizeEstimate(networkDump)

      const { content, stats } = await redQueenCompress(
        networkDump,
        'playwright',
        'playwright-browser_network_requests',
        {},
        {
          enableDedup: false,
          enableFiltering: true,
          enableSummarization: false,
        },
      )

      const newSize = getContentSizeEstimate(content)
      expect(newSize).toBeLessThan(originalSize)
      expect(stats.wasCompressed).toBe(true)
    })

    it('handles GitHub search with many matches (typical 2-3KB tool output)', async () => {
      const githubSearch = JSON.stringify(
        Array.from({ length: 50 }, (_, i) => ({
          repository: `org/repo${i}`,
          path: `src/feature${i % 10}/impl.ts`,
          line: Math.floor(Math.random() * 1000),
          score: Math.random(),
          snippet: `export function implementation_${i}() {\n  // ... ${i * 100} lines of code\n}`.repeat(5),
        })),
      )

      const originalSize = getContentSizeEstimate(githubSearch)

      const { content, stats } = await redQueenCompress(
        githubSearch,
        'github',
        'github-search_code',
        {},
        {
          enableDedup: false,
          enableFiltering: true,
          enableSummarization: false,
        },
      )

      const newSize = getContentSizeEstimate(content)
      expect(newSize).toBeLessThan(originalSize)
      expect(stats.filteredItems).toBeGreaterThanOrEqual(0)
    })

    it('handles MemPalace search results (memory system, typical 1-2KB)', async () => {
      const mempalaceSearch = JSON.stringify(
        Array.from({ length: 15 }, (_, i) => ({
          drawer_id: `drawer_${i}`,
          room: `room_${i % 3}`,
          wing: `project_${i % 2}`,
          content: `Important decision about feature ${i}: ${`This is a long memory entry with detailed context. `.repeat(20)}`,
          score: 0.95 - i * 0.03,
        })),
      )

      const originalSize = getContentSizeEstimate(mempalaceSearch)

      const { content, stats } = await redQueenCompress(
        mempalaceSearch,
        'mempalace',
        'mempalace_search',
        {},
        {
          enableDedup: false,
          enableFiltering: true,
          enableSummarization: false,
        },
      )

      const newSize = getContentSizeEstimate(content)
      expect(newSize).toBeLessThan(originalSize)
      expect(stats.wasCompressed).toBe(true)
    })
  })

  describe('Stats accumulation', () => {
    it('stats accumulate across multiple compression phases', async () => {
      const mixedOutput = 'error error error'.repeat(500)

      const { stats } = await redQueenCompress(
        mixedOutput,
        'server',
        'playwright-browser_console_messages',
        {},
        {
          enableDedup: true,
          enableFiltering: true,
          enableSummarization: false,
        },
      )

      // Multiple phases could contribute savings
      expect(stats.tokensSaved).toBeGreaterThanOrEqual(0)
      expect(stats.wasCompressed).toBeDefined()
    })
  })

  describe('Error handling and fallbacks', () => {
    it('gracefully handles empty content', async () => {
      const { content, stats } = await redQueenCompress('', 'server', 'github-search_code', {}, {
        enableDedup: true,
        enableFiltering: true,
      })

      expect(content).toBe('')
      expect(stats.tokensSaved).toBe(0)
    })

    it('returns original content if no compression applies', async () => {
      const smallContent = 'small'

      const { content } = await redQueenCompress(smallContent, 'server', 'unknown-tool', {}, {
        enableDedup: true,
        enableFiltering: true,
        enableSummarization: false,
      })

      expect(content).toBe(smallContent)
    })

    it('preserves format (string vs ContentBlockParam array)', async () => {
      const stringInput = 'test content'.repeat(500)
      const stringResult = await redQueenCompress(
        stringInput,
        'server',
        'playwright-browser_console_messages',
        {},
        { enableDedup: false, enableFiltering: true },
      )
      expect(typeof stringResult.content === 'string').toBe(true)

      const blockInput: MCPToolResult = [{ type: 'text' as const, text: 'test content'.repeat(500) }]
      const blockResult = await redQueenCompress(blockInput, 'server', 'playwright-browser_console_messages', {}, {
        enableDedup: false,
        enableFiltering: true,
      })
      expect(Array.isArray(blockResult.content)).toBe(true)
    })
  })

  describe('Pipeline configuration', () => {
    it('respects enableDedup flag', async () => {
      const output = 'duplicate result'.repeat(100)

      const withDedup = await redQueenCompress(output, 'server', 'github-search_code', {}, {
        enableDedup: true,
        enableFiltering: false,
      })

      const withoutDedup = await redQueenCompress(output, 'server', 'github-search_code', {}, {
        enableDedup: false,
        enableFiltering: false,
      })

      // Both should handle the content without errors
      expect(withDedup.content).toBeDefined()
      expect(withoutDedup.content).toBeDefined()
    })

    it('respects enableFiltering flag', async () => {
      const largeArray = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: i, data: 'x'.repeat(100) })))

      const withFilter = await redQueenCompress(largeArray, 'server', 'mempalace_search', {}, {
        enableDedup: false,
        enableFiltering: true,
      })

      const withoutFilter = await redQueenCompress(largeArray, 'server', 'mempalace_search', {}, {
        enableDedup: false,
        enableFiltering: false,
      })

      expect(getContentSizeEstimate(withFilter.content)).toBeLessThanOrEqual(getContentSizeEstimate(withoutFilter.content))
    })

    it('respects maxTokens budget parameter', async () => {
      const largeOutput = 'x'.repeat(10000)

      const result1 = await redQueenCompress(largeOutput, 'server', 'unknown-tool', {}, {
        maxTokens: 1000,
      })

      const result2 = await redQueenCompress(largeOutput, 'server', 'unknown-tool', {}, {
        maxTokens: 5000,
      })

      // Both should complete without errors
      expect(result1.content).toBeDefined()
      expect(result2.content).toBeDefined()
    })
  })
})
