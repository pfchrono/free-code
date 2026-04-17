---
name: free-code-repo
description: Free Code CLI built on Claude Code codebase, has ANT-internal feature flags
type: project
---

Free Code is a CLI built on Claude Code codebase. Most ANT-internal features guarded by `process.env.USER_TYPE === 'ant'`. Undercover mode is now available to all users (no longer gated on USER_TYPE).

Git branch: `main`. Recent work includes RedQueen compression, message pruning, deterministic tool reducers.
