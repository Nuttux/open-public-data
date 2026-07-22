#!/usr/bin/env python3
"""
POC stub: build Marseille `logement-social` JSON files from public ODS APIs.

Sources (in order of priority; degrades gracefully when one is missing):
  1. AMP `parc-locatif-social` ODS API — atlas du parc social de la
     Métropole, segmenté par arrondissement INSEE (13201-13216).
     Bailleur nominatif disponible (contrairement au RPLS national qui
     anonymise) → on peut produire des cards bailleurs Marseille.
  2. AMP `sru-taux` ODS API — taux SRU annuel de la commune Marseille
     (codeinsee 13055), millésimes 2010-2024.

POC limits (flagged via P3.2 option a — sections disparaissent silencieusement) :
  - Pas de tension SLS (DRIHL est IDF-only, équivalent national SNE
    publie sur portail web sans CSV exploitable). La section §05 / §06
    Tension est absente du LogementSocialClient pour Marseille.
  - Pas de drill-down par arrondissement (routes
    /ville/marseille/logement/arrondissement/[arr] non créées en POC).
  - Pas de drill-down par bailleur (routes /bailleur/[slug] non créées
    en POC).
  - Pas de série de production "logements financés / an" (le RPLS atlas
    est un état du stock, pas un flux annuel). Le sparkline et le
    BudgetTimeline §04 utilisent l'évolution du stock SRU.
  - Pas d'enrichissement bailleur descriptif détaillé : on liste juste
    le top-N en parts-de-stock avec un type-label déduit du
    `typebaill` ODS.

Outputs:
  website/public/data/marseille/logement/index.json
  website/public/data/marseille/logement/logement_data.json

Schema cible inferé du loader Paris (`loadLogementSocialData`) — voir
`website/src/lib/fusion-data.ts`.
"""

from __future__ import annotations

import json
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

OUT_DIR = (
    Path(__file__).parent.parent.parent.parent
    / "website" / "public" / "data" / "marseille" / "logement"
)

AMP_API = "https://data.ampmetropole.fr/api/explore/v2.1/catalog/datasets"
COMMUNE_INSEE = "13055"
COMMUNE_NAME_PREFIX = "Marseille"
COMMUNE_NAME_LIKE = "Marseille%"
SRU_TARGET_PCT = 25  # Loi SRU article 55 — commune >100k hab en zone tendue.
USER_AGENT = "qipu-poc/1.0"


def http_get(url: str, timeout: int = 60) -> bytes:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_json(url: str, timeout: int = 60) -> dict:
    return json.loads(http_get(url, timeout=timeout).decode("utf-8"))


def ods_aggregate(dataset: str, *, where: str = "", select: str = "", group_by: str = "",
                  order_by: str = "", limit: int = 100) -> list[dict]:
    """Lightweight ODS Explore v2.1 helper — returns `results` list."""
    params: dict[str, str] = {"limit": str(limit)}
    if where:
        params["where"] = where
    if select:
        params["select"] = select
    if group_by:
        params["group_by"] = group_by
    if order_by:
        params["order_by"] = order_by
    qs = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    url = f"{AMP_API}/{dataset}/records?{qs}"
    data = fetch_json(url)
    return data.get("results", [])


# ─── 1. Taux SRU série annuelle ──────────────────────────────────────────────
def fetch_sru_series() -> list[dict]:
    """Per-year SRU stats for Marseille — 2010 to latest available."""
    rows = ods_aggregate(
        "sru-taux",
        where=f"codeinsee=\"{COMMUNE_INSEE}\"",
        select="commune,millesime,txsru,totlog,rp",
        order_by="millesime asc",
        limit=100,
    )
    cleaned: list[dict] = []
    for r in rows:
        try:
            year = int(str(r.get("millesime", "")).strip()[:4])
        except ValueError:
            continue
        cleaned.append({
            "year": year,
            "tauxSru": float(r.get("txsru") or 0),
            "stockTotal": int(r.get("totlog") or 0),
            "residencesPrincipales": int(r.get("rp") or 0) if r.get("rp") else None,
        })
    cleaned.sort(key=lambda x: x["year"])
    return cleaned


