#!/usr/bin/env python3
"""
Sync DGFiP `balances-comptables-...-presentation-croisee-nature-fonction-2024`
→ ventilation fonctionnelle communale par INSEE.

Pourquoi ce script existe :
    Le précédent agent (`sync_ofgl_communes_fonctionnelle.py`) a constaté qu'OFGL
    n'expose pas la ventilation fonctionnelle COMMUNE-par-COMMUNE et est tombé
    en repli sur le seed national agrégé. Mais DGFiP (data.economie.gouv.fr)
    publie un dataset distinct, *à présentation croisée nature-fonction*, où le
    champ FONCTION est rempli pour les communes qui ont voté un budget par
    fonction OU par nature avec ventilation fonctionnelle obligatoire (≥ seuil
    de population). Ce script reconstruit la fonctionnelle par INSEE à partir
    de cette source primaire.

Source :
    https://data.economie.gouv.fr/explore/dataset/
        balances-comptables-des-collectivites-et-des-etablissements-publics-
        locaux-avec-la-presentation-croisee-nature-fonction-2024/
    Attachment ZIP : ~70 MB, CSV décompressé ~835 MB → streaming obligatoire.

Méthode :
    1. Téléchargement du ZIP DGFiP dans `pipeline/cache/dgfip/`.
    2. Streaming du CSV ligne par ligne (pas de pandas).
    3. Filtre :
         CATEG = "Commune" OU CATEG = "PARIS"
         CBUDG = "1"  (budget principal uniquement)
         BAL = "DEF"  (balance définitive)
         FONCTION non vide
         COMPTE commence par "6" (charges fonctionnement) OU "2" (immobilisations)
    4. Code fonction principal :
         - Si FONCTION commence par "9" (vote par fonction) : 3e caractère
           (ex 90020 → fonction 0, 93421 → fonction 4).
         - Sinon (vote par nature, code 0-9) : 1er caractère
           (ex 020 → fonction 0, 252 → fonction 2).
    5. Agrégation : somme des OBNETDEB (montant débité net des annulations).
    6. Calcul des shares par commune et de la moyenne nationale pondérée.

Mappage fonction → label (nomenclature M14/M57 standard, circulaire DGCL 2016) :
    0 = Services généraux (administration)
    1 = Sécurité et salubrité publiques (police municipale, hygiène)
    2 = Enseignement-formation (écoles, cantines)
    3 = Culture (bibliothèques, musées, conservatoires)
    4 = Sport et jeunesse
    5 = Interventions sociales et santé (CCAS, aide sociale)
    6 = Famille (crèches, halte-garderie)
    7 = Logement
    8 = Aménagement et services urbains, environnement (voirie, propreté, déchets)
    9 = Action économique

Output :
    website/public/data/communes-all/fonctionnelle-by-insee.json
    Format documenté dans le mandat (voir bottom of file pour schema).

Caveats :
    - Seules ~3 400 communes (sur 35 000) ont au moins une fonction renseignée
      dans la balance DGFiP — la ventilation fonctionnelle n'est obligatoire
      qu'au-dessus de certains seuils de population. On émet donc le JSON
      uniquement pour ces communes ; pour les autres, on fournit la moyenne
      nationale pondérée comme fallback côté client.
    - Le code INSEE complet = NDEPT + INSEE (le champ INSEE seul est sur 3
      caractères et représente la position dans le département).
    - Pour Paris, NDEPT="075" et INSEE="056" → INSEE complet "75056".
    - Pour les départements 2A/2B (Corse), NDEPT est "02A"/"02B" → on garde
      la concaténation littérale.

Idempotent : oui (re-télécharge le ZIP seulement s'il manque ou si --force).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# Constantes

ROOT = Path(__file__).parent.parent.parent.parent
CACHE_DIR = ROOT / "pipeline" / "cache" / "dgfip"
OUTPUT_DIR = ROOT / "pipeline" / "cache" / "wip" / "communes-all"
OUTPUT_FILE = OUTPUT_DIR / "fonctionnelle-by-insee.json"

DATASET_ID = (
    "balances-comptables-des-collectivites-et-des-etablissements-publics-"
    "locaux-avec-la-presentation-croisee-nature-fonction-2024"
)
ATTACHMENT_URL = (
    f"https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
    f"{DATASET_ID}/attachments/balancespl_fonction_2024_dec2025_zip"
)
DATASET_PAGE = f"https://data.economie.gouv.fr/explore/dataset/{DATASET_ID}/"
ZIP_NAME = "BalanceSPL_Fonction_2024_Dec2025.zip"
CSV_NAME = "BalanceSPL_Fonction_2024_Dec2025.csv"
YEAR = 2024

# Mapping fonction principale (0-9) → clé sortie + libellés
FONCTIONS = [
    ("f0_services_generaux",
     "Services généraux", "General administration"),
    ("f1_securite",
     "Sécurité et salubrité publiques", "Security and public health"),
    ("f2_enseignement",
     "Enseignement-formation", "Education and training"),
    ("f3_culture",
     "Culture", "Culture"),
    ("f4_sport_jeunesse",
     "Sport et jeunesse", "Sports and youth"),
    ("f5_social_sante",
     "Interventions sociales et santé", "Social action and health"),
    ("f6_famille",
     "Famille", "Family (childcare)"),
    ("f7_logement",
     "Logement", "Housing"),
    ("f8_amenagement_env",
     "Aménagement, environnement", "Urban planning, environment"),
    ("f9_action_eco",
     "Action économique", "Economic action"),
]

# Index columns in CSV (semicolon-separated, header verified manually)
COL_NDEPT = 2
COL_LBUDG = 3
COL_INSEE = 5
COL_CBUDG = 6
COL_NOMEN = 9
COL_CATEG = 16
COL_BAL = 17
COL_FONCTION = 18
COL_COMPTE = 19
COL_OBNETDEB = 22


# ---------------------------------------------------------------------------
# Helpers

def _log(msg: str) -> None:
    print(msg, flush=True)


def download_zip(force: bool = False) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / ZIP_NAME
    if target.exists() and not force:
        size_mb = target.stat().st_size / (1024 * 1024)
        _log(f"  ✓ Cache hit: {target.name} ({size_mb:.1f} MB) — skip download")
        return target
    _log(f"  → Download {ATTACHMENT_URL}")
    req = Request(ATTACHMENT_URL, headers={"User-Agent": "open-data-paris/1.0"})
    with urlopen(req, timeout=600) as resp:
        with open(target, "wb") as f:
            while True:
                chunk = resp.read(1 << 20)  # 1 MB chunks
                if not chunk:
                    break
                f.write(chunk)
    size_mb = target.stat().st_size / (1024 * 1024)
    _log(f"  ✓ Downloaded {target.name} ({size_mb:.1f} MB)")
    return target


def parse_obnetdeb(s: str) -> float:
    if not s:
        return 0.0
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return 0.0


def fonction_principale(code: str) -> str | None:
    """Extract single-digit primary function code (0-9) from FONCTION cell."""
    if not code:
        return None
    if code.startswith("9"):
        # Vote par fonction : "9" + section (0-9) + fonction (0-9) + sous-rubrique
        if len(code) >= 3 and code[2].isdigit():
            return code[2]
        return None
    # Vote par nature : 1er chiffre = fonction principale
    if code[0].isdigit():
        return code[0]
    return None


# ---------------------------------------------------------------------------
# Streaming aggregation

def stream_aggregate(zip_path: Path) -> tuple[
    dict[str, dict],   # by_insee → {fonctions: {key: amount}, total: float, libelle}
    dict[str, float],  # national totals by fonction key
    int,               # rows_kept
    int,               # rows_skipped
]:
    by_insee: dict[str, dict] = {}
    national: dict[str, float] = defaultdict(float)
    rows_kept = 0
    rows_skipped = 0

    fonc_key_by_digit = {str(i): FONCTIONS[i][0] for i in range(10)}

    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(CSV_NAME, "r") as raw:
            text = (line.decode("utf-8", errors="replace") for line in raw)
            reader = csv.reader(text, delimiter=";")
            header = next(reader, None)
            if header is None:
                raise RuntimeError("Empty CSV")
            # Validate column positions vs header
            assert header[COL_FONCTION].lower() == "fonction", \
                f"FONCTION column at unexpected position; header={header}"
            assert header[COL_OBNETDEB].lower() == "obnetdeb", \
                f"OBNETDEB column at unexpected position; header={header}"

            for row in reader:
                if len(row) < 24:
                    rows_skipped += 1
                    continue
                # Filter: communes only, budget principal, balance définitive,
                # fonction renseignée
                categ = row[COL_CATEG]
                if categ not in ("Commune", "PARIS"):
                    rows_skipped += 1
                    continue
                if row[COL_CBUDG] != "1":
                    rows_skipped += 1
                    continue
                if row[COL_BAL] != "DEF":
                    rows_skipped += 1
                    continue
                fcode = row[COL_FONCTION]
                if not fcode:
                    rows_skipped += 1
                    continue
                # Expenditure-side comptes only
                compte = row[COL_COMPTE]
                if not compte or compte[0] not in ("6", "2"):
                    rows_skipped += 1
                    continue
                # Resolve fonction
                fdigit = fonction_principale(fcode)
                if fdigit is None:
                    rows_skipped += 1
                    continue
                amount = parse_obnetdeb(row[COL_OBNETDEB])
                if amount <= 0:
                    rows_skipped += 1
                    continue

                ndept = row[COL_NDEPT]
                ins3 = row[COL_INSEE]
                if not ndept or not ins3:
                    rows_skipped += 1
                    continue
                # Build full INSEE: NDEPT (3 chars, may include "0" prefix) + INSEE3
                # Standard 5-digit code → strip leading 0 of NDEPT (except 02A/02B/...)
                if ndept[0] == "0" and ndept[1:].isdigit():
                    ndept_short = ndept[1:]  # "001" → "01", "075" → "75"
                else:
                    ndept_short = ndept     # "02A", "02B", "101", ...
                insee_full = f"{ndept_short}{ins3}".zfill(5)

                fkey = fonc_key_by_digit[fdigit]
                bucket = by_insee.setdefault(insee_full, {
                    "libelle": row[COL_LBUDG],
                    "fonctions": defaultdict(float),
                    "total": 0.0,
                })
                bucket["fonctions"][fkey] += amount
                bucket["total"] += amount
                national[fkey] += amount
                rows_kept += 1

    return by_insee, dict(national), rows_kept, rows_skipped


# ---------------------------------------------------------------------------
# Output building

def build_payload(
    by_insee: dict,
    national: dict[str, float],
    source_url: str,
) -> dict:
    fonction_keys = [k for k, _, _ in FONCTIONS]
    label_fr = {k: fr for k, fr, _ in FONCTIONS}
    label_en = {k: en for k, _, en in FONCTIONS}

    # Per-commune: compute shares (round to 4 dp)
    by_insee_out: dict[str, dict] = {}
    for insee, bucket in by_insee.items():
        total = bucket["total"]
        if total <= 0:
            continue
        fons = {}
        for k in fonction_keys:
            amt = bucket["fonctions"].get(k, 0.0)
            fons[k] = {
                "share": round(amt / total, 4),
                "montant": round(amt, 0),
            }
        by_insee_out[insee] = {
            "libelle": bucket["libelle"],
            "total": round(total, 0),
            "fonctions": fons,
        }

    # National pondéré (somme des dépenses / somme totale)
    nat_total = sum(national.values())
    nat_out: dict[str, dict] = {}
    for k in fonction_keys:
        amt = national.get(k, 0.0)
        nat_out[k] = {
            "share": round(amt / nat_total, 4) if nat_total else 0.0,
            "montant": round(amt, 0),
            "label_fr": label_fr[k],
            "label_en": label_en[k],
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "DGFiP — Balances comptables 2024 (présentation croisée nature-fonction)",
        "source_url": source_url,
        "year": YEAR,
        "scope": "communes_budget_principal_avec_fonction_renseignee",
        "scope_note_fr": (
            "Reconstruction de la ventilation fonctionnelle par commune à partir "
            "du dataset DGFiP `balances-comptables-...-presentation-croisee-"
            "nature-fonction-2024`. Filtre : budgets principaux des communes, "
            "comptes de classe 6 (charges) et 2 (immobilisations), avec fonction "
            "renseignée. La ventilation fonctionnelle n'est obligatoire qu'au-"
            "dessus d'un seuil de population, donc seules ~3 400 communes "
            "figurent ici (couvrant la majorité de la population)."
        ),
        "fonctions": [
            {"key": k, "label_fr": label_fr[k], "label_en": label_en[k]}
            for k in fonction_keys
        ],
        "moyenne_nationale_ponderee": nat_out,
        "by_insee": by_insee_out,
    }


# ---------------------------------------------------------------------------
# Main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true",
        help="Re-download ZIP even if cached"
    )
    args = parser.parse_args()

    _log("→ DGFiP communes ventilation fonctionnelle (M14/M57)")
    _log(f"  Source page: {DATASET_PAGE}")

    zip_path = download_zip(force=args.force)

    _log("  → Streaming CSV → aggregation par INSEE × fonction…")
    by_insee, national, kept, skipped = stream_aggregate(zip_path)
    _log(f"  ✓ Rows kept: {kept:,} | skipped: {skipped:,}")
    _log(f"  ✓ Communes avec fonction renseignée: {len(by_insee):,}")

    payload = build_payload(by_insee, national, source_url=DATASET_PAGE)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = OUTPUT_FILE.stat().st_size / 1024
    _log(f"  ✓ Wrote {OUTPUT_FILE.relative_to(ROOT)} ({size_kb:.1f} KB)")

    # Sanity report
    nat_share_sum = sum(v["share"] for v in payload["moyenne_nationale_ponderee"].values())
    _log(f"  • National share sum: {nat_share_sum:.3f} (expected ~1.0)")
    for code, label in [("75056", "Paris"), ("13055", "Marseille"),
                        ("69123", "Lyon"), ("31555", "Toulouse")]:
        if code in payload["by_insee"]:
            b = payload["by_insee"][code]
            top = max(b["fonctions"].items(), key=lambda kv: kv[1]["share"])
            _log(f"  • {label} ({code}): total {b['total']/1e6:.0f} M€ — "
                 f"top fonction = {top[0]} ({top[1]['share']*100:.1f}%)")
        else:
            _log(f"  • {label} ({code}): NOT in dataset (no fonction reported)")

    return 0


if __name__ == "__main__":
    sys.exit(main())


# ---------------------------------------------------------------------------
# JSON SCHEMA (output)
# {
#   "generated_at": "ISO timestamp",
#   "source": "DGFiP — Balances comptables 2024 ...",
#   "source_url": "https://data.economie.gouv.fr/...",
#   "year": 2024,
#   "scope": "communes_budget_principal_avec_fonction_renseignee",
#   "scope_note_fr": "...",
#   "fonctions": [
#     {"key": "f0_services_generaux", "label_fr": "...", "label_en": "..."},
#     ...
#   ],
#   "moyenne_nationale_ponderee": {
#     "f0_services_generaux": {
#       "share": 0.30, "montant": 12345678.0,
#       "label_fr": "...", "label_en": "..."
#     },
#     ...
#   },
#   "by_insee": {
#     "75056": {
#       "libelle": "VILLE DE PARIS",
#       "total": 9839200000,
#       "fonctions": {
#         "f0_services_generaux": {"share": 0.093, "montant": 918300000},
#         ...
#       }
#     },
#     ...
#   }
# }
