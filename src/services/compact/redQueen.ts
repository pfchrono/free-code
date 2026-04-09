/**
 * RedQueen — MCP Tool Result Compression Layer
 *
 * "You have to keep running just to stay in the same place."
 *
 * Compresses MCP tool results before they hit the context window:
 * - Semantic deduplication of repeated tool calls
 * - Relevance-based result filtering for large result sets
 * - Token-budget-aware truncation with smarter cutting
 * - LLM-powered summarization (Phase 2)
 * - Persistent cross-session cache (Phase 3)
 *
 * Hooks into processMCPResult() after transformMCPResult(), before truncation decision.
 */
import { createHash } from 'crypto'
import { getContentSizeEstimate, type MCPToolResult } from '../../utils/mcpValidation.js'
import { logEvent } from '../analytics/index.js'
import { summarizeToolResult, shouldSummarize } from './mcpToolResultSummarizer.js'
import { applyToolReducer } from './toolReducers.js'
type CachedResult = { content: string }

function computeCacheKey(tool: string, args: unknown): string {
  return createHash('sha256').update(`${tool}:${JSON.stringify(args ?? {})}`).digest('hex')
}

function getCachedResult(_tool: string, _argsHash: string): CachedResult | null {
  return null
}

function cacheResult(
  _tool: string,
  _argsHash: string,
  _content: MCPToolResult,
  _ttlSeconds: number,
): void {}

function recordCompressionStats(
  _tool: string,
  _reason: string,
  _tokensSaved: number,
  _sessionId: string,
): void {}

function isCacheAvailable(): boolean {
  return false
}

const REDQUEEN_DEBUG = process.env.REDQUEEN_DEBUG === 'true'

export interface ToolCallKey {
  server: string
  tool: string
  argsHash: string
}

interface CompressionStats {
  tokensSaved: number
  dedupHits: number
  filteredItems: number
  wasCompressed: boolean
  summarizationRatio: number
  cacheHit: boolean
}

// LRU cache for deduplication — keeps last N tool calls
const DEDUP_CACHE_SIZE = 50
const dedupCache = new Map<string, { result: string; timestamp: number }>()

function hashArgs(args: unknown): string {
  return createHash('sha256').update(JSON.stringify(args ?? {})).digest('hex').slice(0, 16)
}

function makeKey(server: string, tool: string, args: unknown): string {
  return `${server}::${tool}::${hashArgs(args)}`
}

function pruneDedupCache(): void {
  if (dedupCache.size > DEDUP_CACHE_SIZE) {
    const oldest = [...dedupCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, dedupCache.size - DEDUP_CACHE_SIZE)
    for (const [key] of oldest) {
      dedupCache.delete(key)
    }
  }
}

/**
 * Deduplicate a tool call result against recent calls.
 * If identical call was made recently, return cached result instead.
 */
export function deduplicateToolResult(
  server: string,
  tool: string,
  args: unknown,
  content: MCPToolResult,
): { content: MCPToolResult; isDuplicate: boolean; cachedResult?: string } {
  if (typeof content === 'undefined' || content === null) {
    return { content, isDuplicate: false }
  }

  const key = makeKey(server, tool, args)
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
  const cached = dedupCache.get(key)

  pruneDedupCache()

  if (cached && cached.result === contentStr) {
    // Same tool + args + result — return placeholder instead of full content
    dedupCache.set(key, { result: contentStr, timestamp: Date.now() })
    return {
      content: typeof content === 'string'
        ? `[Duplicate of earlier ${tool} result — ${cached.timestamp}ms ago]`
        : [{ type: 'text' as const, text: `[Duplicate of earlier ${tool} result — ${cached.timestamp}ms ago]` }],
      isDuplicate: true,
      cachedResult: cached.result,
    }
  }

  dedupCache.set(key, { result: contentStr, timestamp: Date.now() })
  return { content, isDuplicate: false }
}

/**
 * Filter large result arrays by relevance.
 * Keeps top-N items based on a similarity/priority score.
 */
export function filterByRelevance<T extends { similarity?: number; score?: number; relevance?: number }>(
  items: T[],
  maxItems: number,
): T[] {
  if (items.length <= maxItems) return items

  return [...items]
    .sort((a, b) => {
      const scoreA = a.similarity ?? a.score ?? a.relevance ?? 0
      const scoreB = b.similarity ?? b.score ?? b.relevance ?? 0
      return scoreB - scoreA
    })
    .slice(0, maxItems)
}

/**
 * Extract and filter results array from a tool result.
 * Handles both string JSON and ContentBlockParam[] formats.
 */
