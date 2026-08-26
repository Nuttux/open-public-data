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
# payee paper-trails (link_sf_payees.py) — Category E cache under enrichment/
PAYEE_DOCS = ROOT / "website" / "public" / "data" / "enrichment" / "us_sf_payee_documents"

POOL_LABEL = {
    "sfpl": "Internet Archive — San Francisco Public Library partnership scans",
    "dl": "Internet Archive — Democracy's Library",
}
GATE_MIN_DOCS = 3
SHELF_SALIENT_CAP = 4  # visible-without-expanding rows on the document shelf

# ── The archive presentation contract ────────────────────────────────────────
# What a reader wants from a city archive is the handful of documents that
# DECIDED or EXPLAINED something about this place. What the archive mostly
# holds is the paperwork of governing: minutes, agendas, calendars, notices.
#
# So visibility is decided by DOCUMENT TYPE, read off the title, and the table
# below IS the rule — inspectable, not a magic score. `tier` orders the shelf;
# tier PROCEDURAL_TIER means the document never appears on the shelf at all
# (it stays in the JSON and is reported as an honest count, never dropped
# silently). Evidence scores only order documents WITHIN a tier; they can no
# longer promote an "Agenda" above a grand jury report, which is exactly what
# the previous salience-across-all-groups rule did on 89 of 107 procedural
# documents. First match wins, so the specific patterns come first.
PROCEDURAL_TIER = 9
DOC_TYPES: list[tuple[str, str, int, re.Pattern]] = [
    # ── Tier 1 — someone examined this place and reached a finding ──
    ("audit", "Audit", 1, re.compile(
        r"\baudit\b|performance and efficiency|performance review|"
        r"poor controls|expenditures for calendar year", re.I)),
    ("investigation", "Investigation", 1, re.compile(
        r"\binvestigation\b|grand jury|neglect of reporting", re.I)),
    # ── Tier 2 — someone studied this place before a decision ──
    ("environmental_review", "Environmental review", 2, re.compile(
        r"environmental impact|environmental statement|environmental assessment|"
        r"negative declaration|initial study|notice of preparation|"
        # CEQA volumes cite themselves by acronym, and a response volume is
        # part of the same review — not an unclassified stray.
        r"\b(EIR|FEIR|DEIR|EIS)\b|comments and responses", re.I)),
    ("study", "Study", 2, re.compile(
        r"feasibility|\bstudy\b|\bevaluation\b|\bassessment\b|\banalysis\b|"
        r"\bsurvey\b|\binventory\b|findings? report|site selection", re.I)),
    ("history", "History", 2, re.compile(
        r"\bhistory\b|\bhistorical\b|historic structure|historic background|"
        r"\bannals\b|guided tour|civic art collection", re.I)),
    # ── Tier 3 — what the city said it would do ──
    ("plan", "Plan", 3, re.compile(
        r"master plan|strategic plan|comprehensive plan|improvement plan|"
        r"transition plan|action plan|area plan|capital plan|development program|"
        r"\bplan\b|program proposal|improvement program", re.I)),
    ("annual_report", "Annual report", 3, re.compile(
        r"annual report|financial report|statements of activities|"
        r"activities report|state of the city", re.I)),
    # ── Tier 4 — a report to someone, on something ──
    ("report", "Report", 4, re.compile(
        r"report of the|report to the|report on|\breport\b|"
        r"post occupancy|\brecommendations?\b", re.I)),
    # ── Tier 9 — procedural. The paperwork of governing, not the governing. ──
    ("notice", "Notice", PROCEDURAL_TIER, re.compile(
        r"^notice\b|\bnotice of meeting|notice of public|notice, ", re.I)),
    ("proceeding", "Minutes & agendas", PROCEDURAL_TIER, re.compile(
        r"\bminutes\b|\bagendas?\b|journal of proceedings|calendar of proceedings|"
        r"\bresolution\b|order of business|\[release\]", re.I)),
    ("calendar", "Calendar", PROCEDURAL_TIER, re.compile(
        r"\bcalendar\b|programs and events|calendar of events", re.I)),
    ("serial", "Bulletin or newsletter", PROCEDURAL_TIER, re.compile(
        r"\bbulletin\b|\bmemo\b|trolley topics|what's doing|municipal record|"
        r"data guide|bids? and contracts?|"
        r"bid and contract opportunities|neighborhood profiles|news release", re.I)),
    # A name in a directory or a roster is not a document about that name. These
    # genres exist to LIST organisations, so a match inside one carries no
    # information — it was half of every payee's visible shelf.
    ("directory", "Directory", PROCEDURAL_TIER, re.compile(
        r"\bdirectory\b|\bpolk's\b|crocker-langley|city directory", re.I)),
    ("roster", "Roster or notice", PROCEDURAL_TIER, re.compile(
        r"boards and commissions|boards, commissions|member terms|"
        r"terms expired|policies of the board|policy manual|"
        r"request for use of public meeting|meeting rooms summary|"
        r"open board meeting notices|board meeting notices", re.I)),
]
DOC_TYPE_TIER = {k: tier for k, _, tier, _ in DOC_TYPES}
DOC_TYPE_LABEL = {k: label for k, label, _, _ in DOC_TYPES}
# Anything the table does not recognise: kept, ranked below every named
# substantive type, above nothing that is procedural. Unknown ≠ worthless.
UNCLASSIFIED_TIER = 5

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

