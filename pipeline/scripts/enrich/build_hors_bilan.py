#!/usr/bin/env python3
"""
Agrège les garanties d'emprunt (engagements hors bilan) de la Ville de Paris.

Source   : opendata.paris.fr · dataset `dette-garantie` (annexe IV-B du compte
           administratif, une ligne par emprunt garanti, avec bénéficiaire,
           banque prêteuse, montant initial, capital restant dû au 31/12,
           taux fixe/variable, durée résiduelle, annuités).
Entrée   : API Opendatasoft v2.1 (CSV export filtré par année)
Sortie   : website/public/data/hors_bilan_{year}.json

Usage:
    python scripts/enrich/build_hors_bilan.py --year 2024
    python scripts/enrich/build_hors_bilan.py --all-years
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

DATA_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data"
API_BASE = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/dette-garantie"

# Années disponibles pour Paris (Ville + Département). Depuis la fusion 2019,
# seule « Ville de Paris » subsiste.
DEFAULT_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]

TOP_BENEFICIAIRES = 20
TOP_PRETEURS = 10
EMPRUNTS_PAR_BENEFICIAIRE = 25  # top emprunts embarqués dans chaque fiche bénéficiaire

# Regex pour extraire un code postal parisien (75001 à 75020, plus 75116
# pour le 16e Nord historique) dans l'objet de l'emprunt
# ("4, rue Fauvet - 75018").
ARRONDISSEMENT_RE = re.compile(r"\b75(\d{3})\b")

# Regroupement éditorial des natures M14/M57. Le dataset utilise des libellés
# non normalisés (casse + article), on les catégorise en 3 buckets clairs.
NATURE_BUCKETS = {
    "logement_social_aide": "Logement social aidé par l'État",
    "logement_hors_aide": "Logement hors aide d'État",
    "autres_operations": "Autres opérations (aménagement, équipements, assos)",
}


def _slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "n-a"


def extract_arrondissement(objet: str) -> int | None:
    """Extrait le numéro d'arrondissement (1-20) depuis un champ `objet` qui
    contient une adresse type "4, rue Fauvet - 75018". Retourne None si aucun
    code postal parisien reconnu."""
    if not isinstance(objet, str):
        return None
    m = ARRONDISSEMENT_RE.search(objet)
    if not m:
        return None
    code = m.group(1)  # 3 derniers chiffres du CP
    # 116 = 16e arrondissement historique (16e Nord)
    if code == "116":
        return 16
    n = int(code)
    if 1 <= n <= 20:
        return n
    return None


def classify_nature(nature: str) -> str:
    """Catégorise la nature d'emprunt en buckets éditoriaux."""
    if not isinstance(nature, str):
        return "autres_operations"
    n = nature.lower()
    if "logement" in n and "aid" in n and ("etat" in n or "état" in n):
        return "logement_social_aide"
    if "logement" in n:
        return "logement_hors_aide"
    return "autres_operations"


def fetch_year(year: int, logger: Logger) -> pd.DataFrame:
    """Télécharge le CSV complet pour une année de publication donnée."""
    params = {
        "refine": [f"annee_de_publication:{year}", "collectivite:Ville de Paris"],
        "delimiter": ";",
    }
    url = f"{API_BASE}/exports/csv"
    logger.info(f"Fetch {year} · GET {url}")
    r = requests.get(url, params=params, timeout=180)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text), sep=";")
    logger.info(f"  → {len(df):,} emprunts garantis")
    return df


def _weighted_mean(values: pd.Series, weights: pd.Series) -> float:
    m = values.notna() & weights.notna() & (weights > 0)
    if not m.any():
        return 0.0
    return float((values[m] * weights[m]).sum() / weights[m].sum())


