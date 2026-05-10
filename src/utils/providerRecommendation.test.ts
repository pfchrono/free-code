import { describe, expect, test } from 'bun:test'

import {
  applyBenchmarkLatency,
  getGoalDefaultOpenAIModel,
  normalizeRecommendationGoal,
  rankOllamaModels,
  recommendOllamaModel,
  type OllamaModelDescriptor,
} from './providerRecommendation.js'

function model(
  name: string,
  overrides: Partial<OllamaModelDescriptor> = {},
): OllamaModelDescriptor {
  return {
    name,
    sizeBytes: null,
    family: null,
    families: [],
    parameterSize: null,
    quantizationLevel: null,
    ...overrides,
  }
}

describe('providerRecommendation', () => {
  test('normalizes recommendation goals safely', () => {
    expect(normalizeRecommendationGoal('coding')).toBe('coding')
    expect(normalizeRecommendationGoal(' LATENCY ')).toBe('latency')
    expect(normalizeRecommendationGoal('weird')).toBe('balanced')
    expect(normalizeRecommendationGoal(undefined)).toBe('balanced')
  })

  test('coding goal prefers coding-oriented ollama models', () => {
    const recommended = recommendOllamaModel(
      [
        model('llama3.1:8b', {
          parameterSize: '8B',
          quantizationLevel: 'Q4_K_M',
        }),
        model('qwen2.5-coder:7b', {
          parameterSize: '7B',
          quantizationLevel: 'Q4_K_M',
        }),
      ],
      'coding',
    )

    expect(recommended?.name).toBe('qwen2.5-coder:7b')
  })

  test('latency goal prefers smaller models', () => {
    const recommended = recommendOllamaModel(
      [
        model('llama3.1:70b', {
          parameterSize: '70B',
          quantizationLevel: 'Q4_K_M',
        }),
        model('llama3.2:3b', {
          parameterSize: '3B',
          quantizationLevel: 'Q4_K_M',
        }),
      ],
      'latency',
    )

    expect(recommended?.name).toBe('llama3.2:3b')
  })

  test('non-chat embedding models are heavily demoted', () => {
    const ranked = rankOllamaModels(
      [
        model('nomic-embed-text', { parameterSize: '0.5B' }),
        model('mistral:7b-instruct', {
          parameterSize: '7B',
          quantizationLevel: 'Q4_K_M',
        }),
      ],
      'balanced',
    )

    expect(ranked[0]?.name).toBe('mistral:7b-instruct')
  })

  test('auto-pick ignores non-chat ollama models', () => {
    const recommended = recommendOllamaModel(
      [
        model('nomic-embed-text', { parameterSize: '0.5B' }),
        model('bge-reranker-v2', { parameterSize: '1.5B' }),
        model('whisper-large-v3', { parameterSize: '1.6B' }),
      ],
      'balanced',
    )

    expect(recommended).toBeNull()
  })

  test('benchmark latency can reorder close recommendations', () => {
    const ranked = rankOllamaModels(
      [
        model('llama3.1:8b', {
          parameterSize: '8B',
          quantizationLevel: 'Q4_K_M',
        }),
        model('mistral:7b-instruct', {
          parameterSize: '7B',
          quantizationLevel: 'Q4_K_M',
        }),
      ],
      'latency',
    )

    const benchmarked = applyBenchmarkLatency(
      ranked,
      {
        'llama3.1:8b': 2000,
        'mistral:7b-instruct': 350,
      },
      'latency',
    )

    expect(benchmarked[0]?.name).toBe('mistral:7b-instruct')
    expect(benchmarked[0]?.benchmarkMs).toBe(350)
  })

  test('unbenchmarked models stay behind benchmarked candidates', () => {
    const ranked = rankOllamaModels(
      [
        model('phi4-mini:4b', {
          parameterSize: '4B',
          quantizationLevel: 'Q4_K_M',
        }),
        model('mistral:7b-instruct', {
          parameterSize: '7B',
          quantizationLevel: 'Q4_K_M',
        }),
        model('llama3.1:8b', {
          parameterSize: '8B',
          quantizationLevel: 'Q4_K_M',
        }),
        model('qwen2.5:14b', {
          parameterSize: '14B',
          quantizationLevel: 'Q4_K_M',
        }),
      ],
      'latency',
    )

    const benchmarked = applyBenchmarkLatency(
      ranked,
      {
        'phi4-mini:4b': 2400,
        'mistral:7b-instruct': 2200,
        'llama3.1:8b': 2100,
      },
      'latency',
    )

    expect(benchmarked.slice(0, 3).every(item => item.benchmarkMs !== null)).toBeTrue()
    expect(benchmarked[3]?.name).toBe('qwen2.5:14b')
    expect(benchmarked[3]?.benchmarkMs).toBeNull()
  })

  test('coding goal recognizes codestral and devstral families', () => {
    const ranked = rankOllamaModels(
      [
        model('mistral:7b-instruct', {
          parameterSize: '7B',
          quantizationLevel: 'Q4_K_M',
        }),
        model('codestral:22b', {
          parameterSize: '22B',
          quantizationLevel: 'Q4_K_M',
        }),
        model('devstral:24b', {
          parameterSize: '24B',
          quantizationLevel: 'Q4_K_M',
        }),
      ],
      'coding',
    )

    expect(ranked.slice(0, 2).map(item => item.name)).toEqual([
      'devstral:24b',
      'codestral:22b',
    ])
  })

  test('goal defaults choose sensible openai models', () => {
    expect(getGoalDefaultOpenAIModel('latency')).toBe('gpt-4o-mini')
    expect(getGoalDefaultOpenAIModel('balanced')).toBe('gpt-5.5')
    expect(getGoalDefaultOpenAIModel('coding')).toBe('gpt-5.5')
  })
})
