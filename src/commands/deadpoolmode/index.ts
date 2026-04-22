import type { Command } from '../../types/command.js'

const deadpoolMode = {
  type: 'local',
  name: 'deadpoolmode',
  description: 'Toggle Deadpool response style overlay for replies',
  isEnabled: () => true,
  supportsNonInteractive: true,
  argumentHint: '[on|off]',
  load: () => import('./deadpoolMode.js'),
} satisfies Command

export default deadpoolMode
