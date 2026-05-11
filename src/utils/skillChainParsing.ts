import {
  findCommand,
  type Command,
} from '../commands.js'

export type InlineSkillMention = {
  name: string
  command: Command & { type: 'prompt' }
  isFinalizer: boolean
  finalizerCommand?: string
}

function commandIsInvocablePrompt(
  command: Command | undefined,
): command is Command & { type: 'prompt' } {
  return command?.type === 'prompt' && command.userInvocable !== false
}

function findCommandWithInlineAliases(
  name: string,
  commands: Command[],
): Command | undefined {
  const direct = findCommand(name, commands)
  if (direct) return direct
  if (name === 'handover') return findCommand('handoff', commands)

  // Users often type namespaced skills as `$tte-try-to-enhance` while the
  // installed skill command is `tte/try-to-enhance`.
  const namespaceAlias = name.match(/^([A-Za-z0-9]+)-(.+)$/)
  if (namespaceAlias) {
    const [, namespace, rest] = namespaceAlias
    const namespaced = findCommand(`${namespace}/${rest}`, commands)
    if (namespaced) return namespaced
  }

  return undefined
}

function extractFinalizerCommand(rest: string): string | undefined {
  const match = rest.match(/(?:^|\s)(\/[A-Za-z0-9:_-]+(?:\s+[^$]+?)?)(?=\s+\$|$)/)
  return match?.[1]?.trim()
}

function isFinalizerMention(commandName: string, rest: string): boolean {
  return (
    commandName === 'handoff' &&
    (/\b(then|after|afterwards|last|finally)\b/i.test(rest) ||
      extractFinalizerCommand(rest) !== undefined)
  )
}

export function findInlineSkillMentions(
  input: string,
  commands: Command[],
): InlineSkillMention[] {
  const mentions: InlineSkillMention[] = []
  const seen = new Set<string>()
  const mentionPattern = /\$([A-Za-z0-9][A-Za-z0-9:_/-]*)/g
  for (const match of input.matchAll(mentionPattern)) {
    const rawName = match[1]
    if (!rawName) continue
    const command = findCommandWithInlineAliases(rawName, commands)
    if (!commandIsInvocablePrompt(command) || seen.has(command.name)) continue

    const rest = input.slice((match.index ?? 0) + match[0].length)
    seen.add(command.name)
    mentions.push({
      name: command.name,
      command,
      isFinalizer: isFinalizerMention(command.name, rest),
      finalizerCommand: extractFinalizerCommand(rest),
    })
  }
  return mentions
}
