#!/bin/bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────
PRIVATE_REPO="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_REPO_URL="git@github.com:Nuttux/france-open-data.git"
PUBLIC_CLONE_DIR="${PRIVATE_REPO}/../france-open-data"

# ─── Clone or update the public repo ────────────────────────────
if [ ! -d "$PUBLIC_CLONE_DIR" ]; then
  echo "Cloning public repo..."
  git clone "$PUBLIC_REPO_URL" "$PUBLIC_CLONE_DIR"
else
  echo "Updating public repo..."
  git -C "$PUBLIC_CLONE_DIR" pull --rebase origin main || true
fi

# ─── Sync pipeline ──────────────────────────────────────────────
echo "Syncing pipeline..."
rsync -av --delete \
  --exclude='.DS_Store' \
  --exclude='target/' \
  --exclude='logs/' \
  --exclude='.user.yml' \
  --exclude='dbt_packages/' \
  "${PRIVATE_REPO}/pipeline/" "${PUBLIC_CLONE_DIR}/pipeline/"

# ─── Sync visualization components ──────────────────────────────
echo "Syncing components..."
rsync -av --delete \
  --exclude='.DS_Store' \
  --exclude='Navbar.tsx' \
  --exclude='PageHeader.tsx' \
  --exclude='blog/' \
  "${PRIVATE_REPO}/website/src/components/" "${PUBLIC_CLONE_DIR}/components/"

# ─── Sync shared types/utils if they exist ───────────────────────
if [ -d "${PRIVATE_REPO}/website/src/lib" ]; then
  echo "Syncing lib/utils..."
  rsync -av --delete \
    --exclude='.DS_Store' \
    "${PRIVATE_REPO}/website/src/lib/" "${PUBLIC_CLONE_DIR}/lib/"
fi

# ─── Sync docs ───────────────────────────────────────────────────
echo "Syncing docs..."
rsync -av --delete \
  --exclude='.DS_Store' \
  "${PRIVATE_REPO}/docs/" "${PUBLIC_CLONE_DIR}/docs/"

# ─── Sync sample data (public JSON files) ────────────────────────
if [ -d "${PRIVATE_REPO}/website/public/data" ]; then
  echo "Syncing sample data..."
  rsync -av --delete \
    --exclude='.DS_Store' \
    "${PRIVATE_REPO}/website/public/data/" "${PUBLIC_CLONE_DIR}/data/"
fi

# ─── Commit and push ────────────────────────────────────────────
cd "$PUBLIC_CLONE_DIR"

if [ -z "$(git status --porcelain)" ]; then
  echo "No changes to sync."
  exit 0
fi

echo ""
echo "Changes to sync:"
git status --short
echo ""

read -p "Commit message (or 'skip' to abort): " MSG

if [ "$MSG" = "skip" ]; then
  echo "Aborted."
  exit 0
fi

git add -A
git commit -m "$MSG"
git push origin main

echo "Synced to public repo."