# ─── 2. Parc social par arrondissement (atlas RPLS-AMP) ──────────────────────
def fetch_parc_par_arrondissement() -> list[dict]:
    """Aggregate housing stock per arrondissement INSEE (13201-13216).

    The ODS dataset uses `commune` strings like "Marseille 1er Arrondissement",
    "Marseille 2e Arrondissement", … — we extract the arr number from the
    string since the codeinsee column lumps everything into 13055-style
    aggregates inconsistently. This is the most reliable join.
    """
    rows = ods_aggregate(
        "parc-locatif-social",
        where=f"commune like \"{COMMUNE_NAME_LIKE}\"",
        select="commune,sum(log_tot) as logements,count(*) as operations",
        group_by="commune",
        order_by="commune",
        limit=50,
    )
    out: list[dict] = []
    for r in rows:
        commune = (r.get("commune") or "").strip()
        # Parse arr from "Marseille 1er Arrondissement" / "Marseille 2e …"
        # — keep only those that match the prefix.
        if not commune.startswith(COMMUNE_NAME_PREFIX):
            continue
        rest = commune[len(COMMUNE_NAME_PREFIX):].strip()
        # rest looks like "1er Arrondissement" or "2e Arrondissement" or
        # "16e Arrondissement". Read leading digits.
        digits = ""
        for ch in rest:
            if ch.isdigit():
                digits += ch
            elif digits:
                break
        if not digits:
            continue
        try:
            arr = int(digits)
        except ValueError:
            continue
        if arr < 1 or arr > 16:
            continue
        out.append({
            "arr": arr,
            "logements": int(r.get("logements") or 0),
            "operations": int(r.get("operations") or 0),
        })
    out.sort(key=lambda x: x["arr"])
    return out


# ─── 3. Top bailleurs par parts-de-stock ─────────────────────────────────────
def fetch_top_bailleurs(limit: int = 20) -> list[dict]:
    """Return per-bailleur stock totals across Marseille arrondissements.

    Bailleur typology is mapped from the ODS `typebaill` field to the same
    coarse categories used in the Paris page (OPH, ESH/SA HLM, SEM, EPL,
    Coopérative, Autre).
    """
    rows = ods_aggregate(
        "parc-locatif-social",
        where=f"commune like \"{COMMUNE_NAME_LIKE}\"",
        select="bailleur,typebaill,sum(log_tot) as logements,count(*) as operations",
        group_by="bailleur,typebaill",
        order_by="logements desc",
        limit=limit,
    )
    out: list[dict] = []
    for r in rows:
        name = (r.get("bailleur") or "").strip()
        if not name:
            continue
        out.append({
            "name": name,
            "type_raw": (r.get("typebaill") or "").strip(),
            "logements": int(r.get("logements") or 0),
            "operations": int(r.get("operations") or 0),
        })
    return out


def normalise_bailleur_type(raw: str) -> str:
    """Map the raw `typebaill` ODS string to a short FR label."""
    r = (raw or "").lower()
    if "office" in r:
        return "OPH"
    if "entreprise sociale" in r or "esh" in r:
        return "ESH"
    if "économie mixte" in r or "sem" in r:
        return "SEM"
    if "coopér" in r or "coop." in r:
        return "Coopérative"
    if "société publique" in r or "spla" in r or "spl" in r:
        return "SPL/SPLA"
    if "société anonyme" in r or "sa hlm" in r:
        return "SA HLM"
    if "filiale" in r or "groupe" in r:
        return "Filiale"
    return "Autre"


def coerce_bailleur_color(idx: int) -> str:
    palette = ["#a67638", "#2a3680", "#1e45e4", "#5f6672", "#9099a6", "#7a8295"]
    return palette[idx % len(palette)]


