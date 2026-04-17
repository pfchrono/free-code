import type { Command } from '../../commands.js'

const sidebar = {
  type: 'local-jsx',
  name: 'sidebar',
  description: 'Toggle sidebar with provider info and quick actions',
  argumentHint: '[toggle|open|close|provider]',
  immediate: true,
  load: () => import('./sidebar.js'),
} satisfies Command

export default sidebar
