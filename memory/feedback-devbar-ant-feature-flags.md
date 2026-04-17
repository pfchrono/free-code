---
name: devbar-ant-feature-flags
description: All ANT feature flags use process.env.USER_TYPE comparison, not literal string
type: feedback
---

Bug: `"external" === 'ant'` is always false — comparing a literal string to another literal string.

**Why:** Code had `"external" === 'ant'` instead of `process.env.USER_TYPE === 'ant'`. This is always `false` since the string `"external"` never equals the string `'ant'`. This was likely a search-replace mistake.

**How to apply:** When checking ANT-only features, always use `process.env.USER_TYPE === 'ant'`. Search for similar patterns if more instance of this bug exist.
