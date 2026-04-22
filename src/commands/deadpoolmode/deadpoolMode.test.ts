import { beforeEach, describe, expect, it, mock } from 'bun:test'

describe('deadpoolMode command', () => {
  beforeEach(() => {
    mock.restore()
  })

  it('enables deadpool mode without clearing caveman mode', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const notifyChange = mock(() => {})
    const logEvent = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings: () => ({
        cavemanModeEnabled: true,
        deadpoolModeEnabled: false,
      }),
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

    const { call } = await import('./deadpoolMode.js')
    const result = await call('on', {} as never)

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      deadpoolModeEnabled: true,
    })
    expect(result).toEqual({
      type: 'text',
      value:
        'Deadpool mode ON. Caveman mode still ON. Replies keep antihero voice, but compressed. Style stack: deadpool + caveman.',
    })
  })

  it('reports effective style stack without changing settings', async () => {
    const updateSettingsForSource = mock(() => ({}))

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings: () => ({
        cavemanModeEnabled: true,
        deadpoolModeEnabled: true,
      }),
      updateSettingsForSource,
    }))
    mock.module('../../utils/settings/changeDetector.js', () => ({
      settingsChangeDetector: {
        notifyChange: mock(() => {}),
      },
    }))
    mock.module('src/services/analytics/index.js', () => ({
      logEvent: mock(() => {}),
    }))

    const { call } = await import('./deadpoolMode.js')
    const result = await call('status', {} as never)

    expect(updateSettingsForSource).not.toHaveBeenCalled()
    expect(result).toEqual({
      type: 'text',
      value: 'Deadpool mode ON. Style stack: deadpool + caveman.',
    })
  })

  it('rejects invalid arguments without changing settings', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const logEvent = mock(() => {})

    mock.module('../../utils/settings/settings.js', () => ({
      getInitialSettings: () => ({
        cavemanModeEnabled: false,
        deadpoolModeEnabled: true,
      }),
      updateSettingsForSource,
    }))
    mock.module('../../utils/settings/changeDetector.js', () => ({
      settingsChangeDetector: {
        notifyChange: mock(() => {}),
      },
    }))
    mock.module('src/services/analytics/index.js', () => ({
      logEvent,
    }))

    const { call } = await import('./deadpoolMode.js')
    const result = await call('wat', {} as never)

    expect(updateSettingsForSource).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
    expect(result).toEqual({
      type: 'text',
      value:
        'Invalid argument. Use /deadpoolmode, /deadpoolmode on, /deadpoolmode off, or /deadpoolmode status.',
    })
  })
})
