import { getSessionBypassPermissionsMode } from '../../bootstrap/state.js'
import type { LocalCommandCall } from '../../types/command.js'
import { renderCompanionCard } from '../../buddy/card.js'
import {
  ensureCompanion,
  hatchCompanion,
  getCompanion,
  getPetReaction,
} from '../../buddy/companion.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

function canRehatch(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.CLAUDE_CODE_EXPERIMENTAL_BUILD === 'true' ||
    getSessionBypassPermissionsMode()
  )
}

function renderBuddyStatus(lastReaction?: string): string {
  const companion = ensureCompanion()
  const muted = !!getGlobalConfig().companionMuted
  const card = renderCompanionCard(companion, lastReaction)
  const suffix = muted ? '\n\nStatus: muted' : '\n\nStatus: active'
  return `${card}${suffix}`
}

export const call: LocalCommandCall = async (args, context) => {
  const subcommand = (args || '').trim().toLowerCase()

  if (subcommand === 'hatch') {
    if (getCompanion() && !canRehatch()) {
      return {
        type: 'text',
        value:
          'Re-hatch locked. Use dev build or --dangerously-bypass-permissions to reroll buddy.',
      }
    }

    const companion = hatchCompanion()
    const reaction = `${companion.name} the ${companion.species} has hatched.`
    context.setAppState(prev => ({
      ...prev,
      companionPetAt: Date.now(),
      companionReaction: reaction,
      companionMuted: false,
    }))
    return {
      type: 'text',
      value: renderBuddyStatus(reaction),
    }
  }

  if (subcommand === 'mute' || subcommand === 'off') {
    saveGlobalConfig(current =>
      current.companionMuted
        ? current
        : { ...current, companionMuted: true },
    )
    context.setAppState(prev =>
      prev.companionReaction === undefined
        ? { ...prev, companionMuted: true }
        : { ...prev, companionReaction: undefined, companionMuted: true },
    )
    return {
      type: 'text',
      value: 'Buddy muted. The companion stays hatched but stops reacting.',
    }
  }

  if (subcommand === 'unmute' || subcommand === 'on') {
    saveGlobalConfig(current =>
      current.companionMuted === false
        ? current
        : { ...current, companionMuted: false },
    )
    context.setAppState(prev =>
      prev.companionMuted === false
        ? prev
        : { ...prev, companionMuted: false },
    )
    return {
      type: 'text',
      value: 'Buddy unmuted. The companion can react again.',
    }
  }

  const companion = ensureCompanion()

  if (subcommand === 'pet') {
    const reaction = getPetReaction(companion)
    context.setAppState(prev => ({
      ...prev,
      companionPetAt: Date.now(),
      companionReaction: reaction,
    }))
    return {
      type: 'text',
      value: `${companion.name} leans in. "${reaction}"`,
    }
  }

  if (subcommand === 'show') {
    saveGlobalConfig(current =>
      current.companionMuted === false
        ? current
        : { ...current, companionMuted: false },
    )
    context.setAppState(prev =>
      prev.companionMuted === false
        ? prev
        : { ...prev, companionMuted: false },
    )
    return {
      type: 'text',
      value: renderBuddyStatus(context.getAppState().companionReaction),
    }
  }

  if (subcommand === '' || subcommand === 'status' || subcommand === 'stats') {
    return {
      type: 'text',
      value: renderBuddyStatus(context.getAppState().companionReaction),
    }
  }

  if (subcommand === 'hide' || subcommand === 'dismiss') {
    saveGlobalConfig(current =>
      current.companionMuted
        ? current
        : { ...current, companionMuted: true },
    )
    context.setAppState(prev => ({
      ...prev,
      companionReaction: undefined,
      companionMuted: true,
    }))
    return {
      type: 'text',
      value: `${companion.name} slips out of sight.`,
    }
  }

  return {
    type: 'text',
    value:
      'Usage: /buddy [show|status|stats|pet|hatch|mute|unmute|hide|dismiss]',
  }
}
