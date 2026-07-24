#!/bin/sh
# Nabooth Print Agent — one-line install / upgrade (Mac / Linux)
# curl -fsSL https://github.com/rayenking/nabooth-print-agent/raw/main/install.sh | sh
# Re-running stops any old agent, replaces the binary, then starts the new one.
set -eu

REPO="rayenking/nabooth-print-agent"
NAME="nabooth-print-agent"
PORT="${NABOOTH_PRINT_PORT:-17890}"
UI="http://127.0.0.1:${PORT}"

info() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$os" in
  darwin) goos=darwin ;;
  linux) goos=linux ;;
  *) die "unsupported OS: $os (use install.ps1 on Windows)" ;;
esac
case "$arch" in
  arm64|aarch64) goarch=arm64 ;;
  x86_64|amd64) goarch=amd64 ;;
  *) die "unsupported arch: $arch" ;;
esac

asset="${NAME}-${goos}-${goarch}"
info "Nabooth Print Agent install (${goos}/${goarch})"

# Prefer ~/.local/bin, else ~/bin
if [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
  BIN_DIR="$HOME/.local/bin"
elif mkdir -p "$HOME/bin" 2>/dev/null; then
  BIN_DIR="$HOME/bin"
else
  die "could not create install directory"
fi
BIN_PATH="${BIN_DIR}/${NAME}"

# Resolve latest release tag + download URL.
# Prefer HTML redirect for the tag (no JSON parse). API is fallback only.
# macOS/BSD sed cannot match GitHub's minified single-line release JSON.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
api="https://api.github.com/repos/${REPO}/releases/latest"
ua="nabooth-print-agent-install"

have_curl=0
have_wget=0
command -v curl >/dev/null 2>&1 && have_curl=1
command -v wget >/dev/null 2>&1 && have_wget=1
[ "$have_curl" -eq 1 ] || [ "$have_wget" -eq 1 ] || die "need curl or wget"

tag=""
download_url=""

# 1) Prefer GitHub HTML redirect for latest tag (works without JSON parse)
if [ "$have_curl" -eq 1 ]; then
  latest_url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" || true)
  tag=$(printf '%s\n' "$latest_url" | sed 's|.*/||')
  case "$tag" in
    latest|"") tag="" ;;
  esac
fi

# 2) Fallback: API + split minified JSON by commas before sed
json=""
if [ -z "$tag" ]; then
  if [ "$have_curl" -eq 1 ]; then
    json=$(curl -fsSL -H "User-Agent: ${ua}" "$api" || true)
  else
    json=$(wget -qO- --header="User-Agent: ${ua}" "$api" || true)
  fi
  if [ -n "${json:-}" ]; then
    tag=$(printf '%s' "$json" | tr ',' '\n' | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)
    download_url=$(printf '%s' "$json" | tr ',' '\n' | sed -n "s/.*\"browser_download_url\": *\"\\([^\"]*${asset}\\)\".*/\\1/p" | head -n1)
  fi
fi

# 3) Conventional release asset URL from resolved tag
if [ -z "$download_url" ] && [ -n "$tag" ]; then
  download_url="https://github.com/${REPO}/releases/download/${tag}/${asset}"
fi

if [ -z "$download_url" ]; then
  cat <<EOF
No release binary found for ${asset}.

Build from source (needs Go 1.22+):
  git clone https://github.com/${REPO}.git
  cd nabooth-print-agent/agent
  go build -o ${BIN_PATH} .
  ${BIN_PATH}

Or wait for a GitHub Release that includes agent binaries.
EOF
  exit 1
fi

info "Downloading ${download_url}"
if [ "$have_curl" -eq 1 ]; then
  curl -fL --progress-bar -o "${tmp}/${asset}" "$download_url" || die "download failed"
else
  wget -O "${tmp}/${asset}" "$download_url" || die "download failed"
fi

# Stop any running agent so the new binary actually serves after upgrade.
info "Stopping any running Print Agent…"
if [ "$goos" = "darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.nabooth.print-agent.plist"
  launchctl bootout "gui/$(id -u)/com.nabooth.print-agent" 2>/dev/null || true
  launchctl unload "$PLIST" 2>/dev/null || true
fi
pkill -f nabooth-print-agent 2>/dev/null || true
# Also kill by exact install path when possible (covers renamed/copied binaries).
if command -v pgrep >/dev/null 2>&1; then
  pgrep -f "$BIN_PATH" 2>/dev/null | while read -r pid; do
    kill "$pid" 2>/dev/null || true
  done || true
fi
sleep 0.5

install -m 755 "${tmp}/${asset}" "$BIN_PATH"
info "Installed → ${BIN_PATH}"

# Optional macOS LaunchAgent (keep-alive)
if [ "$goos" = "darwin" ] && [ "${NABOOTH_NO_LAUNCHAGENT:-}" != "1" ]; then
  LA_DIR="$HOME/Library/LaunchAgents"
  PLIST="$LA_DIR/com.nabooth.print-agent.plist"
  mkdir -p "$LA_DIR"
  cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.nabooth.print-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BIN_PATH}</string>
    <string>-open=false</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOME}/Library/Logs/nabooth-print-agent.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/Library/Logs/nabooth-print-agent.err.log</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/com.nabooth.print-agent" 2>/dev/null || true
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST" 2>/dev/null || true
  info "LaunchAgent: $PLIST"
fi

# Always ensure the new agent is up (old process was stopped above).
sleep 1
health_ok=0
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 2 "${UI}/api/health" >/dev/null 2>&1; then
    health_ok=1
  fi
fi
if [ "$health_ok" -ne 1 ]; then
  info "Starting agent…"
  nohup "$BIN_PATH" -open=true >/tmp/nabooth-print-agent.log 2>&1 &
  sleep 1
fi

# Open browser best-effort
if command -v open >/dev/null 2>&1; then
  open "$UI" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$UI" 2>/dev/null || true
fi

cat <<EOF

Nabooth Print Agent is ready.

  Control panel: ${UI}
  Binary:        ${BIN_PATH}

Next:
  1. Open ${UI}
  2. Log in with dashboard Print Agent credentials
  3. Pick your printer and leave this running
  4. Booth → Print with Nabooth

EOF
