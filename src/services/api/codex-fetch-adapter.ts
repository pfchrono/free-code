/**
 * Codex Fetch Adapter
 *
 * Intercepts fetch calls from the Anthropic SDK and routes them to
 * ChatGPT's Codex backend API, translating between Anthropic Messages API
 * format and OpenAI Responses API format.
 *
 * Supports:
 * - Text messages (user/assistant)
 * - System prompts → instructions
 * - Tool definitions (Anthropic input_schema → OpenAI parameters)
 * - Tool use (tool_use → function_call, tool_result → function_call_output)
 * - Streaming events translation
 *
 * Endpoint: https://chatgpt.com/backend-api/codex/responses
 */

import axios from 'axios'
import { createHash } from 'crypto'
import { Readable } from 'stream'
import { roughTokenCountEstimation, roughTokenCountEstimationForMessages } from '../tokenEstimation.js'
import { logForDebugging } from '../../utils/debug.js'
import { getCodexOAuthTokens } from '../../utils/auth.js'
import { reportAnthropicHostedRequest } from '../../utils/anthropicLeakDetection.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { setCodexUsage, type CodexRateLimit } from './codexUsage.js'

// ── Available Codex models ──────────────────────────────────────────
type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'
type CodexModelFamily = 'codex' | 'gpt'

type CodexModelDefinition = {
  id: string
  label: string
  description: string
  family: CodexModelFamily
  supportsVision: boolean
  supportsTools: boolean
  supportedInApi: boolean
  defaultReasoningEffort: CodexReasoningEffort
  supportedReasoningEfforts: readonly CodexReasoningEffort[]
  contextWindow: number
  maxContextWindow: number
  additionalSpeedTiers?: readonly string[]
  upgrade?: string
}

const GPT_5_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const

export const CODEX_MODELS: readonly CodexModelDefinition[] = [
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Strong model for everyday coding',
    family: 'gpt',
    supportsVision: true,
    supportsTools: true,
    supportedInApi: true,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: GPT_5_REASONING_EFFORTS,
    contextWindow: 272000,
    maxContextWindow: 1000000,
    additionalSpeedTiers: ['fast'],
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    description: 'Frontier model for complex coding, research, and real-world work',
    family: 'gpt',
    supportsVision: true,
    supportsTools: true,
    supportedInApi: true,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: GPT_5_REASONING_EFFORTS,
    contextWindow: 272000,
    maxContextWindow: 272000,
    additionalSpeedTiers: ['fast'],
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    description: 'Small, fast, and cost-efficient model for simpler coding tasks',
    family: 'gpt',
    supportsVision: true,
    supportsTools: true,
    supportedInApi: true,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: GPT_5_REASONING_EFFORTS,
    contextWindow: 272000,
    maxContextWindow: 272000,
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    description: 'Coding-optimized model',
    family: 'codex',
    supportsVision: true,
    supportsTools: true,
    supportedInApi: true,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: GPT_5_REASONING_EFFORTS,
    contextWindow: 272000,
    maxContextWindow: 272000,
    upgrade: 'gpt-5.4',
  },
  {
    id: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3 Codex Spark',
    description: 'Ultra-fast coding model',
    family: 'codex',
    supportsVision: false,
    supportsTools: true,
    supportedInApi: false,
    defaultReasoningEffort: 'high',
    supportedReasoningEfforts: GPT_5_REASONING_EFFORTS,
    contextWindow: 128000,
    maxContextWindow: 128000,
  },
  {
    id: 'gpt-5.2',
    label: 'GPT-5.2',
    description: 'Optimized for professional work and long-running agents',
    family: 'gpt',
    supportsVision: true,
    supportsTools: true,
    supportedInApi: true,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: GPT_5_REASONING_EFFORTS,
    contextWindow: 272000,
    maxContextWindow: 272000,
    upgrade: 'gpt-5.4',
  },
] as const

export const DEFAULT_CODEX_MODEL = 'gpt-5.4'

function normalizeCodexModel(model: string): string {
  const normalized = model.trim().toLowerCase()
  if (normalized === 'codexspark' || normalized === 'chatgpt-5.3-codex-spark') {
    return 'gpt-5.3-codex-spark'
  }
  if (normalized === 'codexplan') {
    return DEFAULT_CODEX_MODEL
  }
  if (
    normalized === 'gpt-5.2-codex' ||
    normalized === 'gpt-5.1-codex-max' ||
    normalized === 'gpt-5.1-codex'
  ) {
    return 'gpt-5.3-codex'
  }
  if (normalized === 'gpt-5.1-codex-mini') {
    return 'gpt-5.4-mini'
  }
  return normalized
}

function getCodexModelDefinition(model: string): CodexModelDefinition | undefined {
  const normalizedModel = normalizeCodexModel(model)
  return CODEX_MODELS.find(m => m.id === normalizedModel)
}

function getCodexReasoning(model: string): { effort: CodexReasoningEffort } {
  return { effort: getCodexModelDefinition(model)?.defaultReasoningEffort ?? 'medium' }
}

function getCodexContextWindowSize(model: string): number {
  return getCodexModelDefinition(model)?.contextWindow ?? DEFAULT_CODEX_CONTEXT_WINDOW_SIZE
}

/**
 * Maps Claude model names to corresponding Codex model names.
 * @param claudeModel - The Claude model name to map
 * @returns The corresponding Codex model ID
 */
