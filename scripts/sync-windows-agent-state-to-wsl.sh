#!/usr/bin/env bash
set -euo pipefail

info() {
  printf '[*] %s\n' "$*"
}

ok() {
  printf '[+] %s\n' "$*"
}

warn() {
  printf '[!] %s\n' "$*"
}

fail() {
  printf '[x] %s\n' "$*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

resolve_windows_home() {
  if [ $# -gt 0 ] && [ -n "${1:-}" ]; then
    printf '%s\n' "$1"
    return 0
  fi

  if [ -n "${WINDOWS_HOME:-}" ]; then
    printf '%s\n' "$WINDOWS_HOME"
    return 0
  fi

  if command -v cmd.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
    local raw_home
    raw_home="$(cmd.exe /c "echo %UserProfile%" 2>/dev/null | tr -d '\r' | tail -n 1)"
    if [ -n "$raw_home" ]; then
      wslpath "$raw_home"
      return 0
    fi
  fi

  fail 'Could not resolve Windows home. Pass source path explicitly: ./scripts/sync-windows-agent-state-to-wsl.sh /mnt/c/Users/<windows-user>'
}

sync_file() {
  local src="$1"
  local dest="$2"

  if [ ! -f "$src" ]; then
    warn "Skip missing file: $src"
    return 0
  fi

  mkdir -p "$(dirname "$dest")"
  cp -f "$src" "$dest"
  ok "Copied file: $src -> $dest"
}

sync_dir() {
  local src="$1"
  local dest="$2"
  shift 2

  if [ ! -d "$src" ]; then
    warn "Skip missing dir: $src"
    return 0
  fi

  mkdir -p "$dest"
  rsync -a \
    --delete \
    --human-readable \
    --exclude='*.pid' \
    --exclude='*.sock' \
    --exclude='*.lock' \
    "$@" \
    "$src/" "$dest/"
  ok "Synced dir: $src -> $dest"
}

main() {
  require_cmd rsync
  require_cmd cp

  local windows_home
  windows_home="$(resolve_windows_home "${1:-}")"
  [ -d "$windows_home" ] || fail "Windows home not found: $windows_home"

  info "Windows home: $windows_home"
  info 'Close free-code / Claude / Codex on Windows before sync for best sqlite/session consistency.'

  mkdir -p "$HOME/.claude" "$HOME/.codex" "$HOME/.claude-code-router" "$HOME/.claude-mem"

  sync_file "$windows_home/.claude.json" "$HOME/.claude.json"

  # Free-Code / Claude compatibility namespace. Includes cache/debug/downloads/sessions/history by design.
  sync_dir "$windows_home/.claude" "$HOME/.claude"

  # Codex state, including cache/log/tmp/sandbox/sqlite/session state.
  sync_dir "$windows_home/.codex" "$HOME/.codex"

  # Router config useful for mirrored local provider routing.
  sync_dir "$windows_home/.claude-code-router" "$HOME/.claude-code-router" \
    --exclude='logs/'

  # Memory store. Keep database + settings; logs not usually needed.
  sync_dir "$windows_home/.claude-mem" "$HOME/.claude-mem" \
    --exclude='logs/'

  chmod 700 "$HOME/.claude" "$HOME/.codex" "$HOME/.claude-code-router" "$HOME/.claude-mem" 2>/dev/null || true
  chmod 600 "$HOME/.claude/.credentials.json" "$HOME/.codex/auth.json" "$HOME/.claude.json" 2>/dev/null || true

  echo ''
  ok 'Sync complete'
  printf '  Source: %s\n' "$windows_home"
  printf '  Dest:   %s\n' "$HOME"
  echo ''
  printf '  Verify:\n'
  printf '    ls -la ~/.claude ~/.codex ~/.claude-code-router ~/.claude-mem\n'
}

main "$@"
