import { beforeEach, describe, expect, it, mock } from 'bun:test'

describe('benchmark command', () => {
  beforeEach(() => {
    mock.restore()
  })

  it('shows help when no args provided', async () => {
    mock.module('../../utils/providerDiscovery.js', () => ({
      benchmarkOllamaModel: mock(async () => 12),
      listOllamaModels: mock(async () => []),
    }))

    const { call } = await import('./benchmark.js')
    const result = await call('', {} as never)

    expect(result).toEqual({
      type: 'text',
      value:
        'Usage: /benchmark <model-name>\n' +
        '       /benchmark models\n\n' +
        'Benchmarks a local Ollama model by running 10 quick latency probes.',
    })
  })

  it('lists local Ollama models', async () => {
    const listOllamaModels = mock(async () => [
      { name: 'llama3.2', sizeBytes: null, family: null },
      { name: 'qwen2.5-coder', sizeBytes: null, family: null },
    ])
    mock.module('../../utils/providerDiscovery.js', () => ({
      benchmarkOllamaModel: mock(async () => 12),
      listOllamaModels,
    }))

    const { call } = await import('./benchmark.js')
    const result = await call('models', {} as never)

    expect(listOllamaModels).toHaveBeenCalled()
    expect(result).toEqual({
      type: 'text',
      value: 'Available Ollama models:\n- llama3.2\n- qwen2.5-coder',
    })
  })

  it('reports benchmark summary for valid model', async () => {
    const benchmarkOllamaModel = mock()
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(120)
      .mockResolvedValueOnce(140)
      .mockResolvedValueOnce(160)
      .mockResolvedValueOnce(180)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(220)
      .mockResolvedValueOnce(240)
      .mockResolvedValueOnce(260)
      .mockResolvedValueOnce(280)

    mock.module('../../utils/providerDiscovery.js', () => ({
      benchmarkOllamaModel,
      listOllamaModels: mock(async () => []),
    }))

    const { call } = await import('./benchmark.js')
    const result = await call('llama3.2', {} as never)

    expect(benchmarkOllamaModel).toHaveBeenCalledTimes(10)
    expect(result).toEqual({
      type: 'text',
      value:
        'Benchmark results for llama3.2:\n' +
        '- samples: 10\n' +
        '- average: 190.0ms\n' +
        '- min: 100ms\n' +
        '- max: 280ms\n' +
        '- all samples: 100ms, 120ms, 140ms, 160ms, 180ms, 200ms, 220ms, 240ms, 260ms, 280ms',
    })
  })

  it('reports failure when probe fails', async () => {
    const benchmarkOllamaModel = mock()
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(null)

    mock.module('../../utils/providerDiscovery.js', () => ({
      benchmarkOllamaModel,
      listOllamaModels: mock(async () => []),
    }))

    const { call } = await import('./benchmark.js')
    const result = await call('broken-model', {} as never)

    expect(benchmarkOllamaModel).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      type: 'text',
      value:
        'Benchmark failed for broken-model. Make sure Ollama is running and the model name is correct.',
    })
  })
})