export function mapClaudeModelToCodex(claudeModel: string | null): string {
  if (!claudeModel) return DEFAULT_CODEX_MODEL
  const normalizedModel = normalizeCodexModel(claudeModel)
  if (isCodexModel(normalizedModel)) return normalizedModel
  const lower = claudeModel.toLowerCase()
  if (lower.includes('opus')) return 'gpt-5.3-codex'
  if (lower.includes('haiku')) return 'gpt-5.4-mini'
  if (lower.includes('sonnet')) return 'gpt-5.4'
  return DEFAULT_CODEX_MODEL
}

/**
 * Checks if a given model string is a valid Codex model.
 * @param model - The model string to check
 * @returns True if the model is a Codex model, false otherwise
 */
export function isCodexModel(model: string): boolean {
  return getCodexModelDefinition(model) !== undefined
}

function parseOptionalNumber(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCodexReset(value: string | null): string | null {
  if (!value) return null
  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) {
    return new Date(numericValue * 1000).toISOString()
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString()
}

function extractCodexRateLimits(headers: Headers): CodexRateLimit[] {
  const tokenLimit = parseOptionalNumber(headers.get('x-ratelimit-limit-tokens'))
  const tokenRemaining = parseOptionalNumber(headers.get('x-ratelimit-remaining-tokens'))
  const tokenReset = parseCodexReset(headers.get('x-ratelimit-reset-tokens'))
  const requestLimit = parseOptionalNumber(headers.get('x-ratelimit-limit-requests'))
  const requestRemaining = parseOptionalNumber(headers.get('x-ratelimit-remaining-requests'))
  const requestReset = parseCodexReset(headers.get('x-ratelimit-reset-requests'))

  const limits: CodexRateLimit[] = []
  if (tokenLimit !== null || tokenRemaining !== null || tokenReset !== null) {
    limits.push({
      label: 'Tokens',
      limit: tokenLimit,
      remaining: tokenRemaining,
      used_percentage:
        tokenLimit && tokenRemaining !== null
          ? ((tokenLimit - tokenRemaining) / tokenLimit) * 100
          : null,
      resets_at: tokenReset,
    })
  }
  if (requestLimit !== null || requestRemaining !== null || requestReset !== null) {
    limits.push({
      label: 'Requests',
      limit: requestLimit,
      remaining: requestRemaining,
      used_percentage:
        requestLimit && requestRemaining !== null
          ? ((requestLimit - requestRemaining) / requestLimit) * 100
          : null,
      resets_at: requestReset,
    })
  }
  return limits
}

// ── JWT helpers ─────────────────────────────────────────────────────

const JWT_CLAIM_PATH = 'https://api.openai.com/auth'

/**
 * Extracts the account ID from a Codex JWT token.
 * @param token - The JWT token to extract the account ID from
 * @returns The account ID
 * @throws Error if the token is invalid or account ID cannot be extracted
 */
function extractAccountId(token: string): string {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Invalid token')
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    )
    const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id
    if (!accountId) throw new Error('No account ID in token')
    return accountId
  } catch {
    throw new Error('Failed to extract account ID from Codex token')
  }
}

// ── Types ───────────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | AnthropicContentBlock[]
  [key: string]: unknown
}

interface AnthropicMessage {
  role: string
  content: string | AnthropicContentBlock[]
}

interface AnthropicTool {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
}

interface ToolReferenceBlock {
  type: 'tool_reference'
  tool_name: string
}

type CodexInputItem = Record<string, unknown>
type CodexReasoningItem = Record<string, unknown>

const MAX_REASONING_CACHE_ENTRIES = 512
const DEFAULT_CODEX_CONTEXT_WINDOW_SIZE = 272000
const DEFAULT_CODEX_DEDUP_TTL_MS = 15_000
const CODEX_REQUEST_TIMEOUT_MS = 120_000
const reasoningItemsByToolCall = new Map<string, CodexReasoningItem[]>()

function getCodexDedupTtlMs(): number {
  const raw = Number(process.env.CODEX_DEDUP_TTL_MS)
  if (!Number.isInteger(raw)) return DEFAULT_CODEX_DEDUP_TTL_MS
  return Math.max(raw, 1_000)
}

function normalizeAxiosHeaders(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const normalized = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized.set(key, value.join(', '))
      continue
    }
    if (typeof value === 'string') {
      normalized.set(key, value)
    }
  }
  return normalized
}

async function postCodexResponses(
  token: string,
  accountId: string,
  codexBody: Record<string, unknown>,
): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    Authorization: `Bearer ${token}`,
    'chatgpt-account-id': accountId,
    originator: 'pi',
    'OpenAI-Beta': 'responses=experimental',
  }
  const serializedBody = JSON.stringify(codexBody)

  try {
    return await globalThis.fetch(CODEX_BASE_URL, {
      method: 'POST',
      headers,
      body: serializedBody,
    })
  } catch (error) {
    // Bun/undici fetch can intermittently fail at transport level while
    // Node's HTTP stack succeeds; fallback keeps adapter mode from surfacing
    // as a generic Anthropic SDK connection error.
    logForDebugging(
      `[codex-adapter] fetch transport failed, retrying with axios fallback: ${String(error)}`,
      { level: 'error' },
    )

    const axiosResponse = await axios.post(CODEX_BASE_URL, serializedBody, {
      headers,
      responseType: 'stream',
      timeout: CODEX_REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
    })

    const streamBody = Readable.toWeb(
      axiosResponse.data as Readable,
    ) as unknown as BodyInit

    return new Response(streamBody, {
      status: axiosResponse.status,
      headers: normalizeAxiosHeaders(axiosResponse.headers),
    })
  }
}

