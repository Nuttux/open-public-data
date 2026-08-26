#!/usr/bin/env python3
"""Stage 2 of the SF place expansion — rank the pool by REAL DATA SIGNAL, not
intuition. The SF counterpart of score_lieu_candidates.py, and it keeps that
script's decision (2026-07-21) intact: money magnitude on a log scale first,
breadth of sources second, document presence as a minor bonus only. Weak
signals are DOWN-WEIGHTED, never excluded.

Signals, in the order they carry weight:

  bond_expended_usd   GO-bond program items (m793-kis4) whose item name IS this
                      place — the latest cumulative snapshot per item, never a
                      SUM of snapshots (build_sf_place_bonds.py: ZSFG Bldg 5 is
                      $199M latest, not the $322M a naive sum gives). Program
                      CATEGORY items ("Neighborhood Parks") are pooled across
                      many places and are never credited as a place's dollars.
  contract_paid_usd   prime contracts (core_us_sf_contracts) whose TITLE names
                      the place. Weak aliases get the same department guard the
                      6C crosswalk uses, then a 0.5 weight rather than a drop.
  permit_declared_usd building permits on the place's parcels (APN join, the
                      ~100%-precision structured key). REPORTED, NOT SCORED —
                      applicant-declared construction value is not public money
                      and often is not even the City's work, since a civic
                      facility can share a parcel with a private development.
                      Restricted to permits actually issued/completed, so the
                      reference figure excludes the withdrawn and expired ones.
  n_bond_projects     granular bond projects (d3dc-v5yr) naming the place. The
                      dataset carries no dollars, so this counts toward breadth
                      and never toward magnitude.
  archive_docs        gated Internet Archive documents (sfpl + dl) — a MINOR
                      bonus, capped, never the lead. Only exists for places the
                      IA sync has already run on, so it is reported alongside an
                      `archive_synced` flag: an unsynced candidate scoring 0 here
                      is an unmeasured place, not a poor one.
  size_sq_ft          gross floor area + park acreage, as a size proxy. Also a
                      capped minor bonus.

WEIGHTS (the Paris "down-weight, don't exclude" rule, ported):
  - a money item naming SEVERAL candidates is credited in full only to the most
    specific match (longest matched alias); the others get 0.3, the same weight
    Paris gives a geo-proximity-only project candidate.
  - a permit on an APN shared by several candidates gets 0.3 — the parcel is the
    evidence and it does not say which building on it was worked on.
  - a weak contract alias corroborated only by a builder department gets 0.5.

RANKING MAGNITUDE IS NOT A DOLLAR FACT. `ranking_magnitude_usd` adds bond
expended + contract paid to get one number to sort on. Those are the SAME money
in two ledgers (mart_us_sf_place_capital's no-sum doctrine) — the sum is a
ranking scalar and must never be displayed as a place's spending.
`max_ledger_usd` is the honest single-ledger figure and is emitted next to it.

KNOWN, NOT REDISCOVERED (link_sf_places.py): there is no place-level budget or
payroll in any SF source — nothing is finer than department_code — and only
~17% of places get any contract hit, because small facilities are covered by
citywide blanket contracts that never name the branch. A branch library scoring
low here is a fact about SF's ledgers, not a failure of the ranking.

Usage: python pipeline/scripts/enrich/score_sf_place_candidates.py \
           [--csv out.csv] [--top N]
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sf_place_match import alias_ok, is_acronym, norm, phrase_match  # noqa: E402

POOL = ROOT / "pipeline" / "seeds" / "sf_place_pool.json"
LINKAGE = ROOT / "pipeline" / "cache" / "ia_sf" / "linkage"
SF_WEB = ROOT / "website" / "public" / "data" / "us" / "sf"
PLACES_WEB = SF_WEB / "places"

PROJECT = "open-data-france-484717"
T_BOND_SPEND = f"{PROJECT}.dbt_us_staging.stg_us_sf_go_bond_spending"
T_BOND_PROJ = f"{PROJECT}.dbt_us_staging.stg_us_sf_go_bond_projects"
T_CONTRACTS = f"{PROJECT}.dbt_us_analytics.core_us_sf_contracts"
T_PERMITS = f"{PROJECT}.dbt_us_staging.stg_us_sf_building_permits"

# ── weights (see module docstring) ───────────────────────────────────────────
SECONDARY_MATCH_W = 0.3    # a money item that names a more specific place too
SHARED_APN_W = 0.3         # the parcel carries several candidates
WEAK_ALIAS_W = 0.5         # builder-department corroboration only
PERMIT_MIN_USD = 1000      # same floor as mart_us_sf_place_permits

# A new-construction permit on a city facility's parcel is NOT reliably that
# facility's work. Measured on this pool (2026-07-27): the $150M permit on Fire
# Station #13's parcel is "erect 19 stories, 200 hotel rooms"; 772 Pacific Ave's
# $105M is a 15-storey affordable-housing tower; 1939 Market's $87M is a 15-storey
# mixed-use block. A city facility on the ground floor of a redevelopment shares
# the APN with the development. Alterations/repairs ARE the facility's own work
# (this is what rescued Coit Tower and the Chinatown Library $19M renovation), so
# the two are split and new construction is down-weighted rather than dropped —
# some of it genuinely is a facility being rebuilt.
NEW_CONSTRUCTION_W = 0.3
NEW_CONSTRUCTION_TYPES = ("new construction", "demolition", "grade or quarry")

BUILDER_DEPTS = {"DPW", "GEN", "ADM", "GSA"}

# Program-category bond items — their money is pooled across many facilities, so
# it is never a place's dollars. Lifted verbatim from build_sf_place_bonds.py so
# the two stay in step.
CATEGORY_MARKERS = (
    "neighborhood parks", "waterfront parks", "citywide", "program", "housing",
    "streets", "resurfacing", "improvements", "various", "market rate",
    "below market", "middle-income", "middle income", "low-income", "low income",
    "public housing", "fire stations", "health centers", "community health",
    "navigation center", "scattered sites", "area plan", "seismic",
    "oversight", "cost of issuance", "contingency",
)


def bq_json(query: str, max_rows: int = 60000) -> list[dict]:
    out = subprocess.run(
        ["bq", "query", "--use_legacy_sql=false", "--format=json",
         f"--max_rows={max_rows}", query],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out or "[]")


def f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def is_category(name: str) -> bool:
    n = (name or "").lower()
    return any(m in n for m in CATEGORY_MARKERS)


def is_new_construction(permit_type: str | None) -> bool:
    t = (permit_type or "").lower()
    return any(t.startswith(m) for m in NEW_CONSTRUCTION_TYPES)


def alias_is_strong(alias: str, place: dict) -> bool:
    """Self-disambiguating alias — same rule as build_sf_place_contracts.py."""
    if alias.isupper() and alias.isalpha():
        return True
    if len(alias.split()) >= 3:
        return True
    return alias.lower() == place["name"].lower()


# ── matching ─────────────────────────────────────────────────────────────────

def prepare(places: list[dict]) -> list[dict]:
    """Name-matching uses ONLY the pool's own alias list — never the raw name.

    Stage 1 already dropped every unqualified surface form (the link_sf_places.py
    constraint: a bare name that doubles as a neighborhood matches unrelated
    department programs at ~0% precision). Adding `name` back here would quietly
    undo that: "Twin Peaks" as a park would collect the Twin Peaks Tunnel
    contracts. A candidate with no safe alias is matched by APN only.

    A looser "all distinctive tokens present" fallback was BUILT AND REJECTED
    here (2026-07-27). The contract ledger writes places short — Kezar's work is
    titled "PW Kezar Fence" — so it looked like the fix for the flagship places
    sitting at $0. Measured on the contract corpus it ran at roughly 20%
    precision: "Baker Beach" collected "DPH-Baker 2021-22", "Oracle Park" an
    Oracle software licence, "Fire Division of Training" every contract with the
    word training. Ordinary English words inside place names cannot be told from
    place references without a phrase. The abbreviation gap is real and stays a
    measured, reported gap (see VERIFIED_ABBREV in expand_sf_place_pool.py, and
    §4F of docs/us/block-studies/6-lieux.md) rather than being papered over."""
    for p in places:
        seen, uniq = set(), []
        for a in p.get("aliases") or []:
            # Trust stage 1's alias vetting; alias_ok's ≥4-char acronym floor
            # would otherwise drop the verified 3-letter forms (GGP, LHH) that
            # are the ONLY way Golden Gate Park's contracts are ever written.
            ok = alias_ok(a) or (a.isupper() and a.isalpha() and len(a) >= 3)
            if ok and a.lower() not in seen:
                seen.add(a.lower())
                uniq.append(a)
        p["_aliases"] = [(a, norm(a), is_acronym(a)) for a in uniq]

    return places


def match_all(hay: str, places: list[dict], reverse: bool = False) -> list[tuple[dict, str, float]]:
    """EVERY place whose alias phrase-matches, not just the first. Paris takes
    the first match because its seed is small and hand-curated; an 800-candidate
    pool has real overlap ('Mission Playground' inside 'Mission Playground and
    Pool'), and silently crediting whichever came first in seed order would be
    an arbitrary attribution. Here every match is returned and the caller
    down-weights all but the most specific."""
    hay_norm = norm(hay)
    if not hay_norm:
        return []
    # Reverse containment: the money item's own name sitting whole inside an
    # alias. The GO-bond ledger writes "Office of the Chief Medical Examiner"
    # where the registry writes "…Examiner Building", and forward-only matching
    # loses $67M of real bond spending. Opt-in per source, and ONLY the 151
    # curated bond program items get it: switched on for contract titles it
    # credited the citywide "MENTAL HEALTH SERVICES" contract ($29.7M) to the
    # Sunset Mental Health clinic, because generic service names are contained
    # in many clinic names.
    reverse_ok = reverse and len(hay_norm.split()) >= 3
    out = []
    for p in places:
        best = None
        for (alias, an, ac) in p["_aliases"]:
            hit = phrase_match(an, hay_norm, ac) or (
                reverse_ok and not ac and re.search(rf"\b{re.escape(hay_norm)}\b", an))
            if hit and (best is None or len(an) > len(best[1])):
                best = (alias, an)
        if best:
            out.append((p, best[0], 1.0))
    return out


def credit(matches: list[tuple[dict, str, float]]) -> list[tuple[dict, str, float]]:
    """Full weight to the most specific match, SECONDARY_MATCH_W to the rest."""
    if not matches:
        return []
    longest = max(len(a) for _, a, _ in matches)
    return [(p, a, (1.0 if len(a) == longest else SECONDARY_MATCH_W) * kw)
            for p, a, kw in matches]


# ── signal collection ────────────────────────────────────────────────────────

def collect_bonds(places: list[dict]) -> tuple[dict, dict]:
    """(exact bond $ per slug, bond-project counts per slug)."""
    items = bq_json(f"""
        WITH ranked AS (
            SELECT bond_program, program_item, report_year,
                   expended_usd, revised_budget_usd,
                   ROW_NUMBER() OVER (PARTITION BY bond_program, program_item
                                      ORDER BY report_year DESC) AS rn
            FROM `{T_BOND_SPEND}`
            WHERE program_item IS NOT NULL
        )
        SELECT bond_program, program_item, report_year, expended_usd, revised_budget_usd
        FROM ranked WHERE rn = 1
    """)
    bond = defaultdict(lambda: {"usd": 0.0, "n": 0, "items": []})
    for it in items:
        if is_category(it["program_item"]):
            continue
        exp = f(it.get("expended_usd"))
        if exp <= 0:
            continue
        for p, alias, w in credit(match_all(it["program_item"], places, reverse=True)):
            b = bond[p["slug"]]
            b["usd"] += exp * w
            b["n"] += 1
            b["items"].append(f"{it['program_item']} (${exp:,.0f}, w={w})")

    projs = bq_json(f"""
        SELECT DISTINCT bond, component_or_program, planned_project_name
        FROM `{T_BOND_PROJ}`
        WHERE planned_project_name IS NOT NULL
    """)
    proj = defaultdict(lambda: {"n": 0, "names": []})
    for pr in projs:
        for p, alias, w in credit(match_all(pr["planned_project_name"], places)):
            if w < 1.0:
                continue          # count only the most specific match
            proj[p["slug"]]["n"] += 1
            proj[p["slug"]]["names"].append(pr["planned_project_name"])
    return bond, proj


def collect_contracts(places: list[dict]) -> dict:
    rows = bq_json(f"""
        SELECT contract_no,
               ANY_VALUE(contract_title)  AS contract_title,
               ANY_VALUE(department_code) AS department_code,
               MAX(agreed_amt)            AS agreed_amt,
               MAX(pmt_amt)               AS paid_amt
        FROM `{T_CONTRACTS}`
        WHERE is_prime_contractor_row AND contract_title IS NOT NULL
        GROUP BY contract_no
    """)
    out = defaultdict(lambda: {"paid": 0.0, "agreed": 0.0, "n": 0,
                               "dropped_weak": 0, "titles": []})
    for c in rows:
        for p, alias, w in credit(match_all(c["contract_title"], places)):
            if not alias_is_strong(alias, p):
                dept = c.get("department_code") or ""
                if dept != p.get("owning_dept_code") and dept not in BUILDER_DEPTS:
                    out[p["slug"]]["dropped_weak"] += 1
                    continue
                w *= WEAK_ALIAS_W
            e = out[p["slug"]]
            e["paid"] += f(c.get("paid_amt")) * w
            e["agreed"] += f(c.get("agreed_amt")) * w
            e["n"] += 1
            e["titles"].append(f"{c['contract_title']} (w={round(w, 2)})")
    return out


def collect_permits(places: list[dict]) -> dict:
    apn_owners: dict[str, list[dict]] = defaultdict(list)
    for p in places:
        for a in p.get("block_lots") or []:
            apn_owners[a].append(p)
    apns = sorted(apn_owners)
    if not apns:
        return {}
    in_list = ",".join(f'"{a}"' for a in apns)
    rows = bq_json(f"""
        SELECT block_lot, permit_type,
               COUNT(*) AS n,
               SUM(COALESCE(revised_cost_usd, estimated_cost_usd)) AS declared
        FROM `{T_PERMITS}`
        WHERE block_lot IN ({in_list})
          AND COALESCE(revised_cost_usd, estimated_cost_usd) >= {PERMIT_MIN_USD}
          AND LOWER(TRIM(status)) IN ('complete', 'issued', 'reinstated')
        GROUP BY block_lot, permit_type
    """)
    out = defaultdict(lambda: {"alter": 0.0, "newc": 0.0, "n": 0, "shared_apns": 0,
                               "apns": set(), "max_owners": 1})
    for r in rows:
        owners = apn_owners.get(r["block_lot"], [])
        # A parcel shared by N candidates splits 1/N, capped at SHARED_APN_W.
        # A flat 0.3 was not enough: one Golden Gate Park parcel (1700001) carries
        # the de Young, Park Station and the stewardship centre, and a flat weight
        # handed each of them $111M of the same permits.
        share = 1.0 if len(owners) == 1 else min(SHARED_APN_W, 1.0 / len(owners))
        newc = is_new_construction(r.get("permit_type"))
        for p in owners:
            e = out[p["slug"]]
            e["newc" if newc else "alter"] += f(r["declared"]) * share
            e["n"] += int(r["n"])
            e["apns"].add(r["block_lot"])
            e["max_owners"] = max(e["max_owners"], len(owners))
            if len(owners) > 1:
                e["shared_apns"] += 1
    for e in out.values():
        e["apns"] = len(e["apns"])
        e["usd"] = e["alter"] + e["newc"] * NEW_CONSTRUCTION_W
    return out


def collect_archive() -> dict:
    """Gated archive-document counts, where the IA sync has already run. Reads
    the linkage output (the same n_archive the publication gate uses) so this
    column means exactly what the gate means."""
    out = {}
    if LINKAGE.exists():
        for fp in LINKAGE.glob("*.json"):
            try:
                d = json.loads(fp.read_text())
            except Exception:
                continue
            out[fp.stem] = d.get("n_archive", 0)
    return out


# ── scoring ──────────────────────────────────────────────────────────────────

def size_bonus(sq_ft: float) -> float:
    """Capped size proxy. Floor area is weak evidence of civic weight — a big
    corporation yard is not more legible than a small branch library — so it can
    only ever move a score by half a point, like Paris's délib bonus."""
    if sq_ft <= 0:
        return 0.0
    return round(min(0.5, max(0.0, (math.log10(1 + sq_ft) - 3) / 6)), 3)


def archive_bonus(n_docs: int) -> float:
    if n_docs <= 0:
        return 0.0
    return round(min(0.5, math.log10(1 + n_docs) / 3), 3)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(ROOT / "pipeline" / "cache" / "ia_sf" /
                                         "sf_place_candidates_ranked.csv"))
    ap.add_argument("--top", type=int, default=60)
    args = ap.parse_args()

    pool = json.loads(POOL.read_text())
    places = prepare(pool["places"])
    print(f"· pool: {len(places)} candidates", file=sys.stderr)

    print("· GO bonds (m793-kis4 / d3dc-v5yr) …", file=sys.stderr)
    bond, bond_proj = collect_bonds(places)
    print("· prime contracts (core_us_sf_contracts) …", file=sys.stderr)
    con = collect_contracts(places)
    print("· building permits by APN (i98e-djp9) …", file=sys.stderr)
    per = collect_permits(places)
    print("· archive documents (gated linkage cache) …", file=sys.stderr)
    arch = collect_archive()

    # A fiche FILE exists for every seeded candidate; only the ones whose
    # `published` flag is set actually ship. Counting files would have reported
    # 63 published places when 27 are live.
    published, has_fiche = set(), set()
    for fp in PLACES_WEB.glob("*.json"):
        if fp.stem.startswith("_"):
            continue
        has_fiche.add(fp.stem)
        try:
            if json.loads(fp.read_text()).get("published"):
                published.add(fp.stem)
        except Exception:
            pass
    credits = {}
    cp = ROOT / "website" / "public" / "data" / "enrichment" / "us_sf_places" / "_photo_credits.json"
    if cp.exists():
        credits = json.loads(cp.read_text())

    rows = []
    for p in places:
        slug = p["slug"]
        b, bp = bond.get(slug, {}), bond_proj.get(slug, {})
        c, pe = con.get(slug, {}), per.get(slug, {})
        bond_usd = b.get("usd", 0.0)
        con_usd = c.get("paid", 0.0)
        per_usd = pe.get("usd", 0.0)

        # PUBLIC money only. Building permits are excluded from both the
        # magnitude and the breadth: a permit records what an applicant declared
        # work would cost, often a private owner's work on a parcel the City
        # merely shares, and it is not the City paying for anything. Including
        # them was the defect in the first ranking — permits fired for 36% of
        # candidates against 8% for contracts and 5% for bonds, so the "money"
        # that ordered the pool was mostly not public money at all. They stay in
        # the CSV as reference columns, and out of the score.
        ledgers = [bond_usd, con_usd]
        magnitude_usd = sum(ledgers)          # RANKING SCALAR ONLY — see docstring
        max_ledger = max(ledgers)
        breadth = sum(1 for v in (bond_usd, con_usd, bp.get("n", 0)) if v > 0)

        sq_ft = (p.get("gross_sq_ft") or 0) + (p.get("acres") or 0) * 43560
        n_docs = arch.get(slug, 0)
        a_bonus = archive_bonus(n_docs)
        s_bonus = size_bonus(sq_ft)
        mag = math.log10(1 + magnitude_usd)
        score = mag + breadth * 0.5 + a_bonus + s_bonus

        rows.append({
            "rank": 0,
            "score": round(score, 3),
            "slug": slug,
            "name": p["name"],
            "kind": p.get("kind") or "",
            "family": p.get("family") or "",
            "owning_dept_code": p.get("owning_dept_code") or "",
            "status": ("published" if slug in published
                       else "seeded" if (p.get("already_seeded") or slug in has_fiche)
                       else "new"),
            # ── score components, each shown separately ──
            "magnitude_log10": round(mag, 3),
            "breadth": breadth,
            "archive_bonus": a_bonus,
            "size_bonus": s_bonus,
            # ── the money, per ledger, never summed for display ──
            "bond_expended_usd": round(bond_usd),
            "contract_paid_usd": round(con_usd),
            "contract_agreed_usd": round(c.get("agreed", 0.0)),
            "permit_declared_usd": round(per_usd),
            "permit_alteration_usd": round(pe.get("alter", 0.0)),
            "permit_newconstr_usd": round(pe.get("newc", 0.0)),
            "max_ledger_usd": round(max_ledger),
            "ranking_magnitude_usd": round(magnitude_usd),
            # ── counts behind each ledger ──
            "n_bond_items": b.get("n", 0),
            "n_bond_projects": bp.get("n", 0),
            "n_contracts": c.get("n", 0),
            "n_contracts_dropped_weak": c.get("dropped_weak", 0),
            "n_permits": pe.get("n", 0),
            "n_apns": len(p.get("block_lots") or []),
            "n_apns_shared": pe.get("shared_apns", 0),
            "apn_max_owners": pe.get("max_owners", 1),
            # ── minor / structural ──
            "n_archive_docs": n_docs,
            "archive_synced": slug in arch,
            "has_photo": slug in credits,
            "gross_sq_ft": p.get("gross_sq_ft") or 0,
            "acres": p.get("acres") or "",
            "n_facility_rows": p.get("n_facility_rows") or 0,
            "municipal_status": p.get("municipal_status") or "registry",
            "sources": " | ".join(s["dataset"] for s in p.get("sources", [])),
            "top_bond_item": (b.get("items") or [""])[0][:110],
            "top_contract": (c.get("titles") or [""])[0][:110],
            "top_bond_project": (bp.get("names") or [""])[0][:110],
        })

    rows.sort(key=lambda r: -r["score"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i

    out = Path(args.csv)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    print(f"\n{'#':>4} {'score':>6}  {'slug':<44} {'status':<9} "
          f"{'bond$':>13} {'contract$':>13} {'permit$':>13}  br docs")
    for r in rows[: args.top]:
        print(f"{r['rank']:>4} {r['score']:>6.2f}  {r['slug'][:44]:<44} {r['status']:<9} "
              f"{r['bond_expended_usd']:>13,} {r['contract_paid_usd']:>13,} "
              f"{r['permit_declared_usd']:>13,}  {r['breadth']:>2} {r['n_archive_docs']:>4}")

    n_money = sum(1 for r in rows if r["breadth"] > 0)
    n_new_money = sum(1 for r in rows if r["breadth"] > 0 and r["status"] == "new")
    print(f"\n{len(rows)} ranked · {n_money} carry at least one place-specific money "
          f"signal ({n_new_money} of them new)")
    print(f"-> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
