import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import { DirectConnectSessionManager, type DirectConnectConfig } from './directConnectManager.js'

function writeJsonLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function extractText(message: SDKMessage): string | null {
  if (message.type === 'assistant') {
    const content = message.message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map(block => {
          if (typeof block === 'string') return block
          if (
            typeof block === 'object' &&
            block !== null &&
            'type' in block &&
            'text' in block &&
            (block as { type?: unknown }).type === 'text'
          ) {
            return String((block as { text?: unknown }).text ?? '')
          }
          return ''
        })
        .join('')
    }
  }

  if (message.type === 'result') {
    const subtype = (message as { subtype?: unknown }).subtype
    if (subtype === 'success') {
      return 'Completed successfully.'
    }
    if (subtype === 'error') {
      return String((message as { error?: unknown }).error ?? 'Request failed.')
    }
  }

  if (message.type === 'system') {
    const text = (message as { message?: unknown }).message
    return typeof text === 'string' ? text : null
  }

  return null
}

export async function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat: string,
  interactive: boolean,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false

    const manager = new DirectConnectSessionManager(config, {
      onConnected() {
        if (prompt) {
          manager.sendMessage(prompt)
        }
      },
      onMessage(message) {
        if (outputFormat === 'stream-json') {
          writeJsonLine(message)
        } else if (outputFormat === 'json') {
          writeJsonLine(message)
        } else {
          const text = extractText(message)
          if (text) {
            process.stdout.write(`${text}\n`)
          }
        }

        if (message.type === 'result' && !interactive && !settled) {
          settled = true
          manager.disconnect()
          resolve()
        }
      },
      onPermissionRequest(_request, requestId) {
        manager.respondToPermissionRequest(requestId, {
          behavior: 'deny',
          message:
            'Headless direct-connect mode cannot answer interactive permission prompts.',
        })
      },
      onDisconnected() {
        if (!settled) {
          settled = true
          resolve()
        }
      },
      onError(error) {
        if (!settled) {
          settled = true
          reject(error)
        }
      },
    })

    manager.connect()
  })
}