function extractAndFilterResults(
  content: MCPToolResult,
  tool: string,
  maxItems: number,
): MCPToolResult {
  if (typeof content === 'string') {
    // Try to parse and filter JSON arrays
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed) && parsed.length > maxItems) {
        const filtered = filterByRelevance(parsed, maxItems)
        return JSON.stringify(filtered, null, 2)
      }
    } catch {
      // Not JSON — return as-is
    }
    return content
  }

  // ContentBlockParam[] — look for result arrays inside text blocks
  const textBlocks = content.filter(b => b.type === 'text')
  if (textBlocks.length === 0) return content

  const firstText = textBlocks[0]
  if (firstText.type !== 'text') return content

  try {
    const parsed = JSON.parse(firstText.text)
    if (Array.isArray(parsed) && parsed.length > maxItems) {
      const filtered = filterByRelevance(parsed, maxItems)
      const newText = firstText.text.replace(
        JSON.stringify(parsed, null, 2),
        JSON.stringify(filtered, null, 2),
      )
      return content.map(b => b === firstText ? { type: 'text' as const, text: newText } : b)
    }
  } catch {
    // Not parseable JSON — return as-is
  }

  return content
}

// Per-tool max-items defaults for result filtering
const TOOL_MAX_ITEMS: Record<string, number> = {
  'mempalace_search': 5,
  'mempalace_list_rooms': 20,
  'mempalace_list_wings': 10,
  'mempalace_get_taxonomy': 30,
  'mempalace_kg_query': 10,
  'mempalace_kg_timeline': 15,
  'mempalace_traverse': 10,
  'mempalace_find_tunnels': 10,
  'context7-query': 5,
  'context7-resolve-library-id': 3,
  'github-search_code': 10,
  'github-list_issues': 10,
  'github-get_file_contents': 3,
  'playwright-browser_snapshot': 1,
  'playwright-browser_console_messages': 20,
  'playwright-browser_network_requests': 20,
}

function getMaxItems(tool: string): number {
  return TOOL_MAX_ITEMS[tool] ?? 0 // 0 means no filtering
}

/**
 * Smart truncation — finds the best cut point (sentence/line boundary)
 * instead of raw character slicing.
 */
export function smartTruncate(
  content: string,
  maxChars: number,
  truncationMsg: string,
): string {
  if (content.length <= maxChars) {
    return content
  }

  const available = maxChars - truncationMsg.length - 10
  if (available <= 0) {
    return truncationMsg
  }

  // Try to cut at a sentence boundary first
  const sentenceMatch = content.slice(0, available).match(/.*[.!?]\s/)
  if (sentenceMatch) {
    const cut = sentenceMatch[0]
    return cut + '... ' + truncationMsg
  }

  // Fall back to line boundary
  const lineMatch = content.slice(0, available).match(/.*\n/)
  if (lineMatch) {
    const cut = lineMatch[0]
    return cut + '... ' + truncationMsg
  }

  // Last resort: hard cut at available space
  return content.slice(0, available) + '... ' + truncationMsg
}

export interface RedQueenOptions {
  /** Max tokens for tool results (default: 4000) */
  maxTokens?: number
  /** Enable deduplication (default: true) */
  enableDedup?: boolean
  /** Enable result filtering (default: true) */
  enableFiltering?: boolean
  /** Enable LLM summarization (default: false — Phase 2 opt-in) */
  enableSummarization?: boolean
  /** Enable persistent cache (Phase 3, default: true if cache available) */
  enableCache?: boolean
  /** Abort signal for LLM calls */
  signal?: AbortSignal
  /** Session ID for cache stats attribution */
  sessionId?: string
}

const DEFAULT_MAX_TOKENS = 4000
const CACHE_TTL_SECONDS = 3600 // 1 hour

/**
 * Main entry point — RedQueen compression.
 * Call this after transformMCPResult(), before truncation decision.
 *
 * Pipeline:
 * 1. Deduplication (identical tool+args+result → placeholder)
 * 2. Relevance filtering (top-N results per tool)
 * 3. LLM summarization (Phase 2 — summarize instead of truncate)
 * 4. Token budget flag (marks for smart truncation if still over budget)
 */
