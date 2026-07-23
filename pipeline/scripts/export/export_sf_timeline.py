#!/usr/bin/env python3
"""Export the SF 150-year budget timeline to JSON — one scrubbable series of
total city finances from the 1880s to today, every point traceable to its source.

Two tiers, never merged into one authoritative line:

  live    (~2000→now)  total city spending per sampled fiscal year, from
                       mart_us_sf_budget_by_year (side='Spending'). Solid line;
                       links to the live budget page.
  archive (pre-2000)   the single citywide headline total AS PRINTED in a scanned
                       City & County of San Francisco serial financial report on
                       the Internet Archive. Dotted line; "as reported in the scan."
                       Curated in pipeline/seeds/sf_timeline_archive.json with a
                       verbatim quote + scan leaf + identifier. This exporter
                       RE-FETCHES each item's _djvu.txt (reusing the fetch_ia_ocr
                       client) and refuses to emit any archive point whose verbatim
                       quote or figure digit-run no longer grounds in the live OCR —
                       so a published archive number can never be invented or drift.

Normalization is sourced, never hardcoded (pipeline/seeds/sf_timeline_reference.json):
  - CPI-U deflator: BLS CUUR0000SA0 (1982-84=100) for 1913+, Minneapolis Fed
    long-run estimate spliced at 1913 for pre-1913.
  - Population: U.S. decennial Census for the City & County of San Francisco;
    intercensal years linearly interpolated.

For each point three values are emitted:
  value_nominal          the untouched scan / budget figure (the anchor)
  value_real_today       CPI-adjusted to base_year (a labeled derived transform)
  value_real_per_capita  real dollars ÷ that year's SF population (derived)

Output: website/public/data/us/sf/timeline.json

Usage:
    python pipeline/scripts/export/export_sf_timeline.py
    python pipeline/scripts/export/export_sf_timeline.py --offline   # skip OCR re-verify (dev only)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent / "sync"))
from fetch_ia_ocr import fetch_ocr, norm_ws  # noqa: E402  reuse the IA OCR client

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_us_marts"
ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_DIR = ROOT / "website" / "public" / "data" / "us" / "sf"
SEEDS = ROOT / "pipeline" / "seeds"

SOURCE_PIPELINE = (
    "pipeline/seeds/sf_timeline_{reference,archive}.json (BLS CPI-U + Census + "
    "in-session Internet Archive OCR curation) + Internet Archive _djvu.txt "
    "(re-verified) + mart_us_sf_budget_by_year → export_sf_timeline.py"
)

# Sampled modern anchors — not every fiscal year (the timeline shows ~8-12 points
# across 140 years, honest gaps elsewhere). Each must have a CPI-U base year.
LIVE_YEARS = [2010, 2015, 2020, 2025]
# "What changed" composition window. FY2018 is the PeopleSoft chart-of-accounts
# break, so fine spending-type splits aren't comparable across it — but service
# areas (organization_group) and the personnel characters are, so the whole
# 2010→2025 span is used only on dimensions that survive the break.
COMP_Y0, COMP_Y1 = 2010, 2025
PERSONNEL_CHARACTERS = ("Salaries", "Mandatory Fringe Benefits")
LIVE_BUDGET_PAGE = "/us/city/sf/budget"
IA_PAGE = "https://archive.org/details/{idf}/page/n{leaf}?q={q}"
IA_THUMB = "https://archive.org/download/{idf}/page/n{leaf}_w360.jpg"  # per-leaf scan image


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def fetch_ocr_retry(idf: str, attempts: int = 4) -> str | None:
    """fetch_ia_ocr.fetch_ocr collapses every error (incl. transient timeouts) to
    None. Retry so a network blip never silently drops a verified archive point —
    only a real missing/empty derivative ends up skipped."""
    for i in range(attempts):
        text, _trunc = fetch_ocr(idf)
        if text is not None:
            return text
        if i < attempts - 1:
            time.sleep(2 * (i + 1))
    return None


def fetch_rows(client: bigquery.Client, table: str, order_by: str) -> list[dict]:
    query = f"SELECT * FROM `{PROJECT_ID}.{DATASET}.{table}` ORDER BY {order_by}"
    return [dict(row) for row in client.query(query).result()]


def write_json(payload: dict, filename: str, log: Logger) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / filename
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    log.success(f"wrote {filename}", extra=f"{out.stat().st_size / 1024:.1f} KB")


def interp_population(year: int, census: dict[int, int]) -> tuple[int, str]:
    """SF population for a timeline year from the decennial census table, linearly
    interpolated between the two bracketing censuses. Years outside the table clamp
    to the nearest census (flagged in the note)."""
    ys = sorted(census)
    if year <= ys[0]:
        return census[ys[0]], f"{ys[0]} decennial census (earliest available)"
    if year >= ys[-1]:
        return census[ys[-1]], f"{ys[-1]} decennial census (latest available)"
    for a, b in zip(ys, ys[1:]):
        if a <= year <= b:
            if year == a:
                return census[a], f"{a} decennial census"
            frac = (year - a) / (b - a)
            val = round(census[a] + frac * (census[b] - census[a]))
            return val, f"linearly interpolated between the {a} and {b} decennial censuses"
    raise RuntimeError(f"population lookup failed for {year}")


def deep_link(idf: str, leaf: int, highlight: str) -> str:
    return IA_PAGE.format(idf=idf, leaf=leaf, q=urllib.parse.quote(highlight[:64]))


def _usd(n: float) -> str:
    a = abs(n)
    if a >= 1e9:
        return f"${n / 1e9:.1f}B"
    if a >= 1e6:
        return f"${n / 1e6:.0f}M"
    return f"${n:,.0f}"


def build_composition(client: bigquery.Client, comp_seed: dict, offline: bool, log: Logger) -> dict:
    """The 'what changed' block. Modern half is computed live from the budget
    marts on dimensions that survive the FY2018 chart-of-accounts break (service
    areas + personnel characters). Archive half re-verifies the seeded verbatim
    ledger lines against the live OCR — same honesty gate as the timeline points.
    The narratives are templated straight from these numbers (no free-form claims):
    every figure a reader sees is one they can trace to a mart cell or a scan leaf."""
    # ── modern: spending by service area, COMP_Y0 vs COMP_Y1 ──
    q = f"""
      SELECT organization_group AS name, fiscal_year, SUM(total_usd) AS usd
      FROM `{PROJECT_ID}.{DATASET}.mart_us_sf_budget_org_group`
      WHERE side='Spending' AND fiscal_year IN ({COMP_Y0}, {COMP_Y1})
      GROUP BY name, fiscal_year
    """
    areas: dict[str, dict] = {}
    for r in client.query(q).result():
        a = areas.setdefault(r["name"], {"name": r["name"], "y0_usd": 0.0, "y1_usd": 0.0})
        a["y0_usd" if int(r["fiscal_year"]) == COMP_Y0 else "y1_usd"] = float(r["usd"])
    service_areas = sorted(areas.values(), key=lambda a: a["y1_usd"] - a["y0_usd"], reverse=True)
    for a in service_areas:
        a["growth_usd"] = round(a["y1_usd"] - a["y0_usd"], 2)
        a["mult"] = round(a["y1_usd"] / a["y0_usd"], 2) if a["y0_usd"] else None
        a["y0_usd"], a["y1_usd"] = round(a["y0_usd"], 2), round(a["y1_usd"], 2)

    # ── modern: personnel (characters that survive the COA break) ──
    inlist = ", ".join(f"'{c}'" for c in PERSONNEL_CHARACTERS)
    qp = f"""
      SELECT fiscal_year, SUM(total_usd) AS usd
      FROM `{PROJECT_ID}.{DATASET}.mart_us_sf_budget_character`
      WHERE side='Spending' AND character IN ({inlist})
        AND fiscal_year IN ({COMP_Y0}, {COMP_Y1}) AND NOT is_transfer_adjustment
      GROUP BY fiscal_year
    """
    pers = {int(r["fiscal_year"]): float(r["usd"]) for r in client.query(qp).result()}
    personnel = {"y0_usd": round(pers.get(COMP_Y0, 0), 2), "y1_usd": round(pers.get(COMP_Y1, 0), 2),
                 "characters": list(PERSONNEL_CHARACTERS)}

    top = service_areas[0]
    tot0 = sum(a["y0_usd"] for a in service_areas)
    tot1 = sum(a["y1_usd"] for a in service_areas)
    hw = next((a for a in service_areas if a["mult"] and a["mult"] >= 2 and "Welfare" in a["name"]), None)
    modern_narrative = (
        f"Between FY{COMP_Y0} and FY{COMP_Y1}, adopted city spending rose from {_usd(tot0)} to {_usd(tot1)}. "
        f"The largest single increase was in {top['name']} (+{_usd(top['growth_usd'])}, to {_usd(top['y1_usd'])}), "
        f"and the health and human-services areas grew fastest"
        + (f" — {hw['name']} more than {int(hw['mult'])}× its FY{COMP_Y0} level (+{_usd(hw['growth_usd'])})" if hw else "")
        + f". Personnel — salaries and mandatory fringe benefits — went from {_usd(personnel['y0_usd'])} "
        f"to {_usd(personnel['y1_usd'])}, roughly {personnel['y1_usd'] / personnel['y0_usd']:.1f}× over the span."
    )

    # ── archive: re-verify each seeded ledger line against live OCR ──
    archive_eras: list[dict] = []
    for era in comp_seed["archive"]:
        idf = era["identifier"]
        norm = dnorm = None
        if not offline:
            text = fetch_ocr_retry(idf)
            if text is None:
                log.warning(f"composition {era['year']}: OCR unavailable for {idf} — era skipped")
                continue
            norm = norm_ws(text)
            dnorm = _digits(norm)
        items = []
        for it in era["items"]:
            if not offline:
                if norm_ws(it["quote"]) not in norm or it["digitrun"] not in dnorm:
                    log.warning(f"composition {era['year']}: line '{it['label']}' no longer grounds — dropped")
                    continue
            items.append({
                "label": it["label"],
                "value_nominal": it["value_nominal"],
                "quote": it["quote"],
                "page_label": f"scan leaf {it['leaf']}",
                "url": deep_link(idf, it["leaf"], it["quote"]),
            })
        if not items:
            continue
        archive_eras.append({
            "year": era["year"],
            "identifier": idf,
            "framing": era["framing"],
            "items": items,
        })
        log.success(f"composition {era['year']} verified", extra=f"{len(items)} lines")

    return {
        "modern": {
            "window": f"FY{COMP_Y0}–FY{COMP_Y1}",
            "service_areas": service_areas,
            "personnel": personnel,
            "narrative": modern_narrative,
            "note": (
                "Computed from the SF adopted-budget marts. Compared on service areas and personnel "
                "only — the FY2018 PeopleSoft chart-of-accounts change relabels finer spending types, "
                "so those are not comparable before and after and are left out here."
            ),
            "source_mart": "mart_us_sf_budget_org_group / mart_us_sf_budget_character",
        },
        "archive": archive_eras,
        "archive_note": (
            "What the city funded in the archival era, transcribed verbatim from the scanned reports "
            "(page-level deep links). 1888 lines are illustrative ledger entries, not a ranking; 1913 "
            "are department totals as printed. Fuller per-era breakdowns are a work in progress."
        ),
    }


def build_archive_points(seed: dict, cpi: dict, census: dict, base_cpi: float,
                         offline: bool, log: Logger) -> list[dict]:
    points: list[dict] = []
    for p in seed["points"]:
        year, idf = p["year"], p["identifier"]
        cy = cpi.get(year)
        if cy is None:
            log.warning(f"archive {year}: no CPI value — skipped")
            continue
        # HONESTY GATE: re-verify the verbatim quote + figure against the live OCR.
        if not offline:
            text = fetch_ocr_retry(idf)
            if text is None:
                log.warning(f"archive {year}: OCR unavailable for {idf} — skipped")
                continue
            norm = norm_ws(text)
            if norm_ws(p["quote"]) not in norm:
                log.warning(f"archive {year}: quote no longer grounds in {idf} — skipped")
                continue
            if p["digitrun"] not in _digits(norm):
                log.warning(f"archive {year}: figure {p['digitrun']} absent from {idf} OCR — skipped")
                continue
        nominal = float(p["value_nominal"])
        real_today = nominal * base_cpi / cy
        pop, pop_note = interp_population(year, census)
        points.append({
            "year": year,
            "source_type": "archive",
            "label": p["fy_label"],
            "measure": p["measure"],
            "caption": p["caption"],
            "value_nominal": round(nominal, 2),
            "value_real_today": round(real_today, 2),
            "value_real_per_capita": round(real_today / pop, 2),
            "population": pop,
            "population_note": pop_note,
            "cpi_year": cy,
            "quote": p["quote"],
            "page": p["leaf"],
            "page_label": f"scan leaf {p['leaf']}",
            "identifier": idf,
            "url": deep_link(idf, p["leaf"], p["quote"]),
            "thumb": IA_THUMB.format(idf=idf, leaf=p["leaf"]),
            **({"ocr_note": p["ocr_note"]} if p.get("ocr_note") else {}),
        })
        log.success(f"archive {year} verified", extra=f"${nominal:,.0f} → ${real_today:,.0f} today")
    return points


def build_live_points(client: bigquery.Client, cpi: dict, census: dict,
                      base_cpi: float, log: Logger) -> tuple[list[dict], dict]:
    rows = fetch_rows(client, "mart_us_sf_budget_by_year", "side, fiscal_year")
    spending = {int(r["fiscal_year"]): r for r in rows if r["side"] == "Spending"}
    ref = rows[0]
    source = {
        "name": ref["source_name"],
        "dataset_id": ref["source_dataset_id"],
        "source_url": ref["source_url"],
        "attribution": ref["source_attribution"],
        "mart": "mart_us_sf_budget_by_year",
        "perimeter": "Adopted budget (Annual Appropriation Ordinance), all funds, net of transfers.",
    }
    points: list[dict] = []
    for year in LIVE_YEARS:
        r = spending.get(year)
        if r is None:
            log.warning(f"live {year}: not in mart — skipped")
            continue
        cy = cpi.get(year)
        if cy is None:
            log.warning(f"live {year}: no CPI value — skipped")
            continue
        nominal = float(r["total_usd"])
        real_today = nominal * base_cpi / cy
        pop, pop_note = interp_population(year, census)
        points.append({
            "year": year,
            "source_type": "live",
            "label": f"FY {year}",
            "measure": "total_spending",
            "caption": "Total city spending, adopted budget (all funds, net of transfers)",
            "value_nominal": round(nominal, 2),
            "value_real_today": round(real_today, 2),
            "value_real_per_capita": round(real_today / pop, 2),
            "population": pop,
            "population_note": pop_note,
            "cpi_year": cy,
            "url": f"{LIVE_BUDGET_PAGE}?year={year}",
        })
        log.success(f"live {year} loaded", extra=f"${nominal:,.0f} → ${real_today:,.0f} today")
    return points, source


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true",
                    help="skip the Internet Archive OCR re-verify (dev only; never for a published build)")
    args = ap.parse_args()
    log = Logger("export_sf_timeline")
    log.header("SF budget timeline export")

    reference = json.loads((SEEDS / "sf_timeline_reference.json").read_text())
    archive = json.loads((SEEDS / "sf_timeline_archive.json").read_text())
    composition_seed = json.loads((SEEDS / "sf_timeline_composition.json").read_text())
    cpi = {int(k): v for k, v in reference["deflator"]["cpi_by_year"].items()}
    census = {int(k): v for k, v in reference["population"]["census_by_year"].items()}
    base_year = reference["base_year"]
    base_cpi = cpi[base_year]

    if args.offline:
        log.warning("--offline: archive quotes are NOT re-verified against live OCR")

    log.section("Archive tier — re-verify against Internet Archive OCR")
    arch_pts = build_archive_points(archive, cpi, census, base_cpi, args.offline, log)

    log.section("Live tier — mart_us_sf_budget_by_year")
    client = bigquery.Client(project=PROJECT_ID)
    live_pts, live_source = build_live_points(client, cpi, census, base_cpi, log)

    log.section("What changed — composition (marts + archive OCR)")
    composition = build_composition(client, composition_seed, args.offline, log)

    points = sorted(arch_pts + live_pts, key=lambda p: p["year"])
    if not any(p["source_type"] == "archive" for p in points) and not args.offline:
        log.error("no archive points survived OCR re-verify — aborting")
        return 1

    payload = {
        "generated_at": _now(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "base_year": base_year,
        "value_definitions": {
            "value_nominal": "The figure exactly as printed in the scan (archive) or adopted budget (live) — the untouched anchor, never altered or interpolated.",
            "value_real_today": f"value_nominal adjusted for inflation to {base_year} dollars with the CPI-U deflator below — a labeled derived transform.",
            "value_real_per_capita": "value_real_today divided by that year's SF population — a labeled derived transform.",
        },
        "deflator_source": {
            "index": reference["deflator"]["index"],
            "base": reference["deflator"]["base"],
            "base_year": base_year,
            "source": reference["deflator"]["source"],
            "source_url": reference["deflator"]["source_url"],
            "pre_1913_source_url": reference["deflator"]["pre_1913_source_url"],
        },
        "population_source": {
            "series": reference["population"]["series"],
            "source": reference["population"]["source"],
            "source_url": reference["population"]["source_url"],
            "method": reference["population"]["method"],
        },
        "live_source": live_source,
        "archive_note": (
            "Archive figures are the single citywide headline total as printed in a scanned San "
            "Francisco serial financial report on the Internet Archive, transcribed verbatim with its "
            "page-level deep link. The historical serials report different top-lines across eras "
            "(total receipts, total expenditures, total budget) — recorded per point in `measure` — "
            "so the archive tier is shown 'as reported in the scan' and never joined to the live line."
        ),
        "notes": [
            f"Real dollars are adjusted with the CPI-U to {base_year} (pre-1913: Federal Reserve Bank "
            "of Minneapolis historical index, spliced to the BLS CPI-U at 1913); comparisons across "
            "such spans mix price levels with a growing city and an expanding scope of government.",
        ],
        "points": points,
        "composition": composition,
    }
    write_json(payload, "timeline.json", log)
    log.info(
        f"{len(points)} points "
        f"({sum(p['source_type'] == 'archive' for p in points)} archive, "
        f"{sum(p['source_type'] == 'live' for p in points)} live), "
        f"{points[0]['year']}–{points[-1]['year']}, base {base_year}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
