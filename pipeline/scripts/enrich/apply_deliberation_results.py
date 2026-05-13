#!/usr/bin/env python3
"""
Apply a ground-truth results JSON (produced in-session by Claude reading
the article bodies by hand) back into `session_<id>.json`.

Shape of the results JSON (list[dict]):
    [
      {"idx": 3, "beneficiary": "Fondation Charles de Gaulle",
       "amount_eur": 5000, "motif": "...", "siret": "...", "dossier": "..."},
      {"idx": 7, "is_admin": true, "_note": "article d'autorisation"},
      ...
    ]

Usage:
    python apply_deliberation_results.py --session 152 --results /tmp/gap_batches/results_000.json
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DELIBS_DIR = ROOT / "pipeline" / "cache" / "delibs" / "sessions"


def apply(session_id: int, results_paths: list[Path]) -> None:
    path = DELIBS_DIR / f"session_{session_id}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    articles = data["articles"]

    applied = filled = admin = 0
    for rp in results_paths:
        for rec in json.loads(rp.read_text(encoding="utf-8")):
            idx = rec.get("idx")
            if idx is None or idx >= len(articles):
                continue
            art = articles[idx]
            if rec.get("is_admin"):
                art["is_admin"] = True
                art["beneficiary"] = None
                art["amount_eur"] = None
                admin += 1
                continue
            if rec.get("beneficiary") and not art.get("beneficiary"):
                art["beneficiary"] = rec["beneficiary"]
                art["beneficiary_source"] = rec.get("_source", "manual")
                filled += 1
            if rec.get("amount_eur") is not None and not art.get("amount_eur"):
                try:
                    art["amount_eur"] = float(rec["amount_eur"])
                    art["amount_source"] = rec.get("_source", "manual")
                    filled += 1
                except (TypeError, ValueError):
                    pass
            if rec.get("siret") and not art.get("siret"):
                siret = re.sub(r"\D", "", str(rec["siret"]))
                if len(siret) == 14:
                    art["siret"] = siret
                    art["siret_source"] = rec.get("_source", "manual")
            if rec.get("motif") and not art.get("motif"):
                art["motif"] = rec["motif"][:280]
            if rec.get("dossier") and not art.get("dossier"):
                art["dossier"] = str(rec["dossier"])
            applied += 1
    data["applied_results_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    n = len(articles)
    wb = sum(1 for a in articles if a.get("beneficiary"))
    wa = sum(1 for a in articles if a.get("amount_eur"))
    ws = sum(1 for a in articles if a.get("siret"))
    print(
        f"Applied {applied} records ({filled} fields filled, {admin} articles marked admin)\n"
        f"Now: benef {wb}/{n}  amount {wa}/{n}  siret {ws}/{n}"
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", type=int, required=True)
    ap.add_argument("--results", type=Path, action="append", required=True,
                    help="Path to a results JSON (repeatable).")
    args = ap.parse_args()
    apply(args.session, args.results)


if __name__ == "__main__":
    main()