export async function redQueenCompress(
  content: MCPToolResult,
  server: string,
  tool: string,
  args: unknown,
  options: RedQueenOptions = {},
): Promise<{ content: MCPToolResult; stats: CompressionStats }> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
  const enableDedup = options.enableDedup ?? true
  const enableFiltering = options.enableFiltering ?? true
  const enableSummarization = options.enableSummarization ?? false
  const enableCache = options.enableCache ?? isCacheAvailable()
  const sessionId = options.sessionId ?? 'default'
  const stats: CompressionStats = {
    tokensSaved: 0,
    dedupHits: 0,
    filteredItems: 0,
    wasCompressed: false,
    summarizationRatio: 0,
    cacheHit: false,
  }

  if (!content) {
    return { content, stats }
  }

  const originalSize = getContentSizeEstimate(content)
  const argsHash = computeCacheKey(tool, args)

  // Step 0: Persistent cache check — try to get from cross-session cache
  if (enableCache && isCacheAvailable()) {
    const cached = getCachedResult(tool, argsHash)
    if (cached) {
      const cachedBlock = typeof content === 'string'
        ? cached.content
        : [{ type: 'text' as const, text: cached.content }]

      stats.cacheHit = true
      stats.tokensSaved = originalSize
      stats.wasCompressed = true
      logCompressionEvent('cache_hit', server, tool, stats)
      return { content: cachedBlock, stats }
    }
  }

  // Step 1: Deduplication
  if (enableDedup) {
    const dedup = deduplicateToolResult(server, tool, args, content)
    if (dedup.isDuplicate) {
      stats.dedupHits = 1
      stats.wasCompressed = true
      stats.tokensSaved = originalSize
      logCompressionEvent('dedup', server, tool, stats)
      if (enableCache) {
        recordCompressionStats(tool, 'dedup', originalSize, sessionId)
      }
      return { content: dedup.content, stats }
    }
    content = dedup.content
  }

  // Step 1.5: Deterministic tool-specific reduction
  const reducedContent = applyToolReducer(content, tool)
  if (reducedContent !== content) {
    const reducedSize = getContentSizeEstimate(reducedContent)
    stats.tokensSaved += Math.max(0, getContentSizeEstimate(content) - reducedSize)
    stats.wasCompressed = true
    logCompressionEvent('reduced', server, tool, stats)
    content = reducedContent
  }

  // Step 2: Result filtering
  if (enableFiltering) {
    const maxItems = getMaxItems(tool)
    if (maxItems > 0) {
      const filtered = extractAndFilterResults(content, tool, maxItems)
      if (filtered !== content) {
        stats.filteredItems = 1
        stats.wasCompressed = true
      }
      content = filtered
      // Cache the filtered result
      if (enableCache) {
        cacheResult(tool, argsHash, content, CACHE_TTL_SECONDS)
      }
    }
  }

  // Step 3: LLM Summarization (Phase 2 — replaces truncation with semantic compression)
  if (enableSummarization && shouldSummarize(tool, content)) {
    const { summary, originalLength, summaryLength } = await summarizeToolResult(
      content,
      tool,
      { signal: options.signal },
    )

    const summarizationRatio = originalLength > 0
      ? (1 - summaryLength / originalLength) * 100
      : 0

    // If LLM summarization achieved meaningful compression, use the summary
    if (summarizationRatio > 20) {
      const summaryBlock = typeof content === 'string'
        ? summary
        : [{ type: 'text' as const, text: summary }]

      stats.summarizationRatio = summarizationRatio
      stats.tokensSaved = originalSize - getContentSizeEstimate(summaryBlock)
      stats.wasCompressed = true

      logCompressionEvent('summarized', server, tool, stats)
      if (enableCache) {
        cacheResult(tool, argsHash, summaryBlock, CACHE_TTL_SECONDS)
        recordCompressionStats(tool, 'summarized', stats.tokensSaved, sessionId)
      }
      return { content: summaryBlock, stats }
    }
  }

  // Step 4: Token budget check - mark for smart truncation downstream
  const newSize = getContentSizeEstimate(content)
  stats.tokensSaved = Math.max(0, originalSize - newSize)

  if (newSize > maxTokens) {
    stats.wasCompressed = true
    // Cache even the compressed-to-budget result for future hits
    if (enableCache) {
      cacheResult(tool, argsHash, content, CACHE_TTL_SECONDS)
      recordCompressionStats(tool, 'over_budget', stats.tokensSaved, sessionId)
    }
    logCompressionEvent('over_budget', server, tool, stats)
  }

  return { content, stats }
}

function logCompressionEvent(
  reason: string,
  server: string,
  tool: string,
  stats: CompressionStats,
): void {
  if (REDQUEEN_DEBUG) {
    console.error(
      `[RedQueen] ${reason} | server=${server} tool=${tool} ` +
      `tokensSaved=${stats.tokensSaved} dedup=${stats.dedupHits} filtered=${stats.filteredItems} ` +
      `cacheHit=${stats.cacheHit} compression=${stats.summarizationRatio.toFixed(0)}%`,
    )
  }
  logEvent('redqueen_mcp_tool_compressed', {
    reason,
    server,
    tool,
    tokensSaved: stats.tokensSaved,
    dedupHits: stats.dedupHits,
    filteredItems: stats.filteredItems,
  })
}

/**
 * Check if RedQueen compression is enabled via environment.
 */
export function isRedQueenEnabled(): boolean {
  return process.env.ENABLE_REDQUEEN === 'true'
}

/**
 * Get RedQueen max token budget.
 */
export function getRedQueenMaxTokens(): number {
  const env = process.env.REDQUEEN_MAX_TOKENS
  if (env) {
    const parsed = parseInt(env, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return DEFAULT_MAX_TOKENS
}
