#!/usr/bin/env bash
# =============================================================================
# sync-public.sh — mirror the PUBLIC subset of this monorepo into a target dir.
#
# Whitelist-only: nothing is copied unless it is explicitly listed below, so a
# new private file can never leak by being forgotten. Produces a clean-slate
# tree (no git history) suitable for `git init` + single-commit publish to the
# public `qipu-pipeline` repository.
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

# Seeds are NOT copied wholesale. Reference data (constants, mappings, official
# transcriptions) and the frozen enrichment caches ship; editorial/enrichment
# OUTPUT does not — curated place pools, LLM-written glosses, verified archive
# quotes, lieux curation. That content is the product layer, and no dbt model
# reads it, so excluding it costs nothing in reproducibility. Pattern-based on
# purpose: a new content seed is excluded by default rather than leaking in.
SEED_EXCLUDE='(place|timeline|gloss|editorial|lieux|candidates)'

# --- Personal data ------------------------------------------------------------
# The subventions source mixes organisations with ~15k private individuals, so
# any beneficiary-keyed cache carries personal data into the public mirror.
#   * seed_cache_siret_by_name.csv is NOT shipped. It joins a beneficiary name
#     to a full legal name + SIRET + postcode + city (fetched from the annuaire
#     API) — new, identifying linkage about real people that does not exist in
#     the source. No dbt model reads it, so withholding it costs nothing.
#   * seed_cache_thematique_beneficiaires.csv IS read by the graph, so it ships
#     minus the rows the classifier itself marked as a natural person. Those
#     rows are 'Autre' anyway and resolve to the same value through the
#     downstream LEFT JOIN fallback, so published figures do not move.
SEED_PII_DROP='seed_cache_siret_by_name.csv'
PERSON_ROW='personne physique|nom de personne|particulier|^"?(M|MME|MLLE|MR|MONSIEUR|MADAME|MADEMOISELLE)[ .]'
THEMATIQUE_SEED='pipeline/seeds/seed_cache_thematique_beneficiaires.csv'

SKIPPED_SEEDS="$(mktemp)"
trap 'rm -f "$SKIPPED_SEEDS"' EXIT

# True if any model/test/macro/snapshot does ref('<name>').
seed_is_referenced() {
  grep -rqsE "ref\(\s*['\"]$1['\"]" \
    "$ROOT/pipeline/models" "$ROOT/pipeline/tests" \
    "$ROOT/pipeline/macros" "$ROOT/pipeline/snapshots"
}

copy_seeds() {
  echo "  dir  pipeline/seeds (filtered)"
  local kept=0 skipped=0 rel base name
  mkdir -p "$DEST/pipeline/seeds"
  : > "$SKIPPED_SEEDS"
  while IFS= read -r rel; do
    base="$(basename "$rel")"; name="${base%.*}"
    if [ "$base" = "$SEED_PII_DROP" ]; then
      echo "    skip (personal data) $rel"
      echo "pipeline/seeds/$rel" >> "$SKIPPED_SEEDS"
      skipped=$((skipped + 1)); continue
    fi
    # Editorial content is excluded — but never at the cost of the build. Some
    # seeds are named like content yet feed the graph (place->bond/contract
    # link tables, lieux match patterns): if a model reads it, it ships.
    if [[ "$base" =~ $SEED_EXCLUDE ]] && ! seed_is_referenced "$name"; then
      echo "    skip (editorial, unreferenced) $rel"
      echo "pipeline/seeds/$rel" >> "$SKIPPED_SEEDS"
      skipped=$((skipped + 1)); continue
    fi
    mkdir -p "$DEST/pipeline/seeds/$(dirname "$rel")"
    cp "$ROOT/pipeline/seeds/$rel" "$DEST/pipeline/seeds/$rel"
    kept=$((kept + 1))
  done < <(cd "$ROOT/pipeline/seeds" && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | sort)
  echo "    seeds kept=$kept skipped=$skipped"
}

# Drop rows about identifiable private individuals from the one beneficiary-keyed
# cache that does ship. Heuristic by nature (it trusts the classifier's own
# "personne physique" note plus civility titles), so it is a floor, not a proof.
scrub_person_rows() {
  local f="$DEST/$THEMATIQUE_SEED" before after
  [ -f "$f" ] || return 0
  before=$(($(wc -l < "$f") - 1))
  { head -1 "$f"; tail -n +2 "$f" | grep -ivE "$PERSON_ROW"; } > "$f.tmp"
  mv "$f.tmp" "$f"
  after=$(($(wc -l < "$f") - 1))
  echo "  scrub: thematique cache $before -> $after rows ($((before - after)) natural persons dropped)"
}

# --- Deterministic dbt backbone (models -> tests -> marts) --------------------
copy_dir  pipeline/models
copy_dir  pipeline/tests
copy_dir  pipeline/macros
copy_seeds                        # reference data + frozen caches; NOT editorial output
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

# --- Publish-time scrub: project contact, not personal contact ----------------
# dbt exposures carry a personal address in the private repo; the public tree
# gets the project one instead. perl (not sed -i) so this stays portable.
echo "→ scrub personal data..."
scrub_person_rows
find "$DEST" -type f \( -name '*.yml' -o -name '*.yaml' -o -name '*.sql' \
     -o -name '*.md' -o -name '*.py' \) -print0 \
  | xargs -0 perl -pi -e 's/danielshavit92\@gmail\.com/contact\@qipu.org/g'

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
if grep -rn "danielshavit92" "$DEST" 2>/dev/null; then
  echo "✗ LEAK: personal address survived the scrub. Aborting." >&2; exit 1
fi
if [ -e "$DEST/pipeline/seeds/$SEED_PII_DROP" ]; then
  echo "✗ LEAK: $SEED_PII_DROP (name->SIRET->address on individuals) in mirror. Aborting." >&2; exit 1
fi
if [ -f "$DEST/$THEMATIQUE_SEED" ] && \
   tail -n +2 "$DEST/$THEMATIQUE_SEED" | grep -iqE "$PERSON_ROW"; then
  echo "✗ LEAK: natural-person rows survived the scrub. Aborting." >&2; exit 1
fi
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  if [ -e "$DEST/$rel" ]; then
    echo "✗ LEAK: excluded editorial seed present: $rel. Aborting." >&2; exit 1
  fi
done < "$SKIPPED_SEEDS"
# SOFT WARN on cosmetic website/ path references (docstrings) — not a leak.
WEBREFS=$(grep -rn "website/" "$DEST/pipeline/scripts" 2>/dev/null | wc -l | tr -d ' ')
echo "✓ no private imports, no secrets. (website/ docstring refs: $WEBREFS — cosmetic)"
echo "  files: $(find "$DEST" -type f | wc -l | tr -d ' ')"
