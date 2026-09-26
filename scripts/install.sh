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

# Wings (same binary as desktop TerverPanel — own unit/config, never shared)
WINGS_REPO="${WINGS_REPO:-foxstudio-201/lunarspacewinglunar}"
WINGS_BIN="/usr/local/bin/wings"
WINGS_CONFIG_DIR="${WINGS_CONFIG_DIR:-/etc/terver-panel-wings}"
WINGS_CONFIG="$WINGS_CONFIG_DIR/config.yml"
WINGS_DATA="${WINGS_DATA:-/var/lib/terver/wings}"
WINGS_SERVICE="terver-panel-wings"
WINGS_API_PORT="${WINGS_API_PORT:-8080}"

# Isolated Docker instance (own unit/socket/data — never touches system or desktop Docker)
DOCKER_UNIT="terver-panel-docker"
DOCKER_SOCK="/run/terver-panel-docker/docker.sock"
DOCKER_DATA="${TERVER_DOCKER_DATA:-/var/lib/terver-panel-docker/data}"
DOCKER_HOST_URL="unix://$DOCKER_SOCK"

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

# ── 2. Docker (isolated instance — own unit/socket/data) ─────
if ! command -v docker >/dev/null 2>&1 || ! command -v dockerd >/dev/null 2>&1; then
  log "Docker not found — installing via system packages..."
  case "$PKG" in
    pacman)
      # Arch / CachyOS / Manjaro / EndeavourOS (get.docker.com does not support these)
      pacman -Sy --noconfirm --needed docker docker-buildx docker-compose || \
        pacman -S --noconfirm --needed docker docker-buildx docker-compose
      ;;
    apt)
      # Debian / Ubuntu / Mint etc. — official convenience script works
      if curl -fsSL https://get.docker.com/ | CHANNEL=stable bash; then
        :
      else
        apt-get install -y docker.io docker-buildx docker-compose-plugin || \
          apt-get install -y docker.io
      fi
      ;;
    dnf|yum)
      $PKG install -y docker docker-cli-compose || \
        { curl -fsSL https://get.docker.com/ | CHANNEL=stable bash; } || true
      ;;
    zypper)
      zypper --non-interactive install docker || true
      ;;
    apk)
      apk add docker docker-cli-compose || true
      ;;
    *)
      # last resort for unknown distros (Debian/Ubuntu/Fedora/RHEL)
      warn "Unknown package manager — trying get.docker.com..."
      curl -fsSL https://get.docker.com/ | CHANNEL=stable bash || true
      ;;
  esac
fi
if ! command -v dockerd >/dev/null 2>&1; then
  err "Docker install failed (PKG=$PKG). Install Docker manually then re-run."
  exit 1
fi
log "Docker: $(docker --version 2>/dev/null || echo 'check failed')"

DOCKERD_BIN="$(command -v dockerd)"
log "Writing isolated Docker unit ($DOCKER_UNIT)"
cat > "/etc/systemd/system/${DOCKER_UNIT}.service" <<EOF
[Unit]
Description=TerverPanel Web Docker Engine (isolated)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=notify
ExecStartPre=/bin/bash -c 'ip link show tpweb0 >/dev/null 2>&1 || { ip link add tpweb0 type bridge && ip addr add 172.21.0.1/16 dev tpweb0; }; ip link set tpweb0 up'
ExecStart=${DOCKERD_BIN} -H ${DOCKER_HOST_URL} --pidfile /run/terver-panel-docker/docker.pid --data-root ${DOCKER_DATA} --bridge=tpweb0 --default-address-pool=base=172.21.0.0/16,size=16
ExecReload=/bin/kill -s HUP \$MAINPID
Restart=on-failure
RestartSec=2
LimitNOFILE=1048576
RuntimeDirectory=terver-panel-docker
Delegate=yes
KillMode=process
OOMScoreAdjust=-500

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$DOCKER_UNIT" 2>/dev/null || true
sleep 1
if systemctl is-active --quiet "$DOCKER_UNIT" 2>/dev/null; then
  log "Isolated Docker is running ($DOCKER_SOCK)"
else
  warn "Isolated Docker not active — journalctl -u $DOCKER_UNIT"
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

# migrate legacy config dir (pre-rename installs)
if [[ -f /etc/lunarspace-wings/config.yml && ! -f "$WINGS_CONFIG" ]]; then
  log "Migrating legacy Wings config /etc/lunarspace-wings → $WINGS_CONFIG_DIR"
  mkdir -p "$WINGS_CONFIG_DIR"
  mv /etc/lunarspace-wings/config.yml "$WINGS_CONFIG"
  rmdir /etc/lunarspace-wings 2>/dev/null || true
fi

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
Description=TerverPanel Web Wings Daemon
After=network-online.target ${DOCKER_UNIT}.service
Requires=${DOCKER_UNIT}.service

[Service]
User=root
KillMode=process
LimitNOFILE=4096
PIDFile=/run/${WINGS_SERVICE}/daemon.pid
Environment=DOCKER_HOST=${DOCKER_HOST_URL}
ExecStartPre=/bin/bash -c 'for i in \$(seq 1 30); do [ -S ${DOCKER_SOCK} ] && exit 0; sleep 1; done; echo "Docker socket not ready"; exit 1'
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
After=network-online.target ${DOCKER_UNIT}.service
Wants=${DOCKER_UNIT}.service

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
Environment=PORT=$PORT
Environment=HOST=$HOST
Environment=NODE_ENV=production
Environment=TERVER_DATA_DIR=$APP_DATA
Environment=DOCKER_HOST=$DOCKER_HOST_URL
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
systemctl is-active --quiet "$DOCKER_UNIT" && docker_ok=1

IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")"

log "────────────────────────────────────────"
log "Docker:   $([[ $docker_ok -eq 1 ]] && echo "active (isolated: $DOCKER_SOCK)" || echo NOT active)"
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
