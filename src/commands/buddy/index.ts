import type { Command } from '../../commands.js'

const buddy = {
  type: 'local',
  name: 'buddy',
  description: 'Show, hide, pet, or toggle your companion',
  argumentHint: '[show|status|stats|pet|hatch|mute|unmute|hide]',
  supportsNonInteractive: true,
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy

