import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { companionUserId, getCompanion, rollWithSeed } from '../../buddy/companion.js'
import { renderSprite } from '../../buddy/sprites.js'
import type { StoredCompanion, StatName } from '../../buddy/types.js'
import { RARITY_STARS, STAT_NAMES } from '../../buddy/types.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'

const NAME_PREFIXES = [
  'Byte',
  'Echo',
  'Glint',
  'Miso',
  'Nova',
  'Pixel',
  'Rune',
  'Static',
  'Vector',
  'Whisk',
] as const

const NAME_SUFFIXES = [
  'bean',
  'bit',
  'bud',
  'dot',
  'ling',
  'loop',
  'moss',
  'patch',
  'puff',
  'spark',
] as const

const PERSONALITIES = [
  'Curious and quietly encouraging',
  'A patient little watcher with strong debugging instincts',
  'Playful, observant, and suspicious of flaky tests',
  'Calm under pressure and fond of clean diffs',
  'A tiny terminal gremlin who likes successful builds',
] as const

const PET_REACTIONS = [
  'leans into the headpat',
  'does a proud little bounce',
  'emits a content beep',
  'looks delighted',
  'wiggles happily',
] as const

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickDeterministic<T>(items: readonly T[], seed: string): T {
  return items[hashString(seed) % items.length]!
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function renderBar(value: number, max = 100, width = 8): string {
  const filled = Math.round((value / max) * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${value}`
}

function wrapQuotedText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = '"'
  let needsOpeningQuote = true

  for (const word of words) {
    const prefix = needsOpeningQuote ? '"' : ''
    const candidate = current === prefix ? `${prefix}${word}` : `${current} ${word}`
    if (candidate.length <= width) {
      current = candidate
      needsOpeningQuote = false
      continue
    }
    lines.push(current)
    current = word
  }

  if (current) {
    lines.push(current === '"' ? '"' : current)
  }
  if (lines.length > 0) {
    lines[0] = lines[0].startsWith('"') ? lines[0] : `"${lines[0]}`
    lines[lines.length - 1] = `${lines[lines.length - 1]}"`
  }
  return lines
}

function renderCompanionCard(name: string, species: string, rarity: string, personality: string, stats: Record<StatName, number>, sprite: string[]): string {
  const stars = RARITY_STARS[rarity as keyof typeof RARITY_STARS] ?? '★'
  const rarityLabel = titleCase(rarity)
  const innerWidth = 38
  const border = '─'.repeat(innerWidth)
  const contentWidth = innerWidth - 4

  const spriteLines = sprite
  const personalityLines = wrapQuotedText(personality, contentWidth)
  const header = `${stars} ${rarityLabel}`
  const speciesLabel = species.toUpperCase()

  const lines: string[] = []
  lines.push(`╭${border}╮`)
  lines.push(`│${' '.repeat(innerWidth)}│`)
  lines.push(
    `│  ${(header + speciesLabel.padStart(contentWidth - header.length)).padEnd(contentWidth)}  │`,
  )
  lines.push(`│${' '.repeat(innerWidth)}│`)

  for (const sline of spriteLines) {
    lines.push(`│  ${sline.padEnd(contentWidth)}  │`)
  }

  lines.push(`│${' '.repeat(innerWidth)}│`)
  lines.push(`│  ${name.padEnd(contentWidth)}  │`)
  lines.push(`│${' '.repeat(innerWidth)}│`)

  for (const pline of personalityLines) {
    lines.push(`│  ${pline.padEnd(contentWidth)}  │`)
  }

  lines.push(`│${' '.repeat(innerWidth)}│`)

  for (const statName of STAT_NAMES) {
    const bar = renderBar(stats[statName], 100, 10)
    const statLine = `  ${statName.padEnd(10)} ${bar}`
    lines.push(`│${statLine.padEnd(innerWidth)}│`)
  }

  lines.push(`│${' '.repeat(innerWidth)}│`)
  lines.push(`╰${border}╯`)
  return lines.join('\n')
}

function createStoredCompanion(): StoredCompanion {
  const userId = companionUserId()
  const { bones } = rollWithSeed(`${userId}:buddy`)
  const prefix = pickDeterministic(NAME_PREFIXES, `${userId}:prefix`)
  const suffix = pickDeterministic(NAME_SUFFIXES, `${userId}:suffix`)
  const personality = pickDeterministic(PERSONALITIES, `${userId}:personality`)

  return {
    name: `${prefix}${suffix}`,
    personality: `${personality}.`,
    hatchedAt: Date.now(),
  }
}

function setCompanionReaction(
  context: LocalJSXCommandContext,
  reaction: string | undefined,
  pet = false,
): void {
  context.setAppState(prev => ({
    ...prev,
    companionReaction: reaction,
    companionPetAt: pet ? Date.now() : prev.companionPetAt,
  }))
}

function showHelp(onDone: LocalJSXCommandOnDone): void {
  onDone(
    'Usage: /buddy [status|pet|mute|unmute]\n\nRun /buddy with no args to hatch your companion the first time, then pet it on later runs. `/buddy pet` also pets them explicitly.',
    { display: 'system' },
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<null> {
  const arg = args?.trim().toLowerCase() ?? ''

  if (COMMON_HELP_ARGS.includes(arg) || arg === '') {
    const existing = getCompanion()
    if (arg !== '' || existing) {
      if (arg !== '') {
        showHelp(onDone)
        return null
      }
    }
  }

  if (COMMON_HELP_ARGS.includes(arg)) {
    showHelp(onDone)
    return null
  }

    if (COMMON_INFO_ARGS.includes(arg) || arg === 'status') {
    const companion = getCompanion()
    if (!companion) {
      onDone('No buddy hatched yet. Run /buddy to hatch one.', {
        display: 'system',
      })
      return null
    }
    const sprite = renderSprite(companion)
    const card = renderCompanionCard(
      companion.name,
      companion.species,
      companion.rarity,
      companion.personality,
      companion.stats,
      sprite,
    )
    return (
      <Box
        borderStyle="single"
        padding={1}
        margin={1}
        width="fit-content"
        noSelect={true}
        isLocalJSXCommand={true}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            onDone(undefined, { display: 'skip' })
          }
        }}
      >
        <Text>{card}</Text>
      </Box>
    )
  }

  if (arg === 'mute' || arg === 'unmute') {
    const muted = arg === 'mute'
    saveGlobalConfig(current => ({
      ...current,
      companionMuted: muted,
    }))
    if (muted) {
      setCompanionReaction(context, undefined)
    }
    onDone(`Buddy ${muted ? 'muted' : 'unmuted'}.`, { display: 'system' })
    return null
  }

  if (arg === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      onDone('No buddy hatched yet. Run /buddy to hatch one.', {
        display: 'system',
      })
      return null
    }

    const reaction = `${companion.name} ${pickDeterministic(
      PET_REACTIONS,
      `${Date.now()}:${companion.name}`,
    )}`
    setCompanionReaction(context, reaction, true)
    onDone(undefined, { display: 'skip' })
    return null
  }

  if (arg !== '') {
    showHelp(onDone)
    return null
  }

  let companion = getCompanion()
  if (!companion) {
    const stored = createStoredCompanion()
    saveGlobalConfig(current => ({
      ...current,
      companion: stored,
      companionMuted: false,
    }))
    companion = {
      ...rollWithSeed(`${companionUserId()}:buddy`).bones,
      ...stored,
    }
    setCompanionReaction(
      context,
      `${companion.name} the ${companion.species} has hatched.`,
      true,
    )
    onDone(
      `${companion.name} the ${companion.species} is now your buddy. Run /buddy again to pet them.`,
      { display: 'system' },
    )
    return null
  }

  const reaction = `${companion.name} ${pickDeterministic(
    PET_REACTIONS,
    `${Date.now()}:${companion.name}`,
  )}`
  setCompanionReaction(context, reaction, true)
  onDone(undefined, { display: 'skip' })
  return null
}