# ── Durable gloss store ─────────────────────────────────────────────────────
# A gloss is expensive, human/LLM-authored prose grounded in a document's OCR.
# It used to live ONLY inside places/<slug>.json, which assemble() rebuilds from
# the linkage cache — so every routine export silently destroyed every gloss on
# the site, and the only recovery was whatever happened to be left in a
# scratchpad batch file. That trap fired twice in one day and cost ~110 glosses.
#
# Glosses now live here instead: a version-controlled seed, keyed
# slug -> identifier -> gloss, that assemble() re-attaches on every run. The
# artifact is disposable; the writing is not. There is no longer an ordering
# rule to remember — export can run whenever, and glosses survive it.
GLOSS_STORE = ROOT / "pipeline" / "seeds" / "sf_place_document_glosses.json"
REFRESH_SHELF = False  # set by --refresh-shelf; see the prior-shelf note in assemble()

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
    # Square brackets too: "[draft] environmental impact report" and "final
    # environmental impact report" are the same publication, and leaving "[ ]"
    # in the stem kept both on the shelf as separate rows.
    t = re.sub(r"[:;,.\-–—()\[\]]", " ", t)
    t = re.sub(r"\b(draft|final|revised|summary|vol\.?\s*\w+|volume\s*\w+)\b", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


# What a document IS beats what its subject happens to be called. "Agenda /
# Assessment Appeals Board" is an agenda; "Agenda and Minutes / HIV Health
# Services Planning Council, Needs Assessment" is an agenda. Both were being
# promoted to tier 2 because the `study` pattern matches the word "assessment"
# and DOC_TYPES is first-match-wins. When a title LEADS with a procedural form,
# that form decides, whatever the body of the title mentions.
PROCEDURAL_HEAD = re.compile(
    r"^\s*\[?\s*(?:minutes?|agendas?|calendars?|notices?|journal of proceedings|"
    r"meeting minutes|meeting agenda|agendas? and minutes|minutes and agendas|"
    r"minutes and order of business)\b", re.I)


def classify_doc(title: str) -> tuple[str, str, int]:
    """(type key, human label, tier) for one document, from its title alone.

    First match in DOC_TYPES wins, so the table's order is the precedence rule.
    Deterministic and inspectable: given a title you can point at the row of the
    table that decided its fate."""
    if PROCEDURAL_HEAD.match(title):
        return "proceeding", "Minutes & agendas", PROCEDURAL_TIER
    for key, label, tier, pat in DOC_TYPES:
        if pat.search(title):
            return key, label, tier
    return "unclassified", "Record", UNCLASSIFIED_TIER


def _ocr_richness(d: dict) -> float:
    """How much this document is ABOUT the place.

    Was: total characters of OCR context. That measured volume, not relevance —
    a 600-page general plan naming the place once outranked a short report
    devoted to it, because the long document's single window was just as wide.
    Now it defers to the composite computed at linkage (SF context, hit count,
    hits-per-100k-chars, title match); the char count survives only as a
    tie-breaker for caches written before the composite existed."""
    rel = d.get("relevance")
    if rel:
        return rel["score"]
    return sum(len(e) for e in (d.get("ocr_excerpts") or [])) / 1000.0


def _shelf_score(d: dict) -> float:
    """Both axes: how much the document is about this place (relevance) plus how
    much decision-relevant substance it carries (materiality). Ranking on either
    alone fails in a predictable way — relevance alone promotes the eloquent
    document that decides nothing, materiality alone promotes any budget book
    that happens to name the place."""
    return _ocr_richness(d) + (d.get("materiality") or {}).get("score", 0.0)


def _archive_source_note(*doc_lists: list[dict]) -> str:
    """Name the archive collections this fiche actually draws on."""
    pools = {d.get("pool") for lst in doc_lists for d in lst}
    parts = []
    if "sfpl" in pools:
        parts.append("SFPL partnership scans")
    if "dl" in pools:
        parts.append("Democracy's Library")
    return "Internet Archive — " + (" + ".join(parts) if parts else "public collections")


def rank_documents(docs: list[dict]) -> list[dict]:
    """Stamp doc_type / doc_type_label / doc_tier / procedural / salient on an
    already-deduped shelf, and return it in shelf order.

    Ranking is (tier, -evidence): the TYPE decides the band, evidence only
    orders within it. Procedural documents are ranked last and marked
    `procedural` — the fiche does not list them, and reports their count
    instead. Idempotent, so it is safe to re-apply to shipped fiches (see
    classify_sf_place_documents.py) without rebuilding documents[]."""
    for d in docs:
        key, label, tier = classify_doc(d["title"])
        d["doc_type"] = key
        d["doc_type_label"] = label
        d["doc_tier"] = tier
        d["procedural"] = tier >= PROCEDURAL_TIER
        # `group` is the legacy shelf-bucket field. Keep it aligned with the
        # type label so nothing downstream reads a stale bucket name.
        d["group"] = label

    # Within a tier, a document that carries a one-line gloss outranks one that
    # does not: the shelf's whole promise is "here is what this says", and a
    # row with only a catalogue title cannot keep it. Tier still wins outright,
    # so an un-glossed audit never falls below a glossed agenda.
    docs.sort(key=lambda d: (d["doc_tier"], 0 if d.get("gloss") else 1, -_shelf_score(d), d["title"]))

    substantive = [d for d in docs if not d["procedural"]]
    for i, d in enumerate(docs):
        d["salient"] = (not d["procedural"]) and substantive.index(d) < SHELF_SALIENT_CAP
    return docs


def curate_documents(docs: list[dict]) -> list[dict]:
    """Dedupe repeat editions, then classify + rank under the archive
    presentation contract. Deterministic — no LLM call — so it is safe to
    re-run over every place, published or not."""
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

    return rank_documents(kept)


# Every kind of archive shelf in the SF app. Each is rebuilt by a different
# script from a different cache, and every one of those rebuilds would destroy
# glosses if they lived in the artifact — so they all read from here.
GLOSS_KINDS = ("place", "payee")


def load_gloss_store() -> dict[str, dict[str, dict[str, str]]]:
    """{kind: {slug: {identifier: gloss}}}. Missing file is normal on a clone."""
    empty = {k: {} for k in GLOSS_KINDS}
    if not GLOSS_STORE.exists():
        return empty
    blob = json.loads(GLOSS_STORE.read_text()).get("glosses", {})
    # Tolerate the first-generation layout ({slug: {id: gloss}}, places only).
    if blob and not (set(blob) <= set(GLOSS_KINDS)):
        return {"place": blob, "payee": {}}
    return {k: blob.get(k, {}) for k in GLOSS_KINDS}


def save_gloss_store(store: dict[str, dict[str, dict[str, str]]]) -> None:
    GLOSS_STORE.parent.mkdir(parents=True, exist_ok=True)
    counts = {k: sum(len(v) for v in store.get(k, {}).values()) for k in GLOSS_KINDS}
    GLOSS_STORE.write_text(json.dumps({
        "generated_at": now_iso(),
        "note": (
            "Durable, version-controlled store of OCR-grounded one-line document "
            "glosses for every SF archive shelf. The scripts that rebuild those "
            "shelves (export_sf_places.py for places, link_sf_payees.py for payees) "
            "re-attach from here on every run, so a rebuild can never destroy them. "
            "Written by `export_sf_places.py --harvest-glosses`; edit by hand only "
            "if you have read the document's OCR."
        ),
        "n_by_kind": counts,
        "n_glosses": sum(counts.values()),
        "glosses": {k: {s: store.get(k, {})[s] for s in sorted(store.get(k, {}))}
                    for k in GLOSS_KINDS},
    }, indent=1, ensure_ascii=False, sort_keys=False) + "\n")


def harvest_glosses() -> int:
    """Sweep every gloss that currently exists anywhere into the store.

    Covers both shelf kinds and the scratchpad batches. Purely additive —
    harvesting can only ever gain glosses, never drop one.
    """
    store = load_gloss_store()
    before = sum(len(v) for k in GLOSS_KINDS for v in store[k].values())

    def take(kind: str, slug: str, ident: str, gloss: str | None) -> None:
        if (gloss or "").strip():
            store[kind].setdefault(slug, {})[ident] = gloss.strip()

    # Scratchpad batches. A "payee:<slug>" key targets the payee shelf; a bare
    # slug is a place, which is how every batch written so far is keyed.
    for batch in sorted((ROOT / "scratchpad" / "sf_summaries").glob("batch*.json")):
        for key, res in json.loads(batch.read_text()).items():
            kind, _, slug = key.partition(":")
            if not slug:
                kind, slug = "place", key
            if kind not in GLOSS_KINDS:
                continue
            for ident, gloss in (res.get("glosses") or {}).items():
                take(kind, slug, ident, gloss)

    for f in sorted(PLACES.glob("*.json")):
        if f.name.startswith("_") or f.name in {"index.json", "reverse_index.json",
                                                "places_in_progress.json"}:
            continue
        fiche = json.loads(f.read_text())
        for d in fiche.get("documents") or []:
            take("place", fiche["slug"], d["identifier"], d.get("gloss"))

    for f in sorted(PAYEE_DOCS.glob("payee-*.json")):
        blob = json.loads(f.read_text())
        for d in blob.get("documents") or []:
            take("payee", blob["slug"], d["identifier"], d.get("gloss"))

    save_gloss_store(store)
    counts = {k: sum(len(v) for v in store[k].values()) for k in GLOSS_KINDS}
    after = sum(counts.values())
    print(f"Gloss store: {after} glosses (+{after - before}) — "
          + ", ".join(f"{k} {counts[k]}" for k in GLOSS_KINDS)
          + f" → {GLOSS_STORE.relative_to(ROOT)}")
    return 0


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
    # Glosses survive the rebuild because they do not live in the rebuilt file.
    gloss_store = load_gloss_store()["place"]
    gloss_dirty = False
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
        #
        # This intersection is also a trapdoor: a candidate that was never in the
        # prior shelf can never enter it, so an upstream grounding backfill lands
        # as a silent no-op. --refresh-shelf admits the new candidates (used for
        # the 2026-07-27 Democracy's Library backfill, where the whole point was
        # documents the prior shelf could not have contained).
        prior = load(PLACES / f"{slug}.json")
        if prior and prior.get("documents") and not REFRESH_SHELF:
            keep_ids = {d["identifier"] for d in prior["documents"]}
            raw_docs = [d for d in raw_docs if d["identifier"] in keep_ids] or raw_docs

        docs = curate_documents([
            {**d, "source_label": POOL_LABEL.get(d["pool"], "Internet Archive")}
            for d in raw_docs
        ])

        # Re-attach the durable glosses. Any gloss still on the prior fiche but
        # missing from the store is adopted into it here, so a gloss written by
        # hand and never harvested still cannot be destroyed by this run.
        prior_gloss = {d["identifier"]: d["gloss"]
                       for d in ((prior or {}).get("documents") or [])
                       if (d.get("gloss") or "").strip()}
        for ident, g in prior_gloss.items():
            if gloss_store.get(slug, {}).get(ident) != g:
                gloss_store.setdefault(slug, {})[ident] = g
                gloss_dirty = True
        for d in docs:
            g = gloss_store.get(slug, {}).get(d["identifier"])
            if g:
                d["gloss"] = g

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
                # Derived, not asserted: this line used to name both pools on
                # every fiche while no fiche carried a single Democracy's Library
                # document. Name only the collections this place actually cites.
                {"label": "Historical documents", "note": _archive_source_note(docs, dept_shelf)},
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

    if gloss_dirty:
        whole = load_gloss_store()
        whole["place"] = gloss_store
        save_gloss_store(whole)
        print(f"Gloss store updated: adopted glosses found only on shipped fiches.")

    n_glossed = sum(len(v) for v in gloss_store.values())
    ok = sum(1 for g in gate if g.get("meets_pre_summary"))
    print(f"Assembled {len(gate)} candidate place fiches "
          f"({n_glossed} glosses re-attached from the store).")
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
    global REFRESH_SHELF
    ap = argparse.ArgumentParser()
    ap.add_argument("--finalize", action="store_true")
    ap.add_argument("--refresh-shelf", action="store_true",
                    help="let newly linked documents enter an already-curated shelf "
                         "(otherwise the prior shelf's identifiers are a closed set)")
    ap.add_argument("--harvest-glosses", action="store_true",
                    help="sweep every gloss currently on a fiche or in a scratchpad "
                         "batch into the durable store, then exit")
    args = ap.parse_args()
    REFRESH_SHELF = args.refresh_shelf
    if args.harvest_glosses:
        return harvest_glosses()
    return finalize() if args.finalize else assemble()


if __name__ == "__main__":
    raise SystemExit(main())
