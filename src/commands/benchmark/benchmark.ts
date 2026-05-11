import type { LocalCommandCall } from '../../types/command.js'
import { benchmarkOllamaModel, listOllamaModels } from '../../utils/providerDiscovery.js'

const HELP_TEXT =
  'Usage: /benchmark <model-name>\n' +
  '       /benchmark models\n\n' +
  'Benchmarks a local Ollama model by running 10 quick latency probes.'

const PROBE_COUNT = 10

function formatAverage(totalMs: number, count: number): string {
  return (totalMs / count).toFixed(1)
}

export const call: LocalCommandCall = async (args) => {
  const input = args.trim()

  if (!input) {
    return { type: 'text', value: HELP_TEXT }
  }

  if (input === 'models') {
    const models = await listOllamaModels()
    if (!models.length) {
      return {
        type: 'text',
        value:
          'No Ollama models found. Make sure Ollama is running and has local models installed.',
      }
    }

    return {
      type: 'text',
      value: ['Available Ollama models:', ...models.map((model) => `- ${model.name}`)].join('\n'),
    }
  }

  const latencies: number[] = []
  for (let i = 0; i < PROBE_COUNT; i += 1) {
    const elapsedMs = await benchmarkOllamaModel(input)
    if (elapsedMs == null) {
      return {
        type: 'text',
        value:
          `Benchmark failed for ${input}. ` +
          'Make sure Ollama is running and the model name is correct.',
      }
    }
    latencies.push(elapsedMs)
  }

  const totalMs = latencies.reduce((sum, value) => sum + value, 0)
  const minMs = Math.min(...latencies)
  const maxMs = Math.max(...latencies)

  return {
    type: 'text',
    value: [
      `Benchmark results for ${input}:`,
      `- samples: ${PROBE_COUNT}`,
      `- average: ${formatAverage(totalMs, latencies.length)}ms`,
      `- min: ${minMs}ms`,
      `- max: ${maxMs}ms`,
      `- all samples: ${latencies.join('ms, ')}ms`,
    ].join('\n'),
  }
}
