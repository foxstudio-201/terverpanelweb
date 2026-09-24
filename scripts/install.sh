#!/usr/bin/env bash
# TerverPanel Web — full installer (Docker + Wings + Panel)
# Usage: curl -fsSL .../install.sh | sudo bash
# Non-interactive: installs everything on a clean Linux host.
set -euo pipefail

REPO="${TERVER_REPO:-https://github.com/foxstudio-201/terverpanelweb.git}"
INSTALL_DIR="${TERVER_DIR:-/opt/terver-panel}"
SERVICE_NAME="terver-panel"
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

# Wings (same binary as desktop TerverPanel)
WINGS_REPO="${WINGS_REPO:-foxstudio-201/lunarspacewinglunar}"
WINGS_BIN="/usr/local/bin/wings"
WINGS_CONFIG_DIR="${WINGS_CONFIG_DIR:-/etc/lunarspace-wings}"
WINGS_CONFIG="$WINGS_CONFIG_DIR/config.yml"
WINGS_DATA="${WINGS_DATA:-/var/lib/terver/wings}"
WINGS_SERVICE="lunarspace-wings"
WINGS_API_PORT="${WINGS_API_PORT:-8080}"

# Panel data (token store shared by panel + wings config)
PANEL_HOME="${PANEL_HOME:-/root}"
TOKEN_DIR="$PANEL_HOME/.config/terver-panel"
TOKEN_STORE="$TOKEN_DIR/wings-api-token.json"
APP_DATA="${TERVER_DATA_DIR:-$PANEL_HOME/.config/.TerverPanel}"

log()  { printf '\033[1;32m[terver]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[terver]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[terver]\033[0m %s\n' "$*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "Run as root: sudo bash install.sh"
  exit 1
fi

command -v curl >/dev/null 2>&1 || { err "curl is required"; exit 1; }
command -v git  >/dev/null 2>&1 || { err "git is required"; exit 1; }

log "TerverPanel Web full installer (Docker + Wings + Panel)"

detect_pkg() {
  if command -v apt-get >/dev/null 2>&1; then echo apt
  elif command -v pacman >/dev/null 2>&1; then echo pacman
  elif command -v dnf >/dev/null 2>&1; then echo dnf
  elif command -v yum >/dev/null 2>&1; then echo yum
  else echo unknown
  fi
}
PKG="$(detect_pkg)"
log "Package manager: $PKG"

# ── 1. Node.js ──────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 22..."
  case "$PKG" in
    apt)
      apt-get update -y
      apt-get install -y ca-certificates curl gnupg
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get install -y nodejs
      ;;
    pacman)
      pacman -Sy --noconfirm nodejs npm
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
      $PKG install -y nodejs
      ;;
    *)
      err "Install Node.js 20+ manually then re-run"; exit 1
      ;;
  esac
fi
log "Node $(node -v)"

# ── 2. Docker ───────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Docker not found — installing via get.docker.com (stable)..."
  curl -fsSL https://get.docker.com/ | CHANNEL=stable bash
fi
log "Docker: $(docker --version 2>/dev/null || echo 'check failed')"

if ! systemctl is-active --quiet docker 2>/dev/null; then
  log "Starting Docker..."
  systemctl enable --now docker 2>/dev/null || true
  sleep 1
fi
if systemctl is-active --quiet docker 2>/dev/null; then
  log "Docker is running"
else
  warn "Docker not active — check: systemctl status docker"
fi

# ── 3. Clone / update panel ─────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Updating $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only || true
else
  log "Cloning $REPO → $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── 4. Wings API token (shared by panel + wings config) ─────
mkdir -p "$TOKEN_DIR" "$APP_DATA"
chmod 700 "$TOKEN_DIR" "$APP_DATA"

if [[ ! -f "$TOKEN_STORE" ]]; then
  TOKEN_ID="1"
  TOKEN="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32 | tr -d '\n')"
  cat > "$TOKEN_STORE" <<EOF
{"tokenId":"$TOKEN_ID","token":"$TOKEN"}
EOF
  chmod 600 "$TOKEN_STORE"
  log "Generated Wings API token → $TOKEN_STORE"
else
  log "Wings API token already exists → $TOKEN_STORE"
fi

TOKEN_ID="$(node -pe "JSON.parse(require('fs').readFileSync('$TOKEN_STORE','utf8')).tokenId||'1'" 2>/dev/null || echo 1)"
TOKEN="$(node -pe "JSON.parse(require('fs').readFileSync('$TOKEN_STORE','utf8')).token||''" 2>/dev/null || true)"
if [[ -z "$TOKEN" ]]; then
  err "Failed to read Wings API token"; exit 1
fi

# ── 5. Wings binary ─────────────────────────────────────────
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64)   WINGS_ARCH="x86_64" ;;
  aarch64|arm64)  WINGS_ARCH="aarch64" ;;
  armv7l)         WINGS_ARCH="armv7l" ;;
  *)              WINGS_ARCH="x86_64" ;;
esac

NEED_WINGS=1
if [[ -x "$WINGS_BIN" ]]; then
  log "Wings binary already present: $WINGS_BIN"
  "$WINGS_BIN" --version 2>/dev/null || true
  NEED_WINGS=0
fi

