import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

type ProviderProfileShape = {
  id: string
  name: string
  provider: string
  baseUrl: string
  model: string
  apiKey?: string
  apiFormat?: string
  authHeader?: string
  authScheme?: string
  authHeaderValue?: string
  customHeaders?: Record<string, string>
}

type MockConfig = {
  providerProfiles?: ProviderProfileShape[]
  activeProviderProfileId?: string
  openaiAdditionalModelOptionsCacheByProfile?: Record<
    string,
    Array<{ value: string; label?: string; description?: string }>
  >
}

let mockConfig: MockConfig = {}

mock.module('./config.js', () => ({
  getGlobalConfig: () => mockConfig,
  saveGlobalConfig: (updater: (current: MockConfig) => MockConfig) => {
    mockConfig = updater(mockConfig)
    return mockConfig
  },
}))

const originalEnv = {
  profileAppliedFlag: process.env.CLAUDE_CODE_PROFILE_APPLIED,
  profileAppliedId: process.env.CLAUDE_CODE_PROFILE_APPLIED_ID,
  providerProfileAppliedFlag: process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED,
  providerProfileAppliedId: process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID,
  useOpenAI: process.env.CLAUDE_CODE_USE_OPENAI,
  useGemini: process.env.CLAUDE_CODE_USE_GEMINI,
  useGithub: process.env.CLAUDE_CODE_USE_GITHUB,
  openaiBaseUrl: process.env.OPENAI_BASE_URL,
  openaiModel: process.env.OPENAI_MODEL,
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
  anthropicModel: process.env.ANTHROPIC_MODEL,
  geminiBaseUrl: process.env.GEMINI_BASE_URL,
  geminiModel: process.env.GEMINI_MODEL,
  freeCodeConfigDir: process.env.FREE_CODE_CONFIG_DIR,
  freeCodeConfigHome: process.env.FREE_CODE_CONFIG_HOME,
  claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
  claudeConfigHome: process.env.CLAUDE_CONFIG_HOME,
}

function buildProfile(overrides: Partial<ProviderProfileShape> = {}): ProviderProfileShape {
  return {
    id: 'profile-1',
    name: 'ZAI',
    provider: 'zai',
    baseUrl: 'https://api.z.ai/api/paas/v4/',
    model: 'glm-4.5, glm-4.7',
    apiKey: 'sk-test',
    ...overrides,
  }
}

let tempConfigDir: string | undefined

beforeEach(() => {
  mockConfig = {}
  tempConfigDir = undefined
  delete process.env.CLAUDE_CODE_PROFILE_APPLIED
  delete process.env.CLAUDE_CODE_PROFILE_APPLIED_ID
  delete process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED
  delete process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_GEMINI
  delete process.env.CLAUDE_CODE_USE_GITHUB
  delete process.env.OPENAI_BASE_URL
  delete process.env.OPENAI_MODEL
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.ANTHROPIC_MODEL
  delete process.env.GEMINI_BASE_URL
  delete process.env.GEMINI_MODEL
  delete process.env.FREE_CODE_CONFIG_DIR
  delete process.env.FREE_CODE_CONFIG_HOME
  delete process.env.CLAUDE_CONFIG_DIR
  delete process.env.CLAUDE_CONFIG_HOME
})

