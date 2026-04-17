/**
 * RedQueen Phase 2 — LLM-Powered Tool Result Summarization
 *
 * Replaces verbose MCP tool results with concise LLM-generated summaries
 * when they exceed token budgets. Tool-specific prompts preserve semantic fidelity.
 */
import { logEvent } from '../analytics/index.js'
import type { MCPToolResult } from '../../utils/mcpValidation.js'

// ============================================================================
// Tool-Specific Summarization Prompts
// ============================================================================

interface ToolSummaryConfig {
  /** Max tokens in the summary output */
  maxSummaryTokens: number
  /** Max input chars sent to summarizer */
  maxInputChars: number
  /** System prompt role for this tool type */
  role: string
  /** Template for the summarization prompt */
  promptTemplate: string
}

const TOOL_SUMMARY_CONFIGS: Record<string, ToolSummaryConfig> = {
  // --- Memory / Knowledge Tools ---
  'mempalace_search': {
    maxSummaryTokens: 300,
    maxInputChars: 2500,
    role: 'memory archivist',
    promptTemplate: `Summarize these memory search results. Include: topics found, number of results, key facts discovered, any dates or decisions mentioned. Format as a structured note.`,
  },
  'mempalace_kg_query': {
    maxSummaryTokens: 250,
    maxInputChars: 2000,
    role: 'knowledge graph analyst',
    promptTemplate: `Summarize these entity relationships. List each fact as "ENTITY → relationship → ENTITY" with dates if present. Note any temporal changes (started/ended dates).`,
  },
  'mempalace_kg_timeline': {
    maxSummaryTokens: 300,
    maxInputChars: 2500,
    role: 'timeline analyst',
    promptTemplate: `Summarize this chronological story of an entity. List key events in order with dates. Note the beginning and current state.`,
  },
  'mempalace_status': {
    maxSummaryTokens: 200,
    maxInputChars: 1500,
    role: 'memory system reporter',
    promptTemplate: `Summarize the memory system status. Report: total drawers, number of wings/rooms, key topics stored. Be concise.`,
  },
  'mempalace_list_rooms': {
    maxSummaryTokens: 200,
    maxInputChars: 1500,
    role: 'memory catalog',
    promptTemplate: `List the rooms found. Group by theme if possible. Note which rooms have the most content.`,
  },
  'mempalace_list_wings': {
    maxSummaryTokens: 200,
    maxInputChars: 1500,
    role: 'memory catalog',
    promptTemplate: `List the wings found. Report the type (person/project) and drawer count for each.`,
  },
  'mempalace_get_taxonomy': {
    maxSummaryTokens: 300,
    maxInputChars: 2500,
    role: 'memory structure reporter',
    promptTemplate: `Summarize this memory taxonomy. List all wings with their rooms and counts. Group by category if helpful.`,
  },
  'mempalace_traverse': {
    maxSummaryTokens: 250,
    maxInputChars: 2000,
    role: 'memory navigator',
    promptTemplate: `Describe this memory graph traversal. List connected rooms and their relationships. Note any cross-wing connections.`,
  },
  'mempalace_find_tunnels': {
    maxSummaryTokens: 200,
    maxInputChars: 1500,
    role: 'memory connector',
    promptTemplate: `List the rooms that bridge different domains. For each, note which wings it connects and what topic it represents.`,
  },
  'mempalace_kg_stats': {
    maxSummaryTokens: 150,
    maxInputChars: 1200,
    role: 'memory system reporter',
    promptTemplate: `Summarize the knowledge graph stats. Report: entity count, triple count, number of current vs expired facts, relationship types.`,
  },

  // --- Context / Search Tools ---
  'context7-query': {
    maxSummaryTokens: 300,
    maxInputChars: 2500,
    role: 'documentation analyst',
    promptTemplate: `Summarize these documentation results. For each result: note the library/API, what it covers, and relevance to the query. Flag if the information appears outdated.`,
  },
  'context7-resolve-library-id': {
    maxSummaryTokens: 100,
    maxInputChars: 800,
    role: 'library resolver',
    promptTemplate: `Report the resolved library name and version. Note any alternative names or related packages.`,
  },

  // --- GitHub Tools ---
  'github-list_issues': {
    maxSummaryTokens: 300,
    maxInputChars: 2500,
    role: 'issue tracker',
    promptTemplate: `Summarize these GitHub issues. Group by: open vs closed. For each, note the title, number, labels, and current state. Prioritize bugs and feature requests.`,
  },
  'github-get_file_contents': {
    maxSummaryTokens: 400,
    maxInputChars: 4000,
    role: 'code analyst',
    promptTemplate: `Summarize this file content. Report: file type, key functions/classes defined, imports, and the overall purpose. Note line count.`,
  },
  'github-search_code': {
    maxSummaryTokens: 350,
    maxInputChars: 3000,
    role: 'code search analyst',
    promptTemplate: `Summarize these code search results. For each match: note the file, function/class, and relevance. Group by file or topic.`,
  },
  'github-list_commits': {
    maxSummaryTokens: 250,
    maxInputChars: 2000,
    role: 'commit historian',
    promptTemplate: `Summarize recent commits. List the most significant changes with dates. Note any patterns (e.g., mostly refactoring, new features).`,
  },
  'github-get_pull_request': {
    maxSummaryTokens: 350,
    role: 'PR analyst',
    promptTemplate: `Summarize this pull request. Report: title, author, status, number of files changed, additions/deletions. Note key changes and review status.`,
  },
  'github-get_pull_request_files': {
    maxSummaryTokens: 300,
    maxInputChars: 2500,
    role: 'PR diff analyst',
    promptTemplate: `Summarize the files changed in this PR. For each file: note the change type (added/modified/deleted) and a one-line description of what changed.`,
  },

  // --- Playwright Tools ---
  'playwright-browser_snapshot': {
    maxSummaryTokens: 150,
    maxInputChars: 1200,
    role: 'UI inspector',
    promptTemplate: `Describe the page snapshot. Report: page title, key elements visible, any errors or warnings. Note navigation state.`,
  },
  'playwright-browser_console_messages': {
    maxSummaryTokens: 200,
    maxInputChars: 1500,
    role: 'console analyst',
    promptTemplate: `Summarize browser console output. Group by type: errors (red), warnings (yellow), info. For errors, note the message and frequency.`,
  },
  'playwright-browser_network_requests': {
    maxSummaryTokens: 250,
    maxInputChars: 2000,
    role: 'network inspector',
    promptTemplate: `Summarize network activity. Report: total requests, failed requests, slowest requests, API calls made. Note any errors.`,
  },

  // --- Generic fallback ---
  'default': {
    maxSummaryTokens: 200,
    maxInputChars: 1500,
    role: 'data analyst',
    promptTemplate: `Summarize this tool output concisely. Extract the key information, decisions, or findings. Prioritize actionable items. Aim for 3-5 bullet points in plain text.`,
  },
}

