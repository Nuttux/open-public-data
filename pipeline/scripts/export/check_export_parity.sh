#!/usr/bin/env bash
# Tolerant Paris export-parity gate.
#
# Proves a code change did NOT alter published Paris JSON beyond timestamp +
# BigQuery float-aggregation noise: snapshots the committed output, regenerates
# the given exports (--city paris), tolerant-compares (verify_export_parity.py),
# then restores the working tree.
#
# Requires BigQuery credentials (GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC).
# Usage: check_export_parity.sh [export_script.py ...]   # defaults to core set
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
DATA_REL="website/public/data"
EXPORT_DIR="$REPO/pipeline/scripts/export"
PY="${PYTHON:-python3}"

scripts=("$@")
if [ ${#scripts[@]} -eq 0 ]; then
  scripts=(
    export_sankey_data.py export_budget_nature.py export_subventions_data.py
    export_marches_data.py export_bilan_data.py export_hors_bilan.py
    export_evolution_data.py export_vote_vs_execute.py
  )
fi

# Refuse to run against a dirty data tree — we restore via `git checkout`, which
# would clobber any uncommitted output the user has staged for a real change.
if ! git -C "$REPO" diff --quiet -- "$DATA_REL"; then
  echo "✗ $DATA_REL has uncommitted changes; commit or stash them before the parity check." >&2
  exit 2
fi

BASELINE="$(mktemp -d)"
cleanup() { git -C "$REPO" checkout -- "$DATA_REL" 2>/dev/null || true; rm -rf "$BASELINE"; }
trap cleanup EXIT

# 1. Snapshot the committed baseline.
git -C "$REPO" archive HEAD "$DATA_REL" | tar -x -C "$BASELINE"

# 2. Regenerate the exports (Paris) into the live tree.
for s in "${scripts[@]}"; do
  echo "→ regenerating $s"
  "$PY" "$EXPORT_DIR/$s" --city paris
done

# 2b. Apply the grand-public label pass. The real pipeline (export_all.py) runs
# this as a mandatory post-step, so the committed JSON carries friendly labels +
# name_original. The gate must mirror it — otherwise every re-export reverts to
# raw M57 jargon and looks like a regression against the (friendly) baseline.
echo "→ applying friendly labels (post)"
"$PY" "$EXPORT_DIR/../audit/apply_friendly_labels.py"

# 3. Tolerant compare regenerated (live) vs committed baseline.
rc=0
"$PY" "$EXPORT_DIR/verify_export_parity.py" "$BASELINE/$DATA_REL" "$REPO/$DATA_REL" || rc=$?

# working tree restored by the EXIT trap
exit "$rc"
