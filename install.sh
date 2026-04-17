#!/usr/bin/env bash
set -euo pipefail

# free-code installer
# Usage: curl -fsSL https://raw.githubusercontent.com/pfchrono/free-code/main/install.sh | bash
#        curl -fsSL https://raw.githubusercontent.com/pfchrono/free-code/main/install.sh | bash -s -- --dev

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

REPO="https://github.com/pfchrono/free-code.git"
DEFAULT_INSTALL_DIR="$HOME/free-code"
BUN_MIN_VERSION="1.3.11"
DEV=0
MCP=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USE_LOCAL_SOURCE=0
INSTALL_DIR="$DEFAULT_INSTALL_DIR"

for arg in "$@"; do
  case "$arg" in
    --dev|-d) DEV=1 ;;
    --mcp) MCP=1 ;;
    *)
      fail "Unknown argument: $arg. Supported: --dev, --mcp"
      ;;
  esac
done

if [ -f "$SCRIPT_DIR/package.json" ] && [ -f "$SCRIPT_DIR/scripts/build.ts" ]; then
  USE_LOCAL_SOURCE=1
  INSTALL_DIR="$SCRIPT_DIR"
fi

info()  { printf "${CYAN}[*]${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}[+]${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}[!]${RESET} %s\n" "$*"; }
fail()  { printf "${RED}[x]${RESET} %s\n" "$*"; exit 1; }

header() {
  echo ""
  printf "${BOLD}${CYAN}"
  cat << 'ART'
  ______                    ______          __
 / ____/_______  ___  ___  / ____/___  ____/ /__
/ /_  / ___/ _ \/ _ \/ _ \/ /   / __ \/ __  / _ \
/ __/ / /  /  __/  __/  __/ /___/ /_/ / /_/ /  __/
/_/   /_/   \___/\___/\___/\____/\____/\__,_/\___/

ART
  printf "${RESET}"
  printf "${DIM}  free-code installer for macOS/Linux${RESET}\n"
  printf "${DIM}  telemetry stripped | multi-provider | local-first${RESET}\n"
  echo ""
}

# -------------------------------------------------------------------
# System checks
# -------------------------------------------------------------------

check_os() {
  case "$(uname -s)" in
    Darwin) OS="macos" ;;
    Linux)  OS="linux" ;;
    *)      fail "Unsupported OS: $(uname -s). macOS or Linux required." ;;
  esac
  ok "OS: $(uname -s) $(uname -m)"
}

