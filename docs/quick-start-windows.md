# Free-Code Quick Start for Windows

This guide uses Windows PowerShell.

## Install

Recommended installer:

```powershell
irm https://raw.githubusercontent.com/pfchrono/free-code/main/install.ps1 | iex
```

Source install:

```powershell
git clone https://github.com/pfchrono/free-code.git
cd free-code
bun install
pwsh -ExecutionPolicy Bypass -File .\install.ps1
```

Check:

```powershell
free-code --version
```

## Pick One Provider

### OpenAI-Compatible

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"

free-code
```

### DeepSeek

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_BASE_URL="https://api.deepseek.com/v1"
$env:OPENAI_MODEL="deepseek-v4-flash"

free-code
```

Use `deepseek-v4-pro` when you want the stronger model. `deepseek-chat` and `deepseek-reasoner` remain available as legacy API aliases.

### Ollama

Install Ollama from `https://ollama.com/download/windows`, then:

```powershell
ollama pull llama3.1:8b

$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="llama3.1:8b"

free-code
```

No API key is needed for local Ollama models.

### LM Studio

Install LM Studio from `https://lmstudio.ai/`, load a model, enable the local server, then:

```powershell
$env:CLAUDE_CODE_USE_LMSTUDIO="1"
$env:LMSTUDIO_BASE_URL="http://localhost:1234/v1"
$env:LMSTUDIO_MODEL="your-model-name"

free-code
```

You can also use the OpenAI-compatible path with `OPENAI_BASE_URL=http://localhost:1234/v1`.

### Provider Wizard

Inside Free-Code:

```text
/provider
```

Use wizard when you want settings saved under Free-Code config storage instead of shell exports.

## If `free-code` Is Not Found

Close PowerShell, open a new PowerShell session, and retry:

```powershell
free-code --version
```

## Advanced Setup

Use [Advanced Setup](advanced-setup.md) for Codex, Copilot, Gemini, LiteLLM, provider profiles, diagnostics, and source build options.
