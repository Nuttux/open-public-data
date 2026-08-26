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
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "export"))

# Glosses are re-attached from the durable store, never carried in this file's
# own output — this script rebuilds documents[] from the IA cache, so anything
# living only in dl_documents/payee-*.json would be destroyed on every run.
# Same contract, same store, as the place shelves.
from export_sf_places import (  # noqa: E402
    curate_documents,
    load_gloss_store,
)
CACHE = ROOT / "pipeline" / "cache" / "ia_sf" / "payees"
SF = ROOT / "website" / "public" / "data" / "us" / "sf"
PAYEES = SF / "payees"
# Category E side-channel cache (per-payee document lists, no metric) —
# lives under public/data/enrichment/ per docs/data-platform/04 §4.2.
DLDOCS = ROOT / "website" / "public" / "data" / "enrichment" / "us_sf_payee_documents"

POOL_LABEL = {
    "sfpl": "Internet Archive — San Francisco Public Library partnership scans",
    "dl": "Internet Archive — Democracy's Library",
}
LEGAL_SUFFIX = {"INC", "INCORPORATED", "LLC", "CORP", "CORPORATION", "CO", "COMPANY",
                "LP", "LLP", "LTD", "NA", "PC", "PLLC"}
CAP = 10



# ── Mention quality ─────────────────────────────────────────────────────────
# Document TYPE cannot save us here: an environmental impact report is a
# genuinely substantive genre, but Chicago Title appears in four of them only
# because its mailing address sits in the distribution list bound at the back.
# The same is true of a name in a cc line or a table of grantees. So look at the
# CONTEXT of the match: if every excerpt around the name reads as an address
# block or a bare list of organisations, the document is not about this payee.
_ADDRESS = re.compile(r"\b(?:CA|California)\s*9\d{4}\b|\bAttn:|\bSuite \d|\bP\.?O\.? Box\b", re.I)
_STREET = re.compile(r"\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Plaza|Place|Road|Rd|Drive|Dr|Way)\b")


# A statewide vendor is named in other jurisdictions' planning documents too.
# The City of Rosemead's general plan is not San Francisco's public record, and
# a reader on an SF site has no use for it. Places already screen this via
# relevance.rival_city; payees had no equivalent.
_RIVAL = re.compile(
    r"\b(?:city|county|town) of (?!san francisco)"
    r"|\b(?:oakland|berkeley|san jose|napa|rosemead|tulare|richmond|fremont|"
    r"daly city|sacramento|los angeles|san mateo|marin|alameda county|"
    r"anaheim|pasadena|brooks island|contra costa|santa clara|san diego|sonoma)\b", re.I)


def names_other_jurisdiction(title: str) -> bool:
    """True when the TITLE places the document in another jurisdiction."""
    if re.search(r"san francisco|\bSF\b", title, re.I):
        return False
    return bool(_RIVAL.search(title))


# A roster carries no addresses at all — it is a bare column of organisation
# names (a bond prospectus's list of title insurers, a grand jury's table of
# grantees, a monitoring report's list of funded nonprofits). What separates it
# from prose is grammar: real sentences are full of function words, a list has
# almost none. Measured over hand-labelled examples from this corpus, lists
# scored 0.034–0.084 and prose 0.130–0.439, so 0.11 splits them with margin on
# both sides.
_FUNC = frozenset(
    "the of and to in for with that is was by on at from as are be it this an or "
    "which their its has have been were will not but".split())
PROSE_FLOOR = 0.11


def _prose_ratio(excerpt: str) -> float:
    words = re.findall(r"[A-Za-z']+", excerpt)
    if len(words) < 20:
        return 1.0  # too short to judge; do not drop on this signal
    return sum(1 for w in words if w.lower() in _FUNC) / len(words)


def mention_is_incidental(excerpts: list[str]) -> bool:
    """True when EVERY OCR window around the match is a list rather than prose.

    Two shapes of list, both meaning "this document is not about this payee":
    a mailing/distribution block (postal markers), and a bare roster of names
    (almost no function words). One window of genuine prose is enough to keep
    the document, so this is deliberately hard to trigger.
    """
    if not excerpts:
        return False
    for e in excerpts:
        postal = len(_ADDRESS.findall(e)) + len(_STREET.findall(e))
        if postal < 2 and _prose_ratio(e) >= PROSE_FLOOR:
            return False  # at least one window reads as real prose
    return True

