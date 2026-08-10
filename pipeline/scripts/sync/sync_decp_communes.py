#!/usr/bin/env python3
"""
Fetch DECP (marchés publics) for the 10 registered communes → JSON aggregates.

Source: data.gouv.fr — donnees-essentielles-de-la-commande-publique consolidées
        Resource ID: 22847056-61df-452d-837d-8b8ceadbfc52
        ~5-10k marchés per big French city (cumulative).

For each commune, we paginate through all marchés where acheteur_id starts
with the commune SIREN (acheteur_id is the SIRET — 14 digits — but starts
with the 9-digit SIREN of the local authority, so __contains works).

We aggregate locally (the API doesn't support group_by) into:
  - total_count : nombre total de marchés
  - total_montant : somme totale des montants (€)
  - by_year : montant + count par année (5 dernières années)
  - top_titulaires : 15 plus gros fournisseurs cumulés (5 dernières années)
  - quality : couverture estimée (% de marchés avec montant valide)

⚠ DECP qualité 50-70% au national : on **affiche** la couverture pour
honnêteté, sans masquer les chiffres bruts.

Output:
    website/public/data/communes/{slug}_marches.json
"""

import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DECP_RESOURCE_ID = "22847056-61df-452d-837d-8b8ceadbfc52"
API_BASE = f"https://tabular-api.data.gouv.fr/api/resources/{DECP_RESOURCE_ID}/data/"

ROOT = Path(__file__).parent.parent.parent.parent
SEED_FILE = ROOT / "pipeline" / "seeds" / "seed_communes_cibles.csv"
OUTPUT_DIR = ROOT / "pipeline" / "cache" / "wip" / "communes"

PAGE_SIZE = 200
TOP_N_TITULAIRES = 15
WINDOW_YEARS = 5  # last N years for top titulaires

# Outlier cap: any single marché above this is treated as data-entry error.
# Set to 200 M€ — drops Nice's many "fill" values (399_999_996, 399_996_000,
# etc.) that systematically inflate cumulative totals. Trade-off: a handful
# of legit Paris contracts above 200 M€ (CIELIS street lighting 569 M€,
# LINKT telecoms 550 M€) are also dropped — but the alternative would be
# reporting Nice at multiple times its real volume, which is worse for
# trust. Real impact on Paris cumulative: ~5%.
MAX_PLAUSIBLE_MONTANT = 200_000_000


