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

function isRalphModeEnabled(): boolean {
  return getInitialSettings().ralphModeEnabled === true
}

export const call: LocalCommandCall = async (args = '', _context) => {
  const normalizedArg = args.trim().toLowerCase()
  const hasExplicitEnableArg = ENABLE_ARGS.has(normalizedArg)
  const hasExplicitDisableArg = DISABLE_ARGS.has(normalizedArg)

  if (STATUS_ARGS.has(normalizedArg)) {
    return {
      type: 'text' as const,
      value: isRalphModeEnabled() ? 'Ralph mode ON.' : 'Ralph mode OFF.',
    }
  }

  if (normalizedArg.length > 0 && !hasExplicitEnableArg && !hasExplicitDisableArg) {
    return {
      type: 'text' as const,
      value: 'Invalid argument. Use /ralphmode, /ralphmode on, /ralphmode off, or /ralphmode status.',
    }
  }

  const currentSettings = getInitialSettings()
  const wasEnabled = currentSettings.ralphModeEnabled === true

  const newState = hasExplicitEnableArg ? true : hasExplicitDisableArg ? false : !wasEnabled

  const result = updateSettingsForSource('userSettings', {
    ralphModeEnabled: newState ? true : undefined,
  })

  if (result.error) {
    return {
      type: 'text' as const,
      value: 'Failed to update settings. Check your settings file for syntax errors.',
    }
  }

  settingsChangeDetector.notifyChange('userSettings')

  logEvent('tengu_ralph_mode_toggled', {
    enabled: newState,
    wasEnabled,
  })

  if (newState) {
    const deadpoolAlsoEnabled = currentSettings.deadpoolModeEnabled === true
    const cavemanAlsoEnabled = currentSettings.cavemanModeEnabled === true

    if (deadpoolAlsoEnabled && cavemanAlsoEnabled) {
      return {
        type: 'text' as const,
        value:
          'Ralph mode enabled. Deadpool mode and Caveman mode still ON. Replies now use loop-until-done guidance with those overlays still active.',
      }
    }

    if (deadpoolAlsoEnabled) {
      return {
        type: 'text' as const,
        value:
          'Ralph mode enabled. Deadpool mode still ON. Replies now use loop-until-done guidance with Deadpool voice still active.',
      }
    }

    if (cavemanAlsoEnabled) {
      return {
        type: 'text' as const,
        value:
          'Ralph mode enabled. Caveman mode still ON. Replies now use loop-until-done guidance with ultra-compressed output still active.',
      }
    }

    return {
      type: 'text' as const,
      value: 'Ralph mode enabled. Replies now use loop-until-done guidance.',
    }
  }

  return {
    type: 'text' as const,
    value: 'Ralph mode disabled. Replies back to normal prompt guidance.',
  }
}
