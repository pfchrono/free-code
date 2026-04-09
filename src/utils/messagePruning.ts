import type { Message } from '../types/message.js'
import { logForDebugging } from './debug.js'

/**
 * Aggressively prune old messages from conversation history.
 * Keeps only the most recent N messages to limit token bloat.
 *
 * Strategy:
 * - Keep system messages (type = 'system')
 * - Keep last N non-system messages to preserve context for current query
 * - Strip messages that are pure tool results (often redundant/stale)
 */
export function pruneOldMessages(messages: Message[], keepRecent = 40): Message[] {
  if (messages.length <= keepRecent) {
    return messages
  }

  const systemMessages: Message[] = []
  const nonSystemMessages: Message[] = []

  // Separate system and non-system messages
  for (const msg of messages) {
    if (msg.type === 'system') {
      systemMessages.push(msg)
    } else {
      nonSystemMessages.push(msg)
    }
  }

  // Keep only the most recent N non-system messages
  const recentMessages = nonSystemMessages.slice(-keepRecent)

  // Reconstruct: system messages first, then recent messages
  const prunedMessages = [...systemMessages, ...recentMessages]

  const prunedCount = messages.length - prunedMessages.length
  if (prunedCount > 0) {
    logForDebugging(
      `messagePruning: stripped ${prunedCount} old messages (${messages.length} → ${prunedMessages.length})`
    )
  }

  return prunedMessages
}

/**
 * Strip stale tool results from messages.
 * Tool result blocks that are old or no longer relevant waste tokens.
 *
 * Heuristic: Keep tool results only if they're within the last 15 messages
 * (assumes tool results are typically generated within 15 messages of their use).
 */
export function stripStaleToolResults(messages: Message[]): Message[] {
  if (messages.length === 0) {
    return messages
  }

  const RECENT_WINDOW = 15 // Keep tool results only in recent window

  return messages.map((msg, idx) => {
    // Only process user messages that might contain tool results
    if (msg.type !== 'user') {
      return msg
    }

    // Check if this message is old (outside the recent window)
    const isOld = idx < messages.length - RECENT_WINDOW

    // If message is old and appears to be a pure tool result block, strip it
    if (isOld && msg.message?.content) {
      const content = msg.message.content

      // Check if this is primarily tool result blocks
      const hasOnlyToolResults =
        Array.isArray(content) &&
        content.every(
          block =>
            block.type === 'tool_result' ||
            (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length < 50)
        )

      if (hasOnlyToolResults) {
        // Return message but replace tool results with minimal acknowledgment
        return {
          ...msg,
          message: {
            ...msg.message,
            content: [
              {
                type: 'text',
                text: '[tool result omitted for context length]',
              },
            ],
          },
        }
      }
    }

    return msg
  })
}

/**
 * Comprehensive message pruning combining multiple strategies.
 */
export function pruneMessagesForTokens(messages: Message[]): Message[] {
  // Step 1: Keep only recent messages (helps with 87k+ bloat)
  let pruned = pruneOldMessages(messages, 40)

  // Step 2: Strip stale tool results from older messages
  pruned = stripStaleToolResults(pruned)

  return pruned
}
