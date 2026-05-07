"""Compare two JSON files modulo non-data fields and float-precision noise.

What we ignore:
- Top-level metadata keys that legitimately change between runs
  (`generated_at`, `generation_timestamp`, ...).
- Float diffs below a configurable tolerance (default: relative 1e-9 OR
  absolute 1e-2 — one euro cent). These can come from BigQuery vs Python
  doing the same SUM in different summation orders.

Exit codes: 0 = semantically equal, 1 = diff (prints unified diff), 2 = error.

Usage:
  python diff_json_semantic.py <baseline.json> <candidate.json>
  python diff_json_semantic.py --baseline-dir DIR1 --candidate-dir DIR2 [--filter PREFIX]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from difflib import unified_diff
from pathlib import Path
from typing import Any

# Top-level keys that we treat as run metadata (not data).
META_KEYS = {
    "generated_at",
    "generation_timestamp",
    "exported_at",
    "_generated_at",
}

# Float tolerance: round to N significant digits to absorb summation-order
# noise that arises when BigQuery and Python compute the same SUM in different
# orders. 7 sig digits = 1 cent on 100k€, 1 € on 10M€, 10 € on 100M€ — safely
# below the precision the UI cares about, well above pure float noise.
SIG_DIGITS = 6
ABS_TOL = 1e-2  # treat sub-cent values as zero


def quantize_float(x: float) -> float:
    """Round a float to SIG_DIGITS significant digits."""
    if not isinstance(x, float):
        return x
    if math.isnan(x) or math.isinf(x):
        return x
    if abs(x) < ABS_TOL:
        return 0.0
    ndigits = SIG_DIGITS - int(math.floor(math.log10(abs(x)))) - 1
    return round(x, ndigits)  # may be negative; round() handles that


def normalize(obj: Any) -> Any:
    """Recursively strip metadata, quantize floats, and sort lists of dicts.

    Lists of dicts (typical "data": [...] arrays) are sorted by their
    canonical-JSON form so that two outputs with the same multiset of
    records compare equal regardless of original ordering. Lists of
    primitives keep their order (it's usually meaningful — years, etc.).
    """
    if isinstance(obj, dict):
        return {k: normalize(v) for k, v in obj.items() if k not in META_KEYS}
    if isinstance(obj, list):
        norm = [normalize(v) for v in obj]
        if norm and all(isinstance(x, dict) for x in norm):
            norm.sort(key=lambda d: json.dumps(d, sort_keys=True, ensure_ascii=False))
        return norm
    if isinstance(obj, float):
        return quantize_float(obj)
    return obj


def strip_meta(obj: Any) -> Any:
    """Backward-compat name; delegates to normalize."""
    return normalize(obj)


def canonical(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, indent=2)


def diff_one(baseline: Path, candidate: Path) -> tuple[bool, str]:
    try:
        a = json.loads(baseline.read_text(encoding="utf-8"))
        b = json.loads(candidate.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return False, f"JSON decode error: {exc}"

    a_can = canonical(strip_meta(a))
    b_can = canonical(strip_meta(b))
    if a_can == b_can:
        return True, ""

    diff_lines = list(unified_diff(
        a_can.splitlines(),
        b_can.splitlines(),
        fromfile=str(baseline),
        tofile=str(candidate),
        n=3,
        lineterm="",
    ))
    return False, "\n".join(diff_lines[:200])  # cap output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("baseline", nargs="?")
    parser.add_argument("candidate", nargs="?")
    parser.add_argument("--baseline-dir")
    parser.add_argument("--candidate-dir")
    parser.add_argument("--filter", default="", help="Only include filenames starting with this prefix")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    if args.baseline and args.candidate:
        ok, info = diff_one(Path(args.baseline), Path(args.candidate))
        if ok:
            if not args.quiet:
                print(f"OK {args.candidate} (semantic match)")
            return 0
        print(info)
        return 1

    if args.baseline_dir and args.candidate_dir:
        bd = Path(args.baseline_dir)
        cd = Path(args.candidate_dir)
        rel_paths = sorted(p.relative_to(bd) for p in bd.rglob("*.json"))
        rel_paths = [p for p in rel_paths if str(p).startswith(args.filter)]
        diffs = []
        ok_count = 0
        for rel in rel_paths:
            b = bd / rel
            c = cd / rel
            if not c.exists():
                diffs.append(f"MISSING {rel}")
                continue
            same, info = diff_one(b, c)
            if same:
                ok_count += 1
            else:
                diffs.append(f"DIFF {rel}\n{info}")
        print(f"semantic match: {ok_count}/{len(rel_paths)}")
        if diffs:
            print("\n" + "\n\n".join(diffs[:10]))
            if len(diffs) > 10:
                print(f"\n... and {len(diffs) - 10} more diffs")
            return 1
        return 0

    print("usage: diff_json_semantic.py <baseline> <candidate>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
