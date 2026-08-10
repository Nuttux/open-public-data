#!/usr/bin/env python3
"""
Fetch PLF datasets (Budget Général) → JSON for /etat page.

Source: data.economie.gouv.fr — multiple PLF datasets per year.

Periods supported:
    2025  : plf25-depenses-2025-selon-destination
    2024  : plf-2024-depenses-2024-selon-nomenclatures-destination-et-nature
            (slightly different schema, mapped to common shape)

Périmètre: typebudget = 'BG' uniquement (Budget Général).

⚠ La mission « Remboursements et dégrèvements » (~147 Md€) regroupe les
restitutions d'impôts. Comptablement elle est dans le BG mais
conceptuellement c'est une réduction des recettes, pas une dépense
au sens usuel. On la signale séparément (total brut / total net hors R&D).

Output:
    website/public/data/national/etat_lfi_{year}.json   per year
    website/public/data/national/etat_lfi_index.json    list of years + latest
"""

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OUTPUT_DIR = (
    Path(__file__).parent.parent.parent.parent / "pipeline" / "cache" / "wip" / "national"
)

# Code mission technique exclue du calcul "net" (restitutions d'impôts)
MISSION_REMB = "Remboursements et dégrèvements"

# Per-year config: dataset id + page slug for source_url + column mapping function
# `map_row` takes a raw record dict and returns:
#   { typebudget, mission, libelle_mission, programme, libelle_programme, ae, cp }
def map_row_2025(r: dict) -> dict | None:
    return {
        "typebudget": r.get("typebudget"),
        "mission": str(r.get("mission") or "?"),
        "libelle_mission": r.get("libelle_mission") or "?",
        "programme": str(r.get("programme") or "?"),
        "libelle_programme": r.get("libelle_programme") or "?",
        "ae": r.get("autorisation_engagement") or 0,
        "cp": r.get("credit_de_paiement") or 0,
    }


def map_row_2024(r: dict) -> dict | None:
    # PLF 2024 has different column names (ae_plf / cp_plf, type_mission, code_mission)
    return {
        "typebudget": r.get("type_mission"),
        "mission": str(r.get("code_mission") or "?"),
        "libelle_mission": r.get("mission") or "?",
        "programme": str(int(r.get("programme"))) if r.get("programme") is not None else "?",
        "libelle_programme": r.get("libelle_programme") or "?",
        "ae": r.get("ae_plf") or 0,
        "cp": r.get("cp_plf") or 0,
    }


YEARS_CONFIG = {
    2025: {
        "dataset_id": "plf25-depenses-2025-selon-destination",
        "page_slug": "plf-2025-depenses-2025-selon-destination",
        "map_row": map_row_2025,
    },
    2024: {
        "dataset_id": "plf-2024-depenses-2024-selon-nomenclatures-destination-et-nature",
        "page_slug": "plf-2024-depenses-2024-selon-nomenclatures-destination-et-nature",
        "map_row": map_row_2024,
    },
}


def fetch_all(dataset_id: str) -> list[dict]:
    """Page through all records using offset pagination."""
    api_base = (
        f"https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/{dataset_id}/records"
    )
    out = []
    offset = 0
    limit = 100
    while True:
        params = {
            "limit": str(limit),
            "offset": str(offset),
        }
        url = f"{api_base}?{urlencode(params)}"
        req = Request(url, headers={"User-Agent": "Qipu/1.0"})
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        results = data.get("results", [])
        out.extend(results)
        if len(results) < limit:
            break
        offset += limit
        if offset > 5000:
            break
    return out


def aggregate_missions(rows: list[dict], mapper) -> list[dict]:
    """Group BG rows by mission with totals + programmes inside."""
    by_mission: dict[str, dict] = {}
    for raw in rows:
        r = mapper(raw)
        if r is None:
            continue
        if r["typebudget"] != "BG":
            continue
        m_code = r["mission"]
        m_label = r["libelle_mission"]
        if m_code not in by_mission:
            by_mission[m_code] = {
                "code": m_code,
                "label": m_label,
                "ae": 0.0,
                "cp": 0.0,
                "programmes": defaultdict(lambda: {"code": "", "label": "", "ae": 0.0, "cp": 0.0}),
            }
        by_mission[m_code]["ae"] += float(r["ae"])
        by_mission[m_code]["cp"] += float(r["cp"])

        prog = by_mission[m_code]["programmes"][r["programme"]]
        prog["code"] = r["programme"]
        prog["label"] = r["libelle_programme"]
        prog["ae"] += float(r["ae"])
        prog["cp"] += float(r["cp"])

    out = []
    for m in by_mission.values():
        progs = sorted(m["programmes"].values(), key=lambda p: p["cp"], reverse=True)
        out.append({
            "code": m["code"],
            "label": m["label"],
            "ae": round(m["ae"]),
            "cp": round(m["cp"]),
            "programmes": [
                {"code": p["code"], "label": p["label"], "ae": round(p["ae"]), "cp": round(p["cp"])}
                for p in progs
            ],
        })
    out.sort(key=lambda m: m["cp"], reverse=True)
    return out