check_git() {
  if ! command -v git &>/dev/null; then
    fail "git is not installed. Install it first:
    macOS:  xcode-select --install
    Linux:  sudo apt install git  (or your distro's equivalent)"
  fi
  ok "git: $(git --version | head -1)"
}

# Compare semver: returns 0 if $1 >= $2
version_gte() {
  [ "$(printf '%s\n' "$1" "$2" | sort -V | head -1)" = "$2" ]
}

check_bun() {
  if command -v bun &>/dev/null; then
    local ver
    ver="$(bun --version 2>/dev/null || echo "0.0.0")"
    if version_gte "$ver" "$BUN_MIN_VERSION"; then
      ok "bun: v${ver}"
      return
    fi
    warn "bun v${ver} found but v${BUN_MIN_VERSION}+ required. Upgrading..."
  else
    info "bun not found. Installing..."
  fi
  install_bun
}

install_bun() {
  curl -fsSL https://bun.sh/install | bash
  # Source the updated profile so bun is on PATH for this session
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun &>/dev/null; then
    fail "bun installation succeeded but binary not found on PATH.
    Add this to your shell profile and restart:
      export PATH=\"\$HOME/.bun/bin:\$PATH\""
  fi
  ok "bun: v$(bun --version) (just installed)"
}

# -------------------------------------------------------------------
# Clone & build
# -------------------------------------------------------------------

clone_repo() {
  if [ "$USE_LOCAL_SOURCE" -eq 1 ]; then
    info "Using local checkout as install source..."
    ok "Source: $INSTALL_DIR"
    return
  fi

  if [ -d "$INSTALL_DIR" ]; then
    warn "$INSTALL_DIR already exists"
    if [ -d "$INSTALL_DIR/.git" ]; then
      info "Pulling latest changes..."
      git -C "$INSTALL_DIR" pull --ff-only origin main 2>/dev/null || {
        warn "Pull failed, continuing with existing copy"
      }
    fi
  else
    info "Cloning repository..."
    git clone --depth 1 "$REPO" "$INSTALL_DIR"
  fi
  ok "Source: $INSTALL_DIR"
}

install_deps() {
  info "Installing dependencies..."
  cd "$INSTALL_DIR"
  bun install --frozen-lockfile 2>/dev/null || bun install
  ok "Dependencies installed"
}

resolve_built_binary() {
  local candidates=()
  if [ "$DEV" -eq 1 ]; then
    candidates=(
      "$INSTALL_DIR/dist/cli-dev"
      "$INSTALL_DIR/dist/cli"
    )
  else
    candidates=(
      "$INSTALL_DIR/dist/cli"
    )
  fi

  for candidate in "${candidates[@]}"; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

build_binary() {
  local binary_path build_label build_script expected_binary
  if [ "$DEV" -eq 1 ]; then
    build_label="Building free-code dev binary (all experimental features enabled, no telemetry)..."
    build_script="compile:dev:full:no-telemetry"
    expected_binary="cli-dev"
  else
    build_label="Building free-code standard binary (no telemetry)..."
    build_script="compile:no-telemetry"
    expected_binary="cli"
  fi

  info "$build_label"
  cd "$INSTALL_DIR"
  bun run "$build_script"
  binary_path="$(resolve_built_binary)" || fail "Build completed but $expected_binary was not found in dist/."
  info "Verifying $binary_path for phone-home patterns..."
  bun run verify:no-phone-home -- "$binary_path"
  BUILT_BINARY="$binary_path"
  ok "Binary built: $binary_path"
}

link_binary() {
  local link_dir="$HOME/.local/bin"
  mkdir -p "$link_dir"

  ln -sf "$BUILT_BINARY" "$link_dir/free-code"
  ok "Symlinked: $link_dir/free-code"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$link_dir"; then
    warn "$link_dir is not on your PATH"
    echo ""
    printf "${YELLOW}  Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):${RESET}\n"
    printf "${BOLD}    export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}\n"
    echo ""
  fi
}

install_mcp_servers() {
  local npm_cmd mcp_workspace local_prefix code_summarizer_cmd token_monitor_cmd existing_servers
  info "Installing MCP servers..."

  npm_cmd="$(command -v npm || true)"
  if [ -z "$npm_cmd" ]; then
    fail "npm is required for MCP server installation.
    Install Node.js first:
      macOS:  brew install node
      Linux:  use your distro package manager for nodejs/npm"
  fi

  mcp_workspace="$INSTALL_DIR/mcp-servers"
  local_prefix="$HOME/.local"
  code_summarizer_cmd="$local_prefix/bin/code-summarizer"
  token_monitor_cmd="$local_prefix/bin/token-monitor"

  install_local_mcp_launcher() {
    local package_name="$1"
    local command_name="$2"
    local package_entry="$local_prefix/lib/node_modules/$package_name/build/index.js"

    if [ ! -f "$package_entry" ]; then
      warn "  Package entry for '$command_name' not found at '$package_entry'"
      return 1
    fi

    mkdir -p "$local_prefix/bin"
    cat >"$local_prefix/bin/$command_name" <<EOF
#!/usr/bin/env sh
exec node "$package_entry" "\$@"
EOF
    chmod +x "$local_prefix/bin/$command_name"
    ok "  Installed stable launcher: $local_prefix/bin/$command_name"
  }

  if [ -d "$mcp_workspace" ]; then
    info "Building local MCP servers from $mcp_workspace..."
    cd "$mcp_workspace"
    "$npm_cmd" install
    "$npm_cmd" run build
    "$npm_cmd" install --global --prefix "$local_prefix" --workspaces=false ./token-monitor
    "$npm_cmd" install --global --prefix "$local_prefix" --workspaces=false ./code-summarizer
    install_local_mcp_launcher "@free-code/mcp-token-monitor" "token-monitor"
    install_local_mcp_launcher "@free-code/mcp-code-summarizer" "code-summarizer"
  else
    warn "MCP workspace not found at $mcp_workspace. Skipping local MCP package install."
  fi

  existing_servers="$("$HOME/.local/bin/free-code" mcp list 2>&1 || true)"

  while IFS='|' read -r server_name server_cmd server_args; do
    [ -n "$server_name" ] || continue

    if printf '%s\n' "$existing_servers" | grep -Fqi "$server_name"; then
      ok "  MCP server '$server_name' already installed, skipping"
      continue
    fi

    if { [ "$server_name" = "code-summarizer" ] || [ "$server_name" = "token-monitor" ]; } && [ ! -x "$server_cmd" ]; then
      warn "  MCP server '$server_name' launcher not found at '$server_cmd'. Skipping."
      continue
    fi

    info "  Adding MCP server: $server_name"
    if [ -n "$server_args" ]; then
      if "$HOME/.local/bin/free-code" mcp add "$server_name" "$server_cmd" $server_args >/dev/null 2>&1; then
        ok "  MCP server '$server_name' added successfully"
      else
        warn "  MCP server '$server_name' failed. Skipping."
      fi
    else
      if "$HOME/.local/bin/free-code" mcp add "$server_name" "$server_cmd" >/dev/null 2>&1; then
        ok "  MCP server '$server_name' added successfully"
      else
        warn "  MCP server '$server_name' failed. Skipping."
      fi
    fi
  done <<EOF
MiniMax|uvx|minimax-coding-plan-mcp -y
codesight|npx|codesight --wiki --mcp --watch -hook
code-summarizer|$code_summarizer_cmd|
token-monitor|$token_monitor_cmd|
EOF

  ok "MCP server setup complete"
}

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------

header
info "Starting installation..."
echo ""

check_os
check_git
check_bun
if [ "$USE_LOCAL_SOURCE" -eq 1 ]; then
  warn "Local install script detected. Building and linking current checkout instead of cloning from GitHub."
fi
echo ""

clone_repo
install_deps
build_binary
link_binary
if [ "$MCP" -eq 1 ]; then
  install_mcp_servers
else
  info "Skipping MCP server install (pass --mcp to enable)."
fi

echo ""
printf "${GREEN}${BOLD}  Installation complete!${RESET}\n"
echo ""
printf "  ${BOLD}Run it:${RESET}\n"
if [ "$DEV" -eq 1 ]; then
  printf "    ${CYAN}free-code${RESET}                          # interactive REPL (dev/experimental build)\n"
else
  printf "    ${CYAN}free-code${RESET}                          # interactive REPL (standard build)\n"
fi
printf "    ${CYAN}free-code -p \"your prompt\"${RESET}          # one-shot mode\n"
echo ""
printf "  ${BOLD}Provider bootstrap:${RESET}\n"
printf "    ${CYAN}bun run profile:init${RESET}               # initialize repo-local provider profile\n"
printf "    ${CYAN}bun run profile:auto${RESET}               # auto-detect recommended provider\n"
printf "    ${CYAN}bun run doctor:provider${RESET}            # validate provider wiring and auth\n"
echo ""
printf "  ${BOLD}Launch from selected profile:${RESET}\n"
printf "    ${CYAN}bun run dev:profile${RESET}                # start using current repo profile\n"
printf "    ${CYAN}bun run dev:profile:auto${RESET}           # auto-pick launch profile\n"
echo ""
printf "  ${BOLD}Pick provider directly:${RESET}\n"
printf "    ${CYAN}bun run profile:codex${RESET}\n"
printf "    ${CYAN}bun run profile:openai${RESET}\n"
printf "    ${CYAN}bun run profile:copilot${RESET}\n"
printf "    ${CYAN}bun run profile:openrouter${RESET}\n"
printf "    ${CYAN}bun run profile:lmstudio${RESET}\n"
printf "    ${CYAN}bun run profile:zen${RESET}\n"
printf "    ${CYAN}bun run profile:minimax${RESET}\n"
printf "    ${CYAN}bun run profile:firstparty${RESET}\n"
echo ""
printf "  ${BOLD}Automation and transport testing:${RESET}\n"
printf "    ${CYAN}bun run dev:headless-transport${RESET}    # preferred automation/session transport\n"
printf "    ${CYAN}bun run test:headless-transport${RESET}   # baseline transport smoke test\n"
printf "    ${CYAN}bun run test:headless-integration${RESET} # shared harness integration smoke\n"
printf "    ${CYAN}bun run dev:grpc${RESET}                  # experimental/manual gRPC server\n"
printf "    ${CYAN}bun run dev:grpc:cli${RESET}              # experimental/manual gRPC client\n"
printf "    ${CYAN}bun run dev:grpc:stop${RESET}             # force-stop gRPC server + child tree\n"
echo ""
printf "  ${DIM}Provider notes:${RESET}\n"
printf "  ${DIM}  Profiles stay repo-local and avoid redoing shell env setup each launch.${RESET}\n"
printf "  ${DIM}  Use doctor:provider after switching auth, env, or provider targets.${RESET}\n"
printf "  ${DIM}  Use dev:profile for normal startup; use headless transport scripts for reliable automation.${RESET}\n"
printf "  ${DIM}  Treat gRPC helpers as experimental/manual-only and stop them when done to avoid rogue processes.${RESET}\n"
echo ""
printf "  ${BOLD}Manual API key setup if needed:${RESET}\n"
printf "    ${CYAN}export OPENAI_API_KEY=\"sk-...\"${RESET}\n"
printf "    ${CYAN}export ANTHROPIC_API_KEY=\"sk-ant-...\"${RESET}\n"
echo ""
printf "  ${BOLD}Optional MCP setup:${RESET}\n"
printf "    ${CYAN}./install.sh --mcp${RESET}                 # build and register bundled MCP servers\n"
echo ""
printf "  ${DIM}Source: $INSTALL_DIR${RESET}\n"
printf "  ${DIM}Binary: $BUILT_BINARY${RESET}\n"
printf "  ${DIM}Link:   ~/.local/bin/free-code${RESET}\n"
echo ""