function getToolConfig(tool: string): ToolSummaryConfig {
  // Try exact match first, then prefix match, then default
  if (TOOL_SUMMARY_CONFIGS[tool]) return TOOL_SUMMARY_CONFIGS[tool]

  // Try server-prefixed match (e.g., "context7-query" already covered above)
  const prefix = tool.split('_')[0]
  const prefixMatch = Object.keys(TOOL_SUMMARY_CONFIGS).find(
    k => k.startsWith(prefix + '_') && TOOL_SUMMARY_CONFIGS[k]
  )
  if (prefixMatch) return TOOL_SUMMARY_CONFIGS[prefixMatch]

  return TOOL_SUMMARY_CONFIGS['default']
}

// ============================================================================
// Content Extraction
// ============================================================================

function extractText(content: MCPToolResult): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .filter(b => b.type === 'text')
    .map(b => b.type === 'text' ? b.text : '')
    .join('\n')
}


function truncateForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  // Try to cut at a sentence boundary
  const match = text.slice(0, maxChars).match(/.*[.!?]\s/)
  if (match) return match[0] + '...'
  return text.slice(0, maxChars) + '...'
}

// ============================================================================
// LLM Summarization
// ============================================================================

const SUMMARIZER_SYSTEM_PROMPT = 'Summarize tool output. Plain text only. No markdown or tool calls.'

export interface SummarizeOptions {
  signal?: AbortSignal
  /** Override max summary tokens */
  maxSummaryTokens?: number
}

