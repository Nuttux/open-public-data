#!/usr/bin/env python3
"""Sync ciblé Internet Archive — San Francisco municipal documents.

The SF analogue of sync_gallica_bmo.py. Internet Archive holds three pools
of SF government paper (verified 2026-07-20 via the FTS beta endpoint):

  - sanfranciscopubliclibrary : 14,588 SFPL scans — Municipal Reports
    (FY1859-60 → 1906-07), Board of Supervisors Journals, commission
    minutes, budget volumes. The motherlode. NOT formally inside
    collection:democracys-library — label it "IA's San Francisco Public
    Library partnership scans", never "Democracy's Library".
  - democracys-library : the formal collection; SF enters via UC Berkeley's
    Institute of Governmental Studies (~1,180 SF items, dense 1960s-90s).
  - (videos in openpublica-* are 2025+ only, no OCR — skipped here.)

For each demo entity (place aliases from the seed, SF departments, cleaned
top payees) this queries the FTS beta full-text endpoint per collection and
writes one cache JSON per entity: item identifier, title, creator, parsed
year, collection (pool), and the highlight snippet that is the evidence
quote. Raw only — editorial selection + LLM adjudication happen downstream
(link_sf_places.py). The `year` metadata field is systematically wrong for
serials (every Municipal Report reports 1860), so the year is parsed from
the title/identifier here.

The FTS endpoint is beta/undocumented: results are CACHED to disk and never
depended on at runtime. Rate-limited and resumable — reruns skip entities
whose cache file already exists unless --force.

Usage:
    python pipeline/scripts/sync/sync_ia_sf.py               # all entities
    python pipeline/scripts/sync/sync_ia_sf.py --kind places
    python pipeline/scripts/sync/sync_ia_sf.py --only golden-gate-park
    python pipeline/scripts/sync/sync_ia_sf.py --force
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
OUT_DIR = ROOT / "pipeline" / "cache" / "ia_sf"
SF_DATA = ROOT / "website" / "public" / "data" / "us" / "sf"

UA = {"User-Agent": "sf-open-data/0.1 (civic research; contact via qipu.org)"}
FTS = "https://archive.org/services/search/beta/page_production/"

# The two text pools worth searching, with the label doctrine attached.
POOLS = [
    ("sanfranciscopubliclibrary", "sfpl"),
    ("democracys-library", "dl"),
]

HITS_PER_PAGE = 15
SLEEP = 1.4  # polite gap between FTS calls

# SF departments worth an archive shelf (names that read well in old print).
DEPARTMENTS = [
    ("recreation-and-park", "Recreation and Park Department", "REC"),
    ("public-utilities-commission", "Public Utilities Commission", "PUC"),
    ("public-library", "San Francisco Public Library", "LIB"),
    ("public-health", "Department of Public Health", "DPH"),
    ("fire-department", "San Francisco Fire Department", "FIR"),
    ("police-department", "San Francisco Police Department", "POL"),
    ("port", "Port of San Francisco", "PRT"),
    ("municipal-railway", "Municipal Railway", "MTA"),
    ("public-works", "Department of Public Works", "DPW"),
    ("city-planning", "City Planning Commission", "CPC"),
    ("redevelopment-agency", "San Francisco Redevelopment Agency", "RED"),
    ("war-memorial", "War Memorial", "WAR"),
    ("hetch-hetchy", "Hetch Hetchy Water and Power", "PUC"),
    ("board-of-supervisors", "Board of Supervisors", "BOS"),
    ("controller", "Office of the Controller", "CON"),
]

# Query-noise suffixes stripped from raw ALL-CAPS payee strings.
PAYEE_SUFFIX = re.compile(
    r"\b(INC|INCORPORATED|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LP|L P|LLP|NA|N A|"
    r"PC|PLLC|LTD|THE|A CALIFORNIA|CALIFORNIA|A JOINT VENTURE|JOINT VENTURE|JV)\b",
    re.I,
)
# Payees that are banks / fiscal agents / pass-throughs — no archive value.
PAYEE_SKIP = re.compile(
    r"\b(BANK|TRUST|DEPOSITORY|MORGAN|WELLS FARGO|CITIBANK|U S BANK|US BANK|"
    r"MELLON|STATE STREET|INTERNAL REVENUE|FRANCHISE TAX|RETIREMENT SYSTEM|"
    r"PAYROLL|CALPERS|PERS)\b",
    re.I,
)

YEAR_RE = re.compile(r"\b(1[89]\d\d|20[0-2]\d)\b")
FY_RE = re.compile(r"\b(1[89]\d\d|20[0-2]\d)\s*[-–/]\s*\d")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_year(title: str, identifier: str, field_year) -> int | None:
    """Serial date metadata is wrong (all say 1860); parse from title first."""
    for text in (title or "", identifier or ""):
        m = FY_RE.search(text) or YEAR_RE.search(text)
        if m:
            y = int(m.group(1))
            if 1849 <= y <= 2027:
                return y
    if isinstance(field_year, int) and 1849 <= field_year <= 2027:
        # trust the field only when it is not the bogus serial default
        if field_year != 1860:
            return field_year
    return None


def norm_ws(s: str) -> str:
    """IA OCR snippets are double-spaced; collapse whitespace."""
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def clean_snippet(highlight) -> str:
    """First highlight fragment, whitespace-normalised, {{{match}}} kept as
    a clean «…» emphasis so downstream can show or strip it."""
    if not isinstance(highlight, dict):
        return ""
    texts = highlight.get("text") or []
    if not texts:
        return ""
    frag = norm_ws(texts[0])
    frag = frag.replace("{{{", "«").replace("}}}", "»")
    return frag[:280]


def fts(query: str, collection: str) -> dict:
    params = {
        "service_backend": "fts",
        "user_query": f'"{query}"',
        "filter_map": json.dumps({"collection": {collection: "inc"}}),
        "hits_per_page": str(HITS_PER_PAGE),
        "page": "1",
    }
    url = FTS + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001 — beta endpoint throttles in bursts
            wait = 3.0 * (attempt + 1)
            print(f"    retry {attempt+1} ({e}) in {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
    return {}


def query_entity(aliases: list[str]) -> dict:
    """Query every alias across both pools; dedupe items by identifier,
    keeping the best (longest) snippet and recording which alias matched."""
    items: dict[str, dict] = {}
    totals = {"sfpl": 0, "dl": 0}
    for alias in aliases:
        for collection, pool in POOLS:
            resp = fts(alias, collection)
            body = (resp.get("response") or {}).get("body") or {}
            hits = body.get("hits") or {}
            totals[pool] = max(totals[pool], hits.get("total", 0) or 0)
            for h in hits.get("hits") or []:
                f = h.get("fields") or {}
                ident = f.get("identifier")
                if not ident:
                    continue
                snip = clean_snippet(h.get("highlight"))
                title = f.get("title") or ident
                creator = f.get("creator")
                if isinstance(creator, list):
                    creator = creator[0] if creator else None
                rec = {
                    "identifier": ident,
                    "title": title,
                    "creator": creator,
                    "year": parse_year(title, ident, f.get("year")),
                    "pool": pool,
                    "collection": (f.get("collection") or [collection])[0],
                    "matched_alias": alias,
                    "snippet": snip,
                    "url": f"https://archive.org/details/{ident}",
                }
                prev = items.get(ident)
                if prev is None or len(snip) > len(prev.get("snippet") or ""):
                    rec_keep = rec if prev is None else {**prev, "snippet": snip}
                    items[ident] = rec_keep
            time.sleep(SLEEP)
    ordered = sorted(
        items.values(),
        key=lambda r: (r["pool"] != "sfpl", -(r["year"] or 0)),
    )
    return {"totals": totals, "n_items": len(ordered), "items": ordered}


def clean_payee(raw: str) -> str:
    s = re.sub(r"[.,]", " ", raw)
    s = PAYEE_SUFFIX.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.title()


def load_entities(kind_filter: str | None):
    seed = json.loads(SEED.read_text())
    entities = []
    if kind_filter in (None, "places"):
        for p in seed["places"]:
            entities.append(("places", p["slug"], p["aliases"]))
    if kind_filter in (None, "departments"):
        for slug, name, _code in DEPARTMENTS:
            entities.append(("departments", slug, [name]))
    if kind_filter in (None, "payees"):
        search = json.loads((SF_DATA / "payees_search.json").read_text())
        rows = sorted(search["data"], key=lambda r: -r["totalAmount"])
        n = 0
        for r in rows:
            raw = r["name"]
            if PAYEE_SKIP.search(raw):
                continue
            clean = clean_payee(raw)
            if len(clean) < 4:
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", clean.lower()).strip("-")[:60]
            entities.append(("payees", slug, [clean]))
            n += 1
            if n >= 50:
                break
    return entities


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["places", "departments", "payees"])
    ap.add_argument("--only", help="single slug")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    entities = load_entities(args.kind)
    if args.only:
        entities = [e for e in entities if e[1] == args.only]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    done = 0
    for kind, slug, aliases in entities:
        out = OUT_DIR / kind / f"{slug}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists() and not args.force:
            print(f"= skip {kind}/{slug} (cached)")
            continue
        print(f"→ {kind}/{slug} : {aliases}")
        res = query_entity(aliases)
        payload = {
            "generated_at": now_iso(),
            "source": "Internet Archive full-text (FTS beta) — SFPL partnership scans + Democracy's Library",
            "kind": kind,
            "slug": slug,
            "aliases": aliases,
            **res,
        }
        out.write_text(json.dumps(payload, indent=1, ensure_ascii=False))
        print(f"  ✓ {res['n_items']} items  (sfpl≈{res['totals']['sfpl']}, dl≈{res['totals']['dl']})")
        done += 1
    print(f"\nDone. {done} entities fetched, cache at {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
