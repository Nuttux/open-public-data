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
import re
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
SHELF_SALIENT_CAP = 6  # visible-without-expanding rows on the document shelf

# Document curation: every doc lands in exactly one narrative bucket so the
# shelf reads as a curated case file, not an identifier dump. Order here is
# the render order (most narratively useful first).
DOC_GROUPS: list[tuple[str, str, re.Pattern]] = [
    ("plans", "Plans & environmental review", re.compile(
        r"environmental impact|feasibility study|master plan|transition plan|"
        r"structure report|post occupancy|strategic plan", re.I)),
    ("history", "Histories & surveys", re.compile(
        r"\bhistory\b|guided tour|civic art collection|historic background|"
        r"survey of art|economic performance", re.I)),
    ("meetings", "Meetings & resolutions", re.compile(
        r"\bminutes\b|\bagenda\b|journal of proceedings|\bresolution\b", re.I)),
    ("reports", "Reports & records", re.compile(
        r"annual report|weekly bulletin|salary ordinance|report of the|"
        r"performance and efficiency|grand jury|cost.accounting", re.I)),
]
GROUP_WEIGHT = {"plans": 4, "history": 3, "reports": 2, "meetings": 1, "other": 1}

# Real name of the archive collection each department-shelf slug draws from —
# always the collection's own identity, never the (possibly-fallback) owning
# department's display name, so a substitute shelf (e.g. ADM -> city-planning,
# "nearest print-era shelf" per link_sf_places.py) is never mislabeled.
DEPT_ARCHIVE_LABEL = {
    "recreation-and-park": "Recreation & Park Department",
    "public-utilities-commission": "Public Utilities Commission",
    "public-library": "Public Library",
    "public-health": "Public Health",
    "fire-department": "Fire Department",
    "police-department": "Police Department",
    "port": "Port of San Francisco",
    "municipal-railway": "Municipal Railway (Muni)",
    "public-works": "Public Works",
    "war-memorial": "War Memorial & Performing Arts Center",
    "city-planning": "City Planning Department",
}
DEPT_SHELF_CAP = 3