def core(name: str) -> str:
    up = re.sub(r"[^A-Z0-9 ]", " ", name.upper().replace("&", " AND "))
    toks = [t for t in up.split()]
    if toks and toks[0] == "THE":
        toks = toks[1:]
    while toks and toks[-1] in LEGAL_SUFFIX:
        toks = toks[:-1]
    return " ".join(toks)


def alias_is_specific(alias: str) -> bool:
    """
    Reject aliases that cannot survive OCR full-text search.

    An alias made only of very short tokens ("A P X") matches letter-noise in
    scanned text: the A P X trail cited a 1965 census study and a 1944 land
    report on snippets like "cO ro o in 00 CM ro CM CM xi a> -P X". Require at
    least one token of >=4 characters, i.e. one real word to anchor on.
    """
    return any(len(tok) >= 4 for tok in re.findall(r"[A-Za-z0-9]+", alias))


# Titles that carry no information on their own: the document type alone.
GENERIC_TITLE = re.compile(
    r"^(minutes|resolution|agenda|meeting minutes|notice of meeting|calendar)\b", re.I
)


def has_substance(title: str, snippet: str) -> bool:
    """
    Keep a document only if it tells the reader something.

    "Minutes · 1999" plus a highlighted vendor name is a match, not evidence:
    it says the name appeared in a meeting, nothing more. Require either a
    title that describes the document ("Airport Commission : concession audit
    of…") or enough words around the match to read as a statement.
    """
    words = len([w for w in re.sub(r"«[^»]*»", "", snippet or "").split() if len(w) > 2])
    return not GENERIC_TITLE.match((title or "").strip()) or words >= 8


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
    payee_glosses = load_gloss_store()["payee"]
    kept_slugs: set[str] = set()
    emitted = 0
    for cf in sorted(CACHE.glob("*.json")):
        cache = json.loads(cf.read_text())
        alias = cache.get("aliases", [None])[0]
        if not alias:
            continue
        slug = core_to_slug.get(core(alias))
        if not slug:
            continue
        if not alias_is_specific(alias):
            print(f"  · skipped «{alias}» — too short to match OCR text reliably")
            continue
        docs = []
        n_incidental = n_offscope = n_no_evidence = 0
        for it in cache.get("items", []):
            if not it.get("snippet"):
                continue
            if not has_substance(it.get("title", ""), it["snippet"]):
                continue
            if mention_is_incidental(it.get("ocr_excerpts") or []):
                n_incidental += 1
                continue
            if names_other_jurisdiction(it.get("title", "")):
                n_offscope += 1
                continue
            # No OCR window means the only evidence is that the vendor's name
            # matched somewhere in a scan. The shelf's promise is a line saying
            # what the document SAYS about this payee, and that cannot be
            # written from a title. A row we can never gloss does not earn a row.
            if not (it.get("ocr_excerpts") or []):
                n_no_evidence += 1
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
        # Same treatment as a place shelf: collapse repeat editions, classify by
        # document type so procedural paperwork is never listed, then re-attach
        # the durable glosses.
        docs = curate_documents(docs)
        for d in docs:
            g = payee_glosses.get(slug, {}).get(d["identifier"])
            if g:
                d["gloss"] = g
        (DLDOCS / f"payee-{slug}.json").write_text(json.dumps({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "slug": slug, "matched_alias": alias,
            "note": "Where this vendor appears in SF's digitized public record.",
            "n_incidental_dropped": n_incidental,
            "n_offscope_dropped": n_offscope,
            "n_no_evidence_dropped": n_no_evidence,
            "documents": docs[:CAP],
        }, indent=1, ensure_ascii=False))
        emitted += 1
        kept_slugs.add(slug)
        print(f"  ✓ payee-{slug:34} {len(docs)} docs (alias «{alias}»)")

    # A payee that no longer qualifies must not keep serving yesterday's shelf.
    # Without this, a file written before a gate existed lingers forever: it is
    # still read by the fiche, still rendered, and never touched again — which
    # is how one payee kept showing an un-glossed row after every other shelf
    # had been rebuilt.
    stale = [f for f in DLDOCS.glob("payee-*.json")
             if f.name[len("payee-"):-len(".json")] not in kept_slugs]
    for f in stale:
        f.unlink()
    if stale:
        print(f"Removed {len(stale)} stale payee trail(s): "
              + ", ".join(sorted(f.name for f in stale)))

    print(f"\nEmitted {emitted} payee paper-trails → {DLDOCS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
