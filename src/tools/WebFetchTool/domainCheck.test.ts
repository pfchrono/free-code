import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import axios from 'axios'

const originalEnv = { ...process.env }

async function importFreshModule() {
  return import(`./utils.ts?ts=${Date.now()}-${Math.random()}`)
}

beforeEach(() => {
  process.env = { ...originalEnv }
  mock.restore()
})

afterEach(() => {
  process.env = { ...originalEnv }
  mock.restore()
})

describe('checkDomainBlocklist', () => {
  test('returns allowed without API call in OpenAI mode', async () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    const getSpy = mock(() =>
      Promise.resolve({ status: 200, data: { can_fetch: true } }),
    )
    axios.get = getSpy as typeof axios.get

    const { checkDomainBlocklist } = await importFreshModule()
    const result = await checkDomainBlocklist('example.com')

    expect(result.status).toBe('allowed')
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('returns allowed without API call in Gemini mode', async () => {
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    const getSpy = mock(() =>
      Promise.resolve({ status: 200, data: { can_fetch: true } }),
    )
    axios.get = getSpy as typeof axios.get

    const { checkDomainBlocklist } = await importFreshModule()
    const result = await checkDomainBlocklist('example.com')

    expect(result.status).toBe('allowed')
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('calls Anthropic domain check in first-party mode', async () => {
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GITHUB
    delete process.env.CLAUDE_CODE_USE_CODEX
    delete process.env.OPENAI_API_KEY
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_ACCESS_TOKEN
    delete process.env.NVIDIA_NIM
    process.env.ANTHROPIC_API_KEY = 'test-key'

    const getSpy = mock(() =>
      Promise.resolve({ status: 200, data: { can_fetch: true } }),
    )
    axios.get = getSpy as typeof axios.get

    const { checkDomainBlocklist } = await importFreshModule()
    const result = await checkDomainBlocklist('example.com')

    expect(result.status).toBe('allowed')
    expect(getSpy).toHaveBeenCalledTimes(1)
  })
})

describe('getURLMarkdownContent private host guard', () => {
  test('refuses dotted loopback before axios fetch', async () => {
    const getSpy = mock(() => Promise.resolve({ status: 200, data: 'ok' }))
    axios.get = getSpy as typeof axios.get

    const { getURLMarkdownContent } = await importFreshModule()

    await expect(
      getURLMarkdownContent('http://127.0.0.1:8000/private', new AbortController()),
    ).rejects.toThrow('WebFetch refused private or reserved host 127.0.0.1')
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('refuses numeric loopback before axios fetch', async () => {
    const getSpy = mock(() => Promise.resolve({ status: 200, data: 'ok' }))
    axios.get = getSpy as typeof axios.get

    const { getURLMarkdownContent } = await importFreshModule()

    await expect(
      getURLMarkdownContent('http://2130706433/private', new AbortController()),
    ).rejects.toThrow('WebFetch refused private or reserved host 127.0.0.1')
    expect(getSpy).not.toHaveBeenCalled()
  })
})
