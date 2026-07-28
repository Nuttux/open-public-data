#!/usr/bin/env bash
# =============================================================================
# sync-public.sh — mirror the PUBLIC subset of this monorepo into a target dir.
#
# Whitelist-only: nothing is copied unless it is explicitly listed below, so a
# new private file can never leak by being forgotten. Produces a clean-slate
# tree (no git history) suitable for `git init` + single-commit publish to the
# public `qipu-open-public-data-pipeline` repository.
#
# Usage:  scripts/public-mirror/sync-public.sh <target-dir>
# Example: scripts/public-mirror/sync-public.sh /tmp/qipu-public
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"                 # monorepo root
OVERLAY="$HERE/overlay"                           # public-only files to lay on top
DEST="${1:?usage: sync-public.sh <target-dir>}"

RSYNC_EXCLUDES=(--exclude '__pycache__' --exclude '*.pyc' --exclude 'target/' \
                --exclude 'logs/' --exclude 'dbt_packages/' --exclude '.DS_Store')

echo "→ source : $ROOT"
echo "→ target : $DEST"
rm -rf "$DEST"
mkdir -p "$DEST/pipeline/scripts"

copy_dir()  { echo "  dir  $1"; mkdir -p "$DEST/$1"; rsync -a "${RSYNC_EXCLUDES[@]}" "$ROOT/$1/" "$DEST/$1/"; }
copy_file() { echo "  file $1"; mkdir -p "$DEST/$(dirname "$1")"; cp "$ROOT/$1" "$DEST/$1"; }

# --- Deterministic dbt backbone (models -> tests -> marts) --------------------
copy_dir  pipeline/models
copy_dir  pipeline/tests
copy_dir  pipeline/macros
copy_dir  pipeline/seeds          # incl. 3 FROZEN enrichment-output cache seeds
copy_dir  pipeline/configs
copy_dir  pipeline/snapshots

# --- dbt project config (profiles.yml is oauth/env_var only, no creds) --------
copy_file pipeline/dbt_project.yml
copy_file pipeline/packages.yml
copy_file pipeline/package-lock.yml
copy_file pipeline/profiles.yml
copy_file pipeline/run_all.sh
copy_file pipeline/.env.example

# --- Source ingestion (provenance) + shared utils ----------------------------
# Ingestion scripts write to the raw BigQuery layer; their `website/` mentions
# are docstrings only (no hardcoded website output path in code).
copy_dir  pipeline/scripts/sync
copy_dir  pipeline/scripts/utils

# NOTE (v2 follow-up): the export layer (marts -> JSON) is intentionally NOT
# shipped yet. Those scripts hardcode `OUTPUT_DIR = .../website/public/data`,
# so they need a small refactor to an env-configurable output dir before they
# can run standalone. v1 stops at the marts, which are the reproduced figures
# (publicly queryable and comparable to the reference `dbt_paris_*` datasets).

# --- Public-only overlay (README, LICENSE, NOTICE, CI, .gitignore) -----------
echo "  overlay $OVERLAY -> $DEST"
rsync -a "$OVERLAY/" "$DEST/"

# --- Safety net --------------------------------------------------------------
# HARD FAIL on real leaks: imports of private modules, or secret-shaped strings.
echo "→ leak scan (hard: private imports / secrets)..."
if grep -rnE "^\s*(from|import)\s+.*(scripts\.)?(enrich|chat)\b" "$DEST/pipeline/scripts" 2>/dev/null; then
  echo "✗ LEAK: mirror imports a private module. Aborting." >&2; exit 1
fi
if grep -rnE "(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN|GCP_SA_KEY|xoxb-|ghp_)" \
     "$DEST" 2>/dev/null; then
  echo "✗ LEAK: secret-shaped string in mirror. Aborting." >&2; exit 1
fi
# SOFT WARN on cosmetic website/ path references (docstrings) — not a leak.
WEBREFS=$(grep -rn "website/" "$DEST/pipeline/scripts" 2>/dev/null | wc -l | tr -d ' ')
echo "✓ no private imports, no secrets. (website/ docstring refs: $WEBREFS — cosmetic)"
echo "  files: $(find "$DEST" -type f | wc -l | tr -d ' ')"
