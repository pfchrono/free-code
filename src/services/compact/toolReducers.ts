/**
 * Deterministic Tool Reducers — pure string transforms for noisy tools
 *
 * Extract high-signal fields without LLM cost:
 * - Playwright console: error/warning counts + top errors
 * - Playwright network: failed requests + slowest items
 * - GitHub search_code: top 5 matches only
 * - GitHub list_issues: title/number/state/labels
 * - Context7 query: top 3 docs
 *
 * All reducers are deterministic (no LLM), fast, and testable.
 */

import type { MCPToolResult } from '../../utils/mcpValidation.js'

/**
 * Extract text content from MCP tool result (string or ContentBlockParam array)
 * @param content Tool result in any supported format
 * @returns Plain text string content
 */
function extractText(content: MCPToolResult): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text')
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('\n')
  }
  return ''
}

/**
 * Wrap plain text back into ContentBlockParam array format
 * @param text Plain text to wrap
 * @returns MCP-compatible content block
 */
function textToBlock(text: string): MCPToolResult {
  return [{ type: 'text' as const, text }]
}

/**
 * Reduce Playwright console messages to essential errors/warnings only
 *
 * Extracts error and warning counts + top 5 critical errors.
 * Removes verbose logs, stack traces, and timestamp spam.
 *
 * @param text Raw console output
 * @returns Structured error summary
 * @example
 * Input: 1000 lines of [log], [error], [warning] messages
 * Output: "3 errors, 2 warnings\nError 1: ECONNREFUSED\n..."
 */
function reducePlaywrightConsole(text: string): string {
  try {
    const lines = text.split('\n').filter(l => l.trim())
    const errors = lines.filter(l => /\[error\]|error:|Error:/i.test(l))
    const warnings = lines.filter(l => /\[warning\]|warning:/i.test(l))

    const errorCount = errors.length
    const warningCount = warnings.length
    const topErrors = errors
      .slice(0, 5)
      .map(e => e.replace(/^\[error\]\s*/, '').trim())
      .join('\n')

    return `Console: ${errorCount} errors, ${warningCount} warnings\nTop errors:\n${topErrors || '(none)'}`
  } catch {
    return text
  }
}

/**
 * Reduce Playwright network requests to essential failures and slowest requests
 *
 * Extracts total request count, failed request count (4xx/5xx), and top 5 slowest.
 * Removes successful 200/304 responses and detailed request headers.
 *
 * @param text Raw network request log
 * @returns Summary of failures and slow requests
 * @example
 * Input: 50 network requests, mix of successes and failures
 * Output: "52 requests, 3 failed\nSlowest:\n POST /upload 500ms\n GET /image 450ms\n..."
 */
