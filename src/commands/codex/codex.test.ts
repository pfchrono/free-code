import { beforeEach, describe, expect, it, mock } from 'bun:test'

describe('codex command', () => {
  beforeEach(() => {
    mock.restore()
  })

  it('enables codex provider without changing prompt style toggles', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const switchProviderDirectly = mock(() => {})
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
    mock.module('../../hooks/useProviderSwitch.js', () => ({
      switchProviderDirectly,
    }))
    mock.module('../../utils/model/providers.js', () => ({
      getAPIProvider: () => 'firstParty',
      shouldAllowAnthropicHostedServices: () => true,
      getAPIProviderForStatsig: () => 'firstParty',
      getCurrentAPIAdapterName: () => 'firstParty-adapter',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))

    const { call } = await import('./codex.js')
    await call(onDone as never, {} as never, 'on')

    expect(switchProviderDirectly).toHaveBeenCalledWith('codex')
    expect(updateSettingsForSource).toHaveBeenCalledWith('projectSettings', {
      apiProvider: 'codex',
    })
  })

  it('disables codex mode when switching back off', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const switchProviderDirectly = mock(() => {})
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
    mock.module('../../hooks/useProviderSwitch.js', () => ({
      switchProviderDirectly,
    }))
    mock.module('../../utils/model/providers.js', () => ({
      getAPIProvider: () => 'codex',
      shouldAllowAnthropicHostedServices: () => false,
      getAPIProviderForStatsig: () => 'codex',
      getCurrentAPIAdapterName: () => 'codex-adapter',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))

    const { call } = await import('./codex.js')
    await call(onDone as never, {} as never, 'off')

    expect(switchProviderDirectly).toHaveBeenCalledWith('firstParty')
    expect(updateSettingsForSource).toHaveBeenCalledWith('projectSettings', {
      apiProvider: 'firstParty',
    })
  })

  it('restores the active non-codex provider when switching codex off', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const switchProviderDirectly = mock(() => {})
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
    mock.module('../../hooks/useProviderSwitch.js', () => ({
      switchProviderDirectly,
    }))
    mock.module('../../utils/model/providers.js', () => ({
      getAPIProvider: () => 'openai',
      shouldAllowAnthropicHostedServices: () => false,
      getAPIProviderForStatsig: () => 'openai',
      getCurrentAPIAdapterName: () => 'openai-adapter',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))

    const { call } = await import('./codex.js')
    await call(onDone as never, {} as never, 'off')

    expect(switchProviderDirectly).toHaveBeenCalledWith('openai')
    expect(updateSettingsForSource).toHaveBeenCalledWith('projectSettings', {
      apiProvider: 'openai',
    })
  })
})
