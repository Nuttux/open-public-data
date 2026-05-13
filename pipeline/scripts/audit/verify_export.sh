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

unset GOOGLE_APPLICATION_CREDENTIALS
echo ">> running $SCRIPT ${SCRIPT_ARGS[*]:-}"
if [[ ${#SCRIPT_ARGS[@]} -eq 0 ]]; then
  python3 "$SCRIPT" >/dev/null
else
  python3 "$SCRIPT" "${SCRIPT_ARGS[@]}" >/dev/null
fi

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
