#!/usr/bin/env python3
"""Assemble SF place fiches and (in --finalize) the gated published index.

Two modes:

  default  — assemble one CANDIDATE fiche per seed place from the linkage
             candidates (link_sf_places.py), the photo credits
             (fetch_sf_place_photos.py) and the money exports. Emits:
               places/<slug>.json     (published:false, summary_en:null)
               dl_documents/<slug>.json  (the archive shelf, deep links)
               places/_gate_report.json  (per place: photo? docs? money?)
             The document source label honours the doctrine — SFPL scans are
             "Internet Archive — San Francisco Public Library partnership
             scans", only the Berkeley IGS pool is "Democracy's Library".

  --finalize — scan places/<slug>.json for the ones a human/LLM has completed
             (published:true, summary_en written in Block C) and build the
             publication-guarded outputs over the PUBLISHED set only:
               places/index.json          (map + list)
               places/reverse_index.json  (contract_no / dept → place)
               places/places_in_progress.json  (the daytime queue, w/ reasons)

Gate (Block C, enforced when a fiche is published): cleanly-licensed photo +
≥3 archive documents + ≥1 money link + a summary written only from pulled
material. This script never fabricates a summary or a geo claim.

Usage:
  python pipeline/scripts/export/export_sf_places.py
  python pipeline/scripts/export/export_sf_places.py --finalize
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
LINKAGE = ROOT / "pipeline" / "cache" / "ia_sf" / "linkage"
SF = ROOT / "website" / "public" / "data" / "us" / "sf"
PLACES = SF / "places"
DLDOCS = SF / "dl_documents"

POOL_LABEL = {
    "sfpl": "Internet Archive — San Francisco Public Library partnership scans",
    "dl": "Internet Archive — Democracy's Library",
}
GATE_MIN_DOCS = 3


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(p: Path):
    return json.loads(p.read_text()) if p.exists() else None


def assemble() -> int:
    seed = json.loads(SEED.read_text())
    by_slug = {p["slug"]: p for p in seed["places"]}
    credits = load(PLACES / "_photo_credits.json") or {}
    PLACES.mkdir(parents=True, exist_ok=True)
    DLDOCS.mkdir(parents=True, exist_ok=True)

    gate = []
    for slug, pl in by_slug.items():
        link = load(LINKAGE / f"{slug}.json")
        if not link:
            gate.append({"slug": slug, "has_photo": slug in credits, "n_docs": 0,
                         "n_money": 0, "reason": "no linkage cache"})
            continue

        docs = []
        for d in link.get("archive_docs", []):
            docs.append({**d, "source_label": POOL_LABEL.get(d["pool"], "Internet Archive")})

        photo = credits.get(slug)
        money = {
            "budget_line": link.get("budget_line"),
            "contracts": link.get("contracts", []),
            "grants": [],
        }
        n_money = (1 if money["budget_line"] else 0) + len(money["contracts"])

        fiche = {
            "generated_at": now_iso(),
            "source_pipeline": (
                "sf_place_candidates.json → sync_ia_sf.py + link_sf_places.py "
                "+ fetch_sf_place_photos.py → export_sf_places.py"
            ),
            "unit": "USD",
            "slug": slug,
            "name": pl["name"],
            "kind": pl["kind"],
            "family": pl["family"],
            "address": pl.get("address"),
            "lat": pl["lat"],
            "lon": pl["lon"],
            "owning_dept": {"name": pl["owning_dept"], "code": pl["owning_dept_code"]},
            "photo": photo["photo"] if photo else None,
            "photo_credit": photo if photo else None,
            "summary_en": None,          # written in Block C, only from pulled material
            "published": False,           # flipped in Block C once gate is met
            "money": money,
            "documents": docs,
            "dept_shelf": link.get("dept_shelf", []),
            "sources": [
                {"label": "City budget & payments", "note": "SF Controller open data (budget, vouchers, contracts)"},
                {"label": "Historical documents", "note": "Internet Archive — SFPL partnership scans + Democracy's Library"},
            ],
            "_gate": {
                "has_photo": bool(photo),
                "n_documents": len(docs),
                "n_money_links": n_money,
                "meets_pre_summary": bool(photo) and len(docs) >= GATE_MIN_DOCS and n_money >= 1,
            },
        }
        # Preserve an existing summary/published flag if Block C already wrote one.
        prior = load(PLACES / f"{slug}.json")
        if prior and prior.get("summary_en"):
            fiche["summary_en"] = prior["summary_en"]
            fiche["published"] = prior.get("published", False)

        (PLACES / f"{slug}.json").write_text(json.dumps(fiche, indent=1, ensure_ascii=False))

        # Document shelf as its own dl_documents artifact (deep links).
        (DLDOCS / f"{slug}.json").write_text(json.dumps({
            "generated_at": now_iso(),
            "slug": slug, "name": pl["name"],
            "note": "Archive documents linked to this place; source labels honour the SFPL-vs-Democracy's-Library distinction.",
            "documents": docs,
        }, indent=1, ensure_ascii=False))

        gate.append({
            "slug": slug, "name": pl["name"], "family": pl["family"],
            "has_photo": bool(photo), "n_docs": len(docs), "n_money": n_money,
            "meets_pre_summary": fiche["_gate"]["meets_pre_summary"],
        })

    (PLACES / "_gate_report.json").write_text(json.dumps({
        "generated_at": now_iso(), "places": gate,
    }, indent=1, ensure_ascii=False))

    ok = sum(1 for g in gate if g.get("meets_pre_summary"))
    print(f"Assembled {len(gate)} candidate place fiches.")
    print(f"{ok} meet photo + docs≥{GATE_MIN_DOCS} + money≥1 (pre-summary). Block C writes summaries + gates.")
    for g in sorted(gate, key=lambda x: (not x.get("meets_pre_summary"), -x.get("n_docs", 0))):
        flag = "OK " if g.get("meets_pre_summary") else "   "
        print(f"  {flag}{g['slug']:36} photo={int(g['has_photo'])} docs={g.get('n_docs',0):2} money={g.get('n_money',0)}")
    return 0


def finalize() -> int:
    pubs, in_progress = [], []
    for f in sorted(PLACES.glob("*.json")):
        if f.name.startswith("_") or f.name in ("index.json", "reverse_index.json", "places_in_progress.json"):
            continue
        d = load(f)
        if not d:
            continue
        g = d.get("_gate", {})
        published = bool(d.get("published") and d.get("summary_en") and g.get("has_photo")
                         and g.get("n_documents", 0) >= GATE_MIN_DOCS and g.get("n_money_links", 0) >= 1)
        if published:
            pubs.append(d)
        else:
            reasons = []
            if not g.get("has_photo"): reasons.append("no clean photo")
            if g.get("n_documents", 0) < GATE_MIN_DOCS: reasons.append(f"only {g.get('n_documents',0)} archive docs")
            if g.get("n_money_links", 0) < 1: reasons.append("no money link")
            if not d.get("summary_en"): reasons.append("no summary written")
            in_progress.append({"slug": d["slug"], "name": d["name"], "family": d.get("family"),
                                "has_photo": g.get("has_photo"), "n_documents": g.get("n_documents", 0),
                                "n_money_links": g.get("n_money_links", 0),
                                "reasons": reasons})

    # index (published only)
    index = {
        "generated_at": now_iso(),
        "unit": "USD",
        "count": len(pubs),
        "note": "Published SF places — each has a clean-licensed photo, ≥3 archive documents, ≥1 money link and a source-grounded summary.",
        "places": [{
            "slug": p["slug"], "name": p["name"], "kind": p["kind"], "family": p["family"],
            "lat": p["lat"], "lon": p["lon"], "photo": p["photo"],
            "owning_dept_code": p["owning_dept"]["code"],
            "n_documents": p["_gate"]["n_documents"],
            "n_contracts": len(p["money"]["contracts"]),
        } for p in sorted(pubs, key=lambda x: x["name"])],
    }
    PLACES.mkdir(parents=True, exist_ok=True)
    (PLACES / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False))

    # reverse index (published only) — the publication guard for chips
    by_contract, by_dept = {}, {}
    for p in pubs:
        code = p["owning_dept"]["code"]
        by_dept.setdefault(code, []).append(p["slug"])
        for c in p["money"]["contracts"]:
            by_contract[c["contract_no"]] = p["slug"]
    (PLACES / "reverse_index.json").write_text(json.dumps({
        "generated_at": now_iso(),
        "note": "Maps money entities to PUBLISHED places only (publication guard). A chip renders only if its target slug is in `places`.",
        "places": sorted(p["slug"] for p in pubs),
        "by_contract": by_contract,
        "by_dept": by_dept,
    }, indent=1, ensure_ascii=False))

    (PLACES / "places_in_progress.json").write_text(json.dumps({
        "generated_at": now_iso(),
        "count": len(in_progress),
        "note": "Daytime worklist — candidate places that did not clear the gate, with the reason.",
        "places": sorted(in_progress, key=lambda x: (len(x["reasons"]), x["slug"])),
    }, indent=1, ensure_ascii=False))

    print(f"Finalized: {len(pubs)} published, {len(in_progress)} in progress.")
    print(f"  reverse index: {len(by_contract)} contracts, {len(by_dept)} departments → places")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--finalize", action="store_true")
    args = ap.parse_args()
    return finalize() if args.finalize else assemble()


if __name__ == "__main__":
    raise SystemExit(main())
