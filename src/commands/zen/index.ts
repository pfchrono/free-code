import type { Command } from '../../commands.js'

const zen = {
  type: 'local-jsx',
  name: 'zen',
  description:
    'Store a repo-local OpenCode Zen provider preference for future free-code launches',
  immediate: true,
  argumentHint: '[status|models|off]',
  load: () => import('./zen.js'),
} satisfies Command

export default zen
