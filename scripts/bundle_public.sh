#!/usr/bin/env bash
# bundle_public.sh — Pack the public/ folder into public.tar.gz for Git LFS storage.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$REPO_ROOT/public.tar.gz"

echo "Bundling public/ → public.tar.gz ..."
tar -czf "$BUNDLE" -C "$REPO_ROOT" public/
echo "Done. $(du -sh "$BUNDLE" | cut -f1) written to public.tar.gz"
echo ""
echo "Stage and commit with:"
echo "  git add public.tar.gz && git commit -m 'chore: update public asset bundle'"
