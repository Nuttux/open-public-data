#!/usr/bin/env python3
"""Runner seed lieux : sync délibs (+BMO en option) pour chaque lieu du seed.

Lit pipeline/seeds/seed_lieux_v1.csv, saute les lieux dont le raw existe
déjà, enchaîne séquentiellement (les portails sont lents et on reste polis).
Usage :
    python pipeline/scripts/sync/run_lieux_seed.py --phase delibs
    python pipeline/scripts/sync/run_lieux_seed.py --phase bmo --priorite 1
"""
from __future__ import annotations
import argparse, csv, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=["delibs", "bmo"], required=True)
    ap.add_argument("--priorite", default=None, help="filtrer sur la colonne priorite")
    args = ap.parse_args()

    rows = list(csv.DictReader(SEED.open()))
    if args.priorite:
        rows = [r for r in rows if r["priorite"] == args.priorite]
    done = skipped = failed = 0
    for r in rows:
        slug = r["slug"]
        if args.phase == "delibs":
            out = CACHE / f"{slug}_delibs.jsonl"
            if out.exists() and out.stat().st_size > 0:
                skipped += 1
                continue
            cmd = [sys.executable, str(ROOT / "pipeline/scripts/sync/sync_debat_delibs.py"),
                   "--query", r["delib_query"], "--slug", slug,
                   "--phrase", r["title_phrase"]]
        else:
            if not r["bmo_query"]:
                skipped += 1
                continue
            out = CACHE / f"{slug}_bmo.jsonl"
            if out.exists() and out.stat().st_size > 0:
                skipped += 1
                continue
            cmd = [sys.executable, str(ROOT / "pipeline/scripts/sync/sync_gallica_bmo.py"),
                   "--query", r["bmo_query"], "--slug", slug]
        res = subprocess.run(cmd, capture_output=True, text=True)
        line = (res.stdout or res.stderr).strip().splitlines()
        print(f"[{args.phase}] {slug}: {line[-1] if line else 'rc=' + str(res.returncode)}", flush=True)
        done += 1 if res.returncode == 0 else 0
        failed += 1 if res.returncode != 0 else 0
    print(f"phase={args.phase} ok={done} skip={skipped} fail={failed}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
