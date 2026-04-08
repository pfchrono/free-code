import type { Command } from '../../types/command.js'

const buddy = {
  type: 'local-jsx' as const,
  name: 'buddy',
  description: 'Hatch, pet, and manage your free-code companion',
  immediate: true,
  argumentHint: '[status|pet|mute|unmute|help]',
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy