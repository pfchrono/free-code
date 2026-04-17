/**
 * preinstall.ts - Remove nested zod copies to prevent v3/v4 version conflicts.
 *
 * This script runs before `bun install`. It finds any nested `zod` packages
 * inside transitive dependencies that differ from the top-level zod version,
 * and replaces them with symlinks to the top-level zod@4. This ensures all
 * code — including bundled dependencies like @anthropic-ai/mcpb and
 * @anthropic-ai/sandbox-runtime — resolves to the single top-level zod@4,
 * eliminating the `q.valueType._zod` TypeError caused by v3/v4 internals mixing.
 *
 * Only affects `node_modules/@anthropic-ai/*` nested zods, since those are
 * the known conflict sources.
 */

import { existsSync, rmSync, symlinkSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const nodeModules = join(rootDir, 'node_modules')

// Packages known to ship their own nested zod that conflicts with our zod@4
const AFFECTED_PACKAGES = [
  '@anthropic-ai/mcpb',
  '@anthropic-ai/sandbox-runtime',
]

function findNestedZod(nodeModulesPath: string): string | null {
  const nestedZod = join(nodeModulesPath, 'zod')
  if (existsSync(nestedZod)) {
    return nestedZod
  }
  // Check if any package has zod nested inside
  for (const entry of readdirSync(nodeModulesPath)) {
    if (entry.startsWith('.') || entry === 'zod') continue
    const pkgPath = join(nodeModulesPath, entry)
    if (!statSync(pkgPath).isDirectory()) continue
    // Scoped packages
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(pkgPath)) {
        const nested = join(pkgPath, scoped, 'node_modules', 'zod')
        if (existsSync(nested)) return nested
      }
    }
  }
  return null
}

let fixed = 0
for (const pkgName of AFFECTED_PACKAGES) {
  const pkgPath = join(nodeModules, pkgName)
  if (!existsSync(pkgPath)) continue

  const nestedZod = findNestedZod(join(pkgPath, 'node_modules'))
  if (!nestedZod) continue

  // Read the nested zod's version to confirm it's a conflict
  try {
    const pkgJsonPath = join(nestedZod, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    const nestedPkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
    if (nestedPkg.version?.startsWith('4.')) continue // Already v4, no conflict

    const topLevelZod = join(nodeModules, 'zod')
    if (!existsSync(topLevelZod)) {
      console.warn(`[preinstall] Top-level zod not found in ${nodeModules}, skipping`)
      continue
    }

    console.log(`[preinstall] Removing nested zod@${nestedPkg.version} from ${pkgName}, linking to top-level zod`)
    rmSync(nestedZod, { recursive: true, force: true })
    symlinkSync(topLevelZod, nestedZod, 'junction')
    fixed++
  } catch (err) {
    console.warn(`[preinstall] Could not process nested zod in ${pkgName}: ${err}`)
  }
}

if (fixed > 0) {
  console.log(`[preinstall] Fixed ${fixed} nested zod conflict(s)`)
}
