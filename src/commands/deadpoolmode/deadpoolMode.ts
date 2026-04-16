import { logEvent } from 'src/services/analytics/index.js'
import type { LocalCommandCall } from '../../types/command.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

const DISABLE_ARGS = new Set(['off', 'disable', 'disabled'])
const ENABLE_ARGS = new Set(['on', 'enable', 'enabled'])

function isDeadpoolModeEnabled(): boolean {
  return getInitialSettings().deadpoolModeEnabled === true
}

export const call: LocalCommandCall = async (_onDone, _context, args?: string) => {
  const normalizedArg = args?.trim().toLowerCase() || ''
  const wasEnabled = isDeadpoolModeEnabled()

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
        ? 'Deadpool mode ON. Caveman mode still ON. Replies keep antihero voice, but compressed.'
        : 'Deadpool mode ON. Replies now use snarky antihero voice. Code and structured output stay normal.'
      : getInitialSettings().cavemanModeEnabled === true
        ? 'Deadpool mode OFF. Caveman mode still ON.'
        : 'Deadpool mode OFF. Replies back to normal voice.',
  }
}