afterEach(() => {
  if (originalEnv.profileAppliedFlag === undefined) {
    delete process.env.CLAUDE_CODE_PROFILE_APPLIED
  } else {
    process.env.CLAUDE_CODE_PROFILE_APPLIED = originalEnv.profileAppliedFlag
  }

  if (originalEnv.profileAppliedId === undefined) {
    delete process.env.CLAUDE_CODE_PROFILE_APPLIED_ID
  } else {
    process.env.CLAUDE_CODE_PROFILE_APPLIED_ID = originalEnv.profileAppliedId
  }

  if (originalEnv.providerProfileAppliedFlag === undefined) {
    delete process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED
  } else {
    process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED =
      originalEnv.providerProfileAppliedFlag
  }

  if (originalEnv.providerProfileAppliedId === undefined) {
    delete process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID
  } else {
    process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID =
      originalEnv.providerProfileAppliedId
  }

  if (originalEnv.useOpenAI === undefined) {
    delete process.env.CLAUDE_CODE_USE_OPENAI
  } else {
    process.env.CLAUDE_CODE_USE_OPENAI = originalEnv.useOpenAI
  }

  if (originalEnv.useGemini === undefined) {
    delete process.env.CLAUDE_CODE_USE_GEMINI
  } else {
    process.env.CLAUDE_CODE_USE_GEMINI = originalEnv.useGemini
  }

  if (originalEnv.useGithub === undefined) {
    delete process.env.CLAUDE_CODE_USE_GITHUB
  } else {
    process.env.CLAUDE_CODE_USE_GITHUB = originalEnv.useGithub
  }

  if (originalEnv.openaiBaseUrl === undefined) {
    delete process.env.OPENAI_BASE_URL
  } else {
    process.env.OPENAI_BASE_URL = originalEnv.openaiBaseUrl
  }

  if (originalEnv.openaiModel === undefined) {
    delete process.env.OPENAI_MODEL
  } else {
    process.env.OPENAI_MODEL = originalEnv.openaiModel
  }

  if (originalEnv.anthropicBaseUrl === undefined) {
    delete process.env.ANTHROPIC_BASE_URL
  } else {
    process.env.ANTHROPIC_BASE_URL = originalEnv.anthropicBaseUrl
  }

  if (originalEnv.anthropicModel === undefined) {
    delete process.env.ANTHROPIC_MODEL
  } else {
    process.env.ANTHROPIC_MODEL = originalEnv.anthropicModel
  }

  if (originalEnv.geminiBaseUrl === undefined) {
    delete process.env.GEMINI_BASE_URL
  } else {
    process.env.GEMINI_BASE_URL = originalEnv.geminiBaseUrl
  }

  if (originalEnv.geminiModel === undefined) {
    delete process.env.GEMINI_MODEL
  } else {
    process.env.GEMINI_MODEL = originalEnv.geminiModel
  }

  if (originalEnv.freeCodeConfigDir === undefined) {
    delete process.env.FREE_CODE_CONFIG_DIR
  } else {
    process.env.FREE_CODE_CONFIG_DIR = originalEnv.freeCodeConfigDir
  }

  if (originalEnv.freeCodeConfigHome === undefined) {
    delete process.env.FREE_CODE_CONFIG_HOME
  } else {
    process.env.FREE_CODE_CONFIG_HOME = originalEnv.freeCodeConfigHome
  }

  if (originalEnv.claudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalEnv.claudeConfigDir
  }

  if (originalEnv.claudeConfigHome === undefined) {
    delete process.env.CLAUDE_CONFIG_HOME
  } else {
    process.env.CLAUDE_CONFIG_HOME = originalEnv.claudeConfigHome
  }

  if (tempConfigDir) {
    rmSync(tempConfigDir, { recursive: true, force: true })
  }
})