# ─── Main ────────────────────────────────────────────────────────────────────
def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("=== Marseille logement social POC stub ===")

    print("[1/3] SRU série annuelle …")
    sru = fetch_sru_series()
    if not sru:
        print("  ! aucun millésime SRU récupéré, abort", file=sys.stderr)
        return 1
    latest = sru[-1]
    print(f"   -> {len(sru)} années ({sru[0]['year']}→{latest['year']}); "
          f"taux {latest['tauxSru']} % ; stock {latest['stockTotal']:,}".replace(",", " "))

    print("[2/3] Parc par arrondissement …")
    by_arr = fetch_parc_par_arrondissement()
    print(f"   -> {len(by_arr)} arrondissements, total atlas "
          f"{sum(a['logements'] for a in by_arr):,} logements".replace(",", " "))

    print("[3/3] Top bailleurs …")
    bailleurs_raw = fetch_top_bailleurs()
    total_atlas = sum(b["logements"] for b in bailleurs_raw)
    bailleurs: list[dict] = []
    if total_atlas > 0:
        # Featured = top 5, rest aggregated in "Autres" for the share calc.
        featured = bailleurs_raw[:5]
        others_total = sum(b["logements"] for b in bailleurs_raw[5:])
        for i, b in enumerate(featured):
            share = round(100 * b["logements"] / total_atlas, 1)
            t = normalise_bailleur_type(b["type_raw"])
            bailleurs.append({
                "name": b["name"],
                "type": t,
                "color": coerce_bailleur_color(i),
                "share": share,
                "description": (
                    f"Bailleur social — {b['logements']:,} logements"
                    f" ({b['operations']} opérations) recensés dans le parc social"
                    " de la Métropole AMP sur Marseille."
                ).replace(",", " "),
            })
        if others_total > 0:
            other_share = round(100 * others_total / total_atlas, 1)
            bailleurs.append({
                "name": "Autres bailleurs",
                "type": "Divers",
                "color": "#e4e6ea",
                "share": other_share,
                "description": (
                    f"Cumul des autres bailleurs présents à Marseille hors top 5 — "
                    f"{others_total:,} logements".replace(",", " ")
                ),
            })
    print(f"   -> {len(bailleurs)} cards bailleurs (top 5 + Autres)")

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── Writes ────────────────────────────────────────────────────────────
    available_years = [r["year"] for r in sru]
    picked_year = latest["year"]

    # yearsSummary — use SRU stock series (no annual production flow available
    # at commune level for Marseille in open ODS yet; the Paris-side equivalent
    # uses CA-financed flow, which Marseille publishes only by-PDF).
    years_summary = [
        {"year": r["year"], "logements": r["stockTotal"]}
        for r in sru
    ]

    # nouveauxParAn approx: stock delta YoY (positive only). For the latest year,
    # diff vs previous available year — communicates "le stock a augmenté de N
    # cette année" rather than a real "logements financés".
    nouveaux = 0
    nb_operations = 0  # Pas de "nouvelles opérations financées" pour Marseille en POC
    if len(sru) >= 2:
        nouveaux = max(0, sru[-1]["stockTotal"] - sru[-2]["stockTotal"])

    logement_data = {
        "year": picked_year,
        "availableYears": available_years,
        "nouveauxParAn": nouveaux,
        "nbOperations": nb_operations,
        "sruRatio": latest["tauxSru"],
        "sruTarget": SRU_TARGET_PCT,
        "sruYear": picked_year,
        "stockTotal": latest["stockTotal"],
        "byArrondissement": by_arr,
        "bailleurs": bailleurs,
        "bailleursAll": bailleurs,  # POC: pas de hors-bilan / aménageurs Marseille
        "yearsSummary": years_summary,
        # Tension: Marseille n'a pas d'équivalent DRIHL exploitable en open data.
        # On émet null, le client gère la disparition silencieuse de la section.
        "tension": None,
        "_meta": {
            "generated_at": generated_at,
            "sources": {
                "sru": {
                    "name": "Atelier Métropole AMP — taux SRU",
                    "url": "https://data.ampmetropole.fr/explore/dataset/sru-taux/",
                },
                "parc": {
                    "name": "Atelier Métropole AMP — parc locatif social (RPLS)",
                    "url": "https://data.ampmetropole.fr/explore/dataset/parc-locatif-social/",
                },
            },
            "limits": [
                "Pas de tension SLS / DRIHL pour Marseille (DRIHL = IDF-only).",
                "Pas de drill-down arrondissement / bailleur en POC.",
                "yearsSummary = stock SRU annuel (pas un flux 'logements financés / an').",
            ],
        },
    }

    out_data = OUT_DIR / "logement_data.json"
    with open(out_data, "w", encoding="utf-8") as f:
        json.dump(logement_data, f, ensure_ascii=False, indent=2)
    print(f"   → {out_data.name}")

    index = {
        "generated_at": generated_at,
        "source": "Métropole AMP — sru-taux + parc-locatif-social (ODS)",
        "note": (
            "POC stub Marseille — atlas du parc social agrégé Métropole AMP "
            "filtré sur les 16 arrondissements de Marseille. yearsSummary = "
            "série annuelle du stock SRU."
        ),
        "availableYears": available_years,
        "totalsByYear": {
            str(r["year"]): {
                "stockTotal": r["stockTotal"],
                "tauxSru": r["tauxSru"],
            }
            for r in sru
        },
    }
    out_index = OUT_DIR / "index.json"
    with open(out_index, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"   → {out_index.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
