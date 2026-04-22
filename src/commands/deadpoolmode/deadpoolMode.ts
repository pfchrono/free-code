import { logEvent } from 'src/services/analytics/index.js'
import type { LocalCommandCall } from '../../types/command.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled'])
const ENABLE_ARGS = new Set(['on', 'enable', 'enabled'])
const STATUS_ARGS = new Set(['status', 'state'])

function isValidArg(arg: string): boolean {
  return (
    arg.length === 0 ||
    DISABLE_ARGS.has(arg) ||
    ENABLE_ARGS.has(arg) ||
    STATUS_ARGS.has(arg)
  )
}

function isDeadpoolModeEnabled(): boolean {
  return getInitialSettings().deadpoolModeEnabled === true
}

function getStyleStackMessage(overrides?: {
  deadpoolModeEnabled?: boolean
  cavemanModeEnabled?: boolean
}): string {
  const settings = getInitialSettings()
  const activeStyles: string[] = []

  if ((overrides?.deadpoolModeEnabled ?? settings.deadpoolModeEnabled) === true) {
    activeStyles.push('deadpool')
  }
  if ((overrides?.cavemanModeEnabled ?? settings.cavemanModeEnabled) === true) {
    activeStyles.push('caveman')
  }

  if (activeStyles.length === 0) {
    return 'Style stack: normal.'
  }

  return `Style stack: ${activeStyles.join(' + ')}.`
}

export const call: LocalCommandCall = async (args = '', _context) => {
  const normalizedArg = args.trim().toLowerCase()
  const wasEnabled = isDeadpoolModeEnabled()

  if (!isValidArg(normalizedArg)) {
    return {
      type: 'text' as const,
      value:
        'Invalid argument. Use /deadpoolmode, /deadpoolmode on, /deadpoolmode off, or /deadpoolmode status.',
    }
  }

  if (STATUS_ARGS.has(normalizedArg)) {
    return {
      type: 'text' as const,
      value: `${isDeadpoolModeEnabled() ? 'Deadpool mode ON.' : 'Deadpool mode OFF.'} ${getStyleStackMessage()}`,
    }
  }

  let newState: boolean

  if (DISABLE_ARGS.has(normalizedArg)) {
    newState = false
  } else if (ENABLE_ARGS.has(normalizedArg)) {
    newState = true
  } else {
    newState = !wasEnabled
  }

  const result = updateSettingsForSource('userSettings', {
    deadpoolModeEnabled: newState ? true : undefined,
  })

  if (result.error) {
    return {
      type: 'text' as const,
      value: 'Failed to update settings. Check your settings file for syntax errors.',
    }
  }

  settingsChangeDetector.notifyChange('userSettings')

  logEvent('tengu_deadpool_mode_toggled', {
    enabled: newState,
    wasEnabled,
  })

  return {
    type: 'text' as const,
    value: newState
      ? getInitialSettings().cavemanModeEnabled === true
        ? `Deadpool mode ON. Caveman mode still ON. Replies keep antihero voice, but compressed. ${getStyleStackMessage({ deadpoolModeEnabled: true })}`
        : 'Deadpool mode ON. Replies now use snarky antihero voice. Code and structured output stay normal.'
      : getInitialSettings().cavemanModeEnabled === true
        ? `Deadpool mode OFF. Caveman mode still ON. ${getStyleStackMessage({ deadpoolModeEnabled: false })}`
        : `Deadpool mode OFF. Replies back to normal voice. ${getStyleStackMessage({ deadpoolModeEnabled: false })}`,
  }
}
