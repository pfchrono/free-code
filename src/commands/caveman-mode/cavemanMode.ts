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

function isCavemanModeEnabled(): boolean {
  return getInitialSettings().cavemanModeEnabled === true
}

export const call: LocalCommandCall = async (args = '', _context) => {
  const normalizedArg = args.trim().toLowerCase()
  const wasEnabled = isCavemanModeEnabled()

  if (!isValidArg(normalizedArg)) {
    return {
      type: 'text' as const,
      value:
        'Invalid argument. Use /cavemanmode, /cavemanmode on, /cavemanmode off, or /cavemanmode status.',
    }
  }

  if (STATUS_ARGS.has(normalizedArg)) {
    return {
      type: 'text' as const,
      value: wasEnabled ? 'Caveman mode is ON.' : 'Caveman mode is OFF.',
    }
  }

  let newState: boolean

  if (DISABLE_ARGS.has(normalizedArg)) {
    newState = false
  } else if (ENABLE_ARGS.has(normalizedArg)) {
    newState = true
  } else {
    // Toggle current state
    newState = !wasEnabled
  }

  // Persist to user settings
  const result = updateSettingsForSource('userSettings', {
    cavemanModeEnabled: newState ? true : undefined,
  })

  if (result.error) {
    return {
      type: 'text' as const,
      value: 'Failed to update settings. Check your settings file for syntax errors.',
    }
  }

  settingsChangeDetector.notifyChange('userSettings')

  // Log analytics
  logEvent('tengu_caveman_mode_toggled', {
    enabled: newState,
    wasEnabled,
  })

  if (newState) {
    const deadpoolAlsoEnabled = getInitialSettings().deadpoolModeEnabled === true
    return {
      type: 'text' as const,
      value:
        deadpoolAlsoEnabled
          ? 'Caveman mode ON. Deadpool mode still ON. Replies now compressed hard, with Deadpool voice kept terse.'
          : 'Caveman mode ON. Responses now ultra-compressed. ~75% fewer tokens. Technical accuracy preserved.',
    }
  } else {
    return {
      type: 'text' as const,
      value:
        getInitialSettings().deadpoolModeEnabled === true
          ? 'Caveman mode OFF. Deadpool mode still ON.'
          : 'Caveman mode OFF. Responses back to normal.',
    }
  }
}
