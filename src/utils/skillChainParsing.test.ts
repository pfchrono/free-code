import { describe, expect, it } from 'bun:test'
import type { Command } from '../commands.js'
import { findInlineSkillMentions } from './skillChainParsing.js'

function promptCommand(name: string, aliases: string[] = []): Command {
  return {
    type: 'prompt',
    name,
    aliases,
    description: `${name} command`,
    progressMessage: `running ${name}`,
    contentLength: 0,
    source: 'builtin',
    isEnabled: () => true,
    userInvocable: true,
    async getPromptForCommand() {
      return [{ type: 'text', text: `skill ${name}` }]
    },
  } as Command
}

describe('skill chain parsing', () => {
  const commands = [
    promptCommand('tte/try-to-enhance'),
    promptCommand('handoff'),
    promptCommand('grill-with-docs'),
  ]

  it('normalizes hyphenated namespace shortcut names', () => {
    const mentions = findInlineSkillMentions(
      '$tte-try-to-enhance ~/code/free-code against upstream then $handoff after',
      commands,
    )

    expect(mentions.map(mention => mention.name)).toEqual([
      'tte/try-to-enhance',
      'handoff',
    ])
    expect(mentions[1]?.isFinalizer).toBe(true)
  })

  it('keeps normal hyphenated skill names when they exist directly', () => {
    const mentions = findInlineSkillMentions(
      '$grill-with-docs plan harness direction',
      commands,
    )

    expect(mentions.map(mention => mention.name)).toEqual(['grill-with-docs'])
  })

  it('captures slash command follow-up after handover finalizer alias', () => {
    const mentions = findInlineSkillMentions(
      '$handover /goal complete handover file till finished',
      commands,
    )

    expect(mentions.map(mention => mention.name)).toEqual(['handoff'])
    expect(mentions[0]?.isFinalizer).toBe(true)
    expect(mentions[0]?.finalizerCommand).toBe('/goal complete handover file till finished')
  })

  it('deduplicates aliases that resolve to the same command', () => {
    const mentions = findInlineSkillMentions(
      '$handover then $handoff after /goal complete handover file till finished',
      commands,
    )

    expect(mentions.map(mention => mention.name)).toEqual(['handoff'])
  })
})