function cacheReasoningItemsForToolCall(
  callId: string,
  items: CodexReasoningItem[],
): void {
  if (!callId || items.length === 0) return

  reasoningItemsByToolCall.set(
    callId,
    structuredClone(items),
  )

  while (reasoningItemsByToolCall.size > MAX_REASONING_CACHE_ENTRIES) {
    const oldestKey = reasoningItemsByToolCall.keys().next().value
    if (oldestKey === undefined) break
    reasoningItemsByToolCall.delete(oldestKey)
  }
}

function getCachedReasoningItemsForToolCall(
  callId: string | undefined,
): CodexReasoningItem[] {
  if (!callId) return []
  const items = reasoningItemsByToolCall.get(callId)
  return items ? structuredClone(items) : []
}

// ── Tool translation: Anthropic → Codex ─────────────────────────────

/**
 * Translates Anthropic tool definitions to Codex format.
 * @param anthropicTools - Array of Anthropic tool definitions
 * @returns Array of Codex-compatible tool objects
 */
function translateTools(anthropicTools: AnthropicTool[]): Array<Record<string, unknown>> {
  return anthropicTools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description || '',
    parameters: tool.input_schema || { type: 'object', properties: {} },
    strict: null,
  }))
}

function isToolReferenceBlock(block: unknown): block is ToolReferenceBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    (block as { type?: unknown }).type === 'tool_reference' &&
    'tool_name' in block &&
    typeof (block as { tool_name?: unknown }).tool_name === 'string'
  )
}

function formatToolReferenceExpansion(
  toolNames: string[],
  anthropicTools: AnthropicTool[],
): string {
  const toolByName = new Map(anthropicTools.map(tool => [tool.name, tool]))
  const functions = toolNames
    .map(toolName => {
      const tool = toolByName.get(toolName)
      if (!tool) return null

      return `<function>${jsonStringify({
        description: tool.description || '',
        name: tool.name,
        parameters: tool.input_schema || { type: 'object', properties: {} },
      })}</function>`
    })
    .filter((line): line is string => line !== null)

  if (functions.length === 0) {
    return ''
  }

  return `<functions>\n${functions.join('\n')}\n</functions>`
}

// ── Message translation: Anthropic → Codex input ────────────────────

/**
 * Translates Anthropic message format to Codex input format.
 * Handles text content, tool results, and image attachments.
 * @param anthropicMessages - Array of messages in Anthropic format
 * @returns Array of Codex-compatible input objects
 */
function translateMessages(
  anthropicMessages: AnthropicMessage[],
  anthropicTools: AnthropicTool[],
): CodexInputItem[] {
  const codexInput: CodexInputItem[] = []
  // Track tool_use IDs to generate call_ids for function_call_output
  // Anthropic uses tool_use_id, Codex uses call_id
  let toolCallCounter = 0

  for (const msg of anthropicMessages) {
    if (typeof msg.content === 'string') {
      codexInput.push({ role: msg.role, content: msg.content })
      continue
    }

    if (!Array.isArray(msg.content)) continue

    if (msg.role === 'user') {
      const contentArr: Array<Record<string, unknown>> = []
      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          const callId = block.tool_use_id || `call_${toolCallCounter++}`
          let outputText = ''
          if (typeof block.content === 'string') {
            outputText = block.content
          } else if (Array.isArray(block.content)) {
            const textParts = block.content
              .map(c => {
                if (c.type === 'text') return c.text
                if (c.type === 'image') return '[Image data attached]'
                return ''
              })
              .filter(part => part.length > 0)

            const expandedToolReferences = formatToolReferenceExpansion(
              block.content
                .filter(isToolReferenceBlock)
                .map(c => c.tool_name)
                .filter(
                  (toolName): toolName is string =>
                    typeof toolName === 'string' && toolName.length > 0,
                ),
              anthropicTools,
            )

            outputText = [...textParts, expandedToolReferences]
              .filter(part => part.length > 0)
              .join('\n')
          }
          codexInput.push({
            type: 'function_call_output',
            call_id: callId,
            output: outputText || '',
          })
        } else if (block.type === 'text' && typeof block.text === 'string') {
          contentArr.push({ type: 'input_text', text: block.text })
        } else if (
          block.type === 'image' &&
          typeof block.source === 'object' &&
          block.source !== null &&
          (block.source as any).type === 'base64'
        ) {
          contentArr.push({
            type: 'input_image',
            image_url: `data:${(block.source as any).media_type};base64,${(block.source as any).data}`,
          })
        }
      }
      if (contentArr.length > 0) {
        if (contentArr.length === 1 && contentArr[0].type === 'input_text') {
          codexInput.push({ role: 'user', content: contentArr[0].text })
        } else {
          codexInput.push({ role: 'user', content: contentArr })
        }
      }
    } else {
      // Process assistant or tool blocks
      for (const block of msg.content) {
        if (
          block.type === 'thinking' ||
          block.type === 'redacted_thinking'
        ) {
          continue
        } else if (block.type === 'text' && typeof block.text === 'string') {
          if (msg.role === 'assistant') {
            codexInput.push({
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: block.text, annotations: [] }],
              status: 'completed',
            })
          }
        } else if (block.type === 'tool_use') {
          const callId = block.id || `call_${toolCallCounter++}`
          const reasoningItems = getCachedReasoningItemsForToolCall(
            typeof block.id === 'string' ? block.id : undefined,
          )
          if (reasoningItems.length > 0) {
            codexInput.push(...reasoningItems)
          }
          codexInput.push({
            type: 'function_call',
            call_id: callId,
            name: block.name || '',
            arguments: JSON.stringify(block.input || {}),
          })
        }
      }
    }
  }

  return codexInput
}