def build_year(year: int) -> tuple[Path, dict]:
    cfg = YEARS_CONFIG[year]
    print(f"\n→ PLF {year} sync (dataset: {cfg['dataset_id']})")
    rows = fetch_all(cfg["dataset_id"])
    print(f"  Fetched {len(rows)} rows")

    missions = aggregate_missions(rows, cfg["map_row"])
    print(f"  Aggregated {len(missions)} BG missions")

    total_bg_brut_cp = sum(m["cp"] for m in missions)
    total_bg_brut_ae = sum(m["ae"] for m in missions)
    remb = next((m for m in missions if m["label"] == MISSION_REMB), None)
    total_bg_net_cp = total_bg_brut_cp - (remb["cp"] if remb else 0)
    total_bg_net_ae = total_bg_brut_ae - (remb["ae"] if remb else 0)

    payload = {
        "perimeter": "Budget Général de l'État",
        "perimeter_label_fr": "Budget Général de l'État (BG) — PLF",
        "perimeter_label_en": "Central government Budget Général (BG) — PLF",
        "source": f"data.economie.gouv.fr — {cfg['dataset_id']}",
        "source_url": f"https://www.data.gouv.fr/datasets/{cfg['page_slug']}/",
        "source_dataset_id": cfg["dataset_id"],
        "exercice": year,
        "loi": "PLF",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "bg_brut_cp": total_bg_brut_cp,
            "bg_brut_ae": total_bg_brut_ae,
            "bg_net_cp": total_bg_net_cp,
            "bg_net_ae": total_bg_net_ae,
            "remboursements_degrev_cp": remb["cp"] if remb else 0,
            "remboursements_degrev_ae": remb["ae"] if remb else 0,
            "n_missions": len(missions),
        },
        "missions": missions,
        "notes_fr": (
            "Périmètre : Budget Général (BG) du PLF — pas les comptes spéciaux ni les "
            "budgets annexes. La mission « Remboursements et dégrèvements » regroupe les "
            "restitutions d'impôts (crédits d'impôt, TVA déductible) ; elle est techniquement "
            "dans le BG mais représente une réduction de recettes plutôt qu'une dépense au "
            "sens usuel — d'où le total « net » qui l'exclut. Le budget de l'État ne couvre "
            "que ~25 % des dépenses publiques totales (APU) — voir page /apu pour la vue "
            "consolidée incluant Sécurité sociale, collectivités et opérateurs."
        ),
        "notes_en": (
            "Scope: General Budget (BG) of the PLF — does not include special accounts or "
            "annex budgets. The « Remboursements et dégrèvements » mission groups tax "
            "refunds (tax credits, VAT deductions); it is technically in the BG but is a "
            "revenue reduction rather than spending in the usual sense — hence the « net » "
            "total which excludes it. The State budget covers only ~25% of total public "
            "spending (APU) — see /apu for the consolidated view including social security, "
            "local authorities and operators."
        ),
    }

    out_file = OUTPUT_DIR / f"etat_lfi_{year}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Wrote {out_file.name}")
    print(
        f"  BG brut CP: {total_bg_brut_cp / 1e9:.1f} Md€ · "
        f"BG net (hors R&D): {total_bg_net_cp / 1e9:.1f} Md€ · "
        f"R&D: {(remb['cp'] / 1e9 if remb else 0):.1f} Md€"
    )
    return out_file, payload


def main() -> int:
    print("→ État LFI sync (multi-year)")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    years_done = []
    for year in sorted(YEARS_CONFIG.keys()):
        try:
            build_year(year)
            years_done.append(year)
        except Exception as e:
            print(f"  ✗ {year} FAILED: {e}")

    # Index file
    latest_year = max(years_done) if years_done else None
    index = {
        "available_years": years_done,
        "latest_year": latest_year,
        "loi": "PLF",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(OUTPUT_DIR / "etat_lfi_index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"\n  ✓ Index updated, latest_year={latest_year}, available={years_done}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
