# Handoff: Wave 14 provider profile parity

## What landed

Chosen enhancement: port low-risk upstream-style provider-profile model persistence coverage.

Files in play:
- `src/utils/providerProfiles.ts`
- `src/utils/providerProfiles.test.ts`
- `docs/parity/free-code-parity.md`

Behavior now covered:
- `getProfileModelOptions()` preserves configured comma-separated models and appends cached discovered models without duplicates.
- `persistActiveProviderProfileModel()` does not overwrite a stored model list when the selected model already exists in that list.
- `persistActiveProviderProfileModel()` replaces the stored model when the selection is not already configured.
- Profile-managed sessions refresh `OPENAI_MODEL` and the provider-profile applied markers after persistence.
- Non-profile-managed sessions keep the live process env unchanged while still persisting config.

## Validation

Passed:
- `bun test src/utils/providerProfiles.test.ts`

## Why this one

This is a narrow parity slice with good value and low blast radius: it locks in behavior already implemented in `src/utils/providerProfiles.ts` without dragging in upstream product assumptions or broader provider-command rewrites.

## Next likely candidate

If you want one more small parity bite, compare upstream coverage around `applyProviderProfileToProcessEnv()` for provider-specific env mapping and primary-model selection. That looks like the next cheapest place to add confidence without changing runtime architecture.
