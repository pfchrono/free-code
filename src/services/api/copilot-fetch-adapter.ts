import axios from 'axios'
import { createHash, randomUUID } from 'crypto'
import { Readable } from 'stream'
import { roughTokenCountEstimation, roughTokenCountEstimationForMessages } from '../tokenEstimation.js'
import type { CopilotTokens } from '../oauth/copilot-client.js'
import type { CopilotDiscoveredModel } from './copilot-client.js'
import { reportAnthropicHostedRequest } from '../../utils/anthropicLeakDetection.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { logForDebugging } from '../../utils/debug.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { setCodexUsage } from './codexUsage.js'
import {
  COPILOT_EDITOR_VERSION,
  COPILOT_PLUGIN_VERSION,
  COPILOT_USER_AGENT,
  COPILOT_API_VERSION,
  DEFAULT_COPILOT_MODEL,
  DEFAULT_COPILOT_CONTEXT_WINDOW_SIZE,
  getCopilotApiBaseUrl,
  COPILOT_FALLBACK_MODELS,
  getCopilotTokenParameter,
} from './copilot-constants.js'

// Export the fallback models as COPILOT_MODELS for backward compatibility
export const COPILOT_MODELS = COPILOT_FALLBACK_MODELS
export { DEFAULT_COPILOT_MODEL }

/**
 * Smart model aliases that map to the best available model
 */
const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet': 'claude-sonnet-4.6',
  'claude-haiku': 'claude-haiku-4.5',
  'claude-opus': 'claude-opus-4.6',
  'gpt-latest': 'gpt-5.4',
  'fast': 'claude-haiku-4.5',
  'coding': 'claude-sonnet-4.6',
}

const DEFAULT_COMPACTION_RATIO = 0.8
const DEFAULT_MIN_CONTEXT_MESSAGES = 24
const MIN_CONTEXT_MESSAGES_FLOOR = 8
const DEFAULT_DEDUP_TTL_MS = 15_000

function getCompactionTargetTokens(): number | null {
  const raw = Number(process.env.COPILOT_CONTEXT_COMPACTION_TARGET_TOKENS)
  if (!Number.isInteger(raw)) return null
  return Math.max(raw, 1_000)
}

function getCompactionRatio(): number {
  const raw = Number(process.env.COPILOT_CONTEXT_COMPACTION_RATIO)
  if (!Number.isFinite(raw)) return DEFAULT_COMPACTION_RATIO
  return Math.min(Math.max(raw, 0.3), 0.95)
}

function getMinContextMessages(): number {
  const raw = Number(process.env.COPILOT_CONTEXT_MIN_MESSAGES)
  if (!Number.isInteger(raw)) return DEFAULT_MIN_CONTEXT_MESSAGES
  if (getCompactionTargetTokens() !== null) {
    return Math.max(raw, 2)
  }
  return Math.max(raw, MIN_CONTEXT_MESSAGES_FLOOR)
}

function getDedupTtlMs(): number {
  const raw = Number(process.env.COPILOT_DEDUP_TTL_MS)
  if (!Number.isInteger(raw)) return DEFAULT_DEDUP_TTL_MS
  return Math.max(raw, 1_000)
}

export function resolveModelAlias(model: string): string {
  return MODEL_ALIASES[model.toLowerCase()] ?? model
}

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | AnthropicContentBlock[]
  source?: Record<string, unknown>
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

function formatSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`
}

function getRequestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input)
}

function isAnthropicMessagesEndpoint(url: string): boolean {
  try {
    return new URL(url).pathname === '/v1/messages'
  } catch {
    return url.includes('/v1/messages')
  }
}

// ── Transport helpers ────────────────────────────────────────────
const COPILOT_REQUEST_TIMEOUT_MS = 180_000

/**
 * Normalize axios response headers to standard Headers format
 */
function normalizeAxiosHeaders(
  headers: Record<string, string | string[] | number | boolean>,
): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key] = value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      normalized[key] = String(value)
    } else if (Array.isArray(value)) {
      normalized[key] = value.join(', ')
    }
  }
  return normalized
}

/**
 * Post to Copilot API with transport fallback.
 * Tries fetch first (preferred), falls back to axios for network brittleness.
 */
async function postCopilotChat(
  baseUrl: string,
  body: string,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    return await globalThis.fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body,
    })
  } catch (error) {
    // Bun/undici fetch can intermittently fail at transport level while
    // Node's HTTP stack succeeds; fallback keeps adapter mode from surfacing
    // as a generic Anthropic SDK connection error.
    logForDebugging(
      `[copilot-adapter] fetch transport failed, retrying with axios fallback: ${String(error)}`,
      { level: 'error' },
    )

    const axiosResponse = await axios.post(`${baseUrl}/chat/completions`, body, {
      headers,
      responseType: 'stream',
      timeout: COPILOT_REQUEST_TIMEOUT_MS,
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

export function isCopilotModel(model: string): boolean {
  return COPILOT_MODELS.some((entry) => entry.id === model)
}

export function mapClaudeModelToCopilot(model: string | null): string {
  if (!model) return DEFAULT_COPILOT_MODEL

  const resolvedModel = resolveModelAlias(model)
  if (isCopilotModel(resolvedModel)) return resolvedModel

  // Legacy model mapping for backward compatibility
  const lower = model.toLowerCase()
  if (lower.includes('opus 4.6')) return 'claude-opus-4.6'
  if (lower.includes('opus')) return 'claude-opus-4.5'
  if (lower.includes('haiku')) return 'claude-haiku-4.5'
  if (lower.includes('sonnet 4.6')) return 'claude-sonnet-4.6'
  if (lower.includes('sonnet 4.5')) return 'claude-sonnet-4.5'
  if (lower.includes('sonnet')) return 'claude-sonnet-4'
  return DEFAULT_COPILOT_MODEL
}

function translateTools(tools: AnthropicTool[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} },
    },
  }))
}

/**
 * Check if the request contains vision content (images)
 */
function hasVisionContent(messages: Array<Record<string, unknown>>): boolean {
  return messages.some((message) => {
    const content = message.content
    return (
      Array.isArray(content) &&
      content.some(
        (part) =>
          typeof part === 'object' &&
          part !== null &&
          (part as { type?: string }).type === 'image_url',
      )
    )
  })
}

function getImageDataUrl(source: Record<string, unknown> | undefined): string | null {
  if (!source || source.type !== 'base64') return null
  const mediaType = typeof source.media_type === 'string' ? source.media_type : null
  const data = typeof source.data === 'string' ? source.data : null
  if (!mediaType || !data) return null
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) {
    return null
  }
  return `data:${mediaType};base64,${data}`
}

function translateUserContentPart(
  block: AnthropicContentBlock,
): Record<string, unknown> | null {
  if (block.type === 'text' && block.text) {
    return { type: 'text', text: block.text }
  }

  if (block.type === 'image') {
    const imageUrl = getImageDataUrl(block.source)
    if (!imageUrl) return null
    return {
      type: 'image_url',
      image_url: { url: imageUrl },
    }
  }

  return null
}

function flattenUserContent(content: string | AnthropicContentBlock[]): string {
  if (typeof content === 'string') return content

  return content
    .map((block) => {
      if (block.type === 'text') return block.text || ''
      if (block.type === 'image') return '[Image omitted]'
      if (block.type === 'tool_reference') {
        const toolName = typeof (block as { tool_name?: string }).tool_name === 'string'
          ? (block as { tool_name?: string }).tool_name
          : 'unknown_tool'
        return `[Tool reference: ${toolName}]`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function translateMessages(
  messages: AnthropicMessage[],
): Array<Record<string, unknown>> {
  const translated: Array<Record<string, unknown>> = []

  for (const message of messages) {
    if (message.role === 'user') {
      if (typeof message.content === 'string') {
        translated.push({ role: 'user', content: message.content })
        continue
      }

      for (const block of message.content) {
        if (block.type === 'tool_result') {
          translated.push({
            role: 'tool',
            tool_call_id: block.tool_use_id || '',
            content:
              typeof block.content === 'string'
                ? block.content
                : flattenUserContent(block.content || []),
          })
        }
      }

      const contentParts = message.content.map(translateUserContentPart)
      const filteredParts = contentParts.filter((part): part is Record<string, unknown> => part !== null)
      if (filteredParts.length > 0) {
        translated.push({ role: 'user', content: filteredParts })
      }
      continue
    }

    if (typeof message.content === 'string') {
      translated.push({ role: message.role, content: message.content })
      continue
    }

    const textParts: string[] = []
    const toolCalls: Array<Record<string, unknown>> = []
    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text)
      }
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || `tool_${Date.now()}`,
          type: 'function',
          function: {
            name: block.name || '',
            arguments: JSON.stringify(block.input || {}),
          },
        })
      }
    }

    const translatedMessage: Record<string, unknown> = {
      role: message.role,
    }
    if (textParts.length > 0) {
      translatedMessage.content = textParts.join('\n')
    }
    if (toolCalls.length > 0) {
      translatedMessage.tool_calls = toolCalls
    }
    translated.push(translatedMessage)
  }

  return translated
}

function estimateInputTokens(
  messages: AnthropicMessage[],
  systemPrompt:
    | string
    | Array<{ type: string; text?: string; cache_control?: unknown }>
    | undefined,
  tools: AnthropicTool[],
): number {
  const messageTokens = roughTokenCountEstimationForMessages(
    messages as Parameters<typeof roughTokenCountEstimationForMessages>[0],
  )
  const systemTokens =
    typeof systemPrompt === 'string'
      ? roughTokenCountEstimation(systemPrompt)
      : (systemPrompt || []).reduce((sum, block) => {
          if (block.type !== 'text' || !block.text) return sum
          return sum + roughTokenCountEstimation(block.text)
        }, 0)
  const toolTokens = tools.length > 0 ? roughTokenCountEstimation(jsonStringify(tools)) : 0
  return messageTokens + systemTokens + toolTokens
}

function estimateTranslatedMessageTokens(
  messages: Array<Record<string, unknown>>,
): number {
  return roughTokenCountEstimation(jsonStringify(messages))
}

function removeEmptyMessages(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return messages.filter((message) => {
    const toolCalls = message.tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return true
    }

    const content = message.content
    if (typeof content === 'string') {
      return content.trim().length > 0
    }
    if (Array.isArray(content)) {
      return content.length > 0
    }

    return false
  })
}

function createSyntheticToolResultMessage(toolCallId: string): Record<string, unknown> {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: '[Tool execution interrupted before result was recorded]',
  }
}

function repairTranslatedToolPairing(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const repaired: Array<Record<string, unknown>> = []
  let pendingToolCalls = new Set<string>()
  let repairedMismatches = false

  const flushMissingToolResults = () => {
    if (pendingToolCalls.size === 0) return
    for (const toolCallId of pendingToolCalls) {
      repaired.push(createSyntheticToolResultMessage(toolCallId))
    }
    pendingToolCalls = new Set<string>()
    repairedMismatches = true
  }

  for (const message of messages) {
    const role = typeof message.role === 'string' ? message.role : ''

    if (role === 'assistant') {
      flushMissingToolResults()

      const toolCalls = Array.isArray(message.tool_calls)
        ? (message.tool_calls as Array<Record<string, unknown>>)
        : []

      if (toolCalls.length > 0) {
        const seenIds = new Set<string>()
        const dedupedToolCalls = toolCalls.filter((toolCall) => {
          const id = typeof toolCall.id === 'string' ? toolCall.id : ''
          if (!id || seenIds.has(id)) {
            repairedMismatches = true
            return false
          }
          seenIds.add(id)
          return true
        })

        repaired.push(
          dedupedToolCalls.length === toolCalls.length
            ? message
            : { ...message, tool_calls: dedupedToolCalls },
        )
        pendingToolCalls = new Set(seenIds)
        continue
      }

      repaired.push(message)
      continue
    }

    if (role === 'tool') {
      const toolCallId = typeof message.tool_call_id === 'string' ? message.tool_call_id : ''
      if (!toolCallId || !pendingToolCalls.has(toolCallId)) {
        repairedMismatches = true
        continue
      }

      pendingToolCalls.delete(toolCallId)
      repaired.push(message)
      continue
    }

    flushMissingToolResults()
    repaired.push(message)
  }

  flushMissingToolResults()

  if (repairedMismatches) {
    logForDebugging(
      `[copilot-adapter] repaired translated tool pairing (${messages.length} -> ${repaired.length} messages)`,
    )
  }

  return repaired
}

function compactTranslatedMessages(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (isEnvTruthy(process.env.COPILOT_DISABLE_CONTEXT_COMPACTION)) {
    return messages
  }

  const targetInputTokens =
    getCompactionTargetTokens() ??
    Math.floor(DEFAULT_COPILOT_CONTEXT_WINDOW_SIZE * getCompactionRatio())
  const minContextMessages = getMinContextMessages()
  const initialEstimate = estimateTranslatedMessageTokens(messages)
  if (initialEstimate <= targetInputTokens) {
    return messages
  }

  const firstRole = typeof messages[0]?.role === 'string' ? messages[0]?.role : null
  const keepSystemPrefix = firstRole === 'system' ? [messages[0] as Record<string, unknown>] : []
  const tailStart = Math.max(
    keepSystemPrefix.length,
    messages.length - minContextMessages,
  )
  const tail = messages.slice(tailStart)
  const compacted = [...keepSystemPrefix, ...tail]
  let removedToolResults = 0

  if (isEnvTruthy(process.env.COPILOT_STRICT_TOOL_RESULT_PRUNING)) {
    while (
      compacted.length > keepSystemPrefix.length + MIN_CONTEXT_MESSAGES_FLOOR &&
      estimateTranslatedMessageTokens(compacted) > targetInputTokens
    ) {
      // Find the first tool-result message to prune
      const toolIdx = compacted.findIndex(
        (msg, idx) => idx >= keepSystemPrefix.length && msg.role === 'tool',
      )
      if (toolIdx === -1) break

      const toolCallId = (compacted[toolIdx] as { tool_call_id?: string }).tool_call_id

      // Find the assistant turn that owns this tool result so we can remove the
      // entire exchange (assistant + all its tool results).  Removing only the
      // tool result would leave a dangling tool_call reference causing a 400.
      let assistantIdx = -1
      for (let i = toolIdx - 1; i >= keepSystemPrefix.length; i--) {
        const msg = compacted[i] as { role?: string; tool_calls?: Array<{ id?: string }> }
        if (
          msg.role === 'assistant' &&
          Array.isArray(msg.tool_calls) &&
          msg.tool_calls.some((tc) => tc.id === toolCallId)
        ) {
          assistantIdx = i
          break
        }
      }

      if (assistantIdx !== -1) {
        const assistantMsg = compacted[assistantIdx] as { tool_calls: Array<{ id?: string }> }
        const ownedIds = new Set(assistantMsg.tool_calls.map((tc) => tc.id))
        // Remove the assistant turn first
        compacted.splice(assistantIdx, 1)
        removedToolResults++
        // Remove all tool results that belong to this assistant turn (indices shifted)
        let i = assistantIdx
        while (i < compacted.length) {
          const msg = compacted[i] as { role?: string; tool_call_id?: string }
          if (msg.role === 'tool' && ownedIds.has(msg.tool_call_id)) {
            compacted.splice(i, 1)
            removedToolResults++
          } else {
            i++
          }
        }
      } else {
        // No owning assistant found — remove the orphaned tool result only
        compacted.splice(toolIdx, 1)
        removedToolResults++
      }
    }
  }

  while (
    compacted.length > keepSystemPrefix.length + MIN_CONTEXT_MESSAGES_FLOOR &&
    estimateTranslatedMessageTokens(compacted) > targetInputTokens
  ) {
    compacted.splice(keepSystemPrefix.length, 1)
  }

  const finalEstimate = estimateTranslatedMessageTokens(compacted)
  if (finalEstimate < initialEstimate) {
    const reductionPct = Math.round((1 - finalEstimate / initialEstimate) * 100)
    logForDebugging(
      `[copilot-adapter] compacted request context from ~${initialEstimate} to ~${finalEstimate} tokens (${reductionPct}% reduction, ${messages.length} -> ${compacted.length} messages, removed_tool_results=${removedToolResults})`,
    )
  }

  return compacted
}

function buildRequestFingerprint(
  model: string,
  body: Record<string, unknown>,
): string {
  const serialized = jsonStringify({ model, body })
  return createHash('sha1').update(serialized).digest('hex')
}

type CachedReplay = {
  payload: string
  expiresAt: number
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

async function translateToCopilotBody(
  anthropicBody: Record<string, unknown>,
  selectedModel?: CopilotDiscoveredModel,
): Promise<{
  copilotBody: Record<string, unknown>
  copilotModel: string
  estimatedInputTokens: number
  requestInputTokens: number
  originalMessageCount: number
  requestMessageCount: number
  hasVisionRequest: boolean
}> {
  const anthropicMessages = (anthropicBody.messages as AnthropicMessage[]) || []
  const anthropicTools = (anthropicBody.tools as AnthropicTool[]) || []
  const systemPrompt = anthropicBody.system as
    | string
    | Array<{ type: string; text?: string; cache_control?: unknown }>
    | undefined

  const copilotModel = mapClaudeModelToCopilot((anthropicBody.model as string) || null)
  const translatedMessages = translateMessages(anthropicMessages)
  const hasTranslatedVisionContent = hasVisionContent(translatedMessages)
  if (systemPrompt) {
    const text =
      typeof systemPrompt === 'string'
        ? systemPrompt
        : systemPrompt
            .filter((block) => block.type === 'text' && typeof block.text === 'string')
            .map((block) => block.text as string)
            .join('\n')
    if (text.length > 0) {
      translatedMessages.unshift({ role: 'system', content: text })
    }
  }

  const supportsVision = selectedModel?.supportsVision ?? true
  const requestMessages =
    hasTranslatedVisionContent && !supportsVision
      ? translatedMessages.map((message) => {
          const content = message.content
          if (!Array.isArray(content)) return message
          return {
            ...message,
            content: content.filter(
              (part) =>
                typeof part !== 'object' ||
                part === null ||
                (part as { type?: string }).type !== 'image_url',
            ),
          }
        })
      : translatedMessages

    const repairedMessages = repairTranslatedToolPairing(requestMessages)
    const cleanedMessages = removeEmptyMessages(repairedMessages)
    const compactedMessages = compactTranslatedMessages(cleanedMessages)
    const requestInputTokens = estimateTranslatedMessageTokens(compactedMessages)

  const tokenParamKey = getCopilotTokenParameter(
    copilotModel,
    selectedModel?.preferredTokenParameter,
  )

  const copilotBody: Record<string, unknown> = {
    model: copilotModel,
    stream: true,
    stream_options: { include_usage: true },
      messages: compactedMessages,
    [tokenParamKey]: anthropicBody.max_tokens ?? 4096,
  }

  if (anthropicTools.length > 0) {
    copilotBody.tools = translateTools(anthropicTools)
  }

  return {
    copilotBody,
    copilotModel,
    estimatedInputTokens: estimateInputTokens(
      anthropicMessages,
      systemPrompt,
      anthropicTools,
    ),
    requestInputTokens,
    originalMessageCount: translatedMessages.length,
    requestMessageCount: compactedMessages.length,
    hasVisionRequest: supportsVision && hasVisionContent(compactedMessages),
  }
}

async function translateCopilotStreamToAnthropic(
  copilotResponse: Response,
  copilotModel: string,
  estimatedInputTokens: number,
): Promise<Response> {
  const messageId = `msg_copilot_${Date.now()}`

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      let buffer = ''
      let contentBlockIndex = 0
      let currentTextBlockStarted = false
      let currentToolCallId = ''
      let currentToolCallName = ''
      let inToolCall = false
      let outputTokens = 0
      let inputTokens = estimatedInputTokens
      let finishReason: string | null = null
      let sawToolCall = false

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
                model: copilotModel,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
            }),
          ),
        ),
      )

      controller.enqueue(
        encoder.encode(formatSSE('ping', JSON.stringify({ type: 'ping' }))),
      )

      const closeTextBlock = () => {
        if (!currentTextBlockStarted) return
        controller.enqueue(
          encoder.encode(
            formatSSE(
              'content_block_stop',
              JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
            ),
          ),
        )
        contentBlockIndex++
        currentTextBlockStarted = false
      }

      const closeToolBlock = () => {
        if (!inToolCall) return
        controller.enqueue(
          encoder.encode(
            formatSSE(
              'content_block_stop',
              JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
            ),
          ),
        )
        contentBlockIndex++
        inToolCall = false
        currentToolCallId = ''
        currentToolCallName = ''
      }

      try {
        const reader = copilotResponse.body?.getReader()
        if (!reader) {
          throw new Error('No GitHub Copilot response body available')
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line || !line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(payload)
            } catch {
              continue
            }

            const choices = (event.choices as Array<Record<string, unknown>>) || []
            const usage = event.usage as Record<string, number> | undefined
            if (usage) {
              inputTokens = usage.prompt_tokens || inputTokens
              outputTokens = usage.completion_tokens || outputTokens
              logForDebugging(
                `[copilot-adapter] response usage prompt_tokens=${usage.prompt_tokens ?? inputTokens} completion_tokens=${usage.completion_tokens ?? outputTokens} total_tokens=${usage.total_tokens ?? inputTokens + outputTokens}`,
              )

              const contextWindowSize = DEFAULT_COPILOT_CONTEXT_WINDOW_SIZE

              setCodexUsage({
                provider: 'copilot',
                usage_source: 'github-copilot-stream',
                last_response_usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                  total_tokens: usage.total_tokens ?? inputTokens + outputTokens,
                },
                context_window: {
                  context_window_size: contextWindowSize,
                  used_tokens: usage.total_tokens ?? inputTokens + outputTokens,
                  remaining_tokens:
                    usage.total_tokens !== undefined
                      ? Math.max(contextWindowSize - usage.total_tokens, 0)
                      : null,
                  used_percentage:
                    usage.total_tokens !== undefined
                      ? Math.min((usage.total_tokens / contextWindowSize) * 100, 100)
                      : null,
                },
              })
            }

            for (const choice of choices) {
              const delta = (choice.delta as Record<string, unknown>) || {}
              const toolCalls = (delta.tool_calls as Array<Record<string, unknown>>) || []
              const deltaContent = delta.content as string | undefined

              if (toolCalls.length > 0) {
                closeTextBlock()
                for (const toolCall of toolCalls) {
                  const id = (toolCall.id as string) || currentToolCallId || `toolu_${Date.now()}`
                  const fn = (toolCall.function as Record<string, unknown>) || {}
                  const name = (fn.name as string) || currentToolCallName || ''
                  const args = (fn.arguments as string) || ''

                  if (!inToolCall || currentToolCallId !== id) {
                    closeToolBlock()
                    currentToolCallId = id
                    currentToolCallName = name
                    inToolCall = true
                    sawToolCall = true
                    controller.enqueue(
                      encoder.encode(
                        formatSSE(
                          'content_block_start',
                          JSON.stringify({
                            type: 'content_block_start',
                            index: contentBlockIndex,
                            content_block: {
                              type: 'tool_use',
                              id,
                              name,
                              input: {},
                            },
                          }),
                        ),
                      ),
                    )
                  }

                  if (args.length > 0) {
                    controller.enqueue(
                      encoder.encode(
                        formatSSE(
                          'content_block_delta',
                          JSON.stringify({
                            type: 'content_block_delta',
                            index: contentBlockIndex,
                            delta: {
                              type: 'input_json_delta',
                              partial_json: args,
                            },
                          }),
                        ),
                      ),
                    )
                  }
                }
              }

              if (typeof deltaContent === 'string' && deltaContent.length > 0) {
                closeToolBlock()
                if (!currentTextBlockStarted) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE(
                        'content_block_start',
                        JSON.stringify({
                          type: 'content_block_start',
                          index: contentBlockIndex,
                          content_block: { type: 'text', text: '' },
                        }),
                      ),
                    ),
                  )
                  currentTextBlockStarted = true
                }
                controller.enqueue(
                  encoder.encode(
                    formatSSE(
                      'content_block_delta',
                      JSON.stringify({
                        type: 'content_block_delta',
                        index: contentBlockIndex,
                        delta: { type: 'text_delta', text: deltaContent },
                      }),
                    ),
                  ),
                )
                outputTokens += 1
              }

              const choiceFinishReason = choice.finish_reason as string | null | undefined
              if (choiceFinishReason) {
                finishReason = choiceFinishReason
              }
            }
          }
        }
      } catch (error) {
        logForDebugging(`[copilot-adapter] stream translation failed: ${String(error)}`)
        if (!currentTextBlockStarted) {
          controller.enqueue(
            encoder.encode(
              formatSSE(
                'content_block_start',
                JSON.stringify({
                  type: 'content_block_start',
                  index: contentBlockIndex,
                  content_block: { type: 'text', text: '' },
                }),
              ),
            ),
          )
          currentTextBlockStarted = true
        }
        controller.enqueue(
          encoder.encode(
            formatSSE(
              'content_block_delta',
              JSON.stringify({
                type: 'content_block_delta',
                index: contentBlockIndex,
                delta: { type: 'text_delta', text: `\n\n[Error: ${String(error)}]` },
              }),
            ),
          ),
        )
      }

      closeTextBlock()
      closeToolBlock()

      const stopReason =
        finishReason === 'tool_calls' || sawToolCall ? 'tool_use' : 'end_turn'

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
              usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            }),
          ),
        ),
      )
      controller.close()
    },
  })

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    },
  })
}

export function createCopilotFetch(
  copilotTokens: Pick<CopilotTokens, 'copilotToken' | 'enterpriseUrl'>,
  options?: { getModelById?: (modelId: string) => Promise<CopilotDiscoveredModel | undefined> },
): typeof fetch {
  const responseReplayCache = new Map<string, CachedReplay>()
  const inflightReplays = new Map<string, Promise<string | null>>()
  const wrappedFetch = Object.assign(async (input, init) => {
    const url = getRequestUrl(input)
    const method = init?.method || 'GET'

    if (!isAnthropicMessagesEndpoint(url)) {
      return globalThis.fetch(input, init)
    }

    reportAnthropicHostedRequest({
      transport: 'fetch',
      url,
      context: 'copilot-adapter-intercept',
      operation: 'anthropic-messages->copilot-chat',
    })

    try {
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

    const requestedModel = mapClaudeModelToCopilot((anthropicBody.model as string) || null)
    const selectedModel = await options?.getModelById?.(requestedModel)
    const {
      copilotBody,
      copilotModel,
      estimatedInputTokens,
      requestInputTokens,
      originalMessageCount,
      requestMessageCount,
      hasVisionRequest,
    } =
      await translateToCopilotBody(anthropicBody, selectedModel)
    const copilotApiBaseUrl = getCopilotApiBaseUrl(copilotTokens.enterpriseUrl)
    const dedupEnabled = !isEnvTruthy(process.env.COPILOT_DISABLE_REQUEST_DEDUP)
    const dedupTtlMs = getDedupTtlMs()
    const requestFingerprint = buildRequestFingerprint(copilotModel, copilotBody)

    let replayDeferred: Deferred<string | null> | null = null

    if (dedupEnabled) {
      const now = Date.now()
      const cached = responseReplayCache.get(requestFingerprint)
      if (cached && cached.expiresAt > now) {
        logForDebugging(
          `[copilot-adapter] replay cache hit for fingerprint=${requestFingerprint.slice(0, 12)}`,
        )
        return buildReplayResponse(cached.payload)
      }

      const inflight = inflightReplays.get(requestFingerprint)
      if (inflight) {
        logForDebugging(
          `[copilot-adapter] coalescing duplicate request fingerprint=${requestFingerprint.slice(0, 12)}`,
        )
        const payload = await inflight
        if (payload) {
          return buildReplayResponse(payload)
        }
      }

      replayDeferred = createDeferred<string | null>()
      inflightReplays.set(requestFingerprint, replayDeferred.promise)
    }

    logForDebugging(
      `[copilot-adapter] forwarding ${method} ${url} as model=${copilotModel}`,
    )
    logForDebugging(
      `[copilot-adapter] request usage estimated_input_tokens=${estimatedInputTokens} request_input_tokens=${requestInputTokens} original_message_count=${originalMessageCount} request_message_count=${requestMessageCount}`,
    )

    // Strip Anthropic-specific routing options (ANTHROPIC_UNIX_SOCKET tunnel,
    // proxy dispatcher, etc.) that must not bleed into non-Anthropic fetch paths.
    // See proxy.ts getProxyFetchOptions({ forAnthropicAPI: true }) comment.
    const {
      dispatcher: _dispatcher,
      unix: _unix,
      proxy: _proxy,
      ...cleanInit
    } = (init ?? {}) as Record<string, unknown>

    const upstreamInit = {
      ...cleanInit,
      method: 'POST',
      headers: {
        ...(init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {}),
        Authorization: `Bearer ${copilotTokens.copilotToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': COPILOT_EDITOR_VERSION,
        'Editor-Plugin-Version': COPILOT_PLUGIN_VERSION,
        'User-Agent': COPILOT_USER_AGENT,
        'OpenAI-Intent': 'conversation-panel',
        'X-GitHub-Api-Version': COPILOT_API_VERSION,
        'X-Request-Id': randomUUID(),
        'X-Vscode-User-Agent-Library-Version': 'electron-fetch',
        'Copilot-Vision-Request': String(hasVisionRequest),
        'x-initiator': 'user',
      },
      body: JSON.stringify(copilotBody),
    }

    let response: Response
    try {
      response = await postCopilotChat(
        copilotApiBaseUrl,
        JSON.stringify(copilotBody),
        upstreamInit.headers as Record<string, string>,
      )
    } catch (error) {
      replayDeferred?.resolve(null)
      inflightReplays.delete(requestFingerprint)
      throw error
    }

    logForDebugging(
      `[copilot-adapter] response status=${response.status} ok=${response.ok}`,
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      logForDebugging(
        `[copilot-adapter] request failed with status ${response.status}: ${body}`,
      )
      // Return an Anthropic-format error response so the Anthropic SDK maps
      // HTTP status codes to the correct error types (401 → AuthenticationError,
      // 429 → RateLimitError, 5xx → InternalServerError) instead of treating
      // all failures as a generic "Connection error.".
      const errorType =
        response.status === 401
          ? 'authentication_error'
          : response.status === 403
            ? 'permission_error'
            : response.status === 429
              ? 'rate_limit_error'
              : 'api_error'
      replayDeferred?.resolve(null)
      inflightReplays.delete(requestFingerprint)
      return new Response(
        JSON.stringify({
          type: 'error',
          error: {
            type: errorType,
            message: `[copilot-adapter] Copilot API responded with ${response.status}: ${body}`,
          },
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const translatedResponse = await translateCopilotStreamToAnthropic(
      response,
      copilotModel,
      estimatedInputTokens,
    )

    if (dedupEnabled) {
      const replayPromise = translatedResponse
        .clone()
        .text()
        .then((payload) => {
          responseReplayCache.set(requestFingerprint, {
            payload,
            expiresAt: Date.now() + dedupTtlMs,
          })
          return payload
        })
        .catch((error) => {
          logForDebugging(
            `[copilot-adapter] replay cache population failed: ${String(error)}`,
          )
          replayDeferred?.resolve(null)
          return null
        })
        .finally(() => {
          inflightReplays.delete(requestFingerprint)
        })
      void replayPromise.then((payload) => replayDeferred?.resolve(payload))
    }

    return translatedResponse
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logForDebugging(
        `[copilot-adapter] adapter pipeline failure: ${errorMessage}`,
        { level: 'error' },
      )

      const errorBody = {
        type: 'error',
        error: {
          type: 'api_error',
          message: `Copilot adapter error: ${errorMessage}`,
        },
      }

      return new Response(JSON.stringify(errorBody), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }, {
    preconnect: globalThis.fetch.preconnect?.bind(globalThis.fetch),
  }) as typeof fetch

  return wrappedFetch
}
