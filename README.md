<p align="center">
  <img src="assets/screenshot.png" alt="free-code" width="720" />
</p>

<h1 align="center">free-code</h1>

<p align="center">
  <strong>The clean-room Free-Code build.</strong><br>
  Telemetry stripped. Prompt guardrails mostly removed. Experimental features unlocked.<br>
  One binary, zero callbacks home.
</p>

<p align="center">
  <a href="#quick-install"><img src="https://img.shields.io/badge/install-one--liner-blue?style=flat-square" alt="Install" /></a>
  <a href="https://github.com/pfchrono/free-code/stargazers"><img src="https://img.shields.io/github/stars/pfchrono/free-code?style=flat-square" alt="Stars" /></a>
  <a href="https://github.com/pfchrono/free-code/issues"><img src="https://img.shields.io/github/issues/pfchrono/free-code?style=flat-square" alt="Issues" /></a>
  <a href="https://github.com/pfchrono/free-code/blob/main/FEATURES.md"><img src="https://img.shields.io/badge/features-88%20flags-orange?style=flat-square" alt="Feature Flags" /></a>
  <a href="#ipfs-mirror"><img src="https://img.shields.io/badge/IPFS-mirrored-teal?style=flat-square" alt="IPFS" /></a>
</p>

---

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/pfchrono/free-code/main/install.sh | bash
```

Checks your system, installs Bun if needed, clones the repo, builds free-code, and symlinks `free-code` on your PATH.

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/pfchrono/free-code/main/install.ps1 | iex
```

The Windows installer will:

- Verify Windows + Git + Bun prerequisites
- Clone or update the repo
- Install dependencies with Bun
- Build the binary (`cli.exe` or `cli-dev.exe`)
- Create launchers in `%USERPROFILE%\.local\bin` (`free-code.exe` and `free-code.cmd`)
- Add `%USERPROFILE%\.local\bin` to your user PATH if missing

Then run `free-code profile:init`, check with `free-code doctor:provider`, and start with `free-code dev:profile`.

---

## Table of Contents

