#!/usr/bin/env python3
"""
Enrichissement SIRENE des nouveaux bénéficiaires PDF (présents en 2020/2021
uniquement, ajoutés via merge_subv_pdf_into_opendata).

Utilise l'API publique recherche-entreprises.api.gouv.fr (gratuite, pas de
clé requise). Pour chaque nom, récupère le meilleur match SIREN avec libellé
NAF, adresse et nature juridique INSEE.

Output : enrichit chaque entrée beneficiaires_2020.json / beneficiaires_2021.json
in-place avec les champs `siret`, `direction` (best-effort), `secteur_naf`.

Usage :
    python pipeline/scripts/enrich/sirene_match_new_beneficiaires.py \\
        --min-montant 50000
"""
from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SUBV_DIR = ROOT / "pipeline" / "cache" / "subventions_pre_enrichment"
CACHE_PATH = (
    ROOT / "pipeline" / "cache" / "enrichment" / "sirene_pdf_beneficiaires.json"
)

API_URL = "https://recherche-entreprises.api.gouv.fr/search"
USER_AGENT = "FranceOpenData-Enrich/1.0 (+contact@franceopendata.org)"


def normalize_name(name: str) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFD", name).upper()
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", s)).strip()


def search_sirene(query: str, timeout: int = 10) -> dict | None:
    """Cherche une entreprise via l'API recherche-entreprises. Retourne le
    meilleur match ou None si rien."""
    params = urllib.parse.urlencode({
        "q": query,
        "page": 1,
        "per_page": 5,
        # Restrict à Paris / IDF — la plupart des bénéficiaires Ville de
        # Paris sont implantés en Île-de-France
        "code_postal": "75",
    })
    req = urllib.request.Request(
        f"{API_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}
    results = data.get("results", [])
    if not results:
        # Retry sans code_postal restriction
        params2 = urllib.parse.urlencode({"q": query, "page": 1, "per_page": 5})
        req2 = urllib.request.Request(
            f"{API_URL}?{params2}",
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req2, timeout=timeout) as resp:
                data = json.loads(resp.read())
            results = data.get("results", [])
        except Exception as e:
            return {"error": str(e)}
    if not results:
        return None
    best = results[0]
    siege = best.get("siege") or {}
    return {
        "siren": best.get("siren"),
        "siret_siege": siege.get("siret"),
        "nom_entreprise": best.get("nom_complet") or best.get("nom_raison_sociale"),
        "nature_juridique": best.get("nature_juridique"),
        "naf_code": best.get("activite_principale"),
        "naf_libelle": best.get("libelle_activite_principale"),
        "categorie_juridique": best.get("categorie_juridique"),
        "tranche_effectifs": best.get("tranche_effectif_salarie"),
        "date_creation": best.get("date_creation"),
        "adresse": siege.get("adresse"),
        "commune": siege.get("libelle_commune"),
        "etat_admin": best.get("etat_administratif"),
        "score": best.get("matching_score") or best.get("score"),
        "_query": query,
    }


def load_cache() -> dict[str, dict]:
    if not CACHE_PATH.exists():
        return {}
    return json.loads(CACHE_PATH.read_text()).get("items", {})


def save_cache(items: dict[str, dict]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps({
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "source": "API recherche-entreprises.api.gouv.fr",
            "count": len(items),
            "items": items,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-montant", type=float, default=50_000)
    ap.add_argument("--max", type=int, default=200, help="Plafond projets (debug)")
    ap.add_argument("--rate-limit", type=float, default=0.15, help="Pause entre calls (s)")
    args = ap.parse_args()

    # Identifier les bénéficiaires uniques 2020/2021 (PDF only) absents des autres années
    by_year = {}
    for y in [2018, 2019, 2020, 2021, 2022, 2023, 2024]:
        try:
            d = json.load((SUBV_DIR / f"beneficiaires_{y}.json").open(encoding="utf-8"))
            by_year[y] = {normalize_name(r["beneficiaire"]): r for r in d["data"]}
        except FileNotFoundError:
            pass

    other = set()
    for y in [2018, 2019, 2022, 2023, 2024]:
        other.update(by_year.get(y, {}).keys())

    candidates: dict[str, dict] = {}
    for y in [2020, 2021]:
        for k, r in by_year.get(y, {}).items():
            if k in other or r.get("source") != "pdf_ca_b811":
                continue
            if r["montant_total"] < args.min_montant:
                continue
            current = candidates.get(k)
            if not current or r["montant_total"] > current["montant_total"]:
                candidates[k] = r

    cands = sorted(candidates.values(), key=lambda x: -x["montant_total"])[:args.max]
    print(f"À enrichir : {len(cands)} bénéficiaires (min {args.min_montant} €)")

    cache = load_cache()
    print(f"Cache existant : {len(cache)} entrées")

    enriched_now = 0
    for i, r in enumerate(cands, 1):
        key = normalize_name(r["beneficiaire"])
        if key in cache:
            continue
        result = search_sirene(r["beneficiaire"])
        cache[key] = {
            "name_raw": r["beneficiaire"],
            "name_normalized": key,
            "montant_2020_2021_max": r["montant_total"],
            "result": result,
        }
        enriched_now += 1
        # Affichage compact
        if result and "siren" in result:
            print(
                f"  [{i:>3}/{len(cands)}] ✓ {r['beneficiaire'][:40]:<40s} "
                f"→ SIREN {result['siren']} · NAF {result.get('naf_code') or '?'} "
                f"· {(result.get('naf_libelle') or '')[:50]}"
            )
        else:
            print(f"  [{i:>3}/{len(cands)}] ✗ {r['beneficiaire'][:40]:<40s} (pas de match)")
        if enriched_now % 20 == 0:
            save_cache(cache)
        time.sleep(args.rate_limit)

    save_cache(cache)
    print(f"\n→ {CACHE_PATH.relative_to(ROOT)} ({len(cache)} entrées au total)")


if __name__ == "__main__":
    main()
