import { describe, expect, test } from 'bun:test'

import {
  buildCodexProfileEnv,
  buildLaunchEnv,
  buildOpenAIProfileEnv,
  buildStartupEnvFromProfile,
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_MODEL,
  type ProfileFile,
} from './providerProfile.js'

function buildPersistedProfile(
  profile: ProfileFile['profile'],
  env: ProfileFile['env'],
): ProfileFile {
  return { version: 1, profile, env }
}

describe('provider profile env resolution', () => {
  test('buildOpenAIProfileEnv ignores shell Codex defaults when building OpenAI profile', () => {
    const env = buildOpenAIProfileEnv({
      goal: 'fast',
      apiKey: 'openai-key',
      processEnv: {
        OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
        OPENAI_MODEL: 'codexplan',
      },
    })

    expect(env).toEqual({
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      OPENAI_MODEL: 'gpt-5.5',
      OPENAI_API_KEY: 'openai-key',
    })
  })

  test('buildLaunchEnv ignores persisted Codex defaults when launching OpenAI profile', async () => {
    const env = await buildLaunchEnv({
      profile: 'openai',
      goal: 'fast',
      persisted: buildPersistedProfile('openai', {
        OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
        OPENAI_MODEL: 'codexplan',
      }),
      processEnv: {},
    })

    expect(env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1')
    expect(env.OPENAI_MODEL).toBe('gpt-5.5')
    expect(env.CLAUDE_CODE_USE_OPENAI).toBe('1')
  })

  test('buildCodexProfileEnv keeps Codex OAuth defaults on clean process env', () => {
    const env = buildCodexProfileEnv({
      apiKey: 'codex-key',
      processEnv: { CHATGPT_ACCOUNT_ID: 'acct-123' },
    })

    expect(env).toEqual({
      OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
      OPENAI_MODEL: 'codexplan',
      CODEX_CREDENTIAL_SOURCE: 'existing',
      CODEX_API_KEY: 'codex-key',
      CHATGPT_ACCOUNT_ID: 'acct-123',
    })
  })

  test('buildStartupEnvFromProfile leaves env untouched when plural profile already applied', async () => {
    const processEnv = {
      CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED: '1',
      CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID: 'plural-profile',
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: 'https://api.moonshot.cn/v1',
      OPENAI_MODEL: 'moonshot-v1-8k',
    }

    const env = await buildStartupEnvFromProfile({
      persisted: buildPersistedProfile('openai', {
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
        OPENAI_MODEL: 'gpt-4o',
      }),
      processEnv,
    })

    expect(env).toBe(processEnv)
    expect(env.OPENAI_BASE_URL).toBe('https://api.moonshot.cn/v1')
    expect(env.OPENAI_MODEL).toBe('moonshot-v1-8k')
  })

  test('buildStartupEnvFromProfile honors falsey explicit OpenAI flag and applies persisted Gemini profile', async () => {
    const env = await buildStartupEnvFromProfile({
      persisted: buildPersistedProfile('gemini', {
        GEMINI_API_KEY: 'gemini-key',
      }),
      processEnv: {
        CLAUDE_CODE_USE_OPENAI: '0',
        OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
        OPENAI_MODEL: 'codexplan',
      },
    })

    expect(env.CLAUDE_CODE_USE_GEMINI).toBe('1')
    expect(env.GEMINI_API_KEY).toBe('gemini-key')
    expect(env.GEMINI_BASE_URL).toBe(DEFAULT_GEMINI_BASE_URL)
    expect(env.GEMINI_MODEL).toBe(DEFAULT_GEMINI_MODEL)
    expect(env.CLAUDE_CODE_USE_OPENAI).toBeUndefined()
    expect(env.OPENAI_BASE_URL).toBeUndefined()
    expect(env.OPENAI_MODEL).toBeUndefined()
  })
})
