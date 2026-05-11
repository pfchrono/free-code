import type { LocalCommandCall } from '../../types/command.js'
import {
  addRatchetEntry,
  formatRatchetEntry,
  formatRatchetList,
  parseRatchetAddArgs,
  readRatchetEntries,
  updateRatchetStatus,
  type RatchetStatus,
} from '../../services/harness/ratchetLedger.js'

const STATUS_COMMANDS = new Set<RatchetStatus>(['open', 'planned', 'fixed', 'wontfix'])

function usage(): string {
  return [
    'Usage:',
    '/ratchet list',
    '/ratchet show <id>',
    '/ratchet add <failure> [--impact "..."] [--desired "..."] [--evidence "file,test"] [--tags "goal,skill"]',
    '/ratchet planned <id>',
    '/ratchet fixed <id>',
    '/ratchet wontfix <id>',
  ].join('\n')
}

export const call: LocalCommandCall = async (args = '') => {
  const trimmed = args.trim()
  const [command = 'list', ...rest] = trimmed.split(/\s+/)

  if (command === 'list' || command === 'status' || command === '') {
    return { type: 'text', value: formatRatchetList(await readRatchetEntries()) }
  }

  if (command === 'show') {
    const id = rest[0]
    if (!id) return { type: 'text', value: usage() }
    const entry = (await readRatchetEntries()).find(candidate => candidate.id === id)
    return {
      type: 'text',
      value: entry ? formatRatchetEntry(entry) : `Ratchet entry not found: ${id}`,
    }
  }

  if (command === 'add') {
    const parsed = parseRatchetAddArgs(trimmed.slice(command.length).trim())
    const entry = await addRatchetEntry(parsed)
    return {
      type: 'text',
      value: [
        `Ratchet logged: ${entry.id}`,
        '',
        formatRatchetEntry(entry),
      ].join('\n'),
    }
  }

  if (STATUS_COMMANDS.has(command as RatchetStatus)) {
    const id = rest[0]
    if (!id) return { type: 'text', value: usage() }
    try {
      const entry = await updateRatchetStatus(id, command as RatchetStatus)
      return { type: 'text', value: formatRatchetEntry(entry) }
    } catch (error) {
      return {
        type: 'text',
        value: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return { type: 'text', value: usage() }
}
