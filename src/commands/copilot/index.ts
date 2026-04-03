import type { Command } from '../../commands.js'

const copilot = {
  type: 'local-jsx',
  name: 'copilot',
  description: 'Use GitHub Copilot as the repo-local provider for this workspace',
  immediate: true,
  argumentHint: '[status|models|off]',
  load: () => import('./copilot.js'),
} satisfies Command

export default copilot