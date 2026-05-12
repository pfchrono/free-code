# Free-Code Advanced Setup

This guide is for users who want source builds, Bun workflows, provider profiles, diagnostics, or more control over runtime behavior.

## Install Options

### Option A: installer

```bash
curl -fsSL https://raw.githubusercontent.com/pfchrono/free-code/main/install.sh | bash
```

### Option B: From source with Bun

Use Bun `1.3.11` or newer for source builds on Windows. Older Bun versions can fail during `bun run build`.

```bash
git clone https://github.com/pfchrono/free-code.git
cd free-code

bun install
bun run build
./install.sh
```

### Option C: Run directly with Bun

```bash
git clone https://github.com/pfchrono/free-code.git
cd free-code

bun install
bun run dev
```

## Provider Examples

### OpenAI

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o
```

### Codex via ChatGPT auth

`codexplan` maps to GPT-5.5 on the Codex backend with high reasoning.
`codexspark` maps to GPT-5.3 Codex Spark for faster loops.

If you use the in-app provider wizard, choose `Codex OAuth` to open ChatGPT sign-in in your browser and let Free-Code store Codex credentials securely.

If you already use the Codex CLI, Free-Code reads `~/.codex/auth.json` automatically. You can also point it elsewhere with `CODEX_AUTH_JSON_PATH` or override the token directly with `CODEX_API_KEY`.

If you set `CODEX_API_KEY` manually and are not relying on `auth.json` or stored
Codex OAuth credentials, also set `CHATGPT_ACCOUNT_ID` (or
`CODEX_ACCOUNT_ID`).

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_MODEL=codexplan

# optional if you do not already have ~/.codex/auth.json
export CODEX_API_KEY=...
export CHATGPT_ACCOUNT_ID=...

free-code
```

### DeepSeek

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.deepseek.com/v1
export OPENAI_MODEL=deepseek-v4-flash
```

Use `deepseek-v4-pro` when you want the stronger model. `deepseek-chat` and `deepseek-reasoner` remain available as DeepSeek's legacy API aliases.

### Google Gemini

```bash
export CLAUDE_CODE_USE_GEMINI=1
export GEMINI_API_KEY=...
export GEMINI_MODEL=gemini-3-flash-preview
```

### Gemini via OpenRouter

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-or-...
export OPENAI_BASE_URL=https://openrouter.ai/api/v1
export OPENAI_MODEL=google/gemini-2.5-pro
```

OpenRouter model availability changes over time. If a model stops working, try another current OpenRouter model before assuming the integration is broken.

### Ollama

Using `ollama launch` (recommended if you have Ollama installed):

```bash
ollama launch free-code --model llama3.3:70b
```

This handles all environment setup automatically — no env vars needed. Works with any local or cloud model available in your Ollama instance.

Using environment variables manually:

```bash
ollama pull llama3.3:70b

export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=llama3.3:70b
```

### LM Studio

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:1234/v1
export OPENAI_MODEL=your-model-name
```

### Together AI

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=...
export OPENAI_BASE_URL=https://api.together.xyz/v1
export OPENAI_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo
```

### Groq

```bash
export CLAUDE_CODE_USE_OPENAI=1
export GROQ_API_KEY=gsk_...
export OPENAI_BASE_URL=https://api.groq.com/openai/v1
export OPENAI_MODEL=llama-3.3-70b-versatile
```

`GROQ_API_KEY` matches the built-in Groq gateway preset. `OPENAI_API_KEY` also works as a fallback on the generic OpenAI-compatible path, but `GROQ_API_KEY` is the preferred variable for Groq-specific setup.

### Mistral

```bash
export CLAUDE_CODE_USE_MISTRAL=1
export MISTRAL_API_KEY=...
export MISTRAL_MODEL=devstral-latest
```

### Azure OpenAI

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=your-azure-key
export OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment/v1
export OPENAI_MODEL=gpt-4o
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_USE_OPENAI` | OpenAI-compatible only | Set to `1` to enable the OpenAI-compatible provider path |
| `OPENAI_API_KEY` | OpenAI-compatible cloud routes* | Your API key (`*` not needed for local models like Ollama, LM Studio, Atomic Chat, or other local OpenAI-compatible proxies) |
| `OPENAI_MODEL` | OpenAI-compatible only | Model name such as `gpt-4o`, `deepseek-v4-flash`, or `llama3.3:70b` |
| `OPENAI_BASE_URL` | No | API endpoint, defaulting to `https://api.openai.com/v1` |
| `OPENAI_API_BASE` | No | Compatibility alias for `OPENAI_BASE_URL` |
| `CLAUDE_CODE_USE_GEMINI` | Gemini only | Set to `1` to enable the direct Gemini provider path |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Gemini API-key auth | Gemini API key for direct Gemini setup |
| `GEMINI_MODEL` | Gemini only | Model name such as `gemini-3-flash-preview` or `gemini-2.5-pro` |
| `GEMINI_BASE_URL` | No | Override the Gemini base URL |
| `CLAUDE_CODE_USE_MISTRAL` | Mistral only | Set to `1` to enable the dedicated Mistral provider path |
| `MISTRAL_API_KEY` | Mistral only | Mistral API key |
| `MISTRAL_MODEL` | Mistral only | Model name such as `devstral-latest` |
| `MISTRAL_BASE_URL` | No | Override the Mistral base URL |
| `CODEX_API_KEY` | Codex only | Codex or ChatGPT access token override |
| `CHATGPT_ACCOUNT_ID` / `CODEX_ACCOUNT_ID` | Codex only | Required for manual Codex env setup when the account id is not coming from `auth.json` or stored OAuth credentials |
| `CODEX_AUTH_JSON_PATH` | Codex only | Path to a Codex CLI `auth.json` file |
| `CODEX_HOME` | Codex only | Alternative Codex home directory |
| `FREE_CODE_DISABLE_CO_AUTHORED_BY` | No | Suppress the default `Co-Authored-By` trailer in generated git commits |
| `FREE_CODE_LOG_TOKEN_USAGE` | No | When truthy (e.g. `verbose`), emits one JSON line on stderr per API request with input/output/cache tokens and the resolved provider. **User-facing debug output** — complements the REPL display controlled by `/config showCacheStats`. Distinct from `CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT`, which is **model-facing** (injects context usage info into the prompt itself). Both can run together. |

Model env vars are provider-scoped: Anthropic-native sessions read
`ANTHROPIC_MODEL`, OpenAI-compatible sessions read `OPENAI_MODEL`, Gemini reads
`GEMINI_MODEL`, and Mistral reads `MISTRAL_MODEL`.

## SSH Image Paste Bridge

Use this when `free-code` runs in an SSH session but your clipboard image lives on your local machine.

What it does:

- Local machine runs a tiny HTTP bridge that reads your local clipboard.
- SSH remote forwards one localhost-only port back to that bridge.
- `free-code` detects SSH and tries the bridge first before normal remote clipboard checks.

Exact setup:

### 1. Start bridge on local machine

```bash
bun run dev:ssh-image-paste-bridge
```

Default listener:

- URL: `http://127.0.0.1:17654/image`
- Override with `FREE_CODE_SSH_IMAGE_PASTE_PORT` or `FREE_CODE_SSH_IMAGE_PASTE_HOST`

### 2. Connect to remote host with reverse port forward

```bash
ssh -R 17654:127.0.0.1:17654 <host>
```

If you changed the port locally, use the same port on both sides.

### 3. Run Free-Code on remote host

Usually no extra env is needed. SSH sessions default to:

```bash
FREE_CODE_SSH_IMAGE_PASTE_URL=http://127.0.0.1:17654/image
```

Set `FREE_CODE_SSH_IMAGE_PASTE_URL` only if you need a non-default port or host.

### Expected behavior

- Image in local clipboard: remote paste reads it through bridge.
- No image in local clipboard: bridge returns `404` with `{"error":"no image in clipboard"}` and Free-Code falls back to normal remote clipboard/path handling.
- Bridge unavailable: Free-Code logs debug-only bridge unavailability and continues with existing clipboard fallbacks.

### Exact repro + verification

On remote host, verify tunnel before opening `free-code`:

```bash
curl -i --max-time 2 http://127.0.0.1:17654/image
```

Interpret results:

- `HTTP/1.1 200 OK`: bridge returned image JSON; paste should use it.
- `HTTP/1.1 404 Not Found` with `{"error":"no image in clipboard"}`: tunnel works; local clipboard just has no image.
- timeout or connection error: local bridge is not running, wrong port was forwarded, or SSH reverse forwarding is blocked.