def build_year(year: int, df: pd.DataFrame, logger: Logger) -> dict:
    # Nettoyage minimal : capital restant dû > 0 (on exclut les emprunts soldés
    # ou déclarés à zéro — ils ne pèsent plus comme engagement hors bilan).
    df = df.copy()
    crd_col = "capital_restant_du_au_31_12_de_l_annee_de_publication"
    df[crd_col] = pd.to_numeric(df[crd_col], errors="coerce").fillna(0.0)
    df["montant_initial"] = pd.to_numeric(df["montant_initial"], errors="coerce").fillna(0.0)

    df = df[df[crd_col] > 0].copy()

    total_crd = float(df[crd_col].sum())
    total_initial = float(df["montant_initial"].sum())

    ann_int = pd.to_numeric(df["annuite_garantie_au_cours_de_l_exercice_en_interets"], errors="coerce").fillna(0.0)
    ann_cap = pd.to_numeric(df["annuite_garantie_au_cours_de_l_exercice_en_capital"], errors="coerce").fillna(0.0)
    total_annuite = float((ann_int + ann_cap).sum())
    total_annuite_interets = float(ann_int.sum())
    total_annuite_capital = float(ann_cap.sum())

    df["bucket"] = df["nature"].apply(classify_nature)
    df["arr"] = df["objet_de_l_emprunt_garanti"].apply(extract_arrondissement)

    # ─── Ventilation par nature ─────────────────────────────────────────
    by_nature = []
    for key, label in NATURE_BUCKETS.items():
        sub = df[df["bucket"] == key]
        crd_sum = float(sub[crd_col].sum())
        by_nature.append({
            "key": key,
            "label": label,
            "capital_restant": round(crd_sum),
            "share": (crd_sum / total_crd) if total_crd else 0.0,
            "count_emprunts": int(len(sub)),
        })

    # ─── Top bénéficiaires ──────────────────────────────────────────────
    benef_agg = (
        df.groupby("designation_du_beneficiaire", dropna=False)
          .agg(
              capital_restant=(crd_col, "sum"),
              montant_initial=("montant_initial", "sum"),
              count_emprunts=(crd_col, "size"),
              nature_dominante=("bucket", lambda s: s.mode().iloc[0] if not s.mode().empty else "autres_operations"),
          )
          .sort_values("capital_restant", ascending=False)
          .reset_index()
    )
    top_benef = []
    for _, row in benef_agg.head(TOP_BENEFICIAIRES).iterrows():
        name = str(row["designation_du_beneficiaire"]) if pd.notna(row["designation_du_beneficiaire"]) else "—"
        sub = df[df["designation_du_beneficiaire"] == row["designation_du_beneficiaire"]].copy()

        # Top emprunts par capital restant pour la fiche
        sub_sorted = sub.sort_values(crd_col, ascending=False).head(EMPRUNTS_PAR_BENEFICIAIRE)
        emprunts = []
        for _, e in sub_sorted.iterrows():
            emprunts.append({
                "objet": (str(e["objet_de_l_emprunt_garanti"]) if pd.notna(e.get("objet_de_l_emprunt_garanti")) else ""),
                "preteur": (str(e["organisme_preteur_ou_chef_de_file"]) if pd.notna(e.get("organisme_preteur_ou_chef_de_file")) else ""),
                "annee_mobilisation": (int(e["annee_de_mobilisation"]) if pd.notna(e.get("annee_de_mobilisation")) else None),
                "montant_initial": round(float(e["montant_initial"])) if pd.notna(e.get("montant_initial")) else 0,
                "capital_restant": round(float(e[crd_col])),
                "duree_residuelle": float(e["duree_residuelle"]) if pd.notna(e.get("duree_residuelle")) else None,
                "taux_type": (str(e["taux_initial_taux"]).upper() if pd.notna(e.get("taux_initial_taux")) else ""),
                "taux_index": (str(e["taux_initial_index"]) if pd.notna(e.get("taux_initial_index")) else ""),
                "taux_actuariel": float(e["taux_initial_taux_actuariel"]) if pd.notna(e.get("taux_initial_taux_actuariel")) else None,
            })

        # Métriques pondérées pour cette fiche
        crd_series = sub[crd_col]
        taux_s = pd.to_numeric(sub["taux_initial_taux_actuariel"], errors="coerce")
        duree_s = pd.to_numeric(sub["duree_residuelle"], errors="coerce")
        fiche_taux = _weighted_mean(taux_s, crd_series)
        fiche_duree = _weighted_mean(duree_s, crd_series)
        is_fixe_sub = sub["taux_initial_taux"].astype(str).str.upper().str.startswith("F")
        crd_fixe_sub = float(sub.loc[is_fixe_sub, crd_col].sum())
        sub_total = float(sub[crd_col].sum())

        # Top prêteurs pour cette fiche
        preteurs_sub = (
            sub.groupby("organisme_preteur_ou_chef_de_file", dropna=False)
               .agg(capital_restant=(crd_col, "sum"), count_emprunts=(crd_col, "size"))
               .sort_values("capital_restant", ascending=False)
               .head(5)
               .reset_index()
        )
        fiche_preteurs = [
            {
                "name": str(r["organisme_preteur_ou_chef_de_file"]) if pd.notna(r["organisme_preteur_ou_chef_de_file"]) else "—",
                "capital_restant": round(float(r["capital_restant"])),
                "count_emprunts": int(r["count_emprunts"]),
                "share": (float(r["capital_restant"]) / sub_total) if sub_total else 0.0,
            }
            for _, r in preteurs_sub.iterrows()
        ]

        top_benef.append({
            "key": _slug(name),
            "name": name,
            "capital_restant": round(float(row["capital_restant"])),
            "montant_initial": round(float(row["montant_initial"])),
            "count_emprunts": int(row["count_emprunts"]),
            "share": (float(row["capital_restant"]) / total_crd) if total_crd else 0.0,
            "nature_dominante": row["nature_dominante"],
            "taux_moyen_pondere_pct": round(fiche_taux, 3),
            "duree_residuelle_moyenne_ans": round(fiche_duree, 2),
            "part_fixe": (crd_fixe_sub / sub_total) if sub_total else 0.0,
            "preteurs": fiche_preteurs,
            "emprunts_top": emprunts,
        })
    autres_crd = float(benef_agg.iloc[TOP_BENEFICIAIRES:]["capital_restant"].sum()) if len(benef_agg) > TOP_BENEFICIAIRES else 0.0
    autres_count = int(benef_agg.iloc[TOP_BENEFICIAIRES:]["count_emprunts"].sum()) if len(benef_agg) > TOP_BENEFICIAIRES else 0

    # ─── Top prêteurs ───────────────────────────────────────────────────
    preteur_agg = (
        df.groupby("organisme_preteur_ou_chef_de_file", dropna=False)
          .agg(capital_restant=(crd_col, "sum"), count_emprunts=(crd_col, "size"))
          .sort_values("capital_restant", ascending=False)
          .reset_index()
    )
    top_preteurs = []
    for _, row in preteur_agg.head(TOP_PRETEURS).iterrows():
        name = str(row["organisme_preteur_ou_chef_de_file"]) if pd.notna(row["organisme_preteur_ou_chef_de_file"]) else "—"
        top_preteurs.append({
            "name": name,
            "capital_restant": round(float(row["capital_restant"])),
            "count_emprunts": int(row["count_emprunts"]),
            "share": (float(row["capital_restant"]) / total_crd) if total_crd else 0.0,
        })

    # ─── Taux fixe / variable ──────────────────────────────────────────
    taux_type_col = "taux_initial_taux"
    is_fixe = df[taux_type_col].astype(str).str.upper().str.startswith("F")
    is_var = df[taux_type_col].astype(str).str.upper().str.startswith("V")
    crd_fixe = float(df.loc[is_fixe, crd_col].sum())
    crd_var = float(df.loc[is_var, crd_col].sum())

    # Taux actuariel moyen pondéré par capital restant dû.
    taux_actu = pd.to_numeric(df["taux_initial_taux_actuariel"], errors="coerce")
    taux_moyen_pondere = _weighted_mean(taux_actu, df[crd_col])

    duree_res = pd.to_numeric(df["duree_residuelle"], errors="coerce")
    duree_moyenne = _weighted_mean(duree_res, df[crd_col])

    # ─── Ventilation par arrondissement ─────────────────────────────────
    # Filtre les emprunts dont l'adresse a permis d'identifier un arrondissement
    # parisien. Utile pour la cartographie — les emprunts sans adresse claire
    # (garanties globales au bénéficiaire sans opération nommée) sont agrégés
    # dans un bucket "non localisé".
    mask_loc = df["arr"].notna()
    by_arrondissement = []
    for arr in range(1, 21):
        sub = df[df["arr"] == arr]
        crd_sum = float(sub[crd_col].sum())
        by_arrondissement.append({
            "arr": arr,
            "capital_restant": round(crd_sum),
            "count_emprunts": int(len(sub)),
            "share_of_localized": (crd_sum / float(df.loc[mask_loc, crd_col].sum())) if mask_loc.any() else 0.0,
        })
    non_localised_crd = float(df.loc[~mask_loc, crd_col].sum())
    non_localised_count = int((~mask_loc).sum())

    # Indices variables les plus fréquents (Livret A dominant attendu)
    indice_counts = (
        df.loc[is_var, "taux_initial_index"]
          .fillna("—")
          .astype(str)
          .str.upper()
          .value_counts()
          .head(5)
          .to_dict()
    )
    indices_variables = [{"index": k, "count": int(v)} for k, v in indice_counts.items()]

    payload = {
        "year": year,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "capital_restant": round(total_crd),
            "montant_initial": round(total_initial),
            "annuite_totale": round(total_annuite),
            "annuite_interets": round(total_annuite_interets),
            "annuite_capital": round(total_annuite_capital),
            "count_emprunts": int(len(df)),
            "count_beneficiaires": int(df["designation_du_beneficiaire"].nunique()),
            "count_preteurs": int(df["organisme_preteur_ou_chef_de_file"].nunique()),
        },
        "taux": {
            "capital_taux_fixe": round(crd_fixe),
            "capital_taux_variable": round(crd_var),
            "part_fixe": (crd_fixe / total_crd) if total_crd else 0.0,
            "part_variable": (crd_var / total_crd) if total_crd else 0.0,
            "taux_moyen_pondere_pct": round(taux_moyen_pondere, 3),
            "duree_residuelle_moyenne_ans": round(duree_moyenne, 2),
            "indices_variables": indices_variables,
        },
        "by_nature": by_nature,
        "by_arrondissement": by_arrondissement,
        "non_localised": {
            "capital_restant": round(non_localised_crd),
            "count_emprunts": non_localised_count,
            "share": (non_localised_crd / total_crd) if total_crd else 0.0,
        },
        "top_beneficiaires": top_benef,
        "autres_beneficiaires": {
            "count": max(0, int(benef_agg.shape[0]) - TOP_BENEFICIAIRES),
            "capital_restant": round(autres_crd),
            "count_emprunts": autres_count,
            "share": (autres_crd / total_crd) if total_crd else 0.0,
        },
        "top_preteurs": top_preteurs,
        "sources": {
            "dataset": "opendata.paris.fr · dette-garantie (annexe IV-B CA)",
            "url": "https://opendata.paris.fr/explore/dataset/dette-garantie/",
            "license": "ODbL",
            "note": (
                "Une ligne = un emprunt garanti par la Ville de Paris. Le capital "
                "restant dû au 31/12 représente l'engagement hors bilan : Paris "
                "rembourse à la place du bénéficiaire uniquement en cas de défaut. "
                "Majoritairement des emprunts de bailleurs sociaux auprès de la CDC, "
                "donc un risque jugé faible par les agences de notation."
            ),
        },
    }

    logger.info(
        f"  total capital restant : {total_crd / 1e9:.2f} Md € · "
        f"{len(df):,} emprunts · {payload['totals']['count_beneficiaires']} bénéficiaires"
    )
    logger.info(
        f"  taux fixe/variable : {payload['taux']['part_fixe']*100:.0f} % / "
        f"{payload['taux']['part_variable']*100:.0f} % · "
        f"taux moyen pondéré : {taux_moyen_pondere:.2f} % · "
        f"durée résiduelle : {duree_moyenne:.1f} ans"
    )
    return payload


