import { describe, expect, it } from 'bun:test'
import { recommendProvider, type ProviderAvailability } from './providerAuto.js'

function noneAvailable(): ProviderAvailability {
  return {
    firstParty: false,
    codex: false,
    openai: false,
    openrouter: false,
    copilot: false,
    lmstudio: false,
    zen: false,
    minimax: false,
  }
}

describe('recommendProvider', () => {
  it('prefers codex for coding', () => {
    const availability = {
      ...noneAvailable(),
      codex: true,
      openai: true,
      lmstudio: true,
    }
    expect(recommendProvider(availability, 'coding').provider).toBe('codex')
  })

  it('prefers LM Studio for latency', () => {
    const availability = {
      ...noneAvailable(),
      lmstudio: true,
      openai: true,
      zen: true,
    }
    expect(recommendProvider(availability, 'latency').provider).toBe('lmstudio')
  })

  it('prefers openai over openrouter for balanced', () => {
    const availability = {
      ...noneAvailable(),
      openai: true,
      openrouter: true,
    }
    expect(recommendProvider(availability, 'balanced').provider).toBe('openai')
  })

  it('uses copilot when coding and codex unavailable', () => {
    const availability = {
      ...noneAvailable(),
      copilot: true,
      openai: true,
    }
    expect(recommendProvider(availability, 'coding').provider).toBe('copilot')
  })

  it('uses zen before minimax for latency', () => {
    const availability = {
      ...noneAvailable(),
      zen: true,
      minimax: true,
    }
    expect(recommendProvider(availability, 'latency').provider).toBe('zen')
  })

  it('falls back to firstParty', () => {
    const availability = {
      ...noneAvailable(),
      firstParty: true,
    }
    expect(recommendProvider(availability, 'balanced').provider).toBe('firstParty')
  })
})
