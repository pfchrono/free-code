import { beforeEach, describe, expect, it, mock } from 'bun:test'

describe('ralphmode command', () => {
  beforeEach(() => {
    mock.restore()
  })

  it('enables ralph prompt mode without switching providers', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const getInitialSettings = mock(() => ({
      ralphModeEnabled: false,
      deadpoolModeEnabled: false,
      cavemanModeEnabled: false,
    }))
    const notifyChange = mock(() => {})
    const logEvent = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings,
      getSettings_DEPRECATED: getInitialSettings,
      getSettingsWithErrors: () => ({ settings: {}, errors: [] }),
      getManagedSettingsKeysForLogging: () => [],
      getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
      hasAutoModeOptIn: () => false,
      hasSkipDangerousModePermissionPrompt: () => false,
      getAutoModeConfig: () => undefined,
      parseSettingsFile: () => ({ settings: {}, errors: [] }),
      loadSettingsFromDisk: () => ({}),
      getSettingsFilePathForSource: () => '/tmp/user/.claude/settings.json',
      getRelativeSettingsFilePathForSource: () => '.claude/settings.json',
      getSettingsRootPathForSource: () => '/tmp/user/.claude',
      updateSettingsForSource,
    }))
    mock.module('../../utils/settings/changeDetector.js', () => ({
      settingsChangeDetector: {
        notifyChange,
      },
    }))
    mock.module('src/services/analytics/index.js', () => ({
      logEvent,
    }))
    mock.module('../../utils/model/providers.js', () => ({
      getAPIProvider: () => 'firstParty',
      shouldAllowAnthropicHostedServices: () => true,
      getAPIProviderForStatsig: () => 'firstParty',
      getCurrentAPIAdapterName: () => 'firstParty-adapter',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))

    const { call } = await import('./ralphMode.js')
    const result = await call('on', {} as never)

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      ralphModeEnabled: true,
    })
    expect(result).toEqual({
      type: 'text',
      value: 'Ralph mode enabled. Replies now use loop-until-done guidance.',
    })
  })

  it('disables ralph prompt mode', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const getInitialSettings = mock(() => ({
      ralphModeEnabled: true,
      deadpoolModeEnabled: false,
      cavemanModeEnabled: false,
    }))
    const notifyChange = mock(() => {})
    const logEvent = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings,
      getSettings_DEPRECATED: getInitialSettings,
      getSettingsWithErrors: () => ({ settings: {}, errors: [] }),
      getManagedSettingsKeysForLogging: () => [],
      getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
      hasAutoModeOptIn: () => false,
      hasSkipDangerousModePermissionPrompt: () => false,
      getAutoModeConfig: () => undefined,
      parseSettingsFile: () => ({ settings: {}, errors: [] }),
      loadSettingsFromDisk: () => ({}),
      getSettingsFilePathForSource: () => '/tmp/user/.claude/settings.json',
      getRelativeSettingsFilePathForSource: () => '.claude/settings.json',
      getSettingsRootPathForSource: () => '/tmp/user/.claude',
      updateSettingsForSource,
    }))
    mock.module('../../utils/settings/changeDetector.js', () => ({
      settingsChangeDetector: {
        notifyChange,
      },
    }))
    mock.module('src/services/analytics/index.js', () => ({
      logEvent,
    }))
    mock.module('../../utils/model/providers.js', () => ({
      getAPIProvider: () => 'firstParty',
      shouldAllowAnthropicHostedServices: () => true,
      getAPIProviderForStatsig: () => 'firstParty',
      getCurrentAPIAdapterName: () => 'firstParty-adapter',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))

    const { call } = await import('./ralphMode.js')
    const result = await call('off', {} as never)

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      ralphModeEnabled: undefined,
    })
    expect(result).toEqual({
      type: 'text',
      value: 'Ralph mode disabled. Replies back to normal prompt guidance.',
    })
  })

  it('toggles ralph prompt mode off when no arg is provided and it is already enabled', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const getInitialSettings = mock(() => ({
      ralphModeEnabled: true,
      deadpoolModeEnabled: false,
      cavemanModeEnabled: false,
    }))
    const notifyChange = mock(() => {})
    const logEvent = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings,
      getSettings_DEPRECATED: getInitialSettings,
      getSettingsWithErrors: () => ({ settings: {}, errors: [] }),
      getManagedSettingsKeysForLogging: () => [],
      getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
      hasAutoModeOptIn: () => false,
      hasSkipDangerousModePermissionPrompt: () => false,
      getAutoModeConfig: () => undefined,
      parseSettingsFile: () => ({ settings: {}, errors: [] }),
      loadSettingsFromDisk: () => ({}),
      getSettingsFilePathForSource: () => '/tmp/user/.claude/settings.json',
      getRelativeSettingsFilePathForSource: () => '.claude/settings.json',
      getSettingsRootPathForSource: () => '/tmp/user/.claude',
      updateSettingsForSource,
    }))
    mock.module('../../utils/settings/changeDetector.js', () => ({
      settingsChangeDetector: {
        notifyChange,
      },
    }))
    mock.module('src/services/analytics/index.js', () => ({
      logEvent,
    }))
    mock.module('../../utils/model/providers.js', () => ({
      getAPIProvider: () => 'firstParty',
      shouldAllowAnthropicHostedServices: () => true,
      getAPIProviderForStatsig: () => 'firstParty',
      getCurrentAPIAdapterName: () => 'firstParty-adapter',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))

    const { call } = await import('./ralphMode.js')
    const result = await call('', {} as never)

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      ralphModeEnabled: undefined,
    })
    expect(result).toEqual({
      type: 'text',
      value: 'Ralph mode disabled. Replies back to normal prompt guidance.',
    })
  })

  it('reports enabled status without changing settings', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const getInitialSettings = mock(() => ({
      ralphModeEnabled: true,
      deadpoolModeEnabled: false,
      cavemanModeEnabled: false,
    }))
    const notifyChange = mock(() => {})
    const logEvent = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings,
      getSettings_DEPRECATED: getInitialSettings,
      getSettingsWithErrors: () => ({ settings: {}, errors: [] }),
      getManagedSettingsKeysForLogging: () => [],
      getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
      hasAutoModeOptIn: () => false,
      hasSkipDangerousModePermissionPrompt: () => false,
      getAutoModeConfig: () => undefined,
      parseSettingsFile: () => ({ settings: {}, errors: [] }),
      loadSettingsFromDisk: () => ({}),
      getSettingsFilePathForSource: () => '/tmp/user/.claude/settings.json',
      getRelativeSettingsFilePathForSource: () => '.claude/settings.json',
      getSettingsRootPathForSource: () => '/tmp/user/.claude',
      updateSettingsForSource,
    }))
    mock.module('../../utils/settings/changeDetector.js', () => ({
      settingsChangeDetector: {
        notifyChange,
      },
    }))
    mock.module('src/services/analytics/index.js', () => ({
      logEvent,
    }))
    mock.module('../../utils/model/providers.js', () => ({
      getAPIProvider: () => 'firstParty',
      shouldAllowAnthropicHostedServices: () => true,
      getAPIProviderForStatsig: () => 'firstParty',
      getCurrentAPIAdapterName: () => 'firstParty-adapter',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))

    const { call } = await import('./ralphMode.js')
    const result = await call('status', {} as never)

    expect(updateSettingsForSource).not.toHaveBeenCalled()
    expect(notifyChange).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
    expect(result).toEqual({
      type: 'text',
      value: 'Ralph mode ON.',
    })
  })

  it('rejects invalid arguments without changing settings', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const getInitialSettings = mock(() => ({
      ralphModeEnabled: false,
      deadpoolModeEnabled: false,
      cavemanModeEnabled: false,
    }))
    const notifyChange = mock(() => {})
    const logEvent = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings,
      getSettings_DEPRECATED: getInitialSettings,
      getSettingsWithErrors: () => ({ settings: {}, errors: [] }),
      getManagedSettingsKeysForLogging: () => [],
      getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
      hasAutoModeOptIn: () => false,
      hasSkipDangerousModePermissionPrompt: () => false,
      getAutoModeConfig: () => undefined,
      parseSettingsFile: () => ({ settings: {}, errors: [] }),
      loadSettingsFromDisk: () => ({}),
      getSettingsFilePathForSource: () => '/tmp/user/.claude/settings.json',
      getRelativeSettingsFilePathForSource: () => '.claude/settings.json',
      getSettingsRootPathForSource: () => '/tmp/user/.claude',
      updateSettingsForSource,
    }))
    mock.module('../../utils/settings/changeDetector.js', () => ({
      settingsChangeDetector: {
        notifyChange,
      },
    }))
    mock.module('src/services/analytics/index.js', () => ({
      logEvent,
    }))
    mock.module('../../utils/model/providers.js', () => ({
      getAPIProvider: () => 'firstParty',
      shouldAllowAnthropicHostedServices: () => true,
      getAPIProviderForStatsig: () => 'firstParty',
      getCurrentAPIAdapterName: () => 'firstParty-adapter',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))

    const { call } = await import('./ralphMode.js')
    const result = await call('maybe', {} as never)

    expect(updateSettingsForSource).not.toHaveBeenCalled()
    expect(notifyChange).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
    expect(result).toEqual({
      type: 'text',
      value: 'Invalid argument. Use /ralphmode, /ralphmode on, /ralphmode off, or /ralphmode status.',
    })
  })
})
