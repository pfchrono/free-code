import { randomUUID } from 'crypto'
import { roughTokenCountEstimation, roughTokenCountEstimationForMessages } from '../tokenEstimation.js'
import { COPILOT_API_BASE_URL } from '../../constants/copilot-oauth.js'
import { logForDebugging } from '../../utils/debug.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { setCodexUsage } from './codexUsage.js'

const COPILOT_EDITOR_VERSION = 'vscode/1.80.1'
const COPILOT_PLUGIN_VERSION = 'copilot-chat/0.26.7'
const COPILOT_USER_AGENT = 'GitHubCopilotChat/0.26.7'
const COPILOT_API_VERSION = '2025-04-01'

export const COPILOT_MODELS = [
  {
    id: 'claude-opus-4.6',
    label: 'Claude Opus 4.6',
    description: 'High-capability Claude model for complex reasoning and coding',
  },
  {
    id: 'claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    description: 'Balanced Claude model for everyday coding tasks',
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3-Codex',
    description: 'Latest Codex-focused GPT model for coding workflows',
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Latest general-purpose GPT model',
  },
  {
    id: 'claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Fast Claude model optimized for lightweight tasks',
  },
  {
    id: 'claude-opus-4.5',
    label: 'Claude Opus 4.5',
    description: 'Previous-generation high-capability Claude model',
  },
  {
    id: 'claude-opus-4.6-fast',
    label: 'Claude Opus 4.6 (fast mode)',
    description: 'Preview fast-mode variant of Claude Opus 4.6',
  },
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    description: 'Balanced high-quality coding model',
  },
  {
    id: 'claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    description: 'Previous-generation balanced Claude model',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Google Gemini pro model available via Copilot',
  },
  {
    id: 'gemini-3-flash',
    label: 'Gemini 3 Flash (Preview)',
    description: 'Preview fast Gemini model',
  },
  {
    id: 'gemini-3.1-pro',
    label: 'Gemini 3.1 Pro (Preview)',
    description: 'Preview Gemini pro model',
  },
  { id: 'gpt-4.1', label: 'GPT-4.1', description: 'High-quality general coding model' },
  { id: 'gpt-4o', label: 'GPT-4o', description: 'Fast multimodal general model' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', description: 'Compact GPT-5 variant' },
  { id: 'gpt-5.1', label: 'GPT-5.1', description: 'GPT-5.1 model' },
  { id: 'gpt-5.2', label: 'GPT-5.2', description: 'GPT-5.2 model' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2-Codex', description: 'Codex-focused GPT-5.2 variant' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', description: 'Compact GPT-5.4 variant' },
  { id: 'grok-code-fast-1', label: 'Grok Code Fast 1', description: 'Fast Grok coding model' },
  { id: 'raptor-mini', label: 'Raptor mini (Preview)', description: 'Preview compact coding model' },
] as const

export const DEFAULT_COPILOT_MODEL = 'gpt-5.3-codex'
const DEFAULT_COPILOT_CONTEXT_WINDOW_SIZE = 256_000

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

export function isCopilotModel(model: string): boolean {
  return COPILOT_MODELS.some((entry) => entry.id === model)
}

export function mapClaudeModelToCopilot(model: string | null): string {
  if (!model) return DEFAULT_COPILOT_MODEL
  if (isCopilotModel(model)) return model

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

function flattenUserContent(content: string | AnthropicContentBlock[]): string {
  if (typeof content === 'string') return content

  return content
    .map((block) => {
      if (block.type === 'text') return block.text || ''
      if (block.type === 'image') return '[Image omitted]'
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function translateMessages(messages: AnthropicMessage[]): Array<Record<string, unknown>> {
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

      const textContent = flattenUserContent(message.content)
      if (textContent.length > 0) {
        translated.push({ role: 'user', content: textContent })
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

function translateToCopilotBody(anthropicBody: Record<string, unknown>): {
  copilotBody: Record<string, unknown>
  copilotModel: string
  estimatedInputTokens: number
} {
  const anthropicMessages = (anthropicBody.messages as AnthropicMessage[]) || []
  const anthropicTools = (anthropicBody.tools as AnthropicTool[]) || []
  const systemPrompt = anthropicBody.system as
    | string
    | Array<{ type: string; text?: string; cache_control?: unknown }>
    | undefined

  const copilotModel = mapClaudeModelToCopilot((anthropicBody.model as string) || null)
  const translatedMessages = translateMessages(anthropicMessages)
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

  const copilotBody: Record<string, unknown> = {
    model: copilotModel,
    stream: true,
    stream_options: { include_usage: true },
    messages: translatedMessages,
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
              setCodexUsage({
                provider: 'copilot',
                usage_source: 'github-copilot-stream',
                last_response_usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                  total_tokens: usage.total_tokens ?? inputTokens + outputTokens,
                },
                context_window: {
                  context_window_size: DEFAULT_COPILOT_CONTEXT_WINDOW_SIZE,
                  used_tokens: usage.total_tokens ?? inputTokens + outputTokens,
                  remaining_tokens:
                    usage.total_tokens !== undefined
                      ? Math.max(
                          DEFAULT_COPILOT_CONTEXT_WINDOW_SIZE - usage.total_tokens,
                          0,
                        )
                      : null,
                  used_percentage:
                    usage.total_tokens !== undefined
                      ? Math.min(
                          (usage.total_tokens / DEFAULT_COPILOT_CONTEXT_WINDOW_SIZE) * 100,
                          100,
                        )
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

export function createCopilotFetch(copilotToken: string): typeof fetch {
  return async (input, init) => {
    const url = getRequestUrl(input)
    const method = init?.method || 'GET'

    if (!isAnthropicMessagesEndpoint(url)) {
      return globalThis.fetch(input, init)
    }

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

    const { copilotBody, copilotModel, estimatedInputTokens } =
      translateToCopilotBody(anthropicBody)

    logForDebugging(
      `[copilot-adapter] forwarding ${method} ${url} as model=${copilotModel}`,
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
        Authorization: `Bearer ${copilotToken}`,
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
      },
      body: JSON.stringify(copilotBody),
    }

    const response = await fetch(`${COPILOT_API_BASE_URL}/chat/completions`, {
      ...upstreamInit,
    })

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

    return translateCopilotStreamToAnthropic(
      response,
      copilotModel,
      estimatedInputTokens,
    )
  }
}