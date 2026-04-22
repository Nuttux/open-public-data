#!/usr/bin/env python3
"""
Compare two results JSON for the same batch — used to validate that a
cheaper LLM (e.g. Haiku) produces extractions comparable to the
ground-truth (hand-crafted or a stronger model). Both files share the
same shape:

    [{"idx": 3, "beneficiary": "...", "amount_eur": 5000,
      "is_admin": false, ...}, ...]

Usage:
    python compare_deliberation_results.py \\
        --truth ../enrichment/deliberations_results/session_152_batch_000.json \\
        --candidate /tmp/haiku_batch_000.json

Reports:
    - is_admin agreement rate
    - beneficiary match (exact, case-insensitive, substring)
    - amount match (exact, ±5 % tolerance)
    - siret match (exact)
    - per-record diff for the mismatches
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def norm(s: str | None) -> str:
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def amount_close(a: float | None, b: float | None, tol: float = 0.05) -> bool:
    if a is None or b is None:
        return a == b
    if a == 0 or b == 0:
        return a == b
    return abs(a - b) / max(a, b) <= tol


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--truth", type=Path, required=True)
    ap.add_argument("--candidate", type=Path, required=True)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    truth = {r["idx"]: r for r in json.loads(args.truth.read_text(encoding="utf-8"))}
    cand = {r["idx"]: r for r in json.loads(args.candidate.read_text(encoding="utf-8"))}
    common = sorted(set(truth) & set(cand))
    print(f"Records: truth={len(truth)}  candidate={len(cand)}  common={len(common)}")

    admin_ok = 0
    benef_ok = benef_close = 0
    amount_ok = 0
    siret_ok = 0
    diffs: list[str] = []

    for idx in common:
        t = truth[idx]
        c = cand[idx]
        t_admin = bool(t.get("is_admin"))
        c_admin = bool(c.get("is_admin"))
        if t_admin == c_admin:
            admin_ok += 1
        else:
            diffs.append(f"  #{idx} admin: truth={t_admin} candidate={c_admin}")
            continue
        if t_admin:
            continue
        # Beneficiary comparison
        tn = norm(t.get("beneficiary"))
        cn = norm(c.get("beneficiary"))
        if tn and cn:
            if tn == cn:
                benef_ok += 1
                benef_close += 1
            elif tn in cn or cn in tn:
                benef_close += 1
                diffs.append(f"  #{idx} benef close: t={t['beneficiary']!r} c={c.get('beneficiary')!r}")
            else:
                diffs.append(f"  #{idx} benef diff : t={t['beneficiary']!r} c={c.get('beneficiary')!r}")
        elif not tn and not cn:
            benef_ok += 1
            benef_close += 1
        else:
            diffs.append(f"  #{idx} benef miss : t={t.get('beneficiary')!r} c={c.get('beneficiary')!r}")
        # Amount
        ta, ca = t.get("amount_eur"), c.get("amount_eur")
        if amount_close(ta, ca):
            amount_ok += 1
        else:
            diffs.append(f"  #{idx} amount diff: t={ta} c={ca}")
        # SIRET
        ts, cs = (t.get("siret") or "").strip(), (c.get("siret") or "").strip()
        if ts == cs:
            siret_ok += 1
        elif ts and cs and ts != cs:
            diffs.append(f"  #{idx} siret diff : t={ts} c={cs}")

    n = len(common)
    non_admin = sum(1 for idx in common if not truth[idx].get("is_admin"))
    print()
    print(f"Admin agreement: {admin_ok}/{n} = {admin_ok/n*100:.0f} %")
    print(f"Benef exact     : {benef_ok}/{non_admin} = {benef_ok/non_admin*100:.0f} %  (of non-admin)")
    print(f"Benef close     : {benef_close}/{non_admin} = {benef_close/non_admin*100:.0f} %")
    print(f"Amount ±5 %     : {amount_ok}/{non_admin} = {amount_ok/non_admin*100:.0f} %")
    print(f"SIRET exact     : {siret_ok}/{non_admin} = {siret_ok/non_admin*100:.0f} %")
    if args.verbose and diffs:
        print("\nDiffs:")
        for d in diffs[:30]:
            print(d)
        if len(diffs) > 30:
            print(f"  ... +{len(diffs)-30} more")


if __name__ == "__main__":
    main()
