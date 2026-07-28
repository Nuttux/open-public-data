#!/usr/bin/env python3
"""Export the SF oversight-document index the assistant may point at.

Scope: the documents produced by the City's OWN oversight bodies — the
Controller's City Services Auditor, the Board of Supervisors' Budget Analyst,
the Civil Grand Jury, and named investigations. Their titles are written as
conclusions ("the Agency must improve staffing…", "the Forty Niners owe the
City…"), which is why a pointer is useful with no document text at all.

THE CONSTRAINT, ENFORCED HERE RATHER THAN IN A PROMPT
    This export deliberately carries NO OCR text — no excerpts, no snippets.
    OCR on these scans mangles numeric tables (a real row from the 1993
    overtime report reads "29,394324 ... 03% ... 23%"), so any figure lifted
    from one is unreliable. The assistant cannot quote a number from a scan
    because no scan text ever reaches it. Titles, authors, years and links
    only. Do not add an excerpt field to this file.

Labelling doctrine (non-negotiable): the SFPL pool is "Internet Archive —
San Francisco Public Library partnership scans". ONLY the `dl` pool may be
called Democracy's Library.

Usage:
  python pipeline/scripts/export/export_sf_oversight.py
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "ia_sf"
OUT = ROOT / "website" / "public" / "data" / "us" / "sf" / "oversight_documents.json"

POOL_LABEL = {
    "sfpl": "Internet Archive — San Francisco Public Library partnership scans",
    "dl": "Internet Archive — Democracy's Library",
}

# An oversight document is identified by its AUTHOR first — the body that
# produced it — and only then by title shape. Author is the stronger signal:
# "Annual report" is meaningless until you know the Budget Analyst wrote it.
OVERSIGHT_CREATORS = re.compile(
    r"city services auditor|office of the controller|budget analyst|"
    r"civil grand jury|grand jury|controller\b",
    re.I,
)
OVERSIGHT_TITLES = re.compile(
    r"\baudit\b|\bauditing\b|investigation of|performance review|"
    r"management letter|\bfindings\b|expenditures for",
    re.I,
)

# Coarse subject tags so a topical lookup ("overtime", "transit") reaches a
# document whose title words differ. Derived from title+creator only.
SUBJECTS: list[tuple[str, re.Pattern]] = [
    ("overtime & staffing", re.compile(r"overtime|staffing|personnel|workforce|operators", re.I)),
    ("transit", re.compile(r"transportation agency|municipal railway|transit|muni\b", re.I)),
    ("public health", re.compile(r"public health|hospital|laguna honda|health service", re.I)),
    ("parks & recreation", re.compile(r"recreation and park|park department|parks", re.I)),
    ("airport", re.compile(r"airport|aviation", re.I)),
    ("water & power", re.compile(r"public utilities|water|hetch|power", re.I)),
    ("housing & homelessness", re.compile(r"housing|homeless|shelter", re.I)),
    ("police & fire", re.compile(r"police|fire department|sheriff", re.I)),
    ("contracting", re.compile(r"contract|procurement|concession|vendor|supplier", re.I)),
]


def subjects_for(text: str) -> list[str]:
    return [name for name, rx in SUBJECTS if rx.search(text)]


def main() -> None:
    docs: dict[str, dict] = {}
    for path in sorted(CACHE.rglob("*.json")):
        payload = json.loads(path.read_text())
        if not isinstance(payload, dict):
            continue
        rows = payload.get("items") or payload.get("archive_docs") or []
        for item in rows:
            if not isinstance(item, dict):
                continue
            title = (item.get("title") or "").strip()
            creator = (item.get("creator") or "").strip()
            if not title:
                continue
            haystack = f"{title} {creator}"
            if not (OVERSIGHT_CREATORS.search(creator) or OVERSIGHT_TITLES.search(title)):
                continue
            identifier = item.get("identifier")
            pool = item.get("pool")
            if not identifier or pool not in POOL_LABEL:
                continue
            # Keep the richest record when a document appears under several
            # places (same identifier, differing metadata completeness).
            prior = docs.get(identifier)
            if prior and len(prior["creator"] or "") >= len(creator):
                continue
            docs[identifier] = {
                "identifier": identifier,
                "title": title,
                "creator": creator or None,
                "year": item.get("year"),
                "pool": pool,
                "source_label": POOL_LABEL[pool],
                "url": item.get("url") or f"https://archive.org/details/{identifier}",
                # Whether a CITY body wrote it, or an outside firm the City
                # hired. The model kept crediting consultant audits to the
                # Controller; a boolean removes the guesswork a creator
                # string invites.
                "is_city_oversight_body": bool(OVERSIGHT_CREATORS.search(creator)),
                "subjects": subjects_for(haystack),
            }

    rows = sorted(docs.values(), key=lambda d: (-(d["year"] or 0), d["title"]))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": "sync_ia_sf.py + fetch_ia_ocr.py → pipeline/cache/ia_sf → export_sf_oversight.py",
        "country": "us",
        "place": "sf",
        "perimeter": (
            "Documents by the City's own oversight bodies (Controller's City Services Auditor, "
            "Board of Supervisors' Budget Analyst, Civil Grand Jury) plus named investigations, "
            "as held by the Internet Archive. A pointer index, not a data source."
        ),
        "usage_constraint": (
            "POINT AT THESE DOCUMENTS ONLY. This file deliberately contains no document text: "
            "OCR on these scans mangles numeric tables, so no dollar figure, date or quantity "
            "may ever be attributed to one of them."
        ),
        "pool_labels": POOL_LABEL,
        "n_documents": len(rows),
        "documents": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n")

    by_pool: dict[str, int] = {}
    for r in rows:
        by_pool[r["pool"]] = by_pool.get(r["pool"], 0) + 1
    print(f"✓ {OUT.relative_to(ROOT)} — {len(rows)} documents {by_pool}")
    dated = sum(1 for r in rows if r["year"])
    print(f"  with a year: {dated}/{len(rows)}")


if __name__ == "__main__":
    main()