def build(year: int, logger: Logger) -> Path:
    logger.section(f"Hors bilan · exercice {year}")
    df = fetch_year(year, logger)
    if df.empty:
        logger.warning(f"Aucune donnée pour {year}, fichier ignoré")
        return None

    payload = build_year(year, df, logger)
    out = DATA_DIR / f"hors_bilan_{year}.json"
    with out.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    logger.success(f"Écrit : {out.relative_to(DATA_DIR.parent.parent)}")
    return out


def write_index(years: list[int], logger: Logger):
    idx = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "opendata.paris.fr · dette-garantie",
        "description": "Garanties d'emprunt accordées par la Ville de Paris (engagements hors bilan).",
        "availableYears": sorted(years, reverse=True),
        "latestYear": max(years),
    }
    out = DATA_DIR / "hors_bilan_index.json"
    with out.open("w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)
    logger.success(f"Index : {out.relative_to(DATA_DIR.parent.parent)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="Exercice à enrichir")
    parser.add_argument("--all-years", action="store_true", help="Toutes les années disponibles")
    args = parser.parse_args()

    logger = Logger("build_hors_bilan")
    logger.header("Enrichissement hors bilan · garanties d'emprunt Paris")

    if args.year:
        years = [args.year]
    elif args.all_years:
        years = DEFAULT_YEARS
    else:
        idx_path = DATA_DIR / "bilan_index.json"
        with idx_path.open("r", encoding="utf-8") as f:
            years = [json.load(f)["latestYear"]]

    processed = []
    for y in years:
        if build(y, logger) is not None:
            processed.append(y)

    if processed:
        write_index(processed, logger)
    logger.success(f"Terminé · {len(processed)} exercice(s) traité(s)")


if __name__ == "__main__":
    main()