export async function summarizeToolResult(
  content: MCPToolResult,
  tool: string,
  options: SummarizeOptions = {},
): Promise<{ summary: string; originalLength: number; summaryLength: number }> {
  const text = extractText(content)
  if (!text) {
    return { summary: '[empty result]', originalLength: 0, summaryLength: 13 }
  }

  const originalLength = text.length
  const config = getToolConfig(tool)
  const maxSummaryTokens = options.maxSummaryTokens ?? config.maxSummaryTokens

  // Keep summarizer input bounded so token savings are not erased by the summarizer call itself.
  const truncated = truncateForPrompt(text, config.maxInputChars)

  const prompt = `Role: ${config.role}
Max chars: ${maxSummaryTokens}
Keep key facts, numbers, dates, decisions, names, paths, identifiers.
Task: ${config.promptTemplate}
Input:
${truncated}`

  try {
    // Dynamic import to avoid circular dependencies
    const { queryHaiku, queryWithModel } = await import('../api/claude.js')
    const { asSystemPrompt } = await import('../../utils/systemPrompt.js')
    const { getAPIProvider } = await import('../../utils/model/providers.js')

    const provider = getAPIProvider()
    const useFreeModel = provider === 'openrouter' || provider === 'openai' || provider === 'zen'

    let response: { message: { content: string | Array<{ type: string; text?: string }> } }

    if (useFreeModel) {
      response = await queryWithModel({
        systemPrompt: asSystemPrompt([
          `${SUMMARIZER_SYSTEM_PROMPT} Max ${maxSummaryTokens} chars.`,
        ]),
        userPrompt: prompt,
        signal: options.signal || new AbortController().signal,
        options: {
          isNonInteractiveSession: true,
          hasAppendSystemPrompt: false,
          querySource: 'redqueen_summarize',
          agents: [],
          mcpTools: [],
          enablePromptCaching: false,
          model: 'nvidia/llama-3.1-nemotron-super-49b-v1',
        },
      })
    } else {
      response = await queryHaiku({
        systemPrompt: asSystemPrompt([
          `${SUMMARIZER_SYSTEM_PROMPT} Max ${maxSummaryTokens} chars.`,
        ]),
        userPrompt: prompt,
        signal: options.signal || new AbortController().signal,
        options: {
          isNonInteractiveSession: true,
          hasAppendSystemPrompt: false,
          querySource: 'redqueen_summarize',
          agents: [],
          mcpTools: [],
          enablePromptCaching: false,
        },
      })
    }

    // Extract text from response
    const respContent = response.message.content
    let summary: string

    if (typeof respContent === 'string') {
      summary = respContent.trim()
    } else if (Array.isArray(respContent)) {
      summary = respContent
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text ?? '')
        .join(' ')
        .trim()
    } else {
      summary = ''
    }

    const summaryLength = summary.length

    // Log success
    logEvent('redqueen_summarize_success', {
      tool,
      originalLength,
      summaryLength,
      compressionRatio: originalLength > 0 ? (1 - summaryLength / originalLength) * 100 : 0,
    })

    return { summary, originalLength, summaryLength }
  } catch (error) {
    // Fallback to truncated content on error
    logEvent('redqueen_summarize_failed', {
      tool,
      error: error instanceof Error ? error.message : String(error),
    })

    // Return a graceful truncation instead of the full content
    const fallback = truncateForPrompt(
      `Error summarizing result. Raw result: ${truncated.slice(0, 500)}`,
      maxSummaryTokens,
    )
    return { summary: fallback, originalLength, summaryLength: fallback.length }
  }
}

/**
 * Check if a tool result should use LLM summarization vs truncation.
 * Returns true if the tool has a custom summarization config and the content is large enough.
 */
export function shouldSummarize(tool: string, content: MCPToolResult): boolean {
  const text = extractText(content)
  const config = getToolConfig(tool)
  if (config.role === 'data analyst' && TOOL_SUMMARY_CONFIGS['default'].maxSummaryTokens === config.maxSummaryTokens) {
    // This is the default fallback — only summarize if content is very large
    return text.length > 3000
  }
  // Tool has a specific config — summarize if content is moderately large
  return text.length > 500
}
