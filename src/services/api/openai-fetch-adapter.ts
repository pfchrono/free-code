import { createHash } from 'crypto'
import { reportAnthropicHostedRequest } from '../../utils/anthropicLeakDetection.js'
import type { OpenAIModelCapability } from '../../utils/model/openaiCapabilities.js'

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

function isAnthropicMessagesEndpoint(url: string): boolean {
  try {
    return new URL(url).pathname === '/v1/messages'
  } catch {
    return url.includes('/v1/messages')
  }
}

function getImageDataUrl(source: Record<string, unknown> | undefined): string | null {
  if (!source || source.type !== 'base64') return null
  const mediaType = typeof source.media_type === 'string' ? source.media_type : null
  const data = typeof source.data === 'string' ? source.data : null
  if (!mediaType || !data) return null
  return `data:${mediaType};base64,${data}`
}

function flattenUserContent(content: string | AnthropicContentBlock[]): string {
  if (typeof content === 'string') return content
  return content
    .map(block => {
      if (block.type === 'text') return block.text || ''
      if (block.type === 'image') return '[Image omitted]'
      return ''
    })
    .filter(Boolean)
    .join('\n')
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
    return { type: 'image_url', image_url: { url: imageUrl } }
  }

  return null
}

function translateTools(tools: AnthropicTool[]): Array<Record<string, unknown>> {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} },
    },
  }))
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

      const parts = message.content
        .map(translateUserContentPart)
        .filter((part): part is Record<string, unknown> => part !== null)
      if (parts.length > 0) {
        translated.push({ role: 'user', content: parts })
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

    const nextMessage: Record<string, unknown> = {
      role: message.role,
      content: textParts.join('\n'),
    }
    if (toolCalls.length > 0) {
      nextMessage.tool_calls = toolCalls
    }
    translated.push(nextMessage)
  }

  return translated
}

function preferredTokenKey(modelId: string, capability?: OpenAIModelCapability): 'max_tokens' | 'max_completion_tokens' {
  const explicit = capability?.preferredTokenParameter
  if (explicit === 'max_completion_tokens') return explicit
  const lower = modelId.toLowerCase()
  if (lower.startsWith('gpt-5') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) {
    return 'max_completion_tokens'
  }
  return 'max_tokens'
}

function translateToOpenAIBody(
  anthropicBody: Record<string, unknown>,
  selectedModel?: OpenAIModelCapability,
  options?: { forceToolChoice?: 'auto' | 'none'; disableParallelToolCalls?: boolean },
): { openaiBody: Record<string, unknown>; model: string } {
  const anthropicMessages = (anthropicBody.messages as AnthropicMessage[]) || []
  const anthropicTools = (anthropicBody.tools as AnthropicTool[]) || []
  const systemPrompt = anthropicBody.system as
    | string
    | Array<{ type: string; text?: string }>
    | undefined

  const model = String(anthropicBody.model || selectedModel?.id || 'gpt-5.4')
  const translatedMessages = translateMessages(anthropicMessages)
  if (systemPrompt) {
    const text =
      typeof systemPrompt === 'string'
        ? systemPrompt
        : systemPrompt
            .filter(block => block.type === 'text' && typeof block.text === 'string')
            .map(block => block.text as string)
            .join('\n')
    if (text) {
      translatedMessages.unshift({ role: 'system', content: text })
    }
  }

  const tokenParamKey = preferredTokenKey(model, selectedModel)
  const openaiBody: Record<string, unknown> = {
    model,
    stream: true,
    stream_options: { include_usage: true },
    messages: translatedMessages,
    [tokenParamKey]: anthropicBody.max_tokens ?? selectedModel?.max_tokens ?? 4096,
  }

  if (anthropicTools.length > 0) {
    openaiBody.tools = translateTools(anthropicTools)
    openaiBody.tool_choice = options?.forceToolChoice ?? 'auto'
    openaiBody.parallel_tool_calls = !(options?.disableParallelToolCalls ?? false)
  }

  return { openaiBody, model }
}

