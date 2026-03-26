#!/usr/bin/env bash
# unbundle_public.sh — Restore the public/ folder from public.tar.gz (stored in Git LFS).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$REPO_ROOT/public.tar.gz"

if [ ! -f "$BUNDLE" ]; then
  echo "Error: public.tar.gz not found. Make sure Git LFS objects are fetched:"
  echo "  git lfs pull"
  exit 1
fi

echo "Extracting public.tar.gz → public/ ..."
tar -xzf "$BUNDLE" -C "$REPO_ROOT"
echo "Done."
