#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-workdata_codex0002}"
APP_PORT="${APP_PORT:-5062}"
APP_REPO="${APP_REPO:-https://github.com/peter-zx/workdata_codex0002.git}"
APP_BASE="${APP_BASE:-/opt/${APP_NAME}}"
DATA_DIR="${DATA_DIR:-/var/lib/${APP_NAME}}"
LOG_DIR="${LOG_DIR:-/var/log/${APP_NAME}}"
NODE_VERSION="${NODE_VERSION:-v22.15.0}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"

RELEASES_DIR="${APP_BASE}/releases"
CURRENT_LINK="${APP_BASE}/current"
NODE_DIR="${APP_BASE}/runtime/node"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
PREVIOUS_RELEASE=""

if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK")"
fi

mkdir -p "$RELEASES_DIR" "$DATA_DIR" "$LOG_DIR"
git -c http.version=HTTP/1.1 clone --depth=1 "$APP_REPO" "$RELEASE_DIR"
bash "${RELEASE_DIR}/deploy/ensure-node.sh" "$NODE_DIR" "$NODE_VERSION"
"${NODE_DIR}/bin/node" --check "${RELEASE_DIR}/src/server.js"
"${NODE_DIR}/bin/node" --check "${RELEASE_DIR}/public/app.js"

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
systemctl restart "$APP_NAME"
sleep 1

if ! systemctl is-active --quiet "$APP_NAME"; then
  if [[ -n "$PREVIOUS_RELEASE" ]]; then
    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
    systemctl restart "$APP_NAME"
  fi
  echo "Update failed; rolled back to previous release." >&2
  exit 1
fi

bash "${RELEASE_DIR}/deploy/prune-releases.sh" "$RELEASES_DIR" 5
echo "Updated to release ${RELEASE_ID}."
