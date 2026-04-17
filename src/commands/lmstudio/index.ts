import type { Command } from '../../commands.js'

const lmstudio = {
  type: 'local-jsx',
  name: 'lmstudio',
  description:
    'Store a repo-local LM Studio provider preference for future free-code launches',
  immediate: true,
  argumentHint: '[status|models|off]',
  load: () => import('./lmstudio.js'),
} satisfies Command

export default lmstudio
