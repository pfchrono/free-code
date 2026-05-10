import type { LocalCommandCall } from '../../types/command.js'
import {
  formatSessionTimeline,
  formatSessionTree,
} from '../../services/memory/sessionTimeline.js'

export const call: LocalCommandCall = async (args = '') => {
  const trimmed = args.trim()
  const [command = 'timeline', entryId] = trimmed.split(/\s+/)

  if (command === 'timeline' || command === 'list' || command === '') {
    return { type: 'text', value: await formatSessionTimeline(entryId) }
  }

  if (command === 'tree') {
    return { type: 'text', value: await formatSessionTree() }
  }

  return {
    type: 'text',
    value: 'Usage: /sessions [timeline [entry-id]|tree]',
  }
}