- [What is this](#what-is-this)
- [Latest Changes](#latest-changes)
- [Model Providers](#model-providers)
- [Quick Install](#quick-install)
- [Windows Install and Build](#windows-install-and-build)
- [Requirements](#requirements)
- [Build](#build)
- [Usage](#usage)
- [ChatGPT and Copilot Workflow](#chatgpt-and-copilot-workflow)
- [Experimental Features](#experimental-features)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [IPFS Mirror](#ipfs-mirror)
- [Contributing](#contributing)
- [License](#license)

---

## What is this

A clean, buildable fork of an upstream terminal-native AI coding agent CLI. This project is maintained as `free-code` by Grevin / `pfchrono`, with compatibility-preserving behavior where needed for existing installs and workflows.

This fork applies three categories of changes on top of that snapshot:

### Telemetry removed

The upstream binary phones home through OpenTelemetry/gRPC, GrowthBook analytics, Sentry error reporting, and custom event logging. In this build:

- All outbound telemetry endpoints are dead-code-eliminated or stubbed
- GrowthBook feature flag evaluation still works locally (needed for runtime feature gates) but does not report back
- No crash reports, no usage analytics, no session fingerprinting

### Security-prompt overlays reduced

The upstream product injects additional system-level instructions into conversations that constrain assistant behavior beyond the base model and local tool/runtime enforcement. These include hardcoded refusal patterns, injected "cyber risk" instruction blocks, and managed-settings security overlays pushed from hosted services.

This build removes or bypasses many of those extra CLI prompt-layer overlays. Provider-side/model-side safety systems still apply, and local hard blocks for critical system paths/files remain in place.

### Experimental features unlocked

The upstream CLI ships with 88 feature flags gated behind `bun:bundle` compile-time switches. Most are disabled in the public npm release. This build unlocks all 54 flags that compile cleanly. See [Experimental Features](#experimental-features) below, or refer to [FEATURES.md](FEATURES.md) for the full audit.

## Latest Changes

Recent updates expanded provider bootstrap, local launch workflow, provider health checks, status visibility, Windows/path handling, local skill workflow support, config-home-aware persistence, and internal provider/memory tooling:

- Added provider bootstrap commands for repo-local setup:
  - `free-code profile:init`
  - `free-code profile:auto`
  - `free-code profile:codex`
  - `free-code profile:openai`
  - `free-code profile:copilot`
  - `free-code profile:openrouter`
  - `free-code profile:lmstudio`
  - `free-code profile:zen`
  - `free-code profile:minimax`
  - `free-code profile:firstparty`
- Added profile launch helpers:
  - `free-code dev:profile`
  - `free-code dev:profile:auto`
  - provider-specific `dev:profile:*` variants
- Added provider diagnostics with `free-code doctor:provider`
- Added experimental gRPC dev helpers with `free-code dev:grpc` and `free-code dev:grpc:cli`
- Added explicit gRPC cleanup helper with `free-code dev:grpc:stop`
- Added shared-harness headless transport helpers with `free-code dev:headless-transport`, `free-code test:headless-transport`, and `free-code test:headless-integration`
- Added `Archivist` internal provider wiring for memory, code intel, and checkpoints while keeping external MCP compatibility with the official `token-savior` server name
- Added GitHub Copilot provider integration (OAuth/token exchange + API adapter)
- Added `/copilot models` and `/openrouter models` to probe model support from cached capability data
- Restored `/usage` for Codex sessions and surfaced same usage state in Settings -> Status
- Added `/deadpoolmode` and `/ralphmode` toggles for response-style overlays
- Fixed `/codex off` provider restore behavior so disabling Codex returns to the expected provider state
- Corrected message pruning to preserve system messages plus the last timeline-recent messages
- Hardened Codex stream handling so final text is still emitted when it arrives after `response.done`
- Added `gpt-5.3-codex-spark` support, including `chatgpt-5.3-codex-spark` alias normalization
- Standardized Haiku/Sonnet/Opus routing to provider-equivalent models on third-party backends
- Improved provider-aware status and settings displays so active model/provider state resolves more consistently across the UI
- Added startup provider override handling from `.claude/settings.json`
- Improved Windows and filesystem path validation/permission handling for file access and PowerShell workflows
- Restored `--dangerously-bypass-permissions` for normal tool/edit flows while keeping hard denies for critical Windows/system paths
- Added local free-code skill bundles for `domore`, `domore-caveman`, and `domore-distillate`
- Added ignore coverage for `.claude/settings.local.json`, `.claude/worktrees/`, and OpenSpec temp artifacts
- Added OpenSpec change set for status snapshots, session memory persistence, and compaction inspectability
- Commit trailers now use active adapter names instead of `unknown-adapter`
- Updated config path resolution so `CLAUDE_CONFIG_HOME` works consistently for:
  - global `.claude*.json` config lookup
  - macOS keychain service naming for custom config locations
  - persistent memory and session continuity storage directories

Provider preferences stay repo-local. Bootstrap and launch scripts now cover setup, validation, and repeatable startup from project root.

---

## Windows Install and Build

### Install from GitHub

```powershell
irm https://raw.githubusercontent.com/pfchrono/free-code/main/install.ps1 | iex
```

### Build from local checkout

```powershell
pwsh -ExecutionPolicy Bypass -File .\install.ps1
```

### Build dev/experimental binary

```powershell
pwsh -ExecutionPolicy Bypass -File .\install.ps1 -Dev
```

### Local rebuild behavior

`install.ps1` already handles local-checkout rebuilds. When the script is run from the repo root, it detects the local source tree, rebuilds `dist\cli(.exe)` or `dist\cli-dev(.exe)`, and refreshes the launchers in `%USERPROFILE%\.local\bin`.

Important Windows note:

- If `free-code.exe` is currently running, PowerShell may not be able to replace `%USERPROFILE%\.local\bin\free-code.exe` because the file is locked by the active process.
- In that case the script still updates `free-code.cmd`, but the native `.exe` launcher may stay on the old binary until you exit the running session and rerun `install.ps1`.
- So for a guaranteed binary refresh, exit `free-code` first, then run `install.ps1`.

After install:

- Standard: `free-code` launches the standard build
- Dev: `free-code` launches the dev/experimental build
- One-shot mode: `free-code -p "your prompt"`

If PATH was updated, open a new terminal session before first use.

---

## Model Providers

free-code supports **eleven API providers** out of the box. You can switch with environment flags or, for several third-party providers, repo-local slash commands persisted in `.claude/settings.json`.

### First-Party Hosted Provider -- Default

Use the default first-party hosted API directly.

| Model | ID |
|---|---|
| Opus 4.6 | `claude-opus-4-6` |
| Sonnet 4.6 | `claude-sonnet-4-6` |
| Haiku 4.5 | `claude-haiku-4-5` |

### OpenAI Codex

Use OpenAI's Codex models for code generation. Requires a Codex subscription.

| Model | ID |
|---|---|
| GPT-5.4 (default) | `gpt-5.4` |
| GPT-5.3 Codex | `gpt-5.3-codex` |
| GPT-5.3 Codex Spark | `gpt-5.3-codex-spark` |
| GPT-5.4 Mini | `gpt-5.4-mini` |
| GPT-5.2 Codex | `gpt-5.2-codex` |
| GPT-5.1 Codex Max | `gpt-5.1-codex-max` |
| GPT-5.1 Codex | `gpt-5.1-codex` |
| GPT-5.1 Codex Mini | `gpt-5.1-codex-mini` |

```bash
export CLAUDE_CODE_USE_CODEX=1
free-code
```

You can also switch repo-locally from inside free-code:

```text
/codex on
/codex status
/codex models
```

### OpenAI

Use native OpenAI-compatible routing and capability discovery.

```bash
export CLAUDE_CODE_USE_OPENAI=1
free-code
```

```text
/openai on
/openai status
/openai models
/openai capabilities <model>
```

### GitHub Copilot

Use GitHub Copilot chat/completions models through OAuth-backed credentials.

```bash
export CLAUDE_CODE_USE_COPILOT=1
free-code
```

```text
/copilot on
/copilot status
/copilot models
```

### OpenRouter

Use OpenRouter model IDs and optional repo-local API key storage.

```bash
export CLAUDE_CODE_USE_OPENROUTER=1
export OPENROUTER_API_KEY="..."
free-code
```

```text
/openrouter <api-key>
/openrouter status
/openrouter models
/openrouter off
```

### LM Studio

Use local LM Studio-hosted models. `/lmstudio` stores repo-local preference and restarts session to avoid mixed provider state.

```bash
export CLAUDE_CODE_USE_LMSTUDIO=1
free-code
```

### OpenCode Zen

Use OpenCode Zen routing.

```bash
export CLAUDE_CODE_USE_ZEN=1
free-code
```

### MiniMax

Use MiniMax routing with API key auth.

```bash
export CLAUDE_CODE_USE_MINIMAX=1
export MINIMAX_API_KEY="..."
free-code
```

### AWS Bedrock

Route requests through your AWS account via Amazon Bedrock.

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION="us-east-1"   # or AWS_DEFAULT_REGION
free-code
```

Uses your standard AWS credentials (environment variables, `~/.aws/config`, or IAM role). Models are mapped to Bedrock ARN format automatically (e.g., `us.anthropic.claude-opus-4-6-v1`).

| Variable | Purpose |
|---|---|
| `CLAUDE_CODE_USE_BEDROCK` | Enable Bedrock provider |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | AWS region (default: `us-east-1`) |
| `ANTHROPIC_BEDROCK_BASE_URL` | Custom Bedrock endpoint |
| `AWS_BEARER_TOKEN_BEDROCK` | Bearer token auth |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | Skip auth (testing) |

### Google Cloud Vertex AI

Route requests through your GCP project via Vertex AI.

```bash
export CLAUDE_CODE_USE_VERTEX=1
free-code
```

Uses Google Cloud Application Default Credentials (`gcloud auth application-default login`). Models are mapped to Vertex format automatically (e.g., `claude-opus-4-6@latest`).

### Anthropic Foundry

Use Anthropic Foundry for dedicated deployments.

```bash
export CLAUDE_CODE_USE_FOUNDRY=1
export ANTHROPIC_FOUNDRY_API_KEY="..."
free-code
```

Supports custom deployment IDs as model names.

### Provider Selection Summary

| Provider | Env Variable | Repo-local command | Auth Method |
|---|---|---|---|
| Anthropic (default) | -- | -- | `ANTHROPIC_API_KEY` or OAuth |
| OpenAI Codex | `CLAUDE_CODE_USE_CODEX=1` | `/codex` | OAuth via OpenAI |
| OpenAI | `CLAUDE_CODE_USE_OPENAI=1` | `/openai` | API key / compatible endpoint |
| GitHub Copilot | `CLAUDE_CODE_USE_COPILOT=1` | `/copilot` | OAuth via GitHub |
| OpenRouter | `CLAUDE_CODE_USE_OPENROUTER=1` | `/openrouter` | `OPENROUTER_API_KEY` |
| LM Studio | `CLAUDE_CODE_USE_LMSTUDIO=1` | `/lmstudio` | Local LM Studio |
| OpenCode Zen | `CLAUDE_CODE_USE_ZEN=1` | `/zen` | `OPENCODE_API_KEY` optional |
| MiniMax | `CLAUDE_CODE_USE_MINIMAX=1` | `/minimax` | `MINIMAX_API_KEY` |
| AWS Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` | -- | AWS credentials |
| Google Vertex AI | `CLAUDE_CODE_USE_VERTEX=1` | -- | `gcloud` ADC |
| Anthropic Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | -- | `ANTHROPIC_FOUNDRY_API_KEY` |

Repo-local commands exist for `codex`, `openai`, `copilot`, `openrouter`, `lmstudio`, `zen`, and `minimax`. All persist in `.claude/settings.json`; `/lmstudio` requires restart, others switch immediately.

---

## Requirements

- **Runtime**: [Bun](https://bun.sh) >= 1.3.11
- **OS**: macOS, Linux, or Windows PowerShell
- **Auth**: An API key or OAuth login for your chosen provider

```bash
# Install Bun if you don't have it
curl -fsSL https://bun.sh/install | bash
```

---

## Build

```bash
git clone https://github.com/pfchrono/free-code.git
cd free-code
bun run build
./cli
```

### Build Variants

| Command | Output | Features | Description |
|---|---|---|---|
| `bun run build` | `./cli` | `VOICE_MODE` only | Production-like binary |
| `bun run build:dev` | `./cli-dev` | `VOICE_MODE` only | Dev version stamp |
| `bun run build:dev:full` | `./cli-dev` | All 54 experimental flags | Full unlock build |
| `bun run compile` | `./dist/cli` | `VOICE_MODE` only | Alternative output path |

### Custom Feature Flags

Enable specific flags without the full bundle:

```bash
# Enable just ultraplan and ultrathink
bun run ./scripts/build.ts --feature=ULTRAPLAN --feature=ULTRATHINK

# Add a flag on top of the dev build
bun run ./scripts/build.ts --dev --feature=BRIDGE_MODE
```

---

## Usage

```bash
# Interactive REPL (default)
./cli

# One-shot mode
./cli -p "what files are in this directory?"

# Specify a model
./cli --model claude-opus-4-6

# Run from source (slower startup)
bun run dev

# OAuth login
./cli /login
```

Provider control commands (inside free-code):

```text
/codex on
/codex status
/codex models

/openai on
/openai status
/openai models
/openai off

/copilot on
/copilot status
/copilot models
/copilot off

/openrouter status
/lmstudio status
/zen status
/minimax status
/provider status
/usage
```

`/codex`, `/openai`, `/copilot`, `/openrouter`, `/zen`, and `/minimax` switch current session and persist repo-local preference. `/lmstudio` persists preference and restarts session.

Response-style overlays:

```text
/deadpoolmode on
/deadpoolmode status
/ralphmode on
/ralphmode status
```

`/deadpoolmode` adds the snarky antihero voice layer. `/ralphmode` adds loop-until-done execution guidance. They can stack with `/caveman-mode`.

---

## ChatGPT and Copilot Workflow

This is the recommended setup flow for teams that switch providers by repository. Same pattern also works for `/openrouter`, `/zen`, `/minimax`, and `/lmstudio`.

### 1) Install and verify

Windows:

```powershell
irm https://raw.githubusercontent.com/pfchrono/free-code/main/install.ps1 | iex
free-code -p "health check"
```

macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/pfchrono/free-code/main/install.sh | bash
free-code -p "health check"
```

### 2) Bootstrap provider profile

From repo root, initialize provider profile and local settings:

```bash
free-code profile:init
```

Or pick one directly:

```bash
free-code profile:codex
free-code profile:openai
free-code profile:copilot
free-code profile:openrouter
free-code profile:lmstudio
free-code profile:zen
free-code profile:minimax
free-code profile:firstparty
```

Auto-detect and recommend:

```bash
free-code profile:auto
```

### 3) Check provider health

```bash
free-code doctor:provider
```

This validates current provider wiring, auth expectations, and repo-local profile state.

### 4) Launch dev session from selected profile

```bash
free-code dev:profile
```

Provider-specific launch helpers:

```bash
free-code dev:profile:auto
free-code dev:profile:codex
free-code dev:profile:openai
free-code dev:profile:copilot
free-code dev:profile:openrouter
free-code dev:profile:lmstudio
free-code dev:profile:zen
free-code dev:profile:minimax
free-code dev:profile:firstparty
```

### 5) Headless automation helpers

```bash
bun run dev:headless-transport
bun run test:headless-transport
bun run test:headless-integration
```

Use these for automation, integration smoke, and transport-neutral regression checks. They run on top of the shared headless session harness used by current non-visual transport testing.

### 6) Experimental gRPC dev helpers

```bash
bun run dev:grpc
bun run dev:grpc:cli
bun run dev:grpc:stop
```

Use these only for manual/experimental transport checks. Current Bun-hosted gRPC still has protocol instability in this repo and is not the recommended automation path.

### 7) Daily workflow

- Start in project root
- Initialize or confirm provider profile (`free-code profile:init`, `free-code doctor:provider`)
- Launch from profile (`free-code dev:profile`)
- Use normal coding loop (`free-code`, agent tools, edits, tests)
- Keep provider scoped by repository rather than mutating global shell env each time
- Use `/usage` or Settings -> Status to inspect Codex/Copilot context and rate-limit state when available

### 8) Switch provider mode later

Re-run any profile command:

```bash
free-code profile:codex
# or
free-code profile:openai
# or
free-code profile:copilot
# or
free-code profile:firstparty
```

### Environment Variables Reference

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_AUTH_TOKEN` | Auth token (alternative) |
| `ANTHROPIC_MODEL` | Override default model |
| `ANTHROPIC_BASE_URL` | Custom API endpoint |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Custom Opus model ID |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Custom Sonnet model ID |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Custom Haiku model ID |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token via env |
| `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` | API key helper cache TTL |

---

## Experimental Features

The `bun run build:dev:full` build enables all 54 working feature flags. Highlights:

### Interaction & UI

| Flag | Description |
|---|---|
| `ULTRAPLAN` | Remote multi-agent planning on Free-Code web (Opus-class) |
| `ULTRATHINK` | Deep thinking mode -- type "ultrathink" to boost reasoning effort |
| `VOICE_MODE` | Push-to-talk voice input and dictation |
| `TOKEN_BUDGET` | Token budget tracking and usage warnings |
| `HISTORY_PICKER` | Interactive prompt history picker |
| `MESSAGE_ACTIONS` | Message action entrypoints in the UI |
| `QUICK_SEARCH` | Prompt quick-search |
| `SHOT_STATS` | Shot-distribution stats |

### Agents, Memory & Planning

| Flag | Description |
|---|---|
| `BUILTIN_EXPLORE_PLAN_AGENTS` | Built-in explore/plan agent presets |
| `VERIFICATION_AGENT` | Verification agent for task validation |
| `AGENT_TRIGGERS` | Local cron/trigger tools for background automation |
| `AGENT_TRIGGERS_REMOTE` | Remote trigger tool path |
| `EXTRACT_MEMORIES` | Post-query automatic memory extraction |
| `COMPACTION_REMINDERS` | Smart reminders around context compaction |
| `CACHED_MICROCOMPACT` | Cached microcompact state through query flows |
| `TEAMMEM` | Team-memory files and watcher hooks |

### Tools & Infrastructure

| Flag | Description |
|---|---|
| `BRIDGE_MODE` | IDE remote-control bridge (VS Code, JetBrains) |
| `BASH_CLASSIFIER` | Classifier-assisted bash permission decisions |
| `PROMPT_CACHE_BREAK_DETECTION` | Cache-break detection in compaction/query flow |

See [FEATURES.md](FEATURES.md) for the complete audit of all 88 flags, including 34 broken flags with reconstruction notes.

---

## Project Structure

```
scripts/
  build.ts                # Build script with feature flag system

src/
  entrypoints/cli.tsx     # CLI entrypoint
  commands.ts             # Command registry (slash commands)
  tools.ts                # Tool registry (agent tools)
  QueryEngine.ts          # LLM query engine
  screens/REPL.tsx        # Main interactive UI (Ink/React)

  commands/               # /slash command implementations
  tools/                  # Agent tool implementations (Bash, Read, Edit, etc.)
  components/             # Ink/React terminal UI components
  hooks/                  # React hooks
  services/               # API clients, MCP, OAuth, analytics
    api/                  # API client + Codex fetch adapter
    oauth/                # OAuth flows (Anthropic + OpenAI)
  state/                  # App state store
  utils/                  # Utilities
    model/                # Model configs, providers, validation
  skills/                 # Skill system
  plugins/                # Plugin system
  bridge/                 # IDE bridge
  voice/                  # Voice input
  tasks/                  # Background task management
```

---

## Tech Stack

| | |
|---|---|
| **Runtime** | [Bun](https://bun.sh) |
| **Language** | TypeScript |
| **Terminal UI** | React + [Ink](https://github.com/vadimdemedes/ink) |
| **CLI Parsing** | [Commander.js](https://github.com/tj/commander.js) |
| **Schema Validation** | Zod v4 |
| **Code Search** | ripgrep (bundled) |
| **Protocols** | MCP, LSP |
| **APIs** | Anthropic Messages, OpenAI Codex, AWS Bedrock, Google Vertex AI |

---

## IPFS Mirror

A full copy of this repository is permanently pinned on IPFS via Filecoin:

| | |
|---|---|
| **CID** | `bafybeiegvef3dt24n2znnnmzcud2vxat7y7rl5ikz7y7yoglxappim54bm` |
| **Gateway** | https://w3s.link/ipfs/bafybeiegvef3dt24n2znnnmzcud2vxat7y7rl5ikz7y7yoglxappim54bm |

If this repo gets taken down, the code lives on.

---

## Contributing

Contributions are welcome. If you're working on restoring one of the 34 broken feature flags, check the reconstruction notes in [FEATURES.md](FEATURES.md) first -- many are close to compiling and just need a small wrapper or missing asset.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add something'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

---

## License

The original upstream source came from Anthropic's npm distribution. This fork exists because that source was publicly exposed there. Use at your own discretion.
