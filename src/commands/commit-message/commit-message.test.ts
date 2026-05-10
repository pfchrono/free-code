import { beforeEach, describe, expect, test, mock } from 'bun:test'

import {
  call,
  formatCoAuthorTrailer,
  parseCoAuthor,
  stripMatchingQuotes,
} from './commit-message.js'

const updateSettingsForSource = mock(() => ({}))
const notifyChange = mock(() => {})

mock.module('../../utils/settings/settings.js', () => ({
  getInitialSettings: () => ({ attribution: { commit: undefined } }),
  updateSettingsForSource,
}))

mock.module('../../utils/settings/changeDetector.js', () => ({
  settingsChangeDetector: {
    notifyChange,
  },
}))

mock.module('../../utils/attribution.js', () => ({
  getAttributionTexts: () => ({ commit: 'Co-Authored-By: free-code <noreply@free-code.local>' }),
}))

describe('/commit-message', () => {
  beforeEach(() => {
    updateSettingsForSource.mockClear()
    notifyChange.mockClear()
  })

  test('formats co-author trailer safely', () => {
    expect(formatCoAuthorTrailer('Ada <bad>', 'ada@example.com')).toBe(
      'Co-Authored-By: Ada bad <ada@example.com>',
    )
  })

  test('parses quoted co-author', () => {
    expect(parseCoAuthor('"Ada Lovelace" ada@example.com')).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })

  test('strips matching quotes', () => {
    expect(stripMatchingQuotes('"Generated with Free-Code"')).toBe('Generated with Free-Code')
  })

  test('sets custom attribution', async () => {
    const result = await call('set "Generated with Free-Code"', {} as never)

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      attribution: { commit: 'Generated with Free-Code' },
    })
    expect(notifyChange).toHaveBeenCalledWith('userSettings')
    expect(result.value).toContain('Generated with Free-Code')
  })

  test('disables attribution', async () => {
    const result = await call('off', {} as never)

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      attribution: { commit: '' },
    })
    expect(result.value).toContain('disabled')
  })

  test('resets attribution to default', async () => {
    const result = await call('default', {} as never)

    expect(updateSettingsForSource).toHaveBeenCalledWith('userSettings', {
      attribution: { commit: undefined },
    })
    expect(result.value).toContain('Free-Code default')
  })
})
