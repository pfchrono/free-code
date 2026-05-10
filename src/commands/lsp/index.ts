import type { Command } from '../../commands.js'

const lsp = {
  type: 'local',
  name: 'lsp',
  description: 'Inspect Language Server Protocol code intelligence',
  argumentHint: 'status | recommend <path> | restart',
  supportsNonInteractive: true,
  load: () => import('./lsp.js'),
} satisfies Command

export default lsp
