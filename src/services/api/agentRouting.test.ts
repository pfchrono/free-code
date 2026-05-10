import { describe, expect, test } from 'bun:test'
import { resolveAgentProvider } from './agentRouting.js'
import type { SettingsJson } from '../../utils/settings/types.js'

const baseSettings = {
  agentModels: {
    'deepseek-chat': {
      base_url: 'https://api.deepseek.com/v1',
      api_key: 'sk-ds',
    },
    'gpt-4o': {
      base_url: 'https://api.openai.com/v1',
      api_key: 'sk-oai',
    },
  },
  agentRouting: {
    Explore: 'deepseek-chat',
    'general-purpose': 'gpt-4o',
    'frontend-dev': 'deepseek-chat',
    default: 'gpt-4o',
  },
} as unknown as SettingsJson

describe('resolveAgentProvider', () => {
  test('name takes priority over subagentType', () => {
    const result = resolveAgentProvider('frontend-dev', 'Explore', baseSettings)
    expect(result).toEqual({
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'sk-ds',
    })
  })

  test('subagentType is used when name has no match', () => {
    const result = resolveAgentProvider('unknown-name', 'Explore', baseSettings)
    expect(result).toEqual({
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'sk-ds',
    })
  })

  test('falls back to default when neither name nor subagentType match', () => {
    const result = resolveAgentProvider('nobody', 'unknown-type', baseSettings)
    expect(result).toEqual({
      model: 'gpt-4o',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-oai',
    })
  })

  test('returns null when no routing match and no default exist', () => {
    const settings = {
      agentModels: baseSettings.agentModels,
      agentRouting: { Explore: 'deepseek-chat' },
    } as unknown as SettingsJson

    expect(resolveAgentProvider('nobody', 'unknown-type', settings)).toBeNull()
  })

  test('returns null when name and subagentType are both undefined', () => {
    const settings = {
      agentModels: baseSettings.agentModels,
      agentRouting: { Explore: 'deepseek-chat' },
    } as unknown as SettingsJson

    expect(resolveAgentProvider(undefined, undefined, settings)).toBeNull()
  })

  test('matching is case-insensitive', () => {
    expect(resolveAgentProvider(undefined, 'EXPLORE', baseSettings)?.model).toBe(
      'deepseek-chat',
    )
  })

  test('hyphen and underscore are equivalent', () => {
    expect(
      resolveAgentProvider(undefined, 'general_purpose', baseSettings)?.model,
    ).toBe('gpt-4o')
  })

  test('underscore in config matches hyphen in input', () => {
    const settings = {
      agentModels: baseSettings.agentModels,
      agentRouting: { general_purpose: 'deepseek-chat' },
    } as unknown as SettingsJson

    expect(
      resolveAgentProvider(undefined, 'general-purpose', settings)?.model,
    ).toBe('deepseek-chat')
  })

  test('returns null when settings are unavailable', () => {
    expect(resolveAgentProvider('Explore', 'Explore', null)).toBeNull()
  })

  test('returns null when routing or models are missing', () => {
    expect(
      resolveAgentProvider(
        undefined,
        'Explore',
        { agentModels: baseSettings.agentModels } as unknown as SettingsJson,
      ),
    ).toBeNull()
    expect(
      resolveAgentProvider(
        undefined,
        'Explore',
        { agentRouting: baseSettings.agentRouting } as unknown as SettingsJson,
      ),
    ).toBeNull()
  })

  test('returns null when routing references an unknown model', () => {
    const settings = {
      agentModels: {},
      agentRouting: { Explore: 'missing-model' },
    } as unknown as SettingsJson

    expect(resolveAgentProvider(undefined, 'Explore', settings)).toBeNull()
  })
})
