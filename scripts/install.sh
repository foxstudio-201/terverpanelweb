#!/usr/bin/env bash
# TerverPanel Web — one-line installer (Linux)
# Usage: curl -fsSL .../install.sh | sudo bash
set -euo pipefail

REPO="${TERVER_REPO:-https://github.com/foxstudio-201/terverpanelweb.git}"
INSTALL_DIR="${TERVER_DIR:-/opt/terver-panel}"
SERVICE_NAME="terver-panel"
PORT="${PORT:-8000}"
DATA_DIR="${HOME}/.config/.TerverPanel"

log() { printf '\033[1;32m[terver]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[terver]\033[0m %s\n' "$*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "Run as root: sudo bash install.sh"
  exit 1
fi

log "TerverPanel Web installer"

# --- Node.js ---
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 22..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm nodejs npm
  else
    err "Install Node.js 20+ manually then re-run"
    exit 1
  fi
fi
log "Node $(node -v)"

# --- Docker (host must have it for Wings) ---
if ! command -v docker >/dev/null 2>&1; then
  log "Docker not found — install from https://docs.docker.com/engine/install/ then re-run if Wings needs it"
fi

# --- Clone / update ---
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Updating $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only || true
else
  log "Cloning $REPO → $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# --- Deps + build ---
log "npm install (incl. build tools)..."
npm install
log "Building frontend..."
npm run build
# drop dev deps after build (keeps production lean)
npm prune --omit=dev || true

# --- Data dir ---
mkdir -p "$DATA_DIR"
chown -R "$(logname 2>/dev/null || echo root):$(logname 2>/dev/null || echo root)" "$DATA_DIR" 2>/dev/null || true

# --- systemd unit ---
UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
log "Writing $UNIT"
cat > "$UNIT" <<EOF
[Unit]
Description=TerverPanel Web (game server panel)
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
Environment=PORT=$PORT
Environment=HOST=0.0.0.0
Environment=NODE_ENV=production
ExecStart=$(command -v node) $INSTALL_DIR/server/index.js
Restart=on-failure
RestartSec=5
User=root
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME" || true

sleep 1
if systemctl is-active --quiet "$SERVICE_NAME"; then
  log "Service active."
else
  err "Service failed — journalctl -u $SERVICE_NAME -n 50"
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
log "Open: http://${IP}:${PORT}"
log "Create admin on first visit (OOBE)."
log "Wings must run on this host on :8080 and use the panel remote API."
log "Done."
