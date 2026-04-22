import type { Command } from '../../commands.js'

const ralphMode = {
  type: 'local',
  name: 'ralphmode',
  description: 'Toggle Ralph loop mode without changing providers',
  isEnabled: () => true,
  supportsNonInteractive: true,
  argumentHint: '[on|off|status]',
  load: () => import('./ralphMode.js'),
} satisfies Command

export default ralphMode
