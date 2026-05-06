#!/usr/bin/env bash
set -euo pipefail

RELEASES_DIR="${1:?releases dir required}"
KEEP="${2:-5}"

if [[ ! -d "$RELEASES_DIR" ]]; then
  exit 0
fi

mapfile -t releases < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r)
if (( ${#releases[@]} <= KEEP )); then
  exit 0
fi

for release in "${releases[@]:$KEEP}"; do
  rm -rf "$release"
done
