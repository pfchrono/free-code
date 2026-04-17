import { access, readdir, stat } from 'fs/promises'
import { constants } from 'fs'
import { getWikiPaths } from './paths.js'
import type { WikiStatus } from './types.js'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function countMarkdownFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    let count = 0

    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        count += await countMarkdownFiles(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        count += 1
      }
    }

    return count
  } catch {
    return 0
  }
}

export async function getWikiStatus(cwd: string): Promise<WikiStatus> {
  const paths = getWikiPaths(cwd)
  const initialized = await exists(paths.root)
  const hasSchema = await exists(paths.schemaFile)
  const hasIndex = await exists(paths.indexFile)
  const hasLog = await exists(paths.logFile)
  const pageCount = await countMarkdownFiles(paths.pagesDir)
  const sourceCount = await countMarkdownFiles(paths.sourcesDir)

  let lastUpdatedAt: string | null = null
  if (hasIndex) {
    const info = await stat(paths.indexFile)
    lastUpdatedAt = info.mtime.toISOString()
  }

  return {
    initialized,
    root: paths.root,
    pageCount,
    sourceCount,
    hasSchema,
    hasIndex,
    hasLog,
    lastUpdatedAt,
  }
}
