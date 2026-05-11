import type { Command } from '../../commands.js'

const benchmark = {
  type: 'local',
  name: 'benchmark',
  description: 'Benchmark a local Ollama model with a few quick probe requests',
  isEnabled: () => true,
  supportsNonInteractive: true,
  argumentHint: '[models|<model-name>]',
  load: () => import('./benchmark.js'),
} satisfies Command

export default benchmark
