import type { Command } from '../../commands.js'

const palette = {
  type: 'local-jsx',
  name: 'palette',
  description: 'Open command palette for quick actions',
  aliases: ['cmd', 'commands'],
  argumentHint: '[search term]',
  immediate: true,
  load: () => import('./palette.js'),
} satisfies Command

export default palette
