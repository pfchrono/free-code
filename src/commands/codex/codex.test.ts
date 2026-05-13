import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

describe('codex command', () => {
  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_CODEX
    delete process.env.CLAUDE_CODE_USE_OPENROUTER
    delete process.env.CLAUDE_CODE_USE_COPILOT
    delete process.env.CLAUDE_CODE_USE_LMSTUDIO
    delete process.env.CLAUDE_CODE_USE_MINIMAX
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    mock.restore()
  })

  it('enables codex provider without changing prompt style toggles', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const logEvent = mock(() => {})
    const onDone = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings: () => ({
        codexModeEnabled: false,
        deadpoolModeEnabled: false,
        cavemanModeEnabled: false,
      }),
      getSettings_DEPRECATED: () => ({
        codexModeEnabled: false,
        deadpoolModeEnabled: false,
        cavemanModeEnabled: false,
      }),
      getSettingsForSource: () => ({ apiProvider: 'firstParty' }),
      getSettingsWithErrors: () => ({ settings: { apiProvider: 'firstParty' }, errors: [] }),
      getManagedSettingsKeysForLogging: () => [],
      getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
      getPolicySettingsOrigin: () => undefined,
      hasAutoModeOptIn: () => false,
      hasSkipDangerousModePermissionPrompt: () => false,
      getAutoModeConfig: () => undefined,
      parseSettingsFile: () => ({ settings: {}, errors: [] }),
      loadSettingsFromDisk: () => ({}),
      getSettingsFilePathForSource: () => '/tmp/project/.claude/settings.json',
      getRelativeSettingsFilePathForSource: () => '.claude/settings.json',
      getSettingsRootPathForSource: () => '/tmp/project/.claude',
      updateSettingsForSource,
    }))
    mock.module('../../services/analytics/index.js', () => ({
      logEvent,
    }))
    const { call } = await import('./codex.js')
    await call(onDone as never, {} as never, 'on')

    expect(process.env.CLAUDE_CODE_USE_CODEX).toBe('1')
    expect(updateSettingsForSource).toHaveBeenCalledWith('projectSettings', {
      apiProvider: 'codex',
    })
  })

  it('disables codex mode when switching back off', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const logEvent = mock(() => {})
    const onDone = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings: () => ({
        codexModeEnabled: false,
        deadpoolModeEnabled: false,
        cavemanModeEnabled: false,
      }),
      getSettings_DEPRECATED: () => ({
        codexModeEnabled: false,
        deadpoolModeEnabled: false,
        cavemanModeEnabled: false,
      }),
      getSettingsForSource: () => ({ apiProvider: 'codex' }),
      getSettingsWithErrors: () => ({ settings: { apiProvider: 'codex' }, errors: [] }),
      getManagedSettingsKeysForLogging: () => [],
      getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
      getPolicySettingsOrigin: () => undefined,
      hasAutoModeOptIn: () => false,
      hasSkipDangerousModePermissionPrompt: () => false,
      getAutoModeConfig: () => undefined,
      parseSettingsFile: () => ({ settings: {}, errors: [] }),
      loadSettingsFromDisk: () => ({}),
      getSettingsFilePathForSource: () => '/tmp/project/.claude/settings.json',
      getRelativeSettingsFilePathForSource: () => '.claude/settings.json',
      getSettingsRootPathForSource: () => '/tmp/project/.claude',
      updateSettingsForSource,
    }))
    mock.module('../../services/analytics/index.js', () => ({
      logEvent,
    }))
    const { call } = await import('./codex.js')
    await call(onDone as never, {} as never, 'off')

    expect(process.env.CLAUDE_CODE_USE_CODEX).toBeUndefined()
    expect(updateSettingsForSource).toHaveBeenCalledWith('projectSettings', {
      apiProvider: 'firstParty',
    })
  })

  it('restores the active non-codex provider when switching codex off', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const logEvent = mock(() => {})
    const onDone = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings: () => ({
        codexModeEnabled: false,
        deadpoolModeEnabled: false,
        cavemanModeEnabled: false,
      }),
      getSettings_DEPRECATED: () => ({
        codexModeEnabled: false,
        deadpoolModeEnabled: false,
        cavemanModeEnabled: false,
      }),
      getSettingsForSource: () => ({ apiProvider: 'codex' }),
      getSettingsWithErrors: () => ({ settings: { apiProvider: 'codex' }, errors: [] }),
      getManagedSettingsKeysForLogging: () => [],
      getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
      getPolicySettingsOrigin: () => undefined,
      hasAutoModeOptIn: () => false,
      hasSkipDangerousModePermissionPrompt: () => false,
      getAutoModeConfig: () => undefined,
      parseSettingsFile: () => ({ settings: {}, errors: [] }),
      loadSettingsFromDisk: () => ({}),
      getSettingsFilePathForSource: () => '/tmp/project/.claude/settings.json',
      getRelativeSettingsFilePathForSource: () => '.claude/settings.json',
      getSettingsRootPathForSource: () => '/tmp/project/.claude',
      updateSettingsForSource,
    }))
    mock.module('../../services/analytics/index.js', () => ({
      logEvent,
    }))
    process.env.CLAUDE_CODE_USE_OPENAI = '1'

    const { call } = await import('./codex.js')
    await call(onDone as never, {} as never, 'off')

    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBe('1')
    expect(updateSettingsForSource).toHaveBeenCalledWith('projectSettings', {
      apiProvider: 'openai',
    })
  })
})