describe('provider profile env shaping', () => {
  test('github profiles set github mode instead of generic openai mode', async () => {
    const { applyProviderProfileToProcessEnv } = await import(
      `./providerProfiles.ts?github=${Date.now()}`,
    )

    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    applyProviderProfileToProcessEnv(
      buildProfile({
        provider: 'github',
        baseUrl: 'https://models.github.ai/inference',
        model: 'github:copilot',
      }) as never,
    )

    expect(process.env.CLAUDE_CODE_USE_GITHUB).toBe('1')
    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBeUndefined()
    expect(process.env.OPENAI_BASE_URL).toBe('https://models.github.ai/inference')
    expect(process.env.OPENAI_MODEL).toBe('github:copilot')
  })

  test('anthropic profiles keep only the primary configured model in env', async () => {
    const { applyProviderProfileToProcessEnv } = await import(
      `./providerProfiles.ts?anthropic=${Date.now()}`,
    )

    applyProviderProfileToProcessEnv(
      buildProfile({
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-6, claude-opus-4-6',
      }) as never,
    )

    expect(process.env.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com')
    expect(process.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6')
  })

  test('gemini profiles keep only the primary configured model in env', async () => {
    const { applyProviderProfileToProcessEnv } = await import(
      `./providerProfiles.ts?gemini=${Date.now()}`,
    )

    applyProviderProfileToProcessEnv(
      buildProfile({
        provider: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        model: 'gemini-3-flash-preview; gemini-3-pro-preview',
      }) as never,
    )

    expect(process.env.CLAUDE_CODE_USE_GEMINI).toBe('1')
    expect(process.env.GEMINI_BASE_URL).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/',
    )
    expect(process.env.GEMINI_MODEL).toBe('gemini-3-flash-preview')
  })
})

describe('provider profile persistence', () => {
  test('setActiveProviderProfile writes startup profile into FREE_CODE_CONFIG_DIR', async () => {
    tempConfigDir = mkdtempSync(join(tmpdir(), 'free-code-provider-profile-'))
    process.env.FREE_CODE_CONFIG_DIR = tempConfigDir

    const { setActiveProviderProfile } = await import(
      `./providerProfiles.ts?persist=${Date.now()}`
    )
    const profile = buildProfile({
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6, claude-opus-4-6',
    })
    mockConfig = {
      providerProfiles: [profile],
    }

    const result = setActiveProviderProfile(profile.id)
    const profileFilePath = join(tempConfigDir, '.free-code-profile.json')

    expect(result?.id).toBe(profile.id)
    expect(existsSync(profileFilePath)).toBe(true)
    expect(JSON.parse(readFileSync(profileFilePath, 'utf8'))).toMatchObject({
      profile: 'anthropic',
      env: {
        ANTHROPIC_API_KEY: 'sk-test',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      },
    })
  })
})

describe('provider profile model handling', () => {
  test('getProfileModelOptions preserves configured model list and appends cached discoveries once', async () => {
    const { getProfileModelOptions } = await import(`./providerProfiles.ts?models=${Date.now()}`)
    const profile = buildProfile()

    const options = getProfileModelOptions(profile as never, {
      openaiAdditionalModelOptionsCacheByProfile: {
        [profile.id]: [
          {
            value: 'glm-4.7',
            label: 'glm-4.7',
            description: 'duplicate from cache',
          },
          {
            value: 'glm-z1',
            label: 'glm-z1',
            description: 'discovered from API',
          },
        ],
      },
    } as never)

    expect(options.map(option => option.value)).toEqual([
      'glm-4.5',
      'glm-4.7',
      'glm-z1',
    ])
    expect(options[0]).toEqual({
      value: 'glm-4.5',
      label: 'glm-4.5',
      description: 'Provider: ZAI',
    })
    expect(options[2]).toEqual({
      value: 'glm-z1',
      label: 'glm-z1',
      description: 'discovered from API',
    })
  })

  test('persistActiveProviderProfileModel leaves comma-separated model lists alone when selecting an existing model', async () => {
    const { getProviderProfiles, persistActiveProviderProfileModel } = await import(
      `./providerProfiles.ts?existing=${Date.now()}`,
    )
    const profile = buildProfile()
    mockConfig = {
      providerProfiles: [profile],
      activeProviderProfileId: profile.id,
    }

    const result = persistActiveProviderProfileModel('glm-4.7')

    expect(result?.model).toBe('glm-4.5, glm-4.7')
    expect((getProviderProfiles() as ProviderProfileShape[])[0]?.model).toBe(
      'glm-4.5, glm-4.7',
    )
  })

  test('persistActiveProviderProfileModel replaces the stored model when the selection is not already configured', async () => {
    const { getActiveProviderProfile, persistActiveProviderProfileModel } = await import(
      `./providerProfiles.ts?replacement=${Date.now()}`,
    )
    const profile = buildProfile()
    mockConfig = {
      providerProfiles: [profile],
      activeProviderProfileId: profile.id,
    }

    const result = persistActiveProviderProfileModel('glm-z1')

    expect(result?.model).toBe('glm-z1')
    expect((getActiveProviderProfile() as ProviderProfileShape | undefined)?.model).toBe(
      'glm-z1',
    )
  })

  test('persistActiveProviderProfileModel updates process env for profile-managed sessions', async () => {
    const {
      applyProviderProfileToProcessEnv,
      getProviderProfiles,
      persistActiveProviderProfileModel,
    } = await import(`./providerProfiles.ts?managed=${Date.now()}`)
    const profile = buildProfile({ model: 'glm-4.5' })
    mockConfig = {
      providerProfiles: [profile],
      activeProviderProfileId: profile.id,
    }

    applyProviderProfileToProcessEnv(profile as never)
    const result = persistActiveProviderProfileModel('glm-z1')

    expect(result?.model).toBe('glm-z1')
    expect(process.env.OPENAI_MODEL).toBe('glm-z1')
    expect(process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED).toBe('1')
    expect(process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID).toBe(profile.id)
    expect((getProviderProfiles() as ProviderProfileShape[])[0]?.model).toBe('glm-z1')
  })

  test('persistActiveProviderProfileModel leaves process env alone outside profile-managed sessions', async () => {
    const { getProviderProfiles, persistActiveProviderProfileModel } = await import(
      `./providerProfiles.ts?unmanaged=${Date.now()}`,
    )
    const profile = buildProfile({ model: 'glm-4.5' })
    mockConfig = {
      providerProfiles: [profile],
      activeProviderProfileId: profile.id,
    }
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'cli-model'

    const result = persistActiveProviderProfileModel('glm-z1')

    expect(result?.model).toBe('glm-z1')
    expect(process.env.OPENAI_MODEL).toBe('cli-model')
    expect((getProviderProfiles() as ProviderProfileShape[])[0]?.model).toBe('glm-z1')
  })
})
