#!/usr/bin/env python3
"""
Build generic photo bank — une photo générique par typologie (14 typologies).

Pour la banque générique on n'a PAS besoin du grounded search Gemini :
on sait exactement quoi chercher. On requête Wikimedia Commons directement
avec des queries curated, on récupère jusqu'à 9 candidats, et on demande
au judge Gemini de choisir la meilleure.

Avantages vs grounded search :
- Wikimedia = licences CC garanties
- Pas de paris.fr/404 fantasmés
- Requêtes précises → résultats pertinents dès la première fois

Sortie : website/public/data/enrichment/generic_photo_bank.json

Usage :
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/build_generic_photo_bank.py
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/build_generic_photo_bank.py --only ecole,piscine
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/build_generic_photo_bank.py --force
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "generic_photo_bank.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

USER_AGENT = "Qipu-GenericBank/0.1 (https://qipu.org; contact@qipu.org)"
REQ_TIMEOUT = 15
MAX_CANDIDATES = 9


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


judge_mod = _load_module("_judge_bank", SCRIPT_DIR / "judge_photos_llm.py")

# ─── Queries Wikimedia Commons par typologie ─────────────────────────────────
# Chaque entrée a plusieurs queries testées dans l'ordre — on s'arrête dès qu'on
# a au moins 3 candidats valides.

WIKIMEDIA_QUERIES: dict[str, dict[str, Any]] = {
    "ecole": {
        "label": "École primaire parisienne",
        "queries": [
            "école élémentaire Paris façade rue",
            "école maternelle Paris bâtiment",
            "école publique Paris 20e",
        ],
    },
    "college": {
        "label": "Collège parisien",
        "queries": [
            "Collège Charlemagne Paris",
            "Collège Sévigné Paris",
            "Collège Montaigne Paris",
        ],
    },
    "lycee": {
        "label": "Lycée parisien",
        "queries": [
            "Lycée Janson de Sailly Paris",
            "Lycée Henri IV Paris façade",
            "Lycée Louis le Grand Paris",
        ],
    },
    "creche": {
        "label": "Crèche parisienne",
        "queries": [
            "crèche municipale Paris",
            "halte garderie Paris façade",
            "daycare Paris building exterior",
        ],
    },
    "gymnase": {
        "label": "Gymnase municipal",
        "queries": [
            "gymnase Paris salle polyvalente",
            "gymnase Japy Paris",
            "salle sportive Paris bâtiment",
        ],
    },
    "piscine": {
        "label": "Piscine municipale",
        "queries": [
            "piscine Pontoise Paris",
            "piscine Butte aux Cailles Paris",
            "piscine Molitor Paris façade",
            "piscine Georges Vallerey Paris",
        ],
    },
    "bibliotheque": {
        "label": "Bibliothèque municipale",
        "queries": [
            "Bibliothèque Sainte Geneviève Paris salle",
            "médiathèque Paris intérieur",
            "bibliothèque publique Paris lecture",
        ],
    },
    "espace-vert": {
        "label": "Espace vert parisien",
        "queries": [
            "Parc Monceau Paris allée",
            "Jardin du Luxembourg allée arbres",
            "Parc Montsouris Paris",
            "square Paris jardin public",
        ],
    },
    "voirie": {
        "label": "Voirie parisienne",
        "queries": [
            "boulevard haussmannien Paris perspective",
            "avenue Paris arbres trottoir",
            "rue Paris piste cyclable aménagée",
        ],
    },
    "logement-social": {
        "label": "Logement social",
        "queries": [
            "HBM Paris immeuble brique",
            "Habitation Bon Marché Paris architecture",
            "cité HLM Paris immeuble ensemble",
            "Porte d'Italie logement Paris",
        ],
    },
    "equipement-culturel": {
        "label": "Équipement culturel",
        "queries": [
            "Centquatre Paris façade",
            "Conservatoire municipal Paris bâtiment",
            "théâtre Paris façade 19e siècle",
            "Carreau du Temple Paris",
        ],
    },
    "equipement-sante": {
        "label": "Équipement santé",
        "queries": [
            "hôpital Paris façade AP-HP",
            "Hôpital Saint-Louis Paris cour",
            "centre de santé municipal Paris",
        ],
    },
    "administration": {
        "label": "Bâtiment administratif",
        "queries": [
            "mairie arrondissement Paris façade",
            "Mairie XIIIe Paris",
            "mairie Paris bâtiment municipal",
        ],
    },
    "autre": {
        "label": "Équipement public divers",
        "queries": [
            "Halles Paris bâtiment public",
            "place Paris aménagement urbain",
            "équipement municipal Paris façade",
        ],
    },
}


# Custom prompt pour la banque générique — plus permissif que le prompt projet.
# Le judge DOIT choisir quelque chose parmi les candidats ; il n'y a pas de
# fallback possible pour une banque (à l'inverse d'un projet où on peut tomber
# sur pictogramme). On autorise "photo non parisienne" tant qu'elle illustre
# la typologie.

GENERIC_SYSTEM_PROMPT = """Tu es directeur artistique pour un site journalistique sur les finances publiques de la VILLE DE PARIS (mairie, budget municipal).

