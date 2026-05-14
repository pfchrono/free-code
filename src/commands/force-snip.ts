import { snipCompactIfNeeded } from '../services/compact/snipCompact.js'
import type { SnipResult } from '../services/compact/snipCompact.js'
import type { LocalCommandCall } from '../types/command.js'
import type { Command } from '../types/command.js'
import type { Message } from '../types/message.js'

type SnipCompact = (
  messages: readonly Message[],
  options: { force: true; signal?: AbortSignal },
) => Promise<SnipResult>

export async function compactMessagesForForceSnip(
  messages: readonly Message[],
  signal?: AbortSignal,
  compact: SnipCompact = snipCompactIfNeeded,
): Promise<{
  executed: boolean
  nextMessages: Message[]
  displayText: string
}> {
  const result = await compact(messages, { force: true, signal })

  if (!result.executed) {
    return {
      executed: false,
      nextMessages: [...messages],
      displayText: 'No history snipped. Need more messages before /force-snip can remove old context.',
    }
  }

  const nextMessages = result.boundaryMessage
    ? [result.boundaryMessage, ...result.messages]
    : [...result.messages]
  const messagesSnipped = Math.max(0, messages.length - result.messages.length)

  return {
    executed: true,
    nextMessages,
    displayText: `Snipped ${messagesSnipped} old message${messagesSnipped === 1 ? '' : 's'}; freed ~${result.tokensFreed} tokens.`,
  }
}

export const call: LocalCommandCall = async (_, context) => {
  const { executed, nextMessages, displayText } = await compactMessagesForForceSnip(
    context.messages ?? [],
    context.abortController?.signal,
  )

  if (executed) {
    context.setMessages(() => nextMessages)
  }

  return { type: 'text', value: displayText }
}

const forceSnip = {
  type: 'local',
  name: 'force-snip',
  description: 'Force history snip compaction now',
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default forceSnip
