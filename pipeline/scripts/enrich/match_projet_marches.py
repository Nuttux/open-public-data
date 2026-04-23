#!/usr/bin/env python3
"""
Matching projet d'investissement ↔ marchés publics (fournisseurs).

Stratégie (sans API LLM — le judge est assuré par Claude en session) :
  1. Load projets nommés depuis investissements_localises_{year}.json (2022-2024).
  2. Pour chaque projet, extraire les entités/tokens significatifs.
  3. Requête BQ : candidats marchés filtrés sur
     - annee ∈ [projet_year-3, projet_year+2]
     - ccag ∈ ('Travaux', "Maitrise d'œuvre", 'Prestations intellectuelles')
     - match texte sur objet via tokens signifiants
  4. Scorer par nombre de tokens qui matchent + proximité temporelle.
  5. Sortie CSV brute — le jugement final (confiance) est fait par Claude.

Usage :
    python pipeline/scripts/enrich/match_projet_marches.py
    python pipeline/scripts/enrich/match_projet_marches.py --top 50
    python pipeline/scripts/enrich/match_projet_marches.py --project-id 2023_18_9_0001
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import unicodedata
from pathlib import Path

from google.cloud import bigquery

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "website" / "public" / "data" / "map"
CACHE_DIR = ROOT / "pipeline" / "cache" / "match_projet_marches"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris_marts"


# ─── Token extraction ─────────────────────────────────────────────────────

STOPWORDS = {
    "les", "des", "une", "aux", "sur", "sous", "dans", "avec", "pour", "par",
    "qui", "que", "son", "ses", "cet", "cette", "leurs", "leur",
    "de", "du", "la", "le", "un", "et", "ou", "est", "ne", "pas", "plus",
    "nouvelle", "nouveau", "restauration", "creation", "construction", "renovation", "refection",
    "travaux", "modernisation", "amenagement", "reamenagement", "mise", "remise",
    "etage", "rdc", "sous-sol", "annexe", "principal",
    "rue", "place", "avenue", "boulevard", "bvd", "bd", "impasse", "passage",
    "eme", "er", "ieme", "ere",
    "paris", "ville", "mairie", "arrondissement",
    "lot", "phase", "tranche", "section",
    "ecole", "musee", "bibliotheque", "jardin", "parc", "square", "piscine", "gymnase",
    "stade", "centre", "hotel", "maison", "theatre", "conservatoire",
}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s)


def extract_tokens(nom: str) -> list[str]:
    """Extract the *discriminant* tokens from a project name.

    Priorities:
      - Proper nouns (Delbo, Davout, Baldwin, Eustache, Chapelle…)
      - Street numbers (75, 19…)
      - Numeric quarters (75020, 18e, etc. — normalized)
      - Named equipment name (Aréna 2, Porte Maillot)
    """
    norm = _norm(nom)
    raw_tokens = [t for t in norm.split() if t]
    # Keep tokens >= 4 chars, not in stopwords, OR any numeric token 2-5 digits
    out = []
    for t in raw_tokens:
        if t.isdigit() and 1 <= len(t) <= 5:
            out.append(t)
        elif len(t) >= 4 and t not in STOPWORDS:
            out.append(t)
    # Deduplicate preserving order
    seen = set()
    uniq = []
    for t in out:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


# ─── Load projects ────────────────────────────────────────────────────────

def load_projets() -> list[dict]:
    out = []
    for y in [2022, 2023, 2024]:
        p = DATA_DIR / f"investissements_localises_{y}.json"
        if not p.exists():
            continue
        d = json.load(open(p, encoding="utf-8"))
        for item in d.get("data", []):
            nom = (item.get("nom_projet") or "").strip()
            if not nom or "non nomm" in nom.lower():
                continue
            out.append({
                "year": y,
                "id": item.get("id"),
                "nom": nom,
                "arr": item.get("arrondissement") or 0,
                "montant": float(item.get("montant") or 0),
                "chapitre": item.get("chapitre_libelle") or "",
                "type_ap": item.get("type_ap") or "",
            })
    return out


# ─── Fetch candidates from BQ ─────────────────────────────────────────────

def fetch_candidates(client: bigquery.Client, projet: dict, k: int = 15) -> list[dict]:
    """For a given projet, return top-K candidate marchés from BQ.

    Filter: CCAG Travaux/MOE/PI, annee ∈ [projet.year-3, projet.year+2],
    objet contains at least one discriminant token.
    Ranked by : token_overlap DESC, |annee_diff| ASC, montant DESC.
    """
    tokens = extract_tokens(projet["nom"])
    if not tokens:
        return []

    # Build regex from tokens (word-boundary-ish)
    pattern = r"\b(" + "|".join(re.escape(t) for t in tokens[:8]) + r")"

    y = projet["year"]
    query = f"""
    WITH cands AS (
      SELECT
        numero_marche,
        objet,
        fournisseur_nom,
        fournisseur_siret,
        montant_max,
        date_notification,
        annee,
        decp_ccag,
        decp_cpv_famille,
        decp_lieu_execution_lisible,
        decp_arrondissement_exec,
        -- Token overlap score: count of unique project tokens found in objet.
        (
          SELECT COUNT(DISTINCT t)
          FROM UNNEST([{','.join([f'@t{i}' for i in range(len(tokens[:8]))])}]) AS t
          WHERE REGEXP_CONTAINS(LOWER(objet), CONCAT(r'\\b', t, r''))
        ) AS overlap_tokens
      FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
      WHERE annee BETWEEN {y - 3} AND {y + 2}
        AND montant_max >= 40000
        AND REGEXP_CONTAINS(LOWER(objet), @pattern)
        AND (
              decp_ccag IN ('Travaux', "Maitrise d'œuvre", 'Prestations intellectuelles')
           OR decp_ccag IS NULL  -- on garde aussi les non-enrichis Paris-only
        )
    )
    SELECT *
    FROM cands
    WHERE overlap_tokens >= 1
    ORDER BY overlap_tokens DESC, ABS(annee - {y}), montant_max DESC
    LIMIT {k}
    """
    params = [bigquery.ScalarQueryParameter("pattern", "STRING", pattern)]
    for i, t in enumerate(tokens[:8]):
        params.append(bigquery.ScalarQueryParameter(f"t{i}", "STRING", t))
    job = client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=params))
    out = []
    for row in job.result():
        out.append({
            "numero_marche": row.numero_marche,
            "objet": row.objet,
            "fournisseur_nom": row.fournisseur_nom,
            "fournisseur_siret": row.fournisseur_siret,
            "montant_max": float(row.montant_max) if row.montant_max else 0,
            "date_notification": str(row.date_notification) if row.date_notification else None,
            "annee": row.annee,
            "ccag": row.decp_ccag,
            "cpv_famille": row.decp_cpv_famille,
            "lieu_exec": row.decp_lieu_execution_lisible,
            "arr_exec": row.decp_arrondissement_exec,
            "overlap_tokens": row.overlap_tokens,
        })
    return out


# ─── Main ──────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=50, help="Top N projects by montant (default 50)")
    ap.add_argument("--project-id", type=str, help="Run on a single project id (debug)")
    ap.add_argument("--k", type=int, default=10, help="Candidates per project")
    ap.add_argument("--out", type=str, default=str(CACHE_DIR / "candidates.jsonl"))
    args = ap.parse_args()

    projets = load_projets()
    print(f"Loaded {len(projets)} named projects.")

    if args.project_id:
        projets = [p for p in projets if p["id"] == args.project_id]
    else:
        projets.sort(key=lambda p: -p["montant"])
        projets = projets[:args.top]
    print(f"Processing {len(projets)} projects.")

    if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
        # Fallback to ADC if the ENV path is broken
        path = os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
        if not os.path.exists(path):
            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]

    client = bigquery.Client(project=PROJECT_ID)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        for i, p in enumerate(projets, 1):
            tokens = extract_tokens(p["nom"])
            try:
                cands = fetch_candidates(client, p, k=args.k)
            except Exception as e:
                print(f"  [{i}/{len(projets)}] {p['id']} err: {e}")
                continue
            record = {
                "projet": p,
                "tokens": tokens,
                "candidates": cands,
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            print(f"  [{i:3d}/{len(projets)}] [{p['year']}] {p['montant']/1e6:5.1f}M€  {len(cands):2d} cands  {p['nom'][:60]}")

    print(f"\n→ {out_path}")


if __name__ == "__main__":
    main()
