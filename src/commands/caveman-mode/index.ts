import type { Command } from '../../types/command.js'

const cavemanMode = {
  type: 'local',
  name: 'caveman-mode',
  description: 'Toggle ultra-compressed communication mode (~75% fewer tokens)',
  isEnabled: () => true,
  supportsNonInteractive: true,
  argumentHint: '[on|off]',
  load: () => import('./cavemanMode.js'),
} satisfies Command

export default cavemanMode
