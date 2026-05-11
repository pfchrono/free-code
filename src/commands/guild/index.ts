import type { Command } from '../../commands.js'

const guild = {
  type: 'local-jsx',
  name: 'guild',
  description: 'Connect the Agent Guild MCP memory and quest board',
  immediate: true,
  argumentHint: '[status|install [local|user|project]|start]',
  load: () => import('./guild.js'),
} satisfies Command

export default guild
