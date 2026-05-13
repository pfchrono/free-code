import {
  decodeGuiCommand,
  type GuiCommandDecodeErrorReason,
  type GuiCommandDecodeFailure,
} from './protocolCodec.js'
import type { GuiToCliCommand } from './guiProtocol.js'

type GuiCommandStreamHandlers = {
  onCommand: (command: GuiToCliCommand) => void
  onDecodeError?: (line: string, failure: GuiCommandDecodeFailure) => void
}

export function createGuiCommandStream(handlers: GuiCommandStreamHandlers): {
  onData: (chunk: string) => void
} {
  let buffer = ''

  function onData(chunk: string): void {
    buffer += chunk
    let newlineIndex = buffer.indexOf('\n')

    while (newlineIndex >= 0) {
      const rawLine = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)

      const decoded = decodeGuiCommand(rawLine)
      if (decoded.ok) {
        handlers.onCommand(decoded.command)
    } else if ((decoded as any).reason !== 'empty_line') {
      handlers.onDecodeError?.(rawLine, decoded as any)
      }

      newlineIndex = buffer.indexOf('\n')
    }
  }

  return { onData }
}

export type GuiCommandInbox = {
  next: () => Promise<GuiToCliCommand | null>
  dispose: () => void
}

export function createGuiCommandInbox(options?: {
  input?: NodeJS.ReadStream
  onDecodeError?: (line: string, reason: GuiCommandDecodeErrorReason, lineClass: GuiCommandDecodeFailure['lineClass']) => void
}): GuiCommandInbox {
  const input = options?.input ?? process.stdin
  const queue: GuiToCliCommand[] = []
  const waiters: Array<(command: GuiToCliCommand | null) => void> = []
  let ended = false

  const stream = createGuiCommandStream({
    onCommand: command => {
      const waiter = waiters.shift()
      if (waiter) {
        waiter(command)
      } else {
        queue.push(command)
      }
    },
    onDecodeError: (line, failure) => {
      options?.onDecodeError?.(line, failure.reason, failure.lineClass)
    },
  })

  const handleData = (chunk: string | Buffer): void => {
    stream.onData(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
  }

  const handleEnd = (): void => {
    ended = true
    while (waiters.length > 0) {
      waiters.shift()?.(null)
    }
  }

  input.on('data', handleData)
  input.on('end', handleEnd)

  return {
    next: async () => {
      if (queue.length > 0) {
        return queue.shift() ?? null
      }

      if (ended) {
        return null
      }

      return new Promise(resolve => {
        waiters.push(resolve)
      })
    },
    dispose: () => {
      input.removeListener('data', handleData)
      input.removeListener('end', handleEnd)
      while (waiters.length > 0) {
        waiters.shift()?.(null)
      }
    },
  }
}
