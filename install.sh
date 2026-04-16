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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USE_LOCAL_SOURCE=0
INSTALL_DIR="$DEFAULT_INSTALL_DIR"

for arg in "$@"; do
  case "$arg" in
    --dev|-d) DEV=1 ;;
    *)
      fail "Unknown argument: $arg. Supported: --dev"
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

build_binary() {
  local binary_path label
  if [ "$DEV" -eq 1 ]; then
    binary_path="$INSTALL_DIR/cli-dev"
    label="Building free-code dev binary (all experimental features enabled)..."
  else
    binary_path="$INSTALL_DIR/cli"
    label="Building free-code standard binary..."
  fi

  info "$label"
  cd "$INSTALL_DIR"
  if [ "$DEV" -eq 1 ]; then
    bun run build:dev:full
  else
    bun run build
  fi
  ok "Binary built: $binary_path"
}

link_binary() {
  local link_dir="$HOME/.local/bin"
  local target_binary
  mkdir -p "$link_dir"

  if [ "$DEV" -eq 1 ]; then
    target_binary="$INSTALL_DIR/cli-dev"
  else
    target_binary="$INSTALL_DIR/cli"
  fi

  ln -sf "$target_binary" "$link_dir/free-code"
  ok "Symlinked: $link_dir/free-code"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$link_dir"; then
    warn "$link_dir is not on your PATH"
    echo ""
    printf "${YELLOW}  Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):${RESET}\n"
    printf "${BOLD}    export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}\n"
    echo ""
  fi
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
printf "  ${BOLD}gRPC dev helpers:${RESET}\n"
printf "    ${CYAN}bun run dev:grpc${RESET}\n"
printf "    ${CYAN}bun run dev:grpc:cli${RESET}\n"
echo ""
printf "  ${DIM}Provider notes:${RESET}\n"
printf "  ${DIM}  Profiles stay repo-local and avoid redoing shell env setup each launch.${RESET}\n"
printf "  ${DIM}  Use doctor:provider after switching auth, env, or provider targets.${RESET}\n"
printf "  ${DIM}  Use dev:profile for normal startup; use dev:grpc or dev:grpc:cli for transport testing.${RESET}\n"
echo ""
printf "  ${BOLD}Manual API key setup if needed:${RESET}\n"
printf "    ${CYAN}export OPENAI_API_KEY=\"sk-...\"${RESET}\n"
printf "    ${CYAN}export ANTHROPIC_API_KEY=\"sk-ant-...\"${RESET}\n"
echo ""
printf "  ${DIM}Source: $INSTALL_DIR${RESET}\n"
if [ "$DEV" -eq 1 ]; then
  printf "  ${DIM}Binary: $INSTALL_DIR/cli-dev${RESET}\n"
else
  printf "  ${DIM}Binary: $INSTALL_DIR/cli${RESET}\n"
fi
printf "  ${DIM}Link:   ~/.local/bin/free-code${RESET}\n"
echo ""
