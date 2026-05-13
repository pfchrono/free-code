import { join } from 'path'
import React from 'react'
import { ExportDialog } from '../../components/ExportDialog.js'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import type { Message } from '../../types/message.js'
import { getCwd } from '../../utils/cwd.js'
import { renderMessagesToPlainText } from '../../utils/exportRenderer.js'
import { writeFileSync_DEPRECATED } from '../../utils/slowOperations.js'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

export function ensureHtmlFilename(filename: string): string {
  return filename.endsWith('.html')
    ? filename
    : filename.replace(/\.[^.]+$/, '') + '.html'
}

export function renderStandaloneHtml(
  content: string,
  title = 'Free-Code Conversation Export',
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        background: #0b1020;
        color: #e5e7eb;
      }

      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 1.5rem;
      }

      p {
        margin: 0 0 24px;
        color: #94a3b8;
      }

      pre {
        margin: 0;
        padding: 20px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: 12px;
        border: 1px solid #1f2937;
        background: #111827;
        font: 13px/1.5 "SFMono-Regular", SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>Exported from Free-Code.</p>
      <pre>${escapeHtml(content)}</pre>
    </main>
  </body>
</html>`
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`
}

export function extractFirstPrompt(messages: Message[]): string {
  const firstUserMessage = messages.find(msg => msg.type === 'user')
  if (!firstUserMessage || firstUserMessage.type !== 'user') {
    return ''
  }

  const content = firstUserMessage.message?.content
  let result = ''

  if (typeof content === 'string') {
    result = content.trim()
  } else if (Array.isArray(content)) {
    const textContent = content.find(item => item.type === 'text')
    if (textContent && 'text' in textContent) {
      result = textContent.text.trim()
    }
  }

  result = result.split('\n')[0] || ''
  if (result.length > 50) {
    result = result.substring(0, 49) + '…'
  }

  return result
}

export function sanitizeFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function exportWithReactRenderer(context: ToolUseContext): Promise<string> {
  const tools = context.options.tools || []
  return renderMessagesToPlainText(context.messages, tools)
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext,
  args: string,
): Promise<React.ReactNode> {
  const textContent = await exportWithReactRenderer(context)
  if (textContent.trim().length === 0) {
    onDone('Nothing to export — conversation is empty')
    return null
  }

  const htmlContent = renderStandaloneHtml(textContent)
  const filename = args.trim()

  if (filename) {
    const filepath = join(getCwd(), ensureHtmlFilename(filename))

    try {
      writeFileSync_DEPRECATED(filepath, htmlContent, {
        encoding: 'utf-8',
        flush: true,
      })
      onDone(`Conversation exported to: ${filepath}`)
      return null
    } catch (error) {
      onDone(
        `Failed to export conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      return null
    }
  }

  const firstPrompt = extractFirstPrompt(context.messages)
  const timestamp = formatTimestamp(new Date())
  let defaultFilename: string

  if (firstPrompt) {
    const sanitized = sanitizeFilename(firstPrompt)
    defaultFilename = sanitized
      ? `${timestamp}-${sanitized}.html`
      : `conversation-${timestamp}.html`
  } else {
    defaultFilename = `conversation-${timestamp}.html`
  }

  return (
    <ExportDialog
      content={htmlContent}
      defaultFilename={defaultFilename}
      onDone={result => {
        onDone(result.message)
      }}
    />
  )
}
