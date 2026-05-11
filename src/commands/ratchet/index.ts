import type { Command } from '../../commands.js'

const ratchet = {
  type: 'local',
  name: 'ratchet',
  aliases: ['harness'],
  description: 'Capture agent failures as durable harness improvements',
  isEnabled: () => true,
  supportsNonInteractive: true,
  argumentHint: '[list|show <id>|add <failure>|planned|fixed|wontfix <id>]',
  load: () => import('./ratchet.js'),
} satisfies Command

export default ratchet
