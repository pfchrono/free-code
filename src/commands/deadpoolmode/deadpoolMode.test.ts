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
    const result = await call(() => {}, {} as never, 'on')

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      deadpoolModeEnabled: true,
    })
    expect(result).toEqual({
      type: 'text',
      value:
        'Deadpool mode ON. Caveman mode still ON. Replies keep antihero voice, but compressed.',
    })
  })
})
