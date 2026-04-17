---
name: commands-stub-hunting
description: Which command files are stubs vs complete — found via Read tool failures
type: feedback
---

## commands/index.ts checks isEnabled BEFORE importing

**Why:** Stub files (isEnabled: false) still have runtime errors when imported — their `isEnabled: false` guard doesn't protect the import phase. Only commands that pass the isEnabled check (top of switch in commands.ts) are ever imported, so stubs safely exist but Read fails when trying to verify them directly (module errors or the file just doesn't exist).

**How to apply:** When auditing command completeness, don't trust Read on stubs — use git status and git grep to find files instead. Only try Read on files confirmed to exist via git.

## Stubs that exist (isEnabled: false)

- `reset-limits.ts`
- `bughunter/index.js`
- `env/index.js`
- `issue/index.js`
- `onboarding/index.js`
- `share/index.js`
- `summary/index.js`

## Complete working commands

- `commit.ts` (~300 lines)
- `commit-push-pr.ts` (~250 lines)
- `init-verifiers.ts` (~160 lines)
- `bridge-kick.ts` (~140 lines)
- `version.ts` (~130 lines)
- `autofix-pr.ts` (~150 lines)
- `commit-standard.ts` (~200+ lines, untracked/new)