Tu construis une BANQUE DE PHOTOS GÉNÉRIQUES : UNE photo par typologie (école, piscine, bibliothèque…) qui sera utilisée comme illustration par défaut quand aucune photo dédiée n'est disponible pour un projet spécifique de la mairie.

CONTEXTE ÉDITORIAL — TRÈS IMPORTANT :
Les équipements concernés sont des équipements PUBLICS MUNICIPAUX de la Ville de Paris
(écoles publiques, piscines municipales, bibliothèques de quartier, gymnases municipaux,
mairies d'arrondissement, HLM, voirie parisienne…).

La photo choisie doit ABSOLUMENT avoir l'air d'un équipement municipal ordinaire,
PAS d'un lieu privé ou luxueux. Exemples à REJETER :
  - Piscine du Ritz / d'un hôtel / d'un club de sport privé → PAS une piscine municipale
  - Lycée privé international / école anglaise huppée → PAS une école publique
  - Salle de fitness privée / court de tennis de Roland-Garros → PAS un gymnase municipal
  - Grand Palais / Opéra Garnier / monuments iconiques touristiques → PAS un équipement culturel municipal
  - Hôtel particulier historique transformé en restaurant → PAS un bâtiment administratif

Ce qui est BON :
  - Façade ordinaire d'une école élémentaire publique parisienne (architecture années 30-70 ou contemporaine)
  - Piscine municipale simple (bassin + carrelage, pas de marbre, pas de palmiers)
  - Bibliothèque de quartier ou salle de lecture publique (BnF, Sainte-Geneviève comme exemplaires nobles OK)
  - Mairie d'arrondissement (haussmannienne typique) — emblématique mais public
  - HBM en brique rouge (logement social classique parisien)
  - Rue/avenue parisienne avec trottoir et aménagement voirie

TU DOIS obligatoirement choisir la MEILLEURE photo parmi les candidates. Ne réponds JAMAIS avec `best_index: null`. Si toutes sont imparfaites, choisis la moins mauvaise — ton rôle est de trancher.

Critères (ordre d'importance) :
1. ÉQUIPEMENT MUNICIPAL — public, ordinaire, pas luxueux, pas privé
2. TYPOLOGIE — illustre clairement le type demandé
3. QUALITÉ TECHNIQUE — ≥ 800px large, paysage privilégié, photo nette
4. NEUTRALITÉ — pas de visage, pas de logo commercial, pas de texte proéminent

Tu réponds UNIQUEMENT en JSON :
{
  "best_index": 2,
  "score": 7,
  "reason": "Façade caractéristique d'école publique parisienne, sobre, neutre.",
  "recommendation": "generique_typologique",
  "rejected_reasons": {"0": "piscine privée de luxe", "1": "monument historique touristique"}
}
"""


# ─── Wikimedia search ─────────────────────────────────────────────────────────


def wikimedia_search(query: str, limit: int = 9) -> list[dict[str, Any]]:
    try:
        r = requests.get(
            "https://commons.wikimedia.org/w/api.php",
            params={
                "action": "query",
                "format": "json",
                "generator": "search",
                "gsrsearch": f"filetype:bitmap {query}",
                "gsrlimit": limit,
                "gsrnamespace": 6,
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata",
                "iiurlwidth": 800,
            },
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=REQ_TIMEOUT,
        )
    except requests.RequestException as e:
        return []
    if r.status_code != 200:
        return []
    pages = r.json().get("query", {}).get("pages", {}) or {}
    results = []
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {}) or {}
        url = ii.get("url")
        if not url:
            continue
        # Skip SVG / PDF / audio
        if any(url.lower().endswith(ext) for ext in (".svg", ".pdf", ".ogg", ".webm", ".ogv")):
            continue
        results.append({
            "source": "Wikimedia Commons",
            "url": url,
            "thumb": ii.get("thumburl") or url,
            "title": p.get("title", "")[:120],
            "width": ii.get("width"),
            "height": ii.get("height"),
            "license": (meta.get("LicenseShortName") or {}).get("value", ""),
            "author": (meta.get("Artist") or {}).get("value", "")[:120],
            "source_page": f"https://commons.wikimedia.org/wiki/{p.get('title', '').replace(' ', '_')}",
        })
    return results


def collect_candidates(spec: dict[str, Any], verbose: bool = False) -> list[dict[str, Any]]:
    """Tente les queries successivement jusqu'à avoir ≥ 3 candidats."""
    all_results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for query in spec["queries"]:
        if verbose:
            print(f"    📷 Wikimedia: {query!r}")
        results = wikimedia_search(query, limit=MAX_CANDIDATES)
        for r in results:
            if r.get("url") and r["url"] not in seen_urls:
                seen_urls.add(r["url"])
                all_results.append(r)
        if len(all_results) >= 3:
            break
    return all_results[:MAX_CANDIDATES]


# ─── Curation d'une typologie ────────────────────────────────────────────────


def build_judge_item(typologie: str, spec: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"generic_{typologie}",
        "nom": spec["label"],
        "tier": "generic",
        "typologie_guess": spec["label"],
        "arrondissement": 0,
        "chapitre": spec["label"],
        "montant_eur": 0,
    }


def _deterministic_best(candidates: list[dict[str, Any]]) -> int | None:
    """Fallback si judge rejette tout : plus grosse photo paysage (largeur >= hauteur)."""
    best_idx = None
    best_area = 0
    for i, c in enumerate(candidates):
        w = c.get("width") or 0
        h = c.get("height") or 0
        if w < 600:
            continue
        # Privilégie paysage
        if h > w:
            continue
        area = w * h
        if area > best_area:
            best_area = area
            best_idx = i
    if best_idx is not None:
        return best_idx
    # Sinon prend juste la plus grosse tout court
    best_area = 0
    for i, c in enumerate(candidates):
        w = c.get("width") or 0
        h = c.get("height") or 0
        area = w * h
        if area > best_area:
            best_area = area
            best_idx = i
    return best_idx


def curate_one(typologie: str, spec: dict[str, Any], verbose: bool = False) -> dict[str, Any]:
    candidates = collect_candidates(spec, verbose=verbose)
    if not candidates:
        return {"error": "aucune photo Wikimedia trouvée"}

    if verbose:
        print(f"  → {len(candidates)} candidats Wikimedia")

    # Téléchargement + judge
    images: list[tuple[bytes, str]] = []
    used: list[dict[str, Any]] = []
    for c in candidates:
        thumb = c.get("thumb") or c.get("url")
        data, info = judge_mod.fetch_image_base64(thumb)
        if data is None:
            continue
        images.append((data, info))
        used.append(c)
        if len(used) >= MAX_CANDIDATES:
            break

    if not images:
        return {"error": "candidats non téléchargeables"}

    judge_item = build_judge_item(typologie, spec)
    judge_item["wiki_generic"] = used

    # Swap le prompt judge par le prompt générique (permissif, municipal)
    original_prompt = judge_mod.SYSTEM_PROMPT
    judge_mod.SYSTEM_PROMPT = GENERIC_SYSTEM_PROMPT
    try:
        ctx = judge_mod.build_context(judge_item, used)
        try:
            verdict = judge_mod.call_gemini_multimodal(ctx, images)
        except Exception as e:
            return {"error": f"judge: {e}"}
    finally:
        judge_mod.SYSTEM_PROMPT = original_prompt

    best_idx = verdict.get("best_index")
    fallback = False
    if best_idx is None or not isinstance(best_idx, int) or not (0 <= best_idx < len(used)):
        # Judge a refusé tous les candidats — fallback déterministe
        best_idx = _deterministic_best(used)
        fallback = True
        if best_idx is None:
            return {"error": "judge a rejeté tout ET fallback déterministe a échoué"}
        if verbose:
            print(f"  ⚠ judge null → fallback déterministe sur #{best_idx}")

    best = used[best_idx]
    return {
        "url": best.get("url"),
        "source_page": best.get("source_page"),
        "source_label": best.get("source"),
        "credit": best.get("author") or best.get("license") or "",
        "license": best.get("license") or "",
        "score": (verdict.get("score") if not fallback else 4) or 0,
        "reason": (verdict.get("reason") if not fallback else "fallback déterministe (plus grande photo paysage)") or "",
        "fallback": fallback,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="CSV des typologies à traiter (défaut : toutes)")
    parser.add_argument("--force", action="store_true", help="Écraser les typologies déjà en banque")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if not judge_mod.GEMINI_API_KEY:
        print("❌ GOOGLE_API_KEY / GEMINI_API_KEY non définie.", file=sys.stderr)
        return 1

    if OUT_PATH.exists():
        with OUT_PATH.open(encoding="utf-8") as fh:
            bank = json.load(fh)
    else:
        bank = {"items": {}, "generated_at": None}

    only = {s.strip() for s in args.only.split(",")} if args.only else None

    print(f"📋 {len(WIKIMEDIA_QUERIES)} typologies à curer (Wikimedia Commons → judge)")
    t0 = time.time()

    for typologie, spec in WIKIMEDIA_QUERIES.items():
        if only and typologie not in only:
            continue
        if not args.force and isinstance(bank.get("items", {}).get(typologie), dict) and \
                bank["items"][typologie].get("url"):
            print(f"  ↷ {typologie} (déjà en banque, skip)")
            continue
        print(f"\n— {typologie.upper()} · {spec['label']}")
        result = curate_one(typologie, spec, verbose=args.verbose)
        if result.get("error"):
            print(f"  ❌ {result['error']}")
            bank.setdefault("items", {})[typologie] = {"error": result["error"]}
        else:
            print(f"  ✓ score {result['score']}/10 — {(result.get('url') or '')[:90]}")
            bank.setdefault("items", {})[typologie] = {
                "typologie": typologie,
                "label": spec["label"],
                "url": result["url"],
                "source_page": result["source_page"],
                "source_label": result["source_label"],
                "credit": result["credit"],
                "license": result["license"],
                "score": result["score"],
                "reason": result["reason"],
            }
        bank["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        with OUT_PATH.open("w", encoding="utf-8") as fh:
            json.dump(bank, fh, ensure_ascii=False, indent=2)
        time.sleep(0.5)

    elapsed = time.time() - t0
    print(f"\n✅ {OUT_PATH.relative_to(PROJECT_ROOT)}")
    print(f"⏱  {elapsed:.0f}s")
    items = bank.get("items") or {}
    ok = sum(1 for v in items.values() if isinstance(v, dict) and v.get("url"))
    print(f"📸 Typologies curées : {ok}/{len(WIKIMEDIA_QUERIES)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
