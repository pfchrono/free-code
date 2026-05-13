import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import axios from 'axios'

const originalEnv = { ...process.env }

async function importFreshModule() {
  return import(`./officialRegistry.ts?ts=${Date.now()}-${Math.random()}`)
}

beforeEach(() => {
  process.env = { ...originalEnv }
})

afterEach(() => {
  process.env = { ...originalEnv }
  mock.restore()
})

describe('prefetchOfficialMcpUrls', () => {
  test('does not fetch registry when using OpenAI mode', async () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    const getSpy = mock(() => Promise.resolve({ data: { servers: [] } }))
    axios.get = getSpy as typeof axios.get

    const { prefetchOfficialMcpUrls } = await importFreshModule()
    await prefetchOfficialMcpUrls()

    expect(getSpy).not.toHaveBeenCalled()
  })

  test('does not fetch registry when using Gemini mode', async () => {
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    const getSpy = mock(() => Promise.resolve({ data: { servers: [] } }))
    axios.get = getSpy as typeof axios.get

    const { prefetchOfficialMcpUrls } = await importFreshModule()
    await prefetchOfficialMcpUrls()

    expect(getSpy).not.toHaveBeenCalled()
  })

  test('fetches registry in first-party mode', async () => {
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
      Promise.resolve({
        data: {
          servers: [{ server: { remotes: [{ url: 'https://example.com/mcp' }] } }],
        },
      }),
    )
    axios.get = getSpy as typeof axios.get

    const { prefetchOfficialMcpUrls, isOfficialMcpUrl } = await importFreshModule()
    await prefetchOfficialMcpUrls()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(isOfficialMcpUrl('https://example.com/mcp')).toBe(true)
  })
})
