import { beforeEach, describe, expect, test, mock } from 'bun:test'

const waitForInitialization = mock(async () => {})
const reinitializeLspServerManager = mock(async () => {})
const getAllLspServers = mock(async () => ({ servers: {} }))
const getInitializationStatus = mock(() => ({ status: 'success' as const }))
const getLspServerManager = mock(() => undefined)
const getMatchingLspPlugins = mock(async () => [])

mock.module('../../services/lsp/manager.js', () => ({
  getInitializationStatus,
  getLspServerManager,
  reinitializeLspServerManager,
  waitForInitialization,
}))

mock.module('../../services/lsp/config.js', () => ({
  getAllLspServers,
}))

mock.module('../../utils/plugins/lspRecommendation.js', () => ({
  getMatchingLspPlugins,
}))

const { call } = await import('./lsp.js')

describe('/lsp', () => {
  beforeEach(() => {
    waitForInitialization.mockClear()
    reinitializeLspServerManager.mockClear()
    getAllLspServers.mockClear()
    getInitializationStatus.mockClear()
    getLspServerManager.mockClear()
    getMatchingLspPlugins.mockClear()
  })

  test('renders help', async () => {
    const result = await call('', {} as never)

    expect(result.value).toContain('/lsp status')
  })

  test('renders status', async () => {
    getAllLspServers.mockResolvedValueOnce({
      servers: {
        ts: {
          type: 'stdio',
          command: 'vtsls',
          args: [],
          extensionToLanguage: { '.ts': 'typescript' },
        },
      },
    })

    const result = await call('status', {} as never)

    expect(result.value).toContain('LSP status')
    expect(result.value).toContain('Configured servers: 1')
  })

  test('renders recommendations', async () => {
    getMatchingLspPlugins.mockResolvedValueOnce([
      {
        pluginId: 'official/typescript',
        pluginName: 'TypeScript',
        marketplaceName: 'official',
        description: 'TypeScript LSP',
        isOfficial: true,
        extensions: ['.ts'],
        command: 'vtsls',
      },
    ])

    const result = await call('recommend src/index.ts', {} as never)

    expect(result.value).toContain('official/typescript')
    expect(result.value).toContain('vtsls')
  })

  test('restarts manager before rendering status', async () => {
    const result = await call('restart', {} as never)

    expect(reinitializeLspServerManager).toHaveBeenCalled()
    expect(result.value).toContain('LSP status')
  })
})
