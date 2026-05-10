# LiteLLM Setup

Free-Code can connect to LiteLLM through LiteLLM's OpenAI-compatible proxy.

## Overview

LiteLLM is an open-source LLM gateway that provides a unified API to many model providers. Run the LiteLLM Proxy, then point Free-Code at the proxy through the OpenAI-compatible provider path.

## Prerequisites

- LiteLLM installed: `pip install litellm[proxy]`
- `litellm_config.yaml` or equivalent LiteLLM configuration
- LiteLLM Proxy running on a local or remote port

## Start LiteLLM

Create `litellm_config.yaml`:

```yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude-sonnet-4
    litellm_params:
      model: anthropic/claude-sonnet-4-5-20250929
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: gemini-2.5-flash
    litellm_params:
      model: gemini/gemini-2.5-flash
      api_key: os.environ/GEMINI_API_KEY
```

Run proxy:

```bash
litellm --config litellm_config.yaml --port 4000
```

Default URL: `http://localhost:4000`.

## Connect Free-Code

### Environment

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:4000/v1
export OPENAI_API_KEY=<proxy-key-or-placeholder>
export OPENAI_MODEL=<litellm-model-alias>

free-code
```

`OPENAI_MODEL` must match a `model_name` alias in LiteLLM config. If local proxy auth is disabled, `OPENAI_API_KEY` may be omitted for manual env setup.

### Provider Wizard

1. Run `free-code`
2. Type `/provider`
3. Choose an OpenAI-compatible or custom endpoint option
4. Set base URL to `http://localhost:4000/v1`
5. Enter LiteLLM proxy key, or placeholder if guided flow requires one
6. Enter LiteLLM model alias
7. Save provider configuration

Provider wizard settings persist under Free-Code config storage (`.free-code/` for repo-local active writes).

## Master Key Example

```bash
litellm --config litellm_config.yaml --port 4000 --master_key sk-my-master-key

export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:4000/v1
export OPENAI_API_KEY=sk-my-master-key
export OPENAI_MODEL=gpt-4o

free-code
```

## Troubleshooting

| Issue | Likely Cause | Fix |
|---|---|---|
| 404 or model not found | Model alias missing | Verify `model_name` matches `OPENAI_MODEL` |
| Connection refused | LiteLLM proxy is not running | Start proxy with `litellm --config litellm_config.yaml --port 4000` |
| Auth failed | Missing or wrong master key | Set proxy key in `OPENAI_API_KEY` |
| Backend provider error | Provider key missing in LiteLLM process | Export provider API key before starting LiteLLM |
| Tools fail but chat works | Model has weak tool calling | Switch to a model with stronger tool support |

## Resources

- [LiteLLM Proxy Docs](https://docs.litellm.ai/docs/proxy/quick_start)
- [LiteLLM Provider List](https://docs.litellm.ai/docs/providers)
- [LiteLLM OpenAI-Compatible Endpoints](https://docs.litellm.ai/docs/proxy/openai_compatible_proxy)
