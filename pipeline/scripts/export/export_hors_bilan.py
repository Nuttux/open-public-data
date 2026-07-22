#!/usr/bin/env python3
"""
Export hors_bilan_{year}.json — garanties d'emprunt Paris (engagements HB).

Source: mart_hors_bilan (BigQuery), alimenté par
  raw.dette_garantie_paris ← pipeline/scripts/sync/sync_dette_garantie.py

Output: website/public/data/hors_bilan_{year}.json
        website/public/data/hors_bilan_index.json

Usage:
    python pipeline/scripts/export/export_hors_bilan.py --year 2024
    python pipeline/scripts/export/export_hors_bilan.py --all-years
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))
from utils.logger import Logger
from _export_common import get_bigquery_client, data_dir, marts_dataset

PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = marts_dataset()
# mart_logement_financement (chaîne de financement emprunt → programme). Surchargé
# par MLF_DATASET pour tester en local avant que le mart n'existe en prod.
MLF_DATASET = os.environ.get("MLF_DATASET", MARTS_DATASET)
DATA_DIR = data_dir()

DEFAULT_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]
TOP_BENEFICIAIRES = 20
TOP_PRETEURS = 10
EMPRUNTS_PAR_BENEFICIAIRE = 25
EMPRUNTS_PAR_ARRONDISSEMENT = 15

NATURE_BUCKETS = {
    "logement_social_aide": "Logement social aidé par l'État",
    "logement_hors_aide": "Logement hors aide d'État",
    "autres_operations": "Autres opérations (aménagement, équipements, assos)",
}


def _slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "n-a"


def _weighted_mean(values: pd.Series, weights: pd.Series) -> float:
    m = values.notna() & weights.notna() & (weights > 0)
    if not m.any():
        return 0.0
    return float((values[m] * weights[m]).sum() / weights[m].sum())


def fetch_year(client: bigquery.Client, year: int) -> pd.DataFrame:
    query = f"""
    SELECT
        annee_mobilisation,
        beneficiaire,
        objet,
        preteur,
        montant_initial,
        capital_restant,
        duree_residuelle,
        taux_type,
        taux_index,
        taux_actuariel,
        annuite_interets,
        annuite_capital,
        bucket_nature,
        arrondissement,
        is_taux_fixe
    FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_hors_bilan`
    WHERE annee = {year}
    ORDER BY capital_restant DESC
    """
    return client.query(query).to_dataframe()


def _loan_key(beneficiaire, objet, annee_mob, montant_initial) -> str:
    """Clé naturelle d'un emprunt, partagée entre mart_hors_bilan et
    mart_logement_financement. On évite le hash loan_id (reproduction fragile du
    CAST float→string de BQ en Python) en joignant sur les colonnes brutes."""
    b = str(beneficiaire) if pd.notna(beneficiaire) else ""
    o = str(objet) if pd.notna(objet) else ""
    a = int(annee_mob) if pd.notna(annee_mob) else 0
    m = round(float(montant_initial), 2) if pd.notna(montant_initial) else 0.0
    return f"{b}|{o}|{a}|{m}"


def fetch_financing(client: bigquery.Client) -> tuple[dict, dict]:
    """Charge la chaîne de financement (mart_logement_financement).

    Retourne deux dicts :
      - par emprunt (loan_key) : catégorie de rattachement + programme principal.
      - par bénéficiaire (nom verbatim) : nombre de programmes distincts financés.

    Le mart est dédupliqué tous exercices confondus ; la clé d'emprunt identifie
    le prêt indépendamment de l'année de publication, donc on charge une fois."""
    per_loan_sql = f"""
    SELECT
      beneficiaire, objet, annee_mobilisation,
      ROUND(montant_initial, 2) AS mi_key,
      COUNT(DISTINCT id_livraison) AS n_programmes,
      -- catégorie au grain emprunt : 'programme' si rattaché à ≥1 adresse,
      -- sinon la raison de non-rattachement (portefeuille / zac / non_rattache).
      CASE
        WHEN LOGICAL_OR(match_basis IN ('adresse_exacte','adresse_arr')) THEN 'programme'
        ELSE ANY_VALUE(match_basis)
      END AS categorie,
      -- programme principal : adresse exacte prioritaire, puis le plus grand.
      ARRAY_AGG(
        IF(id_livraison IS NOT NULL,
           STRUCT(programme_adresse AS adresse,
                  programme_nb_logements AS nb_logements,
                  match_basis AS match_basis),
           NULL)
        IGNORE NULLS
        ORDER BY (match_basis = 'adresse_exacte') DESC, programme_nb_logements DESC
        LIMIT 1
      )[SAFE_OFFSET(0)] AS top_prog
    FROM `{PROJECT_ID}.{MLF_DATASET}.mart_logement_financement`
    GROUP BY beneficiaire, objet, annee_mobilisation, mi_key
    """
    per_benef_sql = f"""
    SELECT beneficiaire, COUNT(DISTINCT id_livraison) AS n_programmes
    FROM `{PROJECT_ID}.{MLF_DATASET}.mart_logement_financement`
    WHERE id_livraison IS NOT NULL
    GROUP BY beneficiaire
    """
    per_loan: dict[str, dict] = {}
    for r in client.query(per_loan_sql).result():
        key = _loan_key(r.beneficiaire, r.objet, r.annee_mobilisation, r.mi_key)
        tp = r.top_prog
        programme = None
        if tp and tp.get("adresse"):
            programme = {
                "adresse": tp["adresse"],
                "nb_logements": int(tp["nb_logements"]) if tp.get("nb_logements") is not None else None,
                "n_programmes": int(r.n_programmes) if r.n_programmes else 1,
                "match_basis": tp.get("match_basis"),
            }
        per_loan[key] = {"categorie": r.categorie, "programme": programme}
    per_benef = {r.beneficiaire: int(r.n_programmes) for r in client.query(per_benef_sql).result()}
    return per_loan, per_benef


def build_year_payload(year: int, df: pd.DataFrame, fin_per_loan: dict, fin_per_benef: dict, logger: Logger) -> dict:
    """Reproduit l'ancien `build_year` à partir du mart au lieu du CSV API."""
    if df.empty:
        return None

    df = df.copy()
    df["capital_restant"] = pd.to_numeric(df["capital_restant"], errors="coerce").fillna(0.0)
    df["montant_initial"] = pd.to_numeric(df["montant_initial"], errors="coerce").fillna(0.0)

    # Rattachement financement au grain emprunt (mart_logement_financement) :
    # catégorie ('programme' / 'portefeuille' / 'zac_operation' / 'non_rattache')
    # et programme principal. NaN si l'emprunt n'est pas dans le mart logement
    # (bucket autres_operations non concerné par la chaîne de financement).
    df["_loan_key"] = df.apply(
        lambda r: _loan_key(r["beneficiaire"], r["objet"], r.get("annee_mobilisation"), r["montant_initial"]),
        axis=1,
    )
    df["_fin_categorie"] = df["_loan_key"].map(lambda k: (fin_per_loan.get(k) or {}).get("categorie"))

    total_crd = float(df["capital_restant"].sum())
    total_initial = float(df["montant_initial"].sum())

    ann_int = pd.to_numeric(df["annuite_interets"], errors="coerce").fillna(0.0)
    ann_cap = pd.to_numeric(df["annuite_capital"], errors="coerce").fillna(0.0)
    total_annuite = float((ann_int + ann_cap).sum())
    total_annuite_interets = float(ann_int.sum())
    total_annuite_capital = float(ann_cap.sum())

    # ─── Ventilation par nature ──────────────────────────────────────────────
    by_nature = []
    for key, label in NATURE_BUCKETS.items():
        sub = df[df["bucket_nature"] == key]
        crd_sum = float(sub["capital_restant"].sum())
        by_nature.append({
            "key": key,
            "label": label,
            "capital_restant": round(crd_sum),
            "share": (crd_sum / total_crd) if total_crd else 0.0,
            "count_emprunts": int(len(sub)),
        })

    # ─── Top bénéficiaires ───────────────────────────────────────────────────
    benef_agg = (
        df.groupby("beneficiaire", dropna=False)
          .agg(
              capital_restant=("capital_restant", "sum"),
              montant_initial=("montant_initial", "sum"),
              count_emprunts=("capital_restant", "size"),
              nature_dominante=("bucket_nature", lambda s: s.mode().iloc[0] if not s.mode().empty else "autres_operations"),
          )
          .sort_values("capital_restant", ascending=False)
          .reset_index()
    )

    top_benef = []
    for _, row in benef_agg.head(TOP_BENEFICIAIRES).iterrows():
        name = str(row["beneficiaire"]) if pd.notna(row["beneficiaire"]) else "—"
        sub = df[df["beneficiaire"] == row["beneficiaire"]].copy()

        sub_sorted = sub.sort_values("capital_restant", ascending=False).head(EMPRUNTS_PAR_BENEFICIAIRE)
        emprunts = []
        for _, e in sub_sorted.iterrows():
            fin = fin_per_loan.get(e["_loan_key"]) or {}
            emprunts.append({
                "objet": (str(e["objet"]) if pd.notna(e.get("objet")) else ""),
                "preteur": (str(e["preteur"]) if pd.notna(e.get("preteur")) else ""),
                "annee_mobilisation": (int(e["annee_mobilisation"]) if pd.notna(e.get("annee_mobilisation")) else None),
                "montant_initial": round(float(e["montant_initial"])) if pd.notna(e.get("montant_initial")) else 0,
                "capital_restant": round(float(e["capital_restant"])),
                "duree_residuelle": float(e["duree_residuelle"]) if pd.notna(e.get("duree_residuelle")) else None,
                "taux_type": (str(e["taux_type"]).upper() if pd.notna(e.get("taux_type")) else ""),
                "taux_index": (str(e["taux_index"]) if pd.notna(e.get("taux_index")) else ""),
                "taux_actuariel": float(e["taux_actuariel"]) if pd.notna(e.get("taux_actuariel")) else None,
                # Programme de logements financé par cet emprunt (chaîne de
                # financement). None si portefeuille / non rattaché / hors logement.
                "programme": fin.get("programme"),
            })

        # ─── Synthèse financement (rattachement à des adresses précises) ─────
        # Sur la dette LOGEMENT de ce bailleur (emprunts présents dans le mart),
        # quelle part est rattachée à un programme précis vs financée en
        # portefeuille multi-adresses vs sans programme trouvé.
        base_log = float(sub.loc[sub["_fin_categorie"].notna(), "capital_restant"].sum())
        cap_prog = float(sub.loc[sub["_fin_categorie"] == "programme", "capital_restant"].sum())
        cap_portef = float(sub.loc[sub["_fin_categorie"] == "portefeuille", "capital_restant"].sum())
        cap_autre = float(sub.loc[sub["_fin_categorie"].isin(["non_rattache", "zac_operation"]), "capital_restant"].sum())
        financement = {
            "base_logement": round(base_log),
            "capital_rattache": round(cap_prog),
            "capital_portefeuille": round(cap_portef),
            "capital_non_rattache": round(cap_autre),
            "part_rattachee": (cap_prog / base_log) if base_log else 0.0,
            "n_programmes": int(fin_per_benef.get(row["beneficiaire"], 0)),
        } if base_log > 0 else None

        crd_series = sub["capital_restant"]
        taux_s = pd.to_numeric(sub["taux_actuariel"], errors="coerce")
        duree_s = pd.to_numeric(sub["duree_residuelle"], errors="coerce")
        fiche_taux = _weighted_mean(taux_s, crd_series)
        fiche_duree = _weighted_mean(duree_s, crd_series)
        is_fixe_sub = sub["is_taux_fixe"].fillna(False).astype(bool)
        crd_fixe_sub = float(sub.loc[is_fixe_sub, "capital_restant"].sum())
        sub_total = float(sub["capital_restant"].sum())

        preteurs_sub = (
            sub.groupby("preteur", dropna=False)
               .agg(capital_restant=("capital_restant", "sum"), count_emprunts=("capital_restant", "size"))
               .sort_values("capital_restant", ascending=False)
               .head(5)
               .reset_index()
        )
        fiche_preteurs = [
            {
                "name": str(r["preteur"]) if pd.notna(r["preteur"]) else "—",
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
            "financement": financement,
        })

    autres_crd = float(benef_agg.iloc[TOP_BENEFICIAIRES:]["capital_restant"].sum()) if len(benef_agg) > TOP_BENEFICIAIRES else 0.0
    autres_count = int(benef_agg.iloc[TOP_BENEFICIAIRES:]["count_emprunts"].sum()) if len(benef_agg) > TOP_BENEFICIAIRES else 0

    # ─── Top prêteurs ────────────────────────────────────────────────────────
    preteur_agg = (
        df.groupby("preteur", dropna=False)
          .agg(capital_restant=("capital_restant", "sum"), count_emprunts=("capital_restant", "size"))
          .sort_values("capital_restant", ascending=False)
          .reset_index()
    )
    top_preteurs = []
    for _, row in preteur_agg.head(TOP_PRETEURS).iterrows():
        name = str(row["preteur"]) if pd.notna(row["preteur"]) else "—"
        top_preteurs.append({
            "name": name,
            "capital_restant": round(float(row["capital_restant"])),
            "count_emprunts": int(row["count_emprunts"]),
            "share": (float(row["capital_restant"]) / total_crd) if total_crd else 0.0,
        })

    # ─── Taux fixe / variable ────────────────────────────────────────────────
    is_fixe = df["is_taux_fixe"].fillna(False).astype(bool)
    is_var = df["taux_type"].astype(str).str.upper().str.startswith("V")
    crd_fixe = float(df.loc[is_fixe, "capital_restant"].sum())
    crd_var = float(df.loc[is_var, "capital_restant"].sum())

    taux_actu = pd.to_numeric(df["taux_actuariel"], errors="coerce")
    taux_moyen_pondere = _weighted_mean(taux_actu, df["capital_restant"])
    duree_res = pd.to_numeric(df["duree_residuelle"], errors="coerce")
    duree_moyenne = _weighted_mean(duree_res, df["capital_restant"])

    # ─── Ventilation par arrondissement ──────────────────────────────────────
    df["arr"] = pd.to_numeric(df["arrondissement"], errors="coerce")
    mask_loc = df["arr"].notna()
    localised_crd_total = float(df.loc[mask_loc, "capital_restant"].sum()) if mask_loc.any() else 0.0
    by_arrondissement = []
    for arr in range(1, 21):
        sub = df[df["arr"] == arr]
        crd_sum = float(sub["capital_restant"].sum())

        top_emp = sub.sort_values("capital_restant", ascending=False).head(EMPRUNTS_PAR_ARRONDISSEMENT)
        emprunts = []
        for _, e in top_emp.iterrows():
            emprunts.append({
                "objet": (str(e["objet"]) if pd.notna(e.get("objet")) else ""),
                "beneficiaire": (str(e["beneficiaire"]) if pd.notna(e.get("beneficiaire")) else ""),
                "preteur": (str(e["preteur"]) if pd.notna(e.get("preteur")) else ""),
                "annee_mobilisation": (int(e["annee_mobilisation"]) if pd.notna(e.get("annee_mobilisation")) else None),
                "capital_restant": round(float(e["capital_restant"])),
                "taux_type": (str(e["taux_type"]).upper() if pd.notna(e.get("taux_type")) else ""),
                "taux_actuariel": float(e["taux_actuariel"]) if pd.notna(e.get("taux_actuariel")) else None,
            })

        top_benef_arr = (
            sub.groupby("beneficiaire", dropna=False)
               .agg(capital_restant=("capital_restant", "sum"), count_emprunts=("capital_restant", "size"))
               .sort_values("capital_restant", ascending=False)
               .head(3)
               .reset_index()
        )
        top_benefs = [
            {
                "name": str(r["beneficiaire"]) if pd.notna(r["beneficiaire"]) else "—",
                "capital_restant": round(float(r["capital_restant"])),
                "count_emprunts": int(r["count_emprunts"]),
                "share_of_arr": (float(r["capital_restant"]) / crd_sum) if crd_sum else 0.0,
            }
            for _, r in top_benef_arr.iterrows()
        ]

        by_arrondissement.append({
            "arr": arr,
            "capital_restant": round(crd_sum),
            "count_emprunts": int(len(sub)),
            "share_of_localized": (crd_sum / localised_crd_total) if localised_crd_total else 0.0,
            "top_beneficiaires": top_benefs,
            "emprunts_top": emprunts,
        })
    non_localised_crd = float(df.loc[~mask_loc, "capital_restant"].sum())
    non_localised_count = int((~mask_loc).sum())

    indice_counts = (
        df.loc[is_var, "taux_index"]
          .fillna("—")
          .astype(str)
          .str.upper()
          .value_counts()
          .head(5)
          .to_dict()
    )
    indices_variables = [{"index": k, "count": int(v)} for k, v in indice_counts.items()]

    return {
        "year": year,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "capital_restant": round(total_crd),
            "montant_initial": round(total_initial),
            "annuite_totale": round(total_annuite),
            "annuite_interets": round(total_annuite_interets),
            "annuite_capital": round(total_annuite_capital),
            "count_emprunts": int(len(df)),
            "count_beneficiaires": int(df["beneficiaire"].nunique()),
            "count_preteurs": int(df["preteur"].nunique()),
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


def write_index(years: list[int], logger: Logger) -> None:
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
    parser.add_argument("--year", type=int)
    parser.add_argument("--all-years", action="store_true")
    parser.add_argument("--city", default="paris")
    args = parser.parse_args()

    global DATA_DIR, MARTS_DATASET, MLF_DATASET
    DATA_DIR = data_dir(args.city)
    MARTS_DATASET = marts_dataset(args.city)
    MLF_DATASET = os.environ.get("MLF_DATASET", MARTS_DATASET)

    logger = Logger("export_hors_bilan")
    logger.header("Export hors bilan · garanties d'emprunt Paris")

    client = get_bigquery_client()

    if args.year:
        years = [args.year]
    elif args.all_years:
        years = DEFAULT_YEARS
    else:
        years = [max(DEFAULT_YEARS)]

    # Chaîne de financement chargée une fois (indépendante de l'exercice).
    # Dégradation propre : si mart_logement_financement n'existe pas encore
    # (ordre de build CI), on exporte sans le volet financement plutôt que d'échouer.
    logger.section(f"Financement logement · {MLF_DATASET}.mart_logement_financement")
    try:
        fin_per_loan, fin_per_benef = fetch_financing(client)
        logger.info(f"{len(fin_per_loan)} emprunts logement · {len(fin_per_benef)} bailleurs avec programmes")
    except Exception as e:
        fin_per_loan, fin_per_benef = {}, {}
        logger.warning(f"mart_logement_financement indisponible ({e}) — export sans volet financement")

    processed = []
    for y in years:
        logger.section(f"Hors bilan · exercice {y}")
        df = fetch_year(client, y)
        if df.empty:
            logger.warning(f"Aucune donnée pour {y}, fichier ignoré")
            continue
        payload = build_year_payload(y, df, fin_per_loan, fin_per_benef, logger)
        out = DATA_DIR / f"hors_bilan_{y}.json"
        with out.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        logger.success(f"Écrit : {out.relative_to(DATA_DIR.parent.parent)}")
        processed.append(y)

    if processed:
        write_index(processed, logger)
    logger.success(f"Terminé · {len(processed)} exercice(s) traité(s)")


if __name__ == "__main__":
    main()