if [[ $NEED_WINGS -eq 1 ]]; then
  log "Downloading Wings ($WINGS_ARCH) from $WINGS_REPO..."
  WINGS_URL="https://github.com/${WINGS_REPO}/releases/latest/download/wings-rs-${WINGS_ARCH}-linux"
  TMP_WINGS="$(mktemp /tmp/wings-XXXXXX)"
  if curl -fL --retry 3 --connect-timeout 30 "$WINGS_URL" -o "$TMP_WINGS"; then
    SIZE="$(stat -c%s "$TMP_WINGS" 2>/dev/null || echo 0)"
    if [[ "$SIZE" -lt 1000000 ]]; then
      err "Wings download too small ($SIZE bytes)"; rm -f "$TMP_WINGS"; exit 1
    fi
    install -m 755 "$TMP_WINGS" "$WINGS_BIN"
    rm -f "$TMP_WINGS"
    log "Wings installed → $WINGS_BIN ($("$WINGS_BIN" --version 2>/dev/null || echo unknown))"
  else
    err "Failed to download Wings from $WINGS_URL"
    exit 1
  fi
fi

# ── 6. Wings config.yml ─────────────────────────────────────
mkdir -p "$WINGS_CONFIG_DIR" \
  "$WINGS_DATA/servers" "$WINGS_DATA/logs" "$WINGS_DATA/diffs" \
  "$WINGS_DATA/vmounts" "$WINGS_DATA/archives" "$WINGS_DATA/backups" "$WINGS_DATA/tmp"
chmod 755 "$WINGS_DATA" "$WINGS_DATA/servers" || true

WINGS_UUID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || openssl rand -hex 16)"
# Panel is on the same host; Wings pulls remote config from panel /api/remote
PANEL_REMOTE="http://127.0.0.1:${PORT}"

if [[ ! -f "$WINGS_CONFIG" || "${FORCE_WINGS_CONFIG:-0}" = "1" ]]; then
  log "Writing $WINGS_CONFIG"
  cat > "$WINGS_CONFIG" <<EOF
uuid: $WINGS_UUID
token_id: $TOKEN_ID
token: $TOKEN
remote: $PANEL_REMOTE
api:
  host: 0.0.0.0
  port: $WINGS_API_PORT
  ssl:
    enabled: false
  send_offline_server_logs: true
  websocket_log_count: 500
system:
  root_directory: $WINGS_DATA
  data: $WINGS_DATA/servers
  log_directory: $WINGS_DATA/logs
  diffs_directory: $WINGS_DATA/diffs
  vmount_directory: $WINGS_DATA/vmounts
  archive_directory: $WINGS_DATA/archives
  backup_directory: $WINGS_DATA/backups
  tmp_directory: $WINGS_DATA/tmp
  username: lunarspace
allowed_mounts:
  - /home
  - $WINGS_DATA/servers
docker:
  network:
    interface: wings0
    name: lunarspace-net
    mode: lunarspace-net
    subnet: 172.18.0.0/16
EOF
  chmod 600 "$WINGS_CONFIG"
else
  log "Wings config already exists (set FORCE_WINGS_CONFIG=1 to overwrite)"
fi

# ── 7. Wings systemd ────────────────────────────────────────
log "Writing /etc/systemd/system/${WINGS_SERVICE}.service"
cat > "/etc/systemd/system/${WINGS_SERVICE}.service" <<EOF
[Unit]
Description=LunarSpace Wings Daemon
After=network.target docker.service docker.socket
Wants=docker.socket

[Service]
User=root
KillMode=process
LimitNOFILE=4096
PIDFile=/run/${WINGS_SERVICE}/daemon.pid
ExecStartPre=/bin/bash -c 'for i in $(seq 1 30); do [ -S /run/docker.sock ] && exit 0; sleep 1; done; echo "Docker socket not ready"; exit 1'
ExecStart=${WINGS_BIN} --config ${WINGS_CONFIG}
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$WINGS_SERVICE" 2>/dev/null || true

# ── 8. Panel deps + build ───────────────────────────────────
log "npm install (incl. build tools)..."
npm install
log "Building frontend..."
npm run build
npm prune --omit=dev || true

# ── 9. Panel systemd ────────────────────────────────────────
mkdir -p "$APP_DATA"
NODE_BIN="$(command -v node)"
UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
log "Writing $UNIT"
cat > "$UNIT" <<EOF
[Unit]
Description=TerverPanel Web (game server panel)
After=network.target docker.service docker.socket
Wants=docker.socket

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
Environment=PORT=$PORT
Environment=HOST=$HOST
Environment=NODE_ENV=production
Environment=TERVER_DATA_DIR=$APP_DATA
ExecStart=$NODE_BIN $INSTALL_DIR/server/index.js
Restart=on-failure
RestartSec=5
User=root
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

# ── 10. Start services ──────────────────────────────────────
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME" || true
systemctl restart "$WINGS_SERVICE" || true

sleep 1

panel_ok=0
wings_ok=0
docker_ok=0
systemctl is-active --quiet "$SERVICE_NAME" && panel_ok=1
systemctl is-active --quiet "$WINGS_SERVICE" && wings_ok=1
systemctl is-active --quiet docker && docker_ok=1

IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")"

log "────────────────────────────────────────"
log "Docker:   $([[ $docker_ok -eq 1 ]] && echo active || echo NOT active)"
log "Wings:    $([[ $wings_ok -eq 1 ]] && echo active || echo NOT active)  (config: $WINGS_CONFIG)"
log "Panel:    $([[ $panel_ok -eq 1 ]] && echo active || echo failed)  → http://${IP}:${PORT}"
log "Token:    $TOKEN_STORE"
if [[ $panel_ok -ne 1 ]]; then
  err "Panel failed — journalctl -u $SERVICE_NAME -n 50"
fi
if [[ $wings_ok -ne 1 ]]; then
  err "Wings failed — journalctl -u $WINGS_SERVICE -n 50"
fi
log "Open http://${IP}:${PORT} → create admin (OOBE)."
log "Done."
