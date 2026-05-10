import type { Command } from '../../commands.js'

const goal = {
  type: 'local',
  name: 'goal',
  description: 'Set, inspect, complete, or clear a looping session goal',
  isEnabled: () => true,
  supportsNonInteractive: true,
  argumentHint: '[status|clear|complete|pause|resume|<objective>] [--budget tokens]',
  load: () => import('./goal.js'),
} satisfies Command

export default goal

