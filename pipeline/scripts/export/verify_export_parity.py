#!/usr/bin/env python3
"""
Tolerant parity check for exported JSON.

Export output is NOT byte-deterministic across runs: `generated_at` timestamps
change every run, and BigQuery float aggregation produces last-digit (ULP)
differences in summed amounts (observed e.g. 8707247518.399992 vs .399994). A
naive `git diff` therefore false-positives on every regeneration. This
comparator ignores volatile metadata keys and compares numbers within a
tolerance, so it flags a REAL change to a published number while absorbing
timestamp + float noise.

Complements verify_ods_parity.py (which is byte/fingerprint-exact — correct
there, because *raw ingestion* IS deterministic; *post-aggregation exports* are
not).

Usage:
    verify_export_parity.py EXPECTED ACTUAL [options]

EXPECTED / ACTUAL are either two .json files or two directories (compared
recursively on matching relative paths). Exit 0 = parity holds, 1 = real diff.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

# Volatile keys that legitimately change every run — never a parity failure.
DEFAULT_IGNORE_KEYS = {
    "generated_at",
    "_dbt_updated_at",
    "as_of",
    "export_timestamp",
    "source_pipeline",
}


def _is_number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def diff_json(a, b, rel, abs_, ignore, path="$", out=None):
    if out is None:
        out = []

    if _is_number(a) and _is_number(b):
        if not math.isclose(a, b, rel_tol=rel, abs_tol=abs_):
            out.append(f"{path}: {a} != {b}")
        return out

    if type(a) is not type(b):
        out.append(f"{path}: type {type(a).__name__} != {type(b).__name__} ({a!r} != {b!r})")
        return out

    if isinstance(a, dict):
        ka = {k for k in a if k not in ignore}
        kb = {k for k in b if k not in ignore}
        for k in sorted(ka - kb):
            out.append(f"{path}.{k}: only in expected")
        for k in sorted(kb - ka):
            out.append(f"{path}.{k}: only in actual")
        for k in sorted(ka & kb):
            diff_json(a[k], b[k], rel, abs_, ignore, f"{path}.{k}", out)
        return out

    if isinstance(a, list):
        if len(a) != len(b):
            out.append(f"{path}: length {len(a)} != {len(b)}")
            return out
        for i, (x, y) in enumerate(zip(a, b)):
            diff_json(x, y, rel, abs_, ignore, f"{path}[{i}]", out)
        return out

    if a != b:
        out.append(f"{path}: {a!r} != {b!r}")
    return out


def _load(p: Path):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def compare(expected: Path, actual: Path, rel: float, abs_: float, ignore: set[str]) -> list[str]:
    if expected.is_dir():
        exp_files = {p.relative_to(expected): p for p in expected.rglob("*.json")}
        act_files = {p.relative_to(actual): p for p in actual.rglob("*.json")}
        diffs: list[str] = []
        for rp in sorted(set(exp_files) - set(act_files)):
            diffs.append(f"{rp}: missing in actual")
        for rp in sorted(set(act_files) - set(exp_files)):
            diffs.append(f"{rp}: unexpected in actual")
        for rp in sorted(set(exp_files) & set(act_files)):
            for d in diff_json(_load(exp_files[rp]), _load(act_files[rp]), rel, abs_, ignore):
                diffs.append(f"{rp} :: {d}")
        return diffs
    return diff_json(_load(expected), _load(actual), rel, abs_, ignore)


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("expected", type=Path, help="baseline file or dir")
    ap.add_argument("actual", type=Path, help="freshly-regenerated file or dir")
    ap.add_argument("--float-rel", type=float, default=1e-6,
                    help="relative float tolerance (default 1e-6; float noise is ~1e-15)")
    ap.add_argument("--float-abs", type=float, default=1e-2,
                    help="absolute float tolerance (default 1e-2 = one cent)")
    ap.add_argument("--ignore-keys", default=",".join(sorted(DEFAULT_IGNORE_KEYS)),
                    help="comma-separated keys ignored at any depth")
    ap.add_argument("--max-report", type=int, default=50)
    args = ap.parse_args()

    ignore = {k.strip() for k in args.ignore_keys.split(",") if k.strip()}
    diffs = compare(args.expected, args.actual, args.float_rel, args.float_abs, ignore)

    if diffs:
        print(
            f"PARITY FAILED — {len(diffs)} material difference(s) "
            f"(ignoring {sorted(ignore)}; float rel={args.float_rel} abs={args.float_abs}):",
            file=sys.stderr,
        )
        for d in diffs[: args.max_report]:
            print(f"  {d}", file=sys.stderr)
        if len(diffs) > args.max_report:
            print(f"  … and {len(diffs) - args.max_report} more", file=sys.stderr)
        return 1

    print("PARITY OK — no material differences (timestamp + float noise absorbed).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