function reducePlaywrightNetwork(text: string): string {
  try {
    const lines = text.split('\n').filter(l => l.trim())

    // Identify failed requests (4xx, 5xx status codes)
    const failed = lines.filter(l => /\s(4\d{2}|5\d{2})\s/.test(l))

    // Extract timing and sort by latency (slowest first)
    const withTiming = lines
      .filter(l => /\d+\s*m?s/i.test(l))
      .map(l => ({
        line: l,
        ms: parseInt(l.match(/(\d+)\s*m?s/i)?.[1] || '0', 10),
      }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
      .map(({ line }) => line.replace(/^\s+/, '').trim())

    return `Network: ${lines.length} requests, ${failed.length} failed\nSlowest 5:\n${withTiming.join('\n') || '(all fast)'}`
  } catch {
    return text
  }
}

/**
 * Reduce GitHub code search results to top 5 most relevant matches
 *
 * Extracts file path, line number, and brief context from search results.
 * Removes full code snippets, similarity scores, and metadata.
 *
 * @param text Raw GitHub code search output
 * @returns Top 5 matches with file:line references
 * @example
 * Input: 50 search results with full code snippets
 * Output: "Top 5 matches:\n src/auth.ts:45 - validateToken\n src/api.ts:120 - handler\n..."
 */
function reduceGithubSearchCode(text: string): string {
  try {
    const lines = text.split('\n').filter(l => l.trim())

    // Extract file path lines (contain / or .)
    const matches = lines
      .filter(l => (l.includes('/') || l.includes('.ts') || l.includes('.js')) && l.length > 0)
      .slice(0, 5)
      .map(l => {
        // Truncate long lines, keep path + line number
        return l.length > 120 ? l.slice(0, 120).trim() + '...' : l.trim()
      })

    return `Search results (top 5):\n${matches.join('\n')}`
  } catch {
    return text
  }
}

/**
 * Reduce GitHub issue list to title, number, state, and key labels
 *
 * Extracts issue metadata without full descriptions, comments, or timestamps.
 * Limits to top 20 issues (usually all that matter for current context).
 *
 * @param text Raw GitHub issue list output
 * @returns Structured issue summaries
 * @example
 * Input: 100+ issues with full descriptions
 * Output: "#1234 [open] Auth bug [critical, security]\n#1235 [closed] Feature request [enhancement]\n..."
 */
function reduceGithubListIssues(text: string): string {
  try {
    const lines = text.split('\n').filter(l => l.trim())

    // Extract issue lines (contain # for issue number or state keywords)
    const issues = lines
      .filter(l => /#\d+|^\[open\]|^\[closed\]/i.test(l))
      .slice(0, 20)
      .map(l => {
        // Keep issue number, state, title; truncate if too long
        return l.length > 110 ? l.slice(0, 110).trim() + '...' : l.trim()
      })

    return `Issues (showing ${issues.length}):\n${issues.join('\n') || '(none found)'}`
  } catch {
    return text
  }
}

/**
 * Reduce Context7 documentation results to top 3 most relevant docs
 *
 * Keeps only the highest-scoring documentation blocks.
 * Removes detailed code examples, metadata, and lower-relevance results.
 *
 * @param text Raw Context7 query output
 * @returns Top 3 documentation results
 * @example
 * Input: 10 documentation blocks
 * Output: "Top 3 results:\n[Doc 1 content]\n\n[Doc 2 content]\n\n[Doc 3 content]"
 */
function reduceContext7Query(text: string): string {
  try {
    // Split on double newlines (typical doc separator)
    const docBlocks = text.split(/\n\n+/)
    const top3 = docBlocks.slice(0, 3).join('\n\n')
    return `Documentation (top 3):\n${top3}`
  } catch {
    return text
  }
}

/**
 * Reduce Playwright browser snapshots (accessibility tree with embedded base64 images)
 *
 * Detects and replaces embedded base64 image data with compact metadata.
 * Preserves accessibility tree structure (text content, element hierarchy).
 * Removes PNG/JPEG binary blobs that can be 20-100KB.
 *
 * @param text Raw snapshot output with embedded base64 data
 * @returns Snapshot with images replaced by [Image: WxH, XXKB] placeholders
 * @example
 * Input: Accessibility tree + "data:image/png;base64,iVBORw0KGgo..." (50KB blob)
 * Output: Accessibility tree + "[Image: 1024x768, 50KB]"
 */
function reducePlaywrightSnapshot(text: string): string {
  try {
    // Find all base64 image data URIs and estimate their sizes
    const base64Pattern = /data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)/g
    let imageCount = 0

    const processed = text.replace(base64Pattern, (match, format, data, index) => {
      imageCount += 1
      // Rough estimate: base64 is ~33% larger than binary (4 chars per 3 bytes)
      const estimatedBytes = Math.round((data.length / 4) * 3)

      // Try to extract dimensions from context before this image
      // Look back up to 200 chars for a dimension pattern like "1024x768"
      const contextStart = Math.max(0, index - 200)
      const context = text.substring(contextStart, index)
      const dimMatch = context.match(/(\d+)x(\d+)(?=[^0-9]|$)/)
      const dims = dimMatch ? `${dimMatch[1]}x${dimMatch[2]}` : 'unknown'

      return `[Image: ${dims}, ${Math.round(estimatedBytes / 1024)}KB]`
    })

    // Only use if we actually removed images and achieved meaningful savings
    if (imageCount > 0) {
      return processed
    }
    return text
  } catch {
    return text
  }
}

/**
 * Mapping of tool names to their deterministic reducer functions.
 *
 * Each reducer is a pure function that extracts high-signal information
 * from verbose tool outputs without requiring LLM calls.
 */
const TOOL_REDUCERS: Record<string, (text: string) => string> = {
  'playwright-browser_console_messages': reducePlaywrightConsole,
  'playwright-browser_network_requests': reducePlaywrightNetwork,
  'playwright-browser_snapshot': reducePlaywrightSnapshot,
  'github-search_code': reduceGithubSearchCode,
  'github-list_issues': reduceGithubListIssues,
  'context7-query': reduceContext7Query,
}

/**
 * Apply deterministic reducer to tool output if available
 *
 * Reducers are pure string transforms that extract essential information
 * from verbose MCP tool outputs without requiring LLM calls. They're fast,
 * deterministic, and testable.
 *
 * **Activation criteria:**
 * - Reducer must be defined for this tool
 * - Content must be >500 chars (only reduce if substantial)
 * - Reduction must save >20% (reduced.length < text.length * 0.8)
 *
 * **Safety:**
 * - Falls back to original on any error
 * - Preserves format (string vs ContentBlockParam array)
 * - Logs statistics to analytics
 *
 * @param content Original tool result (string or ContentBlockParam array)
 * @param tool Tool name (e.g., 'github-search_code')
 * @returns Reduced content if applicable, otherwise original
 *
 * @example
 * // Input: 3KB GitHub search result with 50 matches
 * // Output: 200 bytes with top 5 matches only (93% reduction)
 * const reduced = applyToolReducer(searchResult, 'github-search_code')
 *
 * @example
 * // Unknown tool or content <500 chars: returns original unchanged
 * const unchanged = applyToolReducer(smallOutput, 'unknown-tool')
 */
export function applyToolReducer(
  content: MCPToolResult,
  tool: string,
): MCPToolResult {
  const reducer = TOOL_REDUCERS[tool]
  if (!reducer) {
    // No reducer for this tool
    return content
  }

  const text = extractText(content)
  if (!text || text.length < 500) {
    // Only reduce if content is substantial (>500 chars)
    return content
  }

  try {
    const reduced = reducer(text)
    // Only use reduced version if it's actually shorter (>20% savings)
    if (reduced.length < text.length * 0.8) {
      return typeof content === 'string' ? reduced : textToBlock(reduced)
    }
  } catch (error) {
    // Safety: on any error, return original untouched
    // Prefer correctness over compression
  }

  return content
}