function estimateSystemPromptTokens(
  systemPrompt:
    | string
    | Array<{ type: string; text?: string; cache_control?: unknown }>
    | undefined,
): number {
  if (!systemPrompt) return 0

  if (typeof systemPrompt === 'string') {
    return roughTokenCountEstimation(systemPrompt)
  }

  return systemPrompt.reduce((total, block) => {
    if (block.type !== 'text' || typeof block.text !== 'string') {
      return total
    }

    return total + roughTokenCountEstimation(block.text)
  }, 0)
}

function estimateInputTokens(
  anthropicMessages: AnthropicMessage[],
  systemPrompt:
    | string
    | Array<{ type: string; text?: string; cache_control?: unknown }>
    | undefined,
  anthropicTools: AnthropicTool[],
): number {
  const messageTokens = roughTokenCountEstimationForMessages(
    anthropicMessages as unknown as Parameters<
      typeof roughTokenCountEstimationForMessages
    >[0],
  )
  const systemTokens = estimateSystemPromptTokens(systemPrompt)
  const toolTokens =
    anthropicTools.length > 0
      ? roughTokenCountEstimation(jsonStringify(anthropicTools))
      : 0

  return messageTokens + systemTokens + toolTokens
}

function estimateCodexInputTokens(items: CodexInputItem[]): number {
  return roughTokenCountEstimation(jsonStringify(items))
}

function buildCodexRequestFingerprint(
  model: string,
  body: Record<string, unknown>,
): string {
  const serialized = jsonStringify({ model, body })
  return createHash('sha1').update(serialized).digest('hex')
}

type CachedCodexReplay = {
  payload: string
  expiresAt: number
}

type CodexInflightReplay = {
  replay: Promise<string | null>
  expiresAt: number
}

function buildReplayResponse(payload: string): Response {
  return new Response(payload, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    },
  })
}

// ── Full request translation ────────────────────────────────────────

/**
 * Translates a complete Anthropic API request body to Codex format.
 * @param anthropicBody - The Anthropic request body to translate
 * @returns Object containing the translated Codex body and model
 */
function translateToCodexBody(anthropicBody: Record<string, unknown>): {
  codexBody: Record<string, unknown>
  codexModel: string
  estimatedInputTokens: number
  requestInputTokens: number
  originalInputItemCount: number
  requestInputItemCount: number
} {
  const anthropicMessages = (anthropicBody.messages || []) as AnthropicMessage[]
  const systemPrompt = anthropicBody.system as
    | string
    | Array<{ type: string; text?: string; cache_control?: unknown }>
    | undefined
  const claudeModel = anthropicBody.model as string
  const anthropicTools = (anthropicBody.tools || []) as AnthropicTool[]

  const codexModel = mapClaudeModelToCodex(claudeModel)
  const estimatedInputTokens = estimateInputTokens(
    anthropicMessages,
    systemPrompt,
    anthropicTools,
  )

  // Build system instructions
  let instructions = ''
  if (systemPrompt) {
    instructions =
      typeof systemPrompt === 'string'
        ? systemPrompt
        : Array.isArray(systemPrompt)
          ? systemPrompt
              .filter(b => b.type === 'text' && typeof b.text === 'string')
              .map(b => b.text!)
              .join('\n')
          : ''
  }

  // Convert messages
  const input = translateMessages(anthropicMessages, anthropicTools)
  const requestInputTokens = estimateCodexInputTokens(input)

  const codexBody: Record<string, unknown> = {
    model: codexModel,
    store: false,
    stream: true,
    include: ['reasoning.encrypted_content'],
    reasoning: getCodexReasoning(codexModel),
    instructions,
    input,
    tool_choice: 'auto',
    // The Anthropic-side streaming/tool loop expects a serial tool-use
    // trajectory. Keep Codex on single-call turns until the adapter can
    // faithfully translate overlapping function_call items.
    parallel_tool_calls: false,
  }

  // Add tools if present
  if (anthropicTools.length > 0) {
    codexBody.tools = translateTools(anthropicTools)
  }

  return {
    codexBody,
    codexModel,
    estimatedInputTokens,
    requestInputTokens,
    originalInputItemCount: input.length,
    requestInputItemCount: input.length,
  }
}

// ── Response translation: Codex SSE → Anthropic SSE ─────────────────

/**
 * Formats data as Server-Sent Events (SSE) format.
 * @param event - The event type
 * @param data - The data payload
 * @returns Formatted SSE string
 */
function formatSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`
}

function extractTextFromContentPart(part: Record<string, unknown>): string {
  if (part.type === 'output_text' || part.type === 'text') {
    return typeof part.text === 'string' ? part.text : ''
  }
  return ''
}

function extractFinalTextFromItem(item: Record<string, unknown>): string {
  const content = item.content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => extractTextFromContentPart(part as Record<string, unknown>))
    .filter(Boolean)
    .join('\n')
}

function extractFinalTextFromResponse(response: Record<string, unknown>): string {
  const output = response.output
  if (!Array.isArray(output)) return ''

  return output
    .flatMap(item => {
      const record = item as Record<string, unknown>
      if (record.type === 'message') {
        return extractFinalTextFromItem(record)
      }

      const text = extractTextFromContentPart(record)
      return text ? [text] : []
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Translates Codex streaming response to Anthropic format.
 * Converts Codex SSE events into Anthropic-compatible streaming events.
 * @param codexResponse - The streaming response from Codex API
 * @param codexModel - The Codex model used for the request
 * @returns Transformed Response object with Anthropic-format stream
 */
async function translateCodexStreamToAnthropic(
  codexResponse: Response,
  codexModel: string,
  estimatedInputTokens: number,
): Promise<Response> {
  const initialRateLimits = extractCodexRateLimits(codexResponse.headers)
  if (initialRateLimits.length > 0) {
    setCodexUsage({
      rate_limits: initialRateLimits,
      context_window: {
        context_window_size: getCodexContextWindowSize(codexModel),
        used_tokens: null,
        remaining_tokens: null,
        used_percentage: null,
      },
    })
  }
  const messageId = `msg_codex_${Date.now()}`

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let contentBlockIndex = 0
      let outputTokens = 0
      let inputTokens = estimatedInputTokens

      // Emit Anthropic message_start
      controller.enqueue(
        encoder.encode(
          formatSSE(
            'message_start',
            JSON.stringify({
              type: 'message_start',
              message: {
                id: messageId,
                type: 'message',
                role: 'assistant',
                content: [],
                model: codexModel,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
            }),
          ),
        ),
      )

      // Emit ping
      controller.enqueue(
        encoder.encode(
          formatSSE('ping', JSON.stringify({ type: 'ping' })),
        ),
      )

      // Track state for tool calls
      let currentTextBlockStarted = false
      let currentToolCallId = ''
      let currentToolCallName = ''
      let currentToolCallArgs = ''
      let emittedToolCallArgs = ''
      let inToolCall = false
      let hadToolCalls = false
      let inReasoningBlock = false
      let textBlockFinalized = false
      let pendingReasoningItems: CodexReasoningItem[] = []
      let shouldFinishAfterToolCall = false
      let shouldFinishAfterResponse = false

      function attachPendingReasoningToToolCall(callId: string) {
        if (!callId || pendingReasoningItems.length === 0) return
        cacheReasoningItemsForToolCall(callId, pendingReasoningItems)
        pendingReasoningItems = []
      }

      function flushRemainingToolCallArgs() {
        const remainingArgs = currentToolCallArgs.slice(emittedToolCallArgs.length)
        if (remainingArgs.length === 0) return
        controller.enqueue(
          encoder.encode(
            formatSSE('content_block_delta', JSON.stringify({
              type: 'content_block_delta',
              index: contentBlockIndex,
              delta: {
                type: 'input_json_delta',
                partial_json: remainingArgs,
              },
            })),
          ),
        )
        emittedToolCallArgs = currentToolCallArgs
      }

      function emitCompletedTextBlock(text: string) {
        if (!text) return
        textBlockFinalized = true
        controller.enqueue(
          encoder.encode(
            formatSSE('content_block_start', JSON.stringify({
              type: 'content_block_start',
              index: contentBlockIndex,
              content_block: { type: 'text', text: '' },
            })),
          ),
        )
        controller.enqueue(
          encoder.encode(
            formatSSE('content_block_delta', JSON.stringify({
              type: 'content_block_delta',
              index: contentBlockIndex,
              delta: { type: 'text_delta', text },
            })),
          ),
        )
        controller.enqueue(
          encoder.encode(
            formatSSE('content_block_stop', JSON.stringify({
              type: 'content_block_stop',
              index: contentBlockIndex,
            })),
          ),
        )
        contentBlockIndex++
      }

      function closeCurrentToolCallBlock() {
        if (!inToolCall) return
        attachPendingReasoningToToolCall(currentToolCallId)
        flushRemainingToolCallArgs()
        closeToolCallBlock(
          controller,
          encoder,
          contentBlockIndex,
          currentToolCallId,
          currentToolCallName,
          currentToolCallArgs,
        )
        contentBlockIndex++
        inToolCall = false
        currentToolCallId = ''
        currentToolCallName = ''
        currentToolCallArgs = ''
        emittedToolCallArgs = ''
      }

      try {
        const reader = codexResponse.body?.getReader()
        if (!reader) {
          emitTextBlock(controller, encoder, contentBlockIndex, 'Error: No response body')
          finishStream(controller, encoder, outputTokens, inputTokens, false)
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let toolCallTerminateReason: string | null = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            // Parse "event: xxx" lines
            if (trimmed.startsWith('event: ')) continue

            if (!trimmed.startsWith('data: ')) continue
            const dataStr = trimmed.slice(6)
            if (dataStr === '[DONE]') continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(dataStr)
            } catch {
              continue
            }

            const eventType = event.type as string

            // ── Text output events ──────────────────────────────
            if (eventType === 'response.output_item.added') {
              const item = event.item as Record<string, unknown>
              if (item?.type === 'reasoning') {
                inReasoningBlock = true
                controller.enqueue(
                  encoder.encode(
                    formatSSE(
                      'content_block_start',
                      JSON.stringify({
                        type: 'content_block_start',
                        index: contentBlockIndex,
                        content_block: { type: 'thinking', thinking: '' },
                      }),
                    ),
                  ),
                )
              } else if (item?.type === 'message') {
                textBlockFinalized = false
                // New text message block starting
                if (inToolCall) {
                  closeCurrentToolCallBlock()
                }
              } else if (item?.type === 'function_call') {
                // Close text block if open
                if (currentTextBlockStarted) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE('content_block_stop', JSON.stringify({
                        type: 'content_block_stop',
                        index: contentBlockIndex,
                      })),
                    ),
                  )
                  contentBlockIndex++
                  currentTextBlockStarted = false
                }

                // Start tool_use block (Anthropic format)
                currentToolCallId = (item.call_id as string) || `toolu_${Date.now()}`
                currentToolCallName = (item.name as string) || ''
                currentToolCallArgs = (item.arguments as string) || ''
                emittedToolCallArgs = ''
                attachPendingReasoningToToolCall(currentToolCallId)
                inToolCall = true
                hadToolCalls = true

                controller.enqueue(
                  encoder.encode(
                    formatSSE('content_block_start', JSON.stringify({
                      type: 'content_block_start',
                      index: contentBlockIndex,
                      content_block: {
                        type: 'tool_use',
                        id: currentToolCallId,
                        name: currentToolCallName,
                        input: {},
                      },
                    })),
                  ),
                )

                if (currentToolCallArgs.length > 0) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE('content_block_delta', JSON.stringify({
                        type: 'content_block_delta',
                        index: contentBlockIndex,
                        delta: {
                          type: 'input_json_delta',
                          partial_json: currentToolCallArgs,
                        },
                      })),
                    ),
                  )
                  emittedToolCallArgs = currentToolCallArgs
                }
              }
            }

            // Text deltas
            else if (eventType === 'response.output_text.delta') {
              const text = event.delta as string
              if (typeof text === 'string' && text.length > 0) {
                if (!currentTextBlockStarted) {
                  textBlockFinalized = false
                  // Start a new text content block
                  controller.enqueue(
                    encoder.encode(
                      formatSSE('content_block_start', JSON.stringify({
                        type: 'content_block_start',
                        index: contentBlockIndex,
                        content_block: { type: 'text', text: '' },
                      })),
                    ),
                  )
                  currentTextBlockStarted = true
                }
                controller.enqueue(
                  encoder.encode(
                    formatSSE('content_block_delta', JSON.stringify({
                      type: 'content_block_delta',
                      index: contentBlockIndex,
                      delta: { type: 'text_delta', text },
                    })),
                  ),
                )
                outputTokens += 1
              }
            }

            // Finalized text content
            else if (eventType === 'response.output_text.done') {
              const text = event.text as string
              if (
                typeof text === 'string' &&
                text.length > 0 &&
                !currentTextBlockStarted &&
                !textBlockFinalized
              ) {
                emitCompletedTextBlock(text)
              }
            }
            
            // Reasoning deltas
            else if (eventType === 'response.reasoning.delta') {
              const text = event.delta as string
              if (typeof text === 'string' && text.length > 0) {
                if (!inReasoningBlock) {
                  inReasoningBlock = true
                  controller.enqueue(
                    encoder.encode(
                      formatSSE('content_block_start', JSON.stringify({
                        type: 'content_block_start',
                        index: contentBlockIndex,
                        content_block: { type: 'thinking', thinking: '' },
                      })),
                    ),
                  )
                }
                controller.enqueue(
                  encoder.encode(
                    formatSSE('content_block_delta', JSON.stringify({
                      type: 'content_block_delta',
                      index: contentBlockIndex,
                      delta: { type: 'thinking_delta', thinking: text },
                    })),
                  ),
                )
                outputTokens += 1 // approximate token counts
              }
            }

            // ── Tool call argument deltas ───────────────────────
            else if (eventType === 'response.function_call_arguments.delta') {
              const argDelta = event.delta as string
              if (typeof argDelta === 'string' && inToolCall) {
                currentToolCallArgs += argDelta
                emittedToolCallArgs += argDelta
                controller.enqueue(
                  encoder.encode(
                    formatSSE('content_block_delta', JSON.stringify({
                      type: 'content_block_delta',
                      index: contentBlockIndex,
                      delta: {
                        type: 'input_json_delta',
                        partial_json: argDelta,
                      },
                    })),
                  ),
                )
              }
            }

            // Tool call arguments complete
            else if (eventType === 'response.function_call_arguments.done') {
              if (inToolCall) {
                currentToolCallArgs = (event.arguments as string) || currentToolCallArgs
                // The Responses API guarantees this event when function-call
                // arguments are complete. Close the Anthropic tool_use block
                // here so the REPL can execute the tool immediately instead of
                // waiting for a later response.output_item.done event.
                closeCurrentToolCallBlock()
                shouldFinishAfterToolCall = true
                toolCallTerminateReason = 'response.function_call_arguments.done'
              }
            }

            // Output item done — close blocks
            else if (eventType === 'response.output_item.done') {
              const item = event.item as Record<string, unknown>
              if (item?.type === 'function_call') {
                const finalArgs = (item.arguments as string) || currentToolCallArgs
                currentToolCallArgs = finalArgs
                closeCurrentToolCallBlock()
                shouldFinishAfterToolCall = true
                toolCallTerminateReason ??= 'response.output_item.done(function_call)'
              } else if (item?.type === 'message') {
                if (!currentTextBlockStarted && !textBlockFinalized) {
                  const finalText = extractFinalTextFromItem(item)
                  emitCompletedTextBlock(finalText)
                }
                if (currentTextBlockStarted) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE('content_block_stop', JSON.stringify({
                        type: 'content_block_stop',
                        index: contentBlockIndex,
                      })),
                    ),
                  )
                  contentBlockIndex++
                  currentTextBlockStarted = false
                  textBlockFinalized = true
                }
              } else if (item?.type === 'reasoning') {
                if (inReasoningBlock) {
                  pendingReasoningItems.push(structuredClone(item))
                  controller.enqueue(
                    encoder.encode(
                      formatSSE('content_block_stop', JSON.stringify({
                        type: 'content_block_stop',
                        index: contentBlockIndex,
                      })),
                    ),
                  )
                  contentBlockIndex++
                  inReasoningBlock = false
                }
              }
            }

            // Finalized content part without incremental text deltas
            else if (eventType === 'response.content_part.done') {
              const part = event.part as Record<string, unknown>
              const finalizedText = extractTextFromContentPart(part)
              if (finalizedText.length > 0 && !currentTextBlockStarted && !textBlockFinalized) {
                emitCompletedTextBlock(finalizedText)
              }
            }

            // Response completed — extract usage
            else if (eventType === 'response.completed' || eventType === 'response.done') {
              const response = event.response as Record<string, unknown>
              const usage = response?.usage as Record<string, number> | undefined
              if (usage) {
                outputTokens = usage.output_tokens || outputTokens
                inputTokens = usage.input_tokens || inputTokens
                const totalTokens = usage.total_tokens ?? inputTokens + outputTokens
                const contextWindowSize = getCodexContextWindowSize(codexModel)
                const usedTokens = totalTokens ?? null
                setCodexUsage({
                  last_response_usage: {
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    total_tokens: totalTokens ?? null,
                  },
                  context_window: {
                    context_window_size: contextWindowSize,
                    used_tokens: usedTokens,
                    remaining_tokens:
                      usedTokens !== null
                        ? Math.max(contextWindowSize - usedTokens, 0)
                        : null,
                    used_percentage:
                      usedTokens !== null
                        ? Math.min((usedTokens / contextWindowSize) * 100, 100)
                        : null,
                  },
                  rate_limits:
                    initialRateLimits.length > 0 ? initialRateLimits : undefined,
                })
              }

              if (!currentTextBlockStarted && !textBlockFinalized) {
                const finalText = extractFinalTextFromResponse(response)
                if (finalText.length > 0) {
                  emitCompletedTextBlock(finalText)
                }
              }

              shouldFinishAfterResponse = true
            }

            if (shouldFinishAfterToolCall) {
              logForDebugging(
                `[codex-adapter] finishing translated stream after tool call (${toolCallTerminateReason ?? 'unknown'})`,
              )
              void reader.cancel().catch(error => {
                logForDebugging(
                  `[codex-adapter] reader.cancel() after tool call failed: ${String(error)}`,
                )
              })
              break
            }

            if (shouldFinishAfterResponse) {
              continue
            }
          }

          if (shouldFinishAfterToolCall) {
            break
          }
          if (shouldFinishAfterResponse) {
            break
          }
        }
      } catch (err) {
        // If we're in the middle of a text block, emit the error there
        if (!currentTextBlockStarted) {
          controller.enqueue(
            encoder.encode(
              formatSSE('content_block_start', JSON.stringify({
                type: 'content_block_start',
                index: contentBlockIndex,
                content_block: { type: 'text', text: '' },
              })),
            ),
          )
          currentTextBlockStarted = true
        }
        controller.enqueue(
          encoder.encode(
            formatSSE('content_block_delta', JSON.stringify({
              type: 'content_block_delta',
              index: contentBlockIndex,
              delta: { type: 'text_delta', text: `\n\n[Error: ${String(err)}]` },
            })),
          ),
        )
      }

      // Close any remaining open blocks
      if (currentTextBlockStarted) {
        controller.enqueue(
          encoder.encode(
            formatSSE('content_block_stop', JSON.stringify({
              type: 'content_block_stop',
              index: contentBlockIndex,
            })),
          ),
        )
        textBlockFinalized = true
      }
      if (inReasoningBlock) {
        controller.enqueue(
          encoder.encode(
            formatSSE('content_block_stop', JSON.stringify({
              type: 'content_block_stop',
              index: contentBlockIndex,
            })),
          ),
        )
      }
      if (inToolCall) {
        closeCurrentToolCallBlock()
      }

      finishStream(controller, encoder, outputTokens, inputTokens, hadToolCalls)
    },
  })

  function closeToolCallBlock(
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    index: number,
    _toolCallId: string,
    _toolCallName: string,
    _toolCallArgs: string,
  ) {
    controller.enqueue(
      encoder.encode(
        formatSSE('content_block_stop', JSON.stringify({
          type: 'content_block_stop',
          index,
        })),
      ),
    )
  }

  function emitTextBlock(
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    index: number,
    text: string,
  ) {
    controller.enqueue(
      encoder.encode(
        formatSSE('content_block_start', JSON.stringify({
          type: 'content_block_start',
          index,
          content_block: { type: 'text', text: '' },
        })),
      ),
    )
    controller.enqueue(
      encoder.encode(
        formatSSE('content_block_delta', JSON.stringify({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text },
        })),
      ),
    )
    controller.enqueue(
      encoder.encode(
        formatSSE('content_block_stop', JSON.stringify({
          type: 'content_block_stop',
          index,
        })),
      ),
    )
  }

  function finishStream(
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    outputTokens: number,
    inputTokens: number,
    hadToolCalls: boolean,
  ) {
    // Use 'tool_use' stop reason when model made tool calls
    const stopReason = hadToolCalls ? 'tool_use' : 'end_turn'

    controller.enqueue(
      encoder.encode(
        formatSSE(
          'message_delta',
          JSON.stringify({
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          }),
        ),
      ),
    )
    controller.enqueue(
      encoder.encode(
        formatSSE(
          'message_stop',
          JSON.stringify({
            type: 'message_stop',
            'amazon-bedrock-invocationMetrics': {
              inputTokenCount: inputTokens,
              outputTokenCount: outputTokens,
              invocationLatency: 0,
              firstByteLatency: 0,
            },
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          }),
        ),
      ),
    )
    controller.close()
  }

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'x-request-id': messageId,
    },
  })
}

// ── Main fetch interceptor ──────────────────────────────────────────

const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex/responses'

/**
 * Creates a fetch function that intercepts Anthropic API calls and routes them to Codex.
 * @param accessToken - The Codex access token for authentication
 * @returns A fetch function that translates Anthropic requests to Codex format
 */
export function createCodexFetch(
  accessToken: string,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const accountId = extractAccountId(accessToken)
  const responseReplayCache = new Map<string, CachedCodexReplay>()
  const inflightReplays = new Map<string, CodexInflightReplay>()

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)

    // Only intercept Anthropic API message calls
    if (!url.includes('/v1/messages')) {
      return globalThis.fetch(input, init)
    }

    reportAnthropicHostedRequest({
      transport: 'fetch',
      url,
      context: 'codex-adapter-intercept',
      operation: 'anthropic-messages->codex-response',
      allowed: true,
    })

    try {
      // Parse the Anthropic request body
      let anthropicBody: Record<string, unknown>
      try {
        const bodyText =
          init?.body instanceof ReadableStream
            ? await new Response(init.body).text()
            : typeof init?.body === 'string'
              ? init.body
              : '{}'
        anthropicBody = JSON.parse(bodyText)
      } catch {
        anthropicBody = {}
      }

      // Get current token (may have been refreshed)
      const tokens = getCodexOAuthTokens()
      const currentToken = tokens?.accessToken || accessToken

      // Translate to Codex format
      const {
        codexBody,
        codexModel,
        estimatedInputTokens,
        requestInputTokens,
        originalInputItemCount,
        requestInputItemCount,
      } = translateToCodexBody(anthropicBody)
    const dedupEnabled = !isEnvTruthy(process.env.CODEX_DISABLE_REQUEST_DEDUP)
    const dedupTtlMs = getCodexDedupTtlMs()
    const requestFingerprint = buildCodexRequestFingerprint(codexModel, codexBody)

    if (dedupEnabled) {
      const now = Date.now()
      const cached = responseReplayCache.get(requestFingerprint)
      if (cached && cached.expiresAt > now) {
        logForDebugging(
          `[codex-adapter] replay cache hit for fingerprint=${requestFingerprint.slice(0, 12)}`,
        )
        return buildReplayResponse(cached.payload)
      }

      const inflight = inflightReplays.get(requestFingerprint)
      if (inflight && inflight.expiresAt > now) {
        logForDebugging(
          `[codex-adapter] coalescing duplicate request fingerprint=${requestFingerprint.slice(0, 12)}`,
        )
        const payload = await inflight.replay
        if (payload) {
          return buildReplayResponse(payload)
        }
      }
      if (inflight && inflight.expiresAt <= now) {
        inflightReplays.delete(requestFingerprint)
      }
    }

    logForDebugging(
      `[codex-adapter] request usage estimated_input_tokens=${estimatedInputTokens} request_input_tokens=${requestInputTokens} original_input_item_count=${originalInputItemCount} request_input_item_count=${requestInputItemCount}`,
    )

    const requestPromise = postCodexResponses(
      currentToken,
      accountId,
      codexBody,
    )

    if (dedupEnabled) {
      const replay = requestPromise
        .then(async response => {
          if (!response.ok) return null
          // Use a cloned response for replay caching so the primary response
          // stream remains readable for the live caller.
          const replayResponse = response.clone()
          const translated = await translateCodexStreamToAnthropic(
            replayResponse,
            codexModel,
            estimatedInputTokens,
          )
          const payload = await translated.clone().text()
          responseReplayCache.set(requestFingerprint, {
            payload,
            expiresAt: Date.now() + dedupTtlMs,
          })
          return payload
        })
        .catch(error => {
          logForDebugging(
            `[codex-adapter] replay cache population failed: ${String(error)}`,
          )
          return null
        })
        .finally(() => {
          const currentInflight = inflightReplays.get(requestFingerprint)
          if (currentInflight?.replay === replay) {
            inflightReplays.delete(requestFingerprint)
          }
        })

      inflightReplays.set(requestFingerprint, {
        replay,
        expiresAt: Date.now() + dedupTtlMs,
      })
    }

    const codexResponse = await requestPromise

    if (!codexResponse.ok) {
      const errorText = await codexResponse.text()
      const errorBody = {
        type: 'error',
        error: {
          type: 'api_error',
          message: `Codex API error (${codexResponse.status}): ${errorText}`,
        },
      }
      return new Response(JSON.stringify(errorBody), {
        status: codexResponse.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return translateCodexStreamToAnthropic(
      codexResponse,
      codexModel,
      estimatedInputTokens,
    )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logForDebugging(
        `[codex-adapter] adapter pipeline failure: ${errorMessage}`,
        { level: 'error' },
      )

      const errorBody = {
        type: 'error',
        error: {
          type: 'api_error',
          message: `Codex adapter error: ${errorMessage}`,
        },
      }

      return new Response(JSON.stringify(errorBody), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}
