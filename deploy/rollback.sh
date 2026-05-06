#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-workdata_codex0002}"
APP_BASE="${APP_BASE:-/opt/${APP_NAME}}"
RELEASES_DIR="${APP_BASE}/releases"
CURRENT_LINK="${APP_BASE}/current"

CURRENT_RELEASE=""
if [[ -L "$CURRENT_LINK" ]]; then
  CURRENT_RELEASE="$(readlink -f "$CURRENT_LINK")"
fi

mapfile -t releases < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r)
TARGET_RELEASE=""
for release in "${releases[@]}"; do
  if [[ "$release" != "$CURRENT_RELEASE" ]]; then
    TARGET_RELEASE="$release"
    break
  fi
done

if [[ -z "$TARGET_RELEASE" ]]; then
  echo "No previous release found." >&2
  exit 1
fi

ln -sfn "$TARGET_RELEASE" "$CURRENT_LINK"
systemctl restart "$APP_NAME"
echo "Rolled back to ${TARGET_RELEASE}."
