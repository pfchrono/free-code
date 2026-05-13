import type { ToolResultBlockParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import type { AssistantMessage, Message } from '../../types/message.js'

type FileMutationToolName =
  | typeof FILE_EDIT_TOOL_NAME
  | typeof FILE_WRITE_TOOL_NAME
  | typeof NOTEBOOK_EDIT_TOOL_NAME

type PendingFileMutationFailure = {
  toolName: FileMutationToolName
  path: string
  error: string
}

type AssistantTextBlock = {
  type: 'text'
  text: string
  [key: string]: unknown
}

const MAX_ERROR_PREVIEW_LENGTH = 180
const FILE_EDIT_TOOL_NAME = 'Edit'
const FILE_WRITE_TOOL_NAME = 'Write'
const NOTEBOOK_EDIT_TOOL_NAME = 'NotebookEdit'

function isFileMutationToolName(name: string): name is FileMutationToolName {
  return (
    name === FILE_EDIT_TOOL_NAME ||
    name === FILE_WRITE_TOOL_NAME ||
    name === NOTEBOOK_EDIT_TOOL_NAME
  )
}

function getMutationPath(toolUse: ToolUseBlock): string | null {
  const input = toolUse.input
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const value =
    toolUse.name === NOTEBOOK_EDIT_TOOL_NAME
      ? record.notebook_path
      : record.file_path
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : null
}

function getMutationKey(toolName: FileMutationToolName, path: string): string {
  return `${toolName}\0${path}`
}

function textFromToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => {
      if (!block || typeof block !== 'object') return ''
      const text = (block as Record<string, unknown>).text
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function stripToolUseErrorTags(text: string): string {
  return text
    .replace(/<\/?tool_use_error>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncatePreview(text: string): string {
  if (text.length <= MAX_ERROR_PREVIEW_LENGTH) return text
  return `${text.slice(0, MAX_ERROR_PREVIEW_LENGTH - 1)}…`
}

function toolResultsFromMessage(message: Message): ToolResultBlockParam[] {
  if (
    message.type !== 'user' ||
    !Array.isArray(message.message.content)
  ) {
    return []
  }
  return message.message.content.filter(
    (block): block is ToolResultBlockParam =>
      Boolean(block) &&
      typeof block === 'object' &&
      (block as Record<string, unknown>).type === 'tool_result',
  )
}

export class FileMutationVerifier {
  private pendingFailures = new Map<string, PendingFileMutationFailure>()

  recordToolResultMessage(
    message: Message,
    toolUsesById: ReadonlyMap<string, ToolUseBlock>,
  ): void {
    for (const result of toolResultsFromMessage(message)) {
      const toolUse = toolUsesById.get(result.tool_use_id)
      if (!toolUse || !isFileMutationToolName(toolUse.name)) continue
      const path = getMutationPath(toolUse)
      if (!path) continue

      const key = getMutationKey(toolUse.name, path)
      if (result.is_error === true) {
        const error = truncatePreview(
          stripToolUseErrorTags(textFromToolResultContent(result.content)),
        )
        this.pendingFailures.set(key, {
          toolName: toolUse.name,
          path,
          error,
        })
      } else {
        this.pendingFailures.delete(key)
      }
    }
  }

  getPendingFailures(): PendingFileMutationFailure[] {
    return [...this.pendingFailures.values()]
  }

  formatFooter(): string | null {
    const failures = this.getPendingFailures()
    if (failures.length === 0) return null

    const lines = failures.map(failure => {
      const suffix = failure.error ? `: ${failure.error}` : ''
      return `- ${failure.toolName} \`${failure.path}\`${suffix}`
    })
    return [
      'File mutation check: these tool calls did not modify target files:',
      ...lines,
    ].join('\n')
  }
}

export function createFileMutationVerifier(): FileMutationVerifier {
  return new FileMutationVerifier()
}

export function appendFileMutationFooterToAssistantMessage(
  message: AssistantMessage,
  footer: string | null,
): AssistantMessage {
  if (!footer) return message

  const content = message.message.content
  const lastTextIndex = content.findLastIndex(
    (block): block is AssistantTextBlock =>
      Boolean(block) &&
      typeof block === 'object' &&
      (block as Record<string, unknown>).type === 'text' &&
      typeof (block as Record<string, unknown>).text === 'string',
  )
  const footerText = `\n\n${footer}`

  if (lastTextIndex === -1) {
    return {
      ...message,
      message: {
        ...message.message,
        content: [...content, { type: 'text', text: footerText }],
      },
    }
  }

  return {
    ...message,
    message: {
      ...message.message,
      content: content.map((block, index) =>
        index === lastTextIndex
          ? {
              ...(block as AssistantTextBlock),
              text: `${(block as AssistantTextBlock).text}${footerText}`,
            }
          : block,
      ),
    },
  }
}
