#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-workdata_codex0002}"
APP_PORT="${APP_PORT:-5062}"
APP_BASE="${APP_BASE:-/opt/${APP_NAME}}"
DATA_DIR="${DATA_DIR:-/var/lib/${APP_NAME}}"
LOG_DIR="${LOG_DIR:-/var/log/${APP_NAME}}"
NODE_VERSION="${NODE_VERSION:-v22.15.0}"
ARCHIVE_PATH="${ARCHIVE_PATH:-/tmp/${APP_NAME}.tar.gz}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"

RELEASES_DIR="${APP_BASE}/releases"
CURRENT_LINK="${APP_BASE}/current"
RUNTIME_DIR="${APP_BASE}/runtime"
NODE_DIR="${RUNTIME_DIR}/node"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root." >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Archive not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl xz-utils

mkdir -p "$APP_BASE" "$RELEASES_DIR" "$RUNTIME_DIR" "$DATA_DIR" "$LOG_DIR"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR"

bash "${RELEASE_DIR}/deploy/ensure-node.sh" "$NODE_DIR" "$NODE_VERSION"

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Workdata Daily Log Tool
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${CURRENT_LINK}
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=${APP_PORT}
Environment=DATA_DIR=${DATA_DIR}
Environment=LOG_DIR=${LOG_DIR}
ExecStart=${NODE_DIR}/bin/node ${CURRENT_LINK}/src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
systemctl daemon-reload
systemctl enable --now "$APP_NAME"
systemctl restart "$APP_NAME"
bash "${RELEASE_DIR}/deploy/prune-releases.sh" "$RELEASES_DIR" 5

echo "Deployment finished."
echo "Release: ${RELEASE_ID}"
echo "Service: ${APP_NAME}"
echo "URL: http://123.56.100.146:${APP_PORT}"
systemctl --no-pager --full status "$APP_NAME"
