#!/usr/bin/env python3
"""Re-classify every SHIPPED SF archive shelf — places AND payees — in place.

Why this exists rather than "just re-run the export": export_sf_places.py
rebuilds documents[] from the linkage cache, which resets published/summary_en
and destroys every OCR-grounded gloss (they live in scratchpad/sf_summaries,
which covers only the places summarised so far). This script touches nothing
but the classification fields, so it is safe to run on a published set:

    doc_type, doc_type_label, doc_tier, procedural, salient, group

It imports the SAME classifier the export uses (rank_documents), so there is
one rule, in one place, for both paths.

The archive presentation contract is one rule for every fiche type, so the payee
paper trails in dl_documents/payee-*.json get the same DOC_TYPES treatment as the
place shelves. Before this, half of every payee's visible rows were "Minutes",
"Journal of proceedings" and "Bid and contract opportunities" — exactly what the
contract forbids on a place fiche.

Usage:
  python pipeline/scripts/enrich/classify_sf_place_documents.py [--dry-run]
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "export"))

from export_sf_places import (  # noqa: E402
    curate_documents,
    DOC_TYPE_LABEL,
    PROCEDURAL_TIER,
    SHELF_SALIENT_CAP,
    rank_documents,
)

PLACES = ROOT / "website" / "public" / "data" / "us" / "sf" / "places"
DLDOCS = ROOT / "website" / "public" / "data" / "us" / "sf" / "dl_documents"
SKIP = {"index.json", "reverse_index.json", "places_in_progress.json"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    by_type: collections.Counter = collections.Counter()
    shown_by_type: collections.Counter = collections.Counter()
    n_files = n_docs = n_procedural = 0

    for f in sorted(PLACES.glob("*.json")):
        if f.name.startswith("_") or f.name in SKIP:
            continue
        fiche = json.loads(f.read_text())
        docs = fiche.get("documents") or []
        if not docs:
            continue
        # Glosses live on the document rows themselves — rank_documents only
        # sorts and stamps, it never rebuilds a row, so they survive.
        before_glosses = sum(1 for d in docs if d.get("gloss"))
        fiche["documents"] = rank_documents(docs)
        after_glosses = sum(1 for d in fiche["documents"] if d.get("gloss"))
        assert before_glosses == after_glosses, f"{f.name}: gloss loss"

        for d in fiche["documents"]:
            by_type[d["doc_type"]] += 1
            if d["salient"]:
                shown_by_type[d["doc_type"]] += 1
            n_docs += 1
            n_procedural += int(d["procedural"])
        n_files += 1
        if not args.dry_run:
            f.write_text(json.dumps(fiche, ensure_ascii=False, indent=2) + "\n")

    # ── Payee paper trails — same contract, same table ──────────────────────
    p_files = p_docs = p_proc = 0
    for f in sorted(DLDOCS.glob("payee-*.json")):
        blob = json.loads(f.read_text())
        docs = blob.get("documents") or []
        if not docs:
            continue
        before_glosses = sum(1 for d in docs if d.get("gloss"))
        # curate_documents, not rank_documents: payee trails were showing the
        # draft AND the final of the same report as two separate rows (Turner
        # Construction had both Yerba Buena EIRs). The place shelves have always
        # collapsed repeat editions to one row with an "N editions cited" note;
        # there is no reason a payee should not.
        blob["documents"] = curate_documents(docs)
        kept = {d["identifier"] for d in blob["documents"]}
        dropped = [d for d in docs if d["identifier"] not in kept and d.get("gloss")]
        assert not dropped, f"{f.name}: dedupe would drop a glossed row"
        for d in blob["documents"]:
            by_type[d["doc_type"]] += 1
            if d["salient"]:
                shown_by_type[d["doc_type"]] += 1
            p_docs += 1
            p_proc += int(d["procedural"])
        p_files += 1
        if not args.dry_run:
            f.write_text(json.dumps(blob, ensure_ascii=False, indent=1) + "\n")
    print(f"{p_files} payee trails · {p_docs} documents · {p_proc} procedural (never listed)")

    print(f"{n_files} fiches · {n_docs} documents · {n_procedural} procedural "
          f"(tier {PROCEDURAL_TIER}, never listed) · shelf cap {SHELF_SALIENT_CAP}")
    print(f"{'type':22} {'label':24} {'total':>6} {'shown':>6}")
    for k, n in by_type.most_common():
        print(f"  {k:20} {DOC_TYPE_LABEL.get(k, 'Record'):24} {n:6} {shown_by_type[k]:6}")
    if args.dry_run:
        print("\n(dry run — nothing written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
