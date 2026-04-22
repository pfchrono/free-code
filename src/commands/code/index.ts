import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'code',
  description: 'Search Archivist code intel and impact hints',
  load: () => import('./code.js'),
} satisfies Command
