#!/usr/bin/env bash
# Verify that an export script produces JSON byte-identical (modulo metadata)
# to the version checked in git.
#
# Usage:
#   verify_export.sh <export_script> [-- <script_args...>] <output_json> [<output_json2> ...]
#
# Anything before a literal `--` (after the script) is passed to the script;
# everything after is treated as JSON output paths to verify.
#
# Exit 0 = all outputs match git baseline (modulo `generated_at`).
# Exit 1 = at least one output differs.
#
# Side effect on success: outputs are restored to git state (so checksums
# stay clean for subsequent verifications).

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <export_script.py> [-- <script_args>] <output1.json> [output2.json …]" >&2
  exit 2
fi

SCRIPT="$1"
shift

SCRIPT_ARGS=()
if [[ "${1:-}" == "--" ]]; then
  shift
  while [[ $# -gt 0 && "$1" != *.json ]]; do
    SCRIPT_ARGS+=("$1")
    shift
  done
fi
OUTPUTS=("$@")

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

# En local : on s'appuie sur `gcloud auth application-default login` (ADC
# user-level). Dans CI : GOOGLE_APPLICATION_CREDENTIALS est positionné par
# google-github-actions/auth@v2 (WIF). On unset SEULEMENT si on n'est pas
# en CI pour éviter de masquer le token WIF.
if [[ -z "${GITHUB_ACTIONS:-}" ]]; then
  unset GOOGLE_APPLICATION_CREDENTIALS
fi
# Fichiers déjà modifiés AVANT nous : on ne les restaurera pas (travail local
# en cours). Tout ce que NOUS salissons en dehors des OUTPUTS sera remis.
DATA_REL="website/public/data"
dirty_before=$(git diff --name-only -- "$DATA_REL" | sort)

echo ">> running $SCRIPT ${SCRIPT_ARGS[*]:-}"
if [[ ${#SCRIPT_ARGS[@]} -eq 0 ]]; then
  python3 "$SCRIPT" >/dev/null
else
  python3 "$SCRIPT" "${SCRIPT_ARGS[@]}" >/dev/null
fi

# Les JSON committés ne sortent JAMAIS d'un export nu : export_all.py enchaîne
# obligatoirement apply_friendly_labels.py (libellés grand public, name_original)
# puis stamp_licenses.py (bloc `license` ODbL). Comparer un export nu au fichier
# committé, c'est comparer deux étapes différentes du pipeline — le job
# verify-exports de data-platform-audit a échoué sur exactement ça le 2026-09-09
# (« $.license only in expected »), la première fois qu'il a tourné avec BQ.
# Même correctif que check_export_parity.sh (étapes 2b/2c).
echo ">> post: friendly labels + licence stamps"
python3 pipeline/scripts/audit/apply_friendly_labels.py >/dev/null
python3 pipeline/scripts/export/stamp_licenses.py >/dev/null

restore_side_effects() {
  # Remet les fichiers que les post-étapes ont touchés en dehors des OUTPUTS,
  # sauf ceux qui étaient déjà modifiés avant l'appel.
  local f
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if ! grep -qxF "$f" <<<"$dirty_before" && ! printf '%s\n' "${OUTPUTS[@]}" | grep -qxF "$f"; then
      git checkout -- "$f" 2>/dev/null || true
    fi
  done < <(git diff --name-only -- "$DATA_REL")
}
trap restore_side_effects EXIT

DIFFER=0
for out in "${OUTPUTS[@]}"; do
  baseline=$(mktemp)
  git show "HEAD:$out" > "$baseline" 2>/dev/null || {
    echo "  ✗ $out has no git baseline (untracked?)"
    DIFFER=1
    rm -f "$baseline"
    continue
  }
  if python3 pipeline/scripts/audit/diff_json_semantic.py --quiet "$baseline" "$out" >/dev/null 2>&1; then
    echo "  ✓ $out (semantic match)"
    git checkout -- "$out" 2>/dev/null || true
  else
    echo "  ✗ $out (DIFFERS — see diff below)"
    python3 pipeline/scripts/audit/diff_json_semantic.py "$baseline" "$out" | head -40
    DIFFER=1
  fi
  rm -f "$baseline"
done

exit $DIFFER
