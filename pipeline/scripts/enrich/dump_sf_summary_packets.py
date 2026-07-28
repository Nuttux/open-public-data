#!/usr/bin/env python3
"""Dump per-place grounding packets for the Block-C summary pass.

The summary written onto an SF place fiche must come from what the pulled
documents actually SAY — never from background knowledge about the place. This
script assembles, for every place that clears the pre-summary gate, one compact
packet holding exactly the material a summary may be built from:

  - identity: name, kind, owning department, address (from the reviewed seed)
  - money: the capital/permit/contract figures already computed upstream, with
    their measure labels intact (bond expended / contract paid / permit declared
    are never summed)
  - documents: title, year, archive pool and the OCR passages themselves

Nothing else. If a fact is not in the packet it does not go in the summary.

Output: one JSON per batch under the scratchpad, ~N places each, so the writing
pass can work through them without loading the whole corpus at once.

Usage:
    python pipeline/scripts/enrich/dump_sf_summary_packets.py --out DIR [--batch 8]
    python pipeline/scripts/enrich/dump_sf_summary_packets.py --out DIR --pending-only
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLACES = ROOT / "website" / "public" / "data" / "us" / "sf" / "places"
LINKAGE = ROOT / "pipeline" / "cache" / "ia_sf" / "linkage"

MAX_DOCS = 8
MAX_EXCERPT = 620          # chars per document kept in the packet
MAX_EXCERPTS_PER_DOC = 2


def load(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:  # noqa: BLE001
        return None


def money_block(fiche: dict) -> dict:
    cap = fiche.get("capital") or {}
    out = {}
    # Labels are carried through verbatim: a reader (and the summary) must be
    # able to tell "bond dollars expended" from "applicant-declared permit
    # value" — they are the same money in different ledgers and never add up.
    # The capital export calls the bond list "items" — reading "bond_items"
    # silently dropped every bond fact from the packets, so summaries written
    # from them could not mention voter-bond money at all.
    if cap.get("items"):
        out["bond_items"] = cap["items"][:6]
    if cap.get("bond_programs"):
        out["bond_programs"] = cap["bond_programs"]
    for key in ("payees_total_paid", "permits_declared_total", "bond_expended_total"):
        if cap.get(key):
            out[key] = cap[key]
    money = fiche.get("money") or {}
    if money.get("budget_line"):
        out["owning_dept_budget"] = money["budget_line"]
    if money.get("contracts"):
        out["named_contracts"] = [
            {"title": c.get("title"), "prime": c.get("prime"),
             "paid_usd": c.get("paid_usd"), "agreed_usd": c.get("agreed_usd")}
            for c in money["contracts"][:6]
        ]
    fac = fiche.get("facility") or {}
    if fac:
        out["facility"] = {k: fac.get(k) for k in
                           ("address", "tenure", "n_buildings", "gross_sq_ft",
                            "supervisor_district", "block_lots") if fac.get(k)}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--pending-only", action="store_true",
                    help="only places that clear the gate but have no summary yet")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    packets = []
    for fp in sorted(PLACES.glob("*.json")):
        if fp.stem.startswith("_"):
            continue
        fiche = load(fp)
        if not fiche:
            continue
        gate = fiche.get("_gate") or {}
        if not gate.get("meets_pre_summary"):
            continue
        if args.pending_only and fiche.get("summary_en"):
            continue

        link = load(LINKAGE / f"{fp.stem}.json") or {}
        by_id = {d["identifier"]: d for d in link.get("archive_docs", [])}

        docs = []
        for d in fiche.get("documents", [])[:MAX_DOCS]:
            src = by_id.get(d["identifier"], {})
            ex = (src.get("ocr_excerpts") or [])[:MAX_EXCERPTS_PER_DOC]
            docs.append({
                "identifier": d["identifier"],
                "title": d.get("title"),
                "year": d.get("year"),
                "creator": d.get("creator"),
                "pool": d.get("pool"),
                "source_label": d.get("source_label"),
                "ocr_excerpts": [e[:MAX_EXCERPT] for e in ex],
            })

        packets.append({
            "slug": fiche["slug"],
            "name": fiche["name"],
            "kind": fiche.get("kind"),
            "family": fiche.get("family"),
            "address": fiche.get("address"),
            "owning_dept": fiche.get("owning_dept"),
            "money": money_block(fiche),
            "documents": docs,
        })

    for i in range(0, len(packets), args.batch):
        chunk = packets[i:i + args.batch]
        n = i // args.batch + 1
        (out_dir / f"packet{n:02d}.json").write_text(
            json.dumps({"places": chunk}, indent=1, ensure_ascii=False))

    n_batches = (len(packets) + args.batch - 1) // args.batch
    print(f"{len(packets)} places need a summary → {n_batches} packets in {out_dir}")
    for p in packets:
        n_ex = sum(len(d["ocr_excerpts"]) for d in p["documents"])
        print(f"  {p['slug']:<44} docs={len(p['documents']):2} excerpts={n_ex:2}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