Minimal end-to-end repro:

1. Local machine: `bun run dev:ssh-image-paste-bridge`
2. Local machine: copy image into clipboard
3. Local machine: connect with `ssh -R 17654:127.0.0.1:17654 <host>`
4. Remote host: `curl -i --max-time 2 http://127.0.0.1:17654/image`
5. Remote host: start `free-code` and paste with normal terminal paste shortcut

### Proven smoke test

This setup was smoke-tested locally by starting the bridge on port `17655` and requesting `/image`; with no image in clipboard it returned the expected JSON error payload:

```json
{"error":"no image in clipboard"}
```

### Limitations

- Bridge must run on machine that has clipboard access.
- Remote host must allow SSH reverse port forwarding.
- Bridge is localhost-only by default; keep it that way unless you fully trust your network.
- Bridge only serves `/image`.

## Runtime Hardening

Use these commands to validate your setup and catch mistakes early:

```bash
# quick startup sanity check
bun run smoke

# validate provider env + reachability
bun run doctor:runtime

# print machine-readable runtime diagnostics
bun run doctor:runtime:json

# persist a diagnostics report to reports/doctor-runtime.json
bun run doctor:report

# full local hardening check (smoke + runtime doctor)
bun run hardening:check

# strict hardening (includes project-wide typecheck)
bun run hardening:strict
```

Notes:

- `doctor:runtime` fails fast if `CLAUDE_CODE_USE_OPENAI=1` with a placeholder key or a missing key for non-local providers.
- `doctor:runtime` also validates the dedicated Gemini and Mistral env paths when `CLAUDE_CODE_USE_GEMINI=1` or `CLAUDE_CODE_USE_MISTRAL=1`.
- Local providers such as `http://localhost:11434/v1`, `http://10.0.0.1:11434/v1`, and `http://127.0.0.1:1337/v1` can run without `OPENAI_API_KEY`.
- Codex profiles validate `CODEX_API_KEY` or the Codex CLI auth file and probe `POST /responses` instead of `GET /models`.

## Provider Launch Profiles

Use profile launchers to avoid repeated environment setup.

Fast path shortcuts:

```bash
# persist the best low-latency profile for this repo
bun run profile:fast

# persist the best coding-focused profile for this repo
bun run profile:code

# launch with the best low-latency provider/model and reduced background overhead
bun run dev:fast

# launch with the best coding-focused provider/model
bun run dev:code
```

Lower-level profile commands:

```bash
# one-time profile bootstrap (prefer viable local Ollama, otherwise OpenAI)
bun run profile:init

# preview the best provider/model for your goal
bun run profile:recommend -- --goal coding --benchmark

# auto-apply the best available local/openai provider/model for your goal
bun run profile:auto -- --goal latency

# codex bootstrap (defaults to codexplan and ~/.codex/auth.json)
bun run profile:codex

# openai bootstrap with explicit key
bun run profile:init -- --provider openai --api-key sk-...

# gemini bootstrap with explicit key
bun run profile:init -- --provider gemini --api-key ...

# ollama bootstrap with custom model
bun run profile:init -- --provider ollama --model llama3.1:8b

# ollama bootstrap with intelligent model auto-selection
bun run profile:init -- --provider ollama --goal coding

# codex bootstrap with a fast model alias
bun run profile:init -- --provider codex --model codexspark

# launch using persisted user-level provider profile
bun run dev:profile

# codex profile (uses CODEX_API_KEY or ~/.codex/auth.json)
bun run dev:profile:codex

# OpenAI profile (uses the saved OpenAI profile, or OPENAI_API_KEY from your shell)
bun run dev:profile:openai

# Copilot profile
bun run dev:profile:copilot

# LM Studio profile
bun run dev:profile:lmstudio
```

`profile:recommend` ranks installed Ollama models for `latency`, `balanced`, or `coding`, and `profile:auto` can persist the recommendation directly.

If no profile exists yet, `dev:profile` uses the same goal-aware defaults when picking the initial model.

Use `--provider ollama` when you want a local-only path. Auto mode falls back to OpenAI when no viable local chat model is installed.

Use `profile:codex` or `--provider codex` when you want the ChatGPT Codex backend.

`dev:profile:*`
run `doctor:runtime` first and only launch the app if checks pass.

For `dev:ollama`, make sure Ollama is running locally before launch.
