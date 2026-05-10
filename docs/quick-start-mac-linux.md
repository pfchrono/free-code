# Free-Code Quick Start for macOS and Linux

This guide uses Terminal, iTerm, bash, or zsh.

## Install

Recommended installer:

```bash
curl -fsSL https://raw.githubusercontent.com/pfchrono/free-code/main/install.sh | bash
```

Source install:

```bash
git clone https://github.com/pfchrono/free-code.git
cd free-code
bun install
./install.sh
```

Check:

```bash
free-code --version
```

## Pick One Provider

### OpenAI-Compatible

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o

free-code
```

### DeepSeek

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_BASE_URL=https://api.deepseek.com/v1
export OPENAI_MODEL=deepseek-v4-flash

free-code
```

Use `deepseek-v4-pro` when you want the stronger model. `deepseek-chat` and `deepseek-reasoner` remain available as legacy API aliases.

### Ollama

Install Ollama from `https://ollama.com/download`, then:

```bash
ollama pull llama3.1:8b

export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=llama3.1:8b

free-code
```

No API key is needed for local Ollama models.

### LM Studio

Install LM Studio from `https://lmstudio.ai/`, load a model, enable the local server, then:

```bash
export CLAUDE_CODE_USE_LMSTUDIO=1
export LMSTUDIO_BASE_URL=http://localhost:1234/v1
export LMSTUDIO_MODEL=your-model-name

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

Open a new terminal so PATH changes load, then retry:

```bash
free-code --version
```

## Advanced Setup

Use [Advanced Setup](advanced-setup.md) for Codex, Copilot, Gemini, LiteLLM, provider profiles, diagnostics, and source build options.
