#!/usr/bin/env python3
"""Emit archive paper-trails for normalized SF payees (Block D).

Joins the Internet Archive payee cache (sync_ia_sf.py --kind payees) to the
normalized payees (normalize_sf_payees.py) by matching name-core, and writes
one dl_documents/payee-<slug>.json per matched payee: the bid bulletins,
commission agendas and bond documents where that vendor appears in SF's
digitized record. Source labels honour the SFPL-vs-Democracy's-Library
distinction. These feed the payee fiche's paper trail and the contracts-page
vendor chips.

Usage: python pipeline/scripts/enrich/link_sf_payees.py
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "ia_sf" / "payees"
SF = ROOT / "website" / "public" / "data" / "us" / "sf"
PAYEES = SF / "payees"
DLDOCS = SF / "dl_documents"

POOL_LABEL = {
    "sfpl": "Internet Archive — San Francisco Public Library partnership scans",
    "dl": "Internet Archive — Democracy's Library",
}
LEGAL_SUFFIX = {"INC", "INCORPORATED", "LLC", "CORP", "CORPORATION", "CO", "COMPANY",
                "LP", "LLP", "LTD", "NA", "PC", "PLLC"}
CAP = 10


def core(name: str) -> str:
    up = re.sub(r"[^A-Z0-9 ]", " ", name.upper().replace("&", " AND "))
    toks = [t for t in up.split()]
    if toks and toks[0] == "THE":
        toks = toks[1:]
    while toks and toks[-1] in LEGAL_SUFFIX:
        toks = toks[:-1]
    return " ".join(toks)


def main() -> int:
    if not CACHE.exists():
        print("No payee IA cache yet — run sync_ia_sf.py --kind payees first.")
        return 1
    index = json.loads((PAYEES / "index.json").read_text())["payees"]

    # core → normalized slug, from each payee's name + variants
    core_to_slug: dict[str, str] = {}
    for entry in index:
        fiche = json.loads((PAYEES / f"{entry['slug']}.json").read_text())
        core_to_slug.setdefault(core(fiche["name"]), fiche["slug"])
        for v in fiche.get("variants", []):
            core_to_slug.setdefault(core(v["name"]), fiche["slug"])

    DLDOCS.mkdir(parents=True, exist_ok=True)
    emitted = 0
    for cf in sorted(CACHE.glob("*.json")):
        cache = json.loads(cf.read_text())
        alias = cache.get("aliases", [None])[0]
        if not alias:
            continue
        slug = core_to_slug.get(core(alias))
        if not slug:
            continue
        docs = []
        for it in cache.get("items", []):
            if not it.get("snippet"):
                continue
            docs.append({
                "identifier": it["identifier"],
                "title": it["title"],
                "year": it.get("year"),
                "pool": it["pool"],
                "snippet": it["snippet"],
                "url": it["url"],
                "deep_link": f"https://archive.org/details/{it['identifier']}?q="
                             + (it.get('matched_alias') or alias).replace(" ", "+"),
                "source_label": POOL_LABEL.get(it["pool"], "Internet Archive"),
            })
        if len(docs) < 1:
            continue
        (DLDOCS / f"payee-{slug}.json").write_text(json.dumps({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "slug": slug, "matched_alias": alias,
            "note": "Where this vendor appears in SF's digitized public record.",
            "documents": docs[:CAP],
        }, indent=1, ensure_ascii=False))
        emitted += 1
        print(f"  ✓ payee-{slug:34} {len(docs)} docs (alias «{alias}»)")

    print(f"\nEmitted {emitted} payee paper-trails → {DLDOCS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