# Mirrors link_sf_places.py's owning_dept_code -> archive-cache-slug map, so
# the fiche can name the REAL collection a dept_shelf item came from (a
# fallback slug, e.g. ADM -> city-planning, must never be labelled as if it
# were the owning department's own archive).
DEPT_ARCHIVE_SLUG = {
    "REC": "recreation-and-park", "PUC": "public-utilities-commission",
    "LIB": "public-library", "DPH": "public-health", "FIR": "fire-department",
    "POL": "police-department", "PRT": "port", "MTA": "municipal-railway",
    "DPW": "public-works", "WAR": "war-memorial", "ADM": "city-planning",
    "AAM": None, "FAM": None,
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(p: Path):
    return json.loads(p.read_text()) if p.exists() else None


def _title_stem(title: str) -> str:
    """Normalize a title down to its narrative stem so repeat editions of the
    same publication ('San Francisco water and power', 1979/1985/1999/2005...)
    collapse to one curated row instead of a wall of near-duplicates."""
    t = title.lower()
    t = re.sub(r"[:;,.\-–—()]", " ", t)
    t = re.sub(r"\b(draft|final|revised|summary|vol\.?\s*\w+|volume\s*\w+)\b", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def classify_doc(title: str) -> tuple[str, str]:
    for key, label, pat in DOC_GROUPS:
        if pat.search(title):
            return key, label
    return "other", "Other records"


def _ocr_richness(d: dict) -> int:
    """Total characters of OCR context pulled around the aliases — the salience
    signal that replaced snippet length. More real context = the document
    talks about this place more substantively, not just longer."""
    return sum(len(e) for e in (d.get("ocr_excerpts") or []))


def curate_documents(docs: list[dict]) -> list[dict]:
    """Dedupe repeat editions, classify into narrative groups, rank by
    salience within each group, and mark the top rows `salient` (shown
    without expanding) vs the rest (behind "see all"). Deterministic — no
    LLM call — so it is safe to re-run over every place, published or not."""
    # Dedupe: same title stem -> keep the richest single edition, note count.
    by_stem: dict[str, list[dict]] = {}
    for d in docs:
        by_stem.setdefault(_title_stem(d["title"]), []).append(d)

    kept: list[dict] = []
    for stem, group in by_stem.items():
        group.sort(key=lambda d: (_ocr_richness(d), d.get("year") or 0), reverse=True)
        best = dict(group[0])
        if len(group) > 1:
            years = sorted({d["year"] for d in group if d.get("year")})
            best["variant_note"] = (
                f"{len(group)} editions cited"
                + (f" ({years[0]}–{years[-1]})" if len(years) > 1 else "")
            )
        kept.append(best)

    for d in kept:
        key, label = classify_doc(d["title"])
        d["group"] = label
        d["_weight"] = GROUP_WEIGHT[key] * 10 + min(_ocr_richness(d) / 400, 5)
        d["_group_key"] = key

    group_order = [k for k, _, _ in DOC_GROUPS] + ["other"]
    kept.sort(key=lambda d: (group_order.index(d["_group_key"]), -d["_weight"]))

    for i, d in enumerate(kept):
        d["salient"] = i < SHELF_SALIENT_CAP
        del d["_weight"]
        del d["_group_key"]
    return kept


def assemble() -> int:
    seed = json.loads(SEED.read_text())
    by_slug = {p["slug"]: p for p in seed["places"]}
    credits = load(PLACES / "_photo_credits.json") or {}
    # Block 6A: structured facility identity per place (address/APN/ownership/
    # floor-area/building-count), written by export_sf_place_facilities.py from
    # the reviewed crosswalk. Absent → the fiche simply omits the identity block.
    facilities = (load(PLACES / "_facilities.json") or {}).get("places", {})
    # Block 6B+: unified capital & construction (bond/contract/permit/dpw),
    # no-sum. Absent → the fiche omits the capital section.
    capital = (load(PLACES / "_capital.json") or {}).get("places", {})
    PLACES.mkdir(parents=True, exist_ok=True)
    DLDOCS.mkdir(parents=True, exist_ok=True)

    gate = []
    for slug, pl in by_slug.items():
        link = load(LINKAGE / f"{slug}.json")
        if not link:
            gate.append({"slug": slug, "has_photo": slug in credits, "n_docs": 0,
                         "n_money": 0, "reason": "no linkage cache"})
            continue

        raw_docs = link.get("archive_docs", [])
        # If Block C already curated this place's shelf (dropped false-positive
        # matches), keep operating on that curated identifier set rather than
        # reverting to every raw linkage candidate on a routine re-run.
        prior = load(PLACES / f"{slug}.json")
        if prior and prior.get("documents"):
            keep_ids = {d["identifier"] for d in prior["documents"]}
            raw_docs = [d for d in raw_docs if d["identifier"] in keep_ids] or raw_docs

        docs = curate_documents([
            {**d, "source_label": POOL_LABEL.get(d["pool"], "Internet Archive")}
            for d in raw_docs
        ])

        dslug = DEPT_ARCHIVE_SLUG.get(pl["owning_dept_code"])
        dept_shelf_label = DEPT_ARCHIVE_LABEL.get(dslug, pl["owning_dept"])
        # A department-shelf item that's ALSO one of this place's matched
        # documents would otherwise appear twice — once as "names this place"
        # evidence, once as "general, not matched to this place" — which
        # directly contradicts itself. Exclude anything already on the shelf.
        doc_ids = {d["identifier"] for d in docs}
        dept_shelf_all = [d for d in link.get("dept_shelf", []) if d["identifier"] not in doc_ids]
        dept_shelf = dept_shelf_all[:DEPT_SHELF_CAP]
        dept_shelf_more = max(0, len(dept_shelf_all) - DEPT_SHELF_CAP)

        photo = credits.get(slug)
        money = {
            "budget_line": link.get("budget_line"),
            "payroll_line": link.get("payroll_line"),
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
            "facility": facilities.get(slug),   # 6A structured identity, or None
            "capital": capital.get(slug),        # 6B+ capital & construction, or None
            "photo": photo["photo"] if photo else None,
            "photo_credit": photo if photo else None,
            "summary_en": None,          # written in Block C, only from pulled material
            "published": False,           # flipped in Block C once gate is met
            "money": money,
            "documents": docs,
            "dept_shelf": dept_shelf,
            "dept_shelf_label": dept_shelf_label,
            "dept_shelf_more": dept_shelf_more,
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
