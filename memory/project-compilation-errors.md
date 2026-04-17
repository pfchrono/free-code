---
name: project-compilation-errors
description: TypeScript compilation fails with 30+ errors; missing modules and type mismatches across bridge/buddy/cli
type: reference
---

TypeScript compilation failing with 30+ errors:
- Missing modules: `controlTypes.js`, `message.js`, `oauth/types.js`, `assistant/index.js`
- Type errors: `SDKResultSuccess`, `OrgValidationResult`, `ContentBlockParam[]`, string union mismatches
- Affected dirs: `src/bridge/`, `src/buddy/`, `src/cli/`

Pre-existing — not from recent changes. Compilation must pass before testing any new command.