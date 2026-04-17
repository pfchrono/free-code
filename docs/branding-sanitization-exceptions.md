# Branding Sanitization Exceptions

This document defines the compatibility-preserving branding policy for free-code.

## Rewrite Targets

Rewrite trademark-facing wording when users see it directly:

- repository docs and onboarding copy
- command descriptions and help text
- status lines and dialogs
- tool permission text and approval prompts
- prompt-facing product identity
- desktop, remote, and setup callouts

Preferred replacements:

- `Claude Code` -> `Free-Code`
- `Claude` -> `Free-Code` or `assistant`, depending on sentence meaning
- `Anthropic` -> `first-party provider`, `hosted provider`, `Grevin`, or `pfchrono`, depending on technical or stewardship context

## Preserve For Compatibility

Do not rename these compatibility-critical surfaces in this change:

- `.claude/`
- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/settings.local.json`
- existing config directory behavior
- existing settings directory behavior
- `CLAUDE_CODE_*` environment variables
- `claude-*` model identifiers
- `@anthropic-ai/*` package names
- protocol and header fields such as `anthropic-version` and `anthropic-beta`
- upstream endpoint names and domains when they are actual protocol requirements

## Case-By-Case

Review individually before changing:

- internal type, function, class, and component names containing `Claude`
- telemetry names such as `claude_code.*`
- comments and historical notes
- tests that intentionally reference legacy compatibility identifiers
- bridge, OAuth, provider, or marketplace strings that may be user-visible but also tied to external contracts

## First-Pass Inventory

High-signal rewrite surfaces identified during audit:

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `src/constants/prompts.ts`
- command descriptions in `src/commands.ts` and command modules
- tool prompts and approval/request text in `src/tools/`
- dialogs and onboarding copy in `src/components/`
- selected status and workflow text in `src/screens/`

High-signal preserve surfaces identified during audit:

- `.claude` config and memory paths
- `CLAUDE.md` discovery and compatibility handling
- `CLAUDE_CODE_*` flags and session env vars
- model IDs such as `claude-opus-4-6`
- `@anthropic-ai/*` SDK imports
- `anthropic-*` protocol headers
- `api.anthropic.com` and related provider endpoints when technically required

This file is the review baseline for the branding sanitization change. Remaining trademark-bearing strings after the implementation pass must either match the preserve list above or be tracked as follow-up cleanup.
