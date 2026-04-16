import type { Command } from '../../types/command.js'

const deadpoolMode = {
  type: 'local',
  name: 'deadpoolmode',
  description: 'Toggle wisecracking antihero personality mode for replies',
  isEnabled: () => true,
  supportsNonInteractive: true,
  argumentHint: '[on|off]',
  load: () => import('./deadpoolMode.js'),
} satisfies Command

export default deadpoolMode