def load_communes() -> list[dict]:
    out = []
    with open(SEED_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            out.append(row)
    return out


def fetch_paginated(siren: str) -> list[dict]:
    out = []
    page = 1
    while True:
        params = {
            "acheteur_id__contains": siren,
            "page_size": str(PAGE_SIZE),
            "page": str(page),
        }
        url = f"{API_BASE}?{urlencode(params)}"
        req = Request(url, headers={"User-Agent": "Qipu/1.0"})
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        rows = data.get("data", []) or []
        if not rows:
            break
        out.extend(rows)
        if len(rows) < PAGE_SIZE:
            break
        page += 1
        if page > 100:  # safety
            print(f"    ⚠ stopped at page {page}")
            break
    return out


def aggregate(rows: list[dict], commune_siren: str) -> dict:
    """Compute the aggregates we ship to the frontend."""
    current_year = datetime.now().year
    cutoff_year = current_year - WINDOW_YEARS

    # Filter to rows whose acheteur_id starts with the commune SIREN
    # (defensive — __contains may match elsewhere in the SIRET)
    siren_match = [r for r in rows if str(r.get("acheteur_id", "")).startswith(commune_siren)]

    # Deduplicate by uid: some collectivities (Nice notably) publish the
    # same marché multiple times in DECP — one row per lot/titulaire — which
    # massively inflates aggregates if not handled.
    seen_uids: set[str] = set()
    valid = []
    duplicates_dropped = 0
    for r in siren_match:
        uid = str(r.get("uid") or "").strip()
        if uid and uid in seen_uids:
            duplicates_dropped += 1
            continue
        if uid:
            seen_uids.add(uid)
        valid.append(r)

    total_count = len(valid)
    valid_montant = []
    outliers_dropped = 0
    sentinels_dropped = 0
    for r in valid:
        m = r.get("montant")
        if m is None:
            continue
        try:
            f = float(m)
        except (TypeError, ValueError):
            continue
        if f <= 0:
            continue
        if f > MAX_PLAUSIBLE_MONTANT:
            outliers_dropped += 1
            continue
        # Sentinel detection: Nice and a few others publish "fill" values
        # like 39_999_999_996, 399_999_996, 39_999_996 (pattern: ends in 9999996).
        # These are placeholders, not real prices.
        if f >= 1_000_000:
            int_f = int(f)
            if int_f % 10_000_000 == 9_999_996 or int_f % 1_000_000 == 999_996:
                sentinels_dropped += 1
                continue
        valid_montant.append((f, r))

    total_montant = sum(f for f, _ in valid_montant)
    coverage_pct = round(100 * len(valid_montant) / total_count, 1) if total_count else 0

    # By year (montant only — counts include NULL-amount marchés)
    by_year_amount: dict[int, float] = defaultdict(float)
    by_year_count: dict[int, int] = defaultdict(int)
    for r in valid:
        date_str = str(r.get("dateNotification") or "")
        if len(date_str) >= 4:
            try:
                yr = int(date_str[:4])
            except ValueError:
                continue
            if 2010 <= yr <= current_year:
                by_year_count[yr] += 1
                m = r.get("montant")
                try:
                    f = float(m) if m is not None else 0
                    if 0 < f <= MAX_PLAUSIBLE_MONTANT:
                        # Same sentinel detection as above
                        if f >= 1_000_000:
                            int_f = int(f)
                            if int_f % 10_000_000 == 9_999_996 or int_f % 1_000_000 == 999_996:
                                continue
                        by_year_amount[yr] += f
                except (TypeError, ValueError):
                    pass

    by_year_sorted = sorted(set(by_year_amount.keys()) | set(by_year_count.keys()))
    by_year = [
        {
            "year": y,
            "montant": int(round(by_year_amount.get(y, 0))),
            "count": by_year_count.get(y, 0),
        }
        for y in by_year_sorted
    ]

    # Top titulaires (last WINDOW_YEARS years only)
    titulaire_total: dict[str, dict] = {}
    for f, r in valid_montant:
        date_str = str(r.get("dateNotification") or "")
        try:
            yr = int(date_str[:4]) if len(date_str) >= 4 else 0
        except ValueError:
            yr = 0
        if yr < cutoff_year:
            continue
        tid = str(r.get("titulaire_id") or "?")
        nom = str(r.get("titulaire_nom") or "?").strip()
        # Group by titulaire_id, fall back to name
        key = tid if tid != "?" else f"name:{nom}"
        if key not in titulaire_total:
            titulaire_total[key] = {
                "id": tid,
                "nom": nom,
                "montant": 0.0,
                "count": 0,
            }
        titulaire_total[key]["montant"] += f
        titulaire_total[key]["count"] += 1

    top_titulaires = sorted(
        titulaire_total.values(), key=lambda x: x["montant"], reverse=True
    )[:TOP_N_TITULAIRES]
    top_titulaires_out = [
        {
            "id": t["id"],
            "nom": t["nom"],
            "montant": int(round(t["montant"])),
            "count": t["count"],
        }
        for t in top_titulaires
    ]

    return {
        "total_count": total_count,
        "total_montant": int(round(total_montant)),
        "coverage_pct": coverage_pct,
        "n_with_montant": len(valid_montant),
        "duplicates_dropped": duplicates_dropped,
        "outliers_dropped": outliers_dropped,
        "sentinels_dropped": sentinels_dropped,
        "max_plausible_montant": MAX_PLAUSIBLE_MONTANT,
        "by_year": by_year,
        "top_titulaires_window_years": WINDOW_YEARS,
        "top_titulaires": top_titulaires_out,
    }


def main() -> int:
    print("→ DECP communes sync")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    communes = load_communes()
    print(f"  {len(communes)} communes to fetch")

    for c in communes:
        slug = c["slug"]
        siren = c["siren"]
        print(f"  → {c['nom']} (SIREN {siren})")
        try:
            rows = fetch_paginated(siren)
            print(f"    fetched {len(rows)} marchés")
            agg = aggregate(rows, siren)
            payload = {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "source": "data.gouv.fr — DECP consolidés",
                "source_url": "https://www.data.gouv.fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/",
                "source_resource_id": DECP_RESOURCE_ID,
                "commune": {
                    "slug": slug,
                    "nom": c["nom"],
                    "siren": siren,
                },
                "aggregates": agg,
                "notes_fr": (
                    f"Marchés publics filtrés par SIREN acheteur ({siren}). Couverture estimée "
                    f"de la qualité montant : {agg['coverage_pct']}% des marchés ont un montant "
                    f"non-nul renseigné. La DECP au national est connue pour avoir une qualité "
                    "variable selon les acheteurs ; les chiffres ci-dessous sont bruts, "
                    "non corrigés."
                ),
                "notes_en": (
                    f"Public procurement filtered by buyer SIREN ({siren}). Estimated quality "
                    f"coverage: {agg['coverage_pct']}% of contracts have a non-zero amount. "
                    "DECP is known for variable quality across buyers; numbers below are raw, "
                    "unadjusted."
                ),
            }
            out_file = OUTPUT_DIR / f"{slug}_marches.json"
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            print(
                f"    ✓ {out_file.name}  total={agg['total_count']}  "
                f"montant={agg['total_montant'] / 1e6:.0f} M€  "
                f"coverage={agg['coverage_pct']}%"
            )
        except Exception as e:
            print(f"    ✗ FAILED: {e}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
