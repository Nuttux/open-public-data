#!/usr/bin/env bash
# Hydrate the PRIVATE enrichment seed-caches from the bucket into pipeline/seeds/
# before `dbt seed`. These are GENERATED OUTPUTS (LLM geocode/thematique, fuzzy
# SIRET/marché matching, curated lieux) — the moat. They are NOT committed.
#
# The enrichment METHOD stays open: the scripts under pipeline/scripts/enrich/
# and their prompts are in the repo. Only the generated caches are private.
# Trust-safe: anyone can see HOW we enrich; the outputs are our work-product.
#
# Auth: Application Default Credentials (gcloud auth application-default login,
# or a service account). Without credentials this fails loudly — self-host runs
# the enrich scripts to regenerate its own caches (see docs/data-buckets.md).
set -euo pipefail
BUCKET="${SITE_DATA_BUCKET:-qipu-site-data}"
DEST="$(cd "$(dirname "$0")/../../seeds" && pwd)"
echo "→ hydrating private enrichment seeds from gs://${BUCKET}/seeds-private → ${DEST}"
gcloud storage rsync "gs://${BUCKET}/seeds-private" "${DEST}"
echo "✓ private seeds hydrated (run before: dbt seed)"
