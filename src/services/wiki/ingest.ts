import { appendFile, readFile, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { getWikiPaths } from './paths.js'
import { rebuildWikiIndex } from './indexBuilder.js'
import {
  extractTitleFromText,
  sanitizeWikiSlug,
  summarizeText,
} from './utils.js'
import type { WikiIngestResult } from './types.js'

export async function ingestWikiSource(
  cwd: string,
  sourcePath: string,
): Promise<WikiIngestResult> {
  const paths = getWikiPaths(cwd)
  const content = await readFile(sourcePath, 'utf8')
  const fallbackName = basename(sourcePath).replace(/\.[^.]+$/, '')
  const title = extractTitleFromText(fallbackName, content)
  const slug = sanitizeWikiSlug(title) || sanitizeWikiSlug(fallbackName) || 'note'
  const sourceNote = join(paths.sourcesDir, `${slug}.md`)
  const summary = summarizeText(content)

  const sourceBody = `# ${title}\n\n## Source\n\n- Path: ${sourcePath}\n\n## Summary\n\n${summary}\n\n## Extract\n\n${content.trim()}\n`

  await writeFile(sourceNote, sourceBody, 'utf8')
  await appendFile(
    paths.logFile,
    `- ${new Date().toISOString()} ingested ${sourcePath} -> ${basename(sourceNote)}\n`,
    'utf8',
  )
  await rebuildWikiIndex(cwd)

  return {
    sourceFile: sourcePath,
    sourceNote,
    summary,
    title,
  }
}
