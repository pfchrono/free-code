import { mkdir, access, writeFile } from 'fs/promises'
import { constants } from 'fs'
import { basename } from 'path'
import { getWikiPaths } from './paths.js'
import { rebuildWikiIndex } from './indexBuilder.js'
import type { WikiInitResult } from './types.js'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function initializeWiki(cwd: string): Promise<WikiInitResult> {
  const paths = getWikiPaths(cwd)
  const createdDirectories: string[] = []
  const createdFiles: string[] = []
  const alreadyExisted = await exists(paths.root)

  for (const dir of [paths.root, paths.pagesDir, paths.sourcesDir]) {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true })
      createdDirectories.push(dir)
    }
  }

  const fileTemplates: Array<[string, string]> = [
    [
      paths.schemaFile,
      `# Wiki Schema\n\n- Project: ${basename(cwd)}\n- Purpose: Durable notes, entities, and links for this repo\n`,
    ],
    [paths.logFile, '# Wiki Log\n'],
  ]

  for (const [file, content] of fileTemplates) {
    if (!(await exists(file))) {
      await writeFile(file, content, 'utf8')
      createdFiles.push(file)
    }
  }

  await rebuildWikiIndex(cwd)
  if (!(await exists(paths.indexFile))) {
    createdFiles.push(paths.indexFile)
  }

  return {
    root: paths.root,
    createdDirectories,
    createdFiles,
    alreadyExisted,
  }
}
