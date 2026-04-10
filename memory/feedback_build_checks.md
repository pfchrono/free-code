---
name: feedback build checks
description: Build verification approach for this project
type: feedback
---

Build check: `bun run ./scripts/build.ts` succeeds. `tsc --noEmit` fails due to `moduleResolution: "bundler"` + `.js` extensions in `.ts` imports — tsc limitation, not a real error. **How to apply:** When user asks to verify build, use `bun run ./scripts/build.ts` only. Skip `tsc --noEmit`.
