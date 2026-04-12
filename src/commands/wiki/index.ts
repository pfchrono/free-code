import type { Command } from '../../commands.js'

const wiki: Command = {
  type: 'local',
  name: 'wiki',
  description: 'Manage local project wiki data',
  argumentHint: '[init|status|ingest <file>]',
  supportsNonInteractive: true,
  load: () => import('./wiki.js'),
}

export default wiki
