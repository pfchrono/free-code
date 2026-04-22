import type { Command } from '../../commands.js'

const memory: Command = {
  type: 'local-jsx',
  name: 'memory',
  description: 'Search and manage Free-Code memory',
  load: () => import('./enhancedMemory.js'),
}

export default memory
