import { beforeEach, describe, expect, it, mock } from 'bun:test'

describe('cavemanMode command', () => {
  beforeEach(() => {
    mock.restore()
  })

  it('enables caveman mode without clearing deadpool mode', async () => {
    const updateSettingsForSource = mock(() => ({}))
    const notifyChange = mock(() => {})
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
        notifyChange,
      },
    }))
    mock.module('src/services/analytics/index.js', () => ({
      logEvent,
    }))

    const { call } = await import('./cavemanMode.js')
    const result = await call('on', {} as never)

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      cavemanModeEnabled: true,
    })
    expect(result).toEqual({
      type: 'text',
      value:
        'Caveman mode ON. Deadpool mode still ON. Replies now compressed hard, with Deadpool voice kept terse.',
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

    const { call } = await import('./cavemanMode.js')
    const result = await call('wat', {} as never)

    expect(updateSettingsForSource).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
    expect(result).toEqual({
      type: 'text',
      value:
        'Invalid argument. Use /cavemanmode, /cavemanmode on, /cavemanmode off, or /cavemanmode status.',
    })
  })
})
