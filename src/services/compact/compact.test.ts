import { describe, expect, it } from 'bun:test'

import { createCompactBoundaryMessage, createUserMessage } from '../../utils/messages.js'
import {
  buildPostCompactMessages,
  stripLegacyWarningMessagesForCompaction,
  type CompactionResult,
} from './compact.js'

describe('stripLegacyWarningMessagesForCompaction', () => {
  it('drops legacy warning messages while preserving real user text', () => {
    const messages = [
      createUserMessage({
        content:
          'Warning: The maximum number of unified exec processes you can keep open is 60 and you currently have 61 processes open. Reuse older processes or close them to prevent automatic pruning of old processes',
      }),
      createUserMessage({
        content:
          'Warning: apply_patch was requested via exec_command. Use the apply_patch tool instead of exec_command.',
      }),
      createUserMessage({
        content:
          'Warning: Your account was flagged for potentially high-risk cyber activity and this request was routed to gpt-5.2 as a fallback.',
      }),
      createUserMessage({ content: 'real user message' }),
    ]

    const kept = stripLegacyWarningMessagesForCompaction(messages)

    expect(kept.map(message => message.type === 'user' ? message.message.content : '')).toEqual([
      'real user message',
    ])
  })

  it('filters preserved messages from post-compact output', () => {
    const summary = createUserMessage({ content: 'summary', isCompactSummary: true })
    const legacyWarning = createUserMessage({
      content:
        'Warning: apply_patch was requested via exec_command. Use the apply_patch tool instead of exec_command.',
    })
    const keptUserMessage = createUserMessage({ content: 'latest user' })
    const result: CompactionResult = {
      boundaryMarker: createCompactBoundaryMessage('manual', 100),
      summaryMessages: [summary],
      messagesToKeep: [legacyWarning, keptUserMessage],
      attachments: [],
      hookResults: [],
    }

    const postCompactMessages = buildPostCompactMessages(result)

    expect(postCompactMessages).toEqual([
      result.boundaryMarker,
      summary,
      keptUserMessage,
    ])
  })
})
