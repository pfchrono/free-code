import type { Message } from './mailbox.js'
import { logForDebugging } from './debug.js'

const STRIPPED_TOOL_RESULT_PLACEHOLDER = '[tool result omitted for context length]'
const PURE_TOOL_RESULT_PATTERN = /^\s*(\[tool result:[\s\S]*?\]\s*)+$/i

/**
 * Aggressively prune old messages from conversation history.
 * Keeps only the most recent N messages to limit token bloat.
 */
export function pruneOldMessages(messages: Message[], keepRecent = 40): Message[] {
  if (messages.length <= keepRecent) {
    return messages
  }

  if (keepRecent <= 0) {
    const systemMessages = messages.filter(msg => msg.source === 'system')
    const prunedCount = messages.length - systemMessages.length
    if (prunedCount > 0) {
      logForDebugging(
        `messagePruning: stripped ${prunedCount} old messages (${messages.length} → ${systemMessages.length})`
      )
    }
    return systemMessages
  }

  const recentWindowStart = Math.max(messages.length - keepRecent, 0)
  const prunedMessages = messages.filter(
    (msg, index) => msg.source === 'system' || index >= recentWindowStart
  )

  const prunedCount = messages.length - prunedMessages.length
  if (prunedCount > 0) {
    logForDebugging(
      `messagePruning: stripped ${prunedCount} old messages (${messages.length} → ${prunedMessages.length})`
    )
  }

  return prunedMessages
}

/**
 * Strip stale tool results from old user messages.
 */
export function stripStaleToolResults(messages: Message[], keepToolResultsCount = 15): Message[] {
  if (messages.length === 0) {
    return messages
  }

  const thresholdIndex = Math.max(0, messages.length - keepToolResultsCount)

  return messages.map((msg, idx) => {
    if (msg.source !== 'user' || idx >= thresholdIndex) {
      return msg
    }

    if (!PURE_TOOL_RESULT_PATTERN.test(msg.content)) {
      return msg
    }

    return {
      ...msg,
      content: STRIPPED_TOOL_RESULT_PLACEHOLDER,
    }
  })
}

/**
 * Comprehensive message pruning combining multiple strategies.
 */
export function pruneMessagesForTokens(
  messages: Message[],
  keepRecent = 40,
  keepToolResultsCount = 15
): Message[] {
  let pruned = pruneOldMessages(messages, keepRecent)
  pruned = stripStaleToolResults(pruned, keepToolResultsCount)
  return pruned
}
