import type { Command } from '../../types/command.js'

const provider = {
  type: 'local-jsx',
  name: 'provider',
  description: 'Show or update the active API provider',
  load: () => import('./provider.js'),
} satisfies Command

export default provider
