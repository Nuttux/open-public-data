#!/usr/bin/env python3
"""
Stamp published JSON exports with the licence of the database they derive from.

Paris Open Data and Recife publish under ODbL, which is share-alike: a derived
database that we redistribute must itself be offered under ODbL and must carry
the notice. Our exports under website/public/data are exactly such derived
databases, so each object-shaped file gets a top-level `license` block naming
the licence, the required source attribution, and the share-alike obligation.

Buckets are resolved from the output path, mirroring _export_common.data_dir():
Paris writes flat (plus its topical subdirs), other cities write under <city>/.
Sources whose licence imposes no share-alike (French State: Licence Ouverte 2.0,
DataSF: PDDL) carry no obligation and are left alone unless --all is passed.

Run after an export pass; idempotent. Use --check in CI to fail on drift.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = _REPO_ROOT / "website" / "public" / "data"

ODBL = {
    "id": "ODbL-1.0",
    "url": "https://opendatacommons.org/licenses/odbl/1-0/",
    "share_alike": True,
    "notice": (
        "Derived database licensed under ODbL 1.0. Redistributing a database "
        "derived from this file requires releasing it under ODbL 1.0."
    ),
}

# Top-level directory under website/public/data -> licence block.
# Paris writes flat and into topical subdirs, so it is the default.
BUCKETS = {
    "us": None,          # DataSF — PDDL, public domain, no obligation
    "marseille": None,   # AMP Métropole — mostly Licence Ouverte 2.0; verify per dataset
    "br": {**ODBL, "attribution": "Prefeitura do Recife (Dados Abertos), sob licença ODbL"},
}
PARIS = {
    **ODBL,
    "attribution": (
        "Ville de Paris (Paris Open Data), sous licence ODbL; "
        "données d'État sous Licence Ouverte 2.0 (Etalab)"
    ),
}
PRODUCER = "Qipu (qipu.org) — derived database"


def bucket_for(path: Path):
    rel = path.relative_to(DATA_ROOT)
    top = rel.parts[0] if len(rel.parts) > 1 else None
    if top in BUCKETS:
        return BUCKETS[top]
    return PARIS


def stamp(path: Path, block: dict, check: bool) -> str:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return "unreadable"
    if not isinstance(payload, dict):
        return "skipped-list"
    desired = {**block, "producer": PRODUCER}
    if payload.get("license") == desired:
        return "ok"
    if check:
        return "would-change"
    payload["license"] = desired
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return "stamped"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    ap.add_argument("--all", action="store_true", help="include no-obligation buckets")
    args = ap.parse_args()

    counts: dict[str, int] = {}
    for path in sorted(DATA_ROOT.rglob("*.json")):
        block = bucket_for(path)
        if block is None and not args.all:
            counts["skipped-no-obligation"] = counts.get("skipped-no-obligation", 0) + 1
            continue
        if block is None:
            continue
        result = stamp(path, block, args.check)
        counts[result] = counts.get(result, 0) + 1

    for key in sorted(counts):
        print(f"  {key:<24} {counts[key]:>6}")
    if args.check and counts.get("would-change"):
        print("\nlicence stamps are stale — run stamp_licenses.py", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
