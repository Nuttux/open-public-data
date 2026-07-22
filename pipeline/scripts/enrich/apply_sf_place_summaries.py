#!/usr/bin/env python3
"""Apply Block-C grounded summaries + document curation to place fiches.

Reads the batch files written by the summary subagents (scratchpad/sf_summaries/
batch*.json), and for each place: sets summary_en, filters documents[] to the
curated keep-list, and flips published=true. Then export_sf_places.py --finalize
builds the published index + reverse index + in-progress queue.

A place is only published if it has a summary AND still clears the gate after
curation (photo + ≥3 kept docs + ≥1 money link). If curation drops it below 3
docs, it stays unpublished (logged).

Usage: python pipeline/scripts/enrich/apply_sf_place_summaries.py --dir <scratchpad/sf_summaries>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLACES = ROOT / "website" / "public" / "data" / "us" / "sf" / "places"
DLDOCS = ROOT / "website" / "public" / "data" / "us" / "sf" / "dl_documents"
GATE_MIN_DOCS = 3


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    args = ap.parse_args()
    d = Path(args.dir)

    merged: dict[str, dict] = {}
    for f in sorted(d.glob("batch*.json")):
        merged.update(json.loads(f.read_text()))
    print(f"Loaded {len(merged)} place summaries from {d}")

    published, skipped = [], []
    for slug, res in merged.items():
        fpath = PLACES / f"{slug}.json"
        if not fpath.exists():
            skipped.append((slug, "no fiche")); continue
        fiche = json.loads(fpath.read_text())
        summary = (res.get("summary_en") or "").strip()
        keep = set(res.get("keep") or [])
        glosses = res.get("glosses") or {}
        if keep:
            fiche["documents"] = [x for x in fiche["documents"] if x["identifier"] in keep]
        # Attach the OCR-grounded one-line gloss to each kept document (what the
        # scan actually shows about this place), replacing the old raw snippet,
        # then drop the raw OCR passages: they fed the summary + gloss and do
        # not belong in the shipped fiche (récit visible, raw OCR out of flow).
        for x in fiche["documents"]:
            g = (glosses.get(x["identifier"]) or "").strip()
            if g:
                x["gloss"] = g
            x.pop("ocr_excerpts", None)
        n_docs = len(fiche["documents"])
        g = fiche.get("_gate", {})
        n_money = g.get("n_money_links", 0)
        has_photo = g.get("has_photo", False)
        # refresh gate doc count after curation
        fiche["_gate"]["n_documents"] = n_docs
        if summary and has_photo and n_docs >= GATE_MIN_DOCS and n_money >= 1:
            fiche["summary_en"] = summary
            fiche["published"] = True
            published.append(slug)
        else:
            reasons = []
            if not summary: reasons.append("no summary")
            if not has_photo: reasons.append("no photo")
            if n_docs < GATE_MIN_DOCS: reasons.append(f"only {n_docs} docs after curation")
            if n_money < 1: reasons.append("no money")
            skipped.append((slug, ", ".join(reasons)))
        fpath.write_text(json.dumps(fiche, indent=1, ensure_ascii=False))
        # keep dl_documents shelf in sync with the curated set
        dl = DLDOCS / f"{slug}.json"
        if dl.exists() and keep:
            doc = json.loads(dl.read_text())
            doc["documents"] = [x for x in doc.get("documents", []) if x["identifier"] in keep]
            for x in doc["documents"]:
                g = (glosses.get(x["identifier"]) or "").strip()
                if g:
                    x["gloss"] = g
                x.pop("ocr_excerpts", None)
            dl.write_text(json.dumps(doc, indent=1, ensure_ascii=False))

    print(f"\nPublished {len(published)} places:")
    for s in published:
        print(f"  ✓ {s}")
    if skipped:
        print(f"\nHeld back {len(skipped)}:")
        for s, why in skipped:
            print(f"  … {s}: {why}")
    print("\nNext: python pipeline/scripts/export/export_sf_places.py --finalize")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
