import type { LocalCommandCall } from '../../types/command.js'
import { initializeWiki } from '../../services/wiki/init.js'
import { getWikiStatus } from '../../services/wiki/status.js'
import { ingestWikiSource } from '../../services/wiki/ingest.js'

function renderStatusLines(status: Awaited<ReturnType<typeof getWikiStatus>>): string[] {
  return [
    `initialized: ${status.initialized ? 'yes' : 'no'}`,
    `root: ${status.root}`,
    `pages: ${status.pageCount}`,
    `sources: ${status.sourceCount}`,
    `schema: ${status.hasSchema ? 'yes' : 'no'}`,
    `index: ${status.hasIndex ? 'yes' : 'no'}`,
    `log: ${status.hasLog ? 'yes' : 'no'}`,
    `updated: ${status.lastUpdatedAt ?? 'never'}`,
  ]
}

export const call: LocalCommandCall = async (args, context) => {
  const rawArgs = args.trim()
  const cwd = context.cwd ?? process.cwd()

  if (rawArgs === '') {
    const status = await getWikiStatus(cwd)
    return {
      type: 'text',
      value: renderStatusLines(status).join('\n'),
    }
  }

  const [subcommand, ...rest] = rawArgs.split(/\s+/).filter(Boolean)

  if (subcommand === 'status') {
    const status = await getWikiStatus(cwd)
    return {
      type: 'text',
      value: renderStatusLines(status).join('\n'),
    }
  }

  if (subcommand === 'init') {
    const result = await initializeWiki(cwd)
    return {
      type: 'text',
      value: [
        `root: ${result.root}`,
        `created directories: ${result.createdDirectories.length}`,
        `created files: ${result.createdFiles.length}`,
        `already existed: ${result.alreadyExisted ? 'yes' : 'no'}`,
      ].join('\n'),
    }
  }

  if (subcommand === 'ingest') {
    const file = rest.join(' ').trim()
    if (!file) {
      return {
        type: 'text',
        value: 'Usage: /wiki ingest <file>',
      }
    }

    const result = await ingestWikiSource(cwd, file)
    return {
      type: 'text',
      value: [
        `title: ${result.title}`,
        `source: ${result.sourceFile}`,
        `note: ${result.sourceNote}`,
        `summary: ${result.summary}`,
      ].join('\n'),
    }
  }

  return {
    type: 'text',
    value: [
      'Usage: /wiki [status|init|ingest <file>]',
      '',
      'Commands:',
      '  status         Show wiki status',
      '  init           Initialize wiki structure',
      '  ingest <file>  Ingest source file into wiki',
    ].join('\n'),
  }
}