async function translateOpenAIStreamToAnthropic(
  openaiResponse: Response,
  model: string,
): Promise<Response> {
  const messageId = `msg_openai_${Date.now()}`
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      let buffer = ''
      let contentBlockIndex = 0
      let currentTextBlockStarted = false
      let inToolCall = false
      let currentToolCallId = ''
      let currentToolCallName = ''
      let sawToolCall = false
      let inputTokens = 0
      let outputTokens = 0
      let finishReason: string | null = null

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
                model,
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
        currentTextBlockStarted = false
        contentBlockIndex++
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
        inToolCall = false
        currentToolCallId = ''
        currentToolCallName = ''
        contentBlockIndex++
      }

      const reader = openaiResponse.body?.getReader()
      if (!reader) {
        controller.error(new Error('No OpenAI response body available'))
        return
      }

      try {
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

             const usage = event.usage as Record<string, number> | undefined
             if (usage) {
               inputTokens = (usage.prompt_tokens ?? usage.input_tokens ?? 0) + inputTokens
               outputTokens = (usage.completion_tokens ?? usage.output_tokens ?? 0) + outputTokens
             }

            const choices = (event.choices as Array<Record<string, unknown>>) || []
            for (const choice of choices) {
              const delta = (choice.delta as Record<string, unknown>) || {}
              finishReason = (choice.finish_reason as string | null) ?? finishReason

              const toolCalls = (delta.tool_calls as Array<Record<string, unknown>>) || []
              for (const toolCall of toolCalls) {
                const functionInfo = (toolCall.function as Record<string, unknown>) || {}
                const toolCallId = String(toolCall.id || currentToolCallId || `tool_${Date.now()}`)
                const toolCallName = String(functionInfo.name || currentToolCallName || '')
                const toolArgsChunk = String(functionInfo.arguments || '')

                if (!inToolCall) {
                  closeTextBlock()
                  currentToolCallId = toolCallId
                  currentToolCallName = toolCallName
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
                            id: currentToolCallId,
                            name: currentToolCallName,
                            input: {},
                          },
                        }),
                      ),
                    ),
                  )
                }

                if (toolArgsChunk) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE(
                        'content_block_delta',
                        JSON.stringify({
                          type: 'content_block_delta',
                          index: contentBlockIndex,
                          delta: {
                            type: 'input_json_delta',
                            partial_json: toolArgsChunk,
                          },
                        }),
                      ),
                    ),
                  )
                }
              }

              const content =
                typeof delta.content === 'string'
                  ? delta.content
                  : typeof delta.reasoning_content === 'string'
                    ? delta.reasoning_content
                    : ''
              if (content) {
                closeToolBlock()
                if (!currentTextBlockStarted) {
                  currentTextBlockStarted = true
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
                }
                controller.enqueue(
                  encoder.encode(
                    formatSSE(
                      'content_block_delta',
                      JSON.stringify({
                        type: 'content_block_delta',
                        index: contentBlockIndex,
                        delta: { type: 'text_delta', text: content },
                      }),
                    ),
                  ),
                )
              }
            }
          }
        }

        closeTextBlock()
        closeToolBlock()

        controller.enqueue(
          encoder.encode(
            formatSSE(
              'message_delta',
              JSON.stringify({
                type: 'message_delta',
                delta: {
                  stop_reason: sawToolCall ? 'tool_use' : (finishReason || 'end_turn'),
                  stop_sequence: null,
                },
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                },
              }),
            ),
          ),
        )
        controller.enqueue(
          encoder.encode(
            formatSSE(
              'message_stop',
              JSON.stringify({ type: 'message_stop', request_hash: createHash('sha1').update(messageId).digest('hex') }),
            ),
          ),
        )
        controller.close()
      } catch (error) {
        controller.error(error)
      }
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

export function createOpenAIFetch({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  getModelCapability,
  forceToolChoice,
  disableParallelToolCalls,
  extraHeaders,
}: {
  apiKey: string
  baseUrl?: string
  getModelCapability?: (modelId: string) => OpenAIModelCapability | undefined
  forceToolChoice?: 'auto' | 'none'
  disableParallelToolCalls?: boolean
  extraHeaders?: Record<string, string>
}): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    if (!isAnthropicMessagesEndpoint(url)) {
      return globalThis.fetch(input, init)
    }

    reportAnthropicHostedRequest({
      transport: 'fetch',
      url,
      context: 'openai-adapter-intercept',
      operation: 'anthropic-messages->openai-responses',
    })

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

    const selectedModel = getModelCapability?.(String(anthropicBody.model || ''))
    const { openaiBody, model } = translateToOpenAIBody(anthropicBody, selectedModel, {
      forceToolChoice,
      disableParallelToolCalls,
    })
    const openaiResponse = await globalThis.fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(openaiBody),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text().catch(() => '')
      return new Response(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'api_error',
            message: `OpenAI API error (${openaiResponse.status}): ${errorText}`,
          },
        }),
        {
          status: openaiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    return translateOpenAIStreamToAnthropic(openaiResponse, model)
  }
}
