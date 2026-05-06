#!/usr/bin/env bash
set -euo pipefail

NODE_DIR="${1:?node dir required}"
NODE_VERSION="${2:-v22.15.0}"

if [[ -x "${NODE_DIR}/bin/node" ]]; then
  exit 0
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "Unsupported CPU architecture: ${ARCH}" >&2; exit 1 ;;
esac

NODE_TARBALL="node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_TARBALL}" -o "${TMP_DIR}/${NODE_TARBALL}"
rm -rf "$NODE_DIR"
mkdir -p "$(dirname "$NODE_DIR")"
tar -xJf "${TMP_DIR}/${NODE_TARBALL}" -C "$TMP_DIR"
mv "${TMP_DIR}/node-${NODE_VERSION}-linux-${NODE_ARCH}" "$NODE_DIR"
