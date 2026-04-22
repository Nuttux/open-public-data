#!/usr/bin/env python3
"""
Enrich bénéficiaires de subventions via cascade SIRENE → LLM grounded search.

Cascade par bénéficiaire (clé : beneficiaire_normalise) :

  1. SIRENE cache (SIRET ou nom) → si APE spécifique, on prend le libellé INSEE.
  2. recherche-entreprises.api.gouv.fr par nom → enrichit le cache en mémoire.
  3. LLM grounded (provider=claude par défaut, gemini disponible) → cherche
     l'activité et les sources web. Claude Haiku avec web_search est nettement
     plus fiable que Gemini google_search pour les institutions françaises.
  4. Wikipedia FR (MediaWiki API) → filet quand le LLM rend null.
  5. Libellé INSEE brut si SIRENE a résolu sans APE spécifique.
  6. fallback_none — frontend affiche "données brutes".

Entrée : website/public/data/subventions/beneficiaires_*.json
Cache  : website/public/data/enrichment/beneficiaire_grounded.json

Usage :
    ANTHROPIC_API_KEY=xxx python pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py
    ANTHROPIC_API_KEY=xxx python pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py --limit 50 --verbose
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py --provider gemini
    python pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py --dry-run --year 2023
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SUBVENTIONS_DIR = PROJECT_ROOT / "website" / "public" / "data" / "subventions"
SIRENE_CACHE = PROJECT_ROOT / "website" / "public" / "data" / "enrichment" / "sirene_companies.json"
CACHE_PATH = PROJECT_ROOT / "website" / "public" / "data" / "enrichment" / "beneficiaire_grounded.json"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# Claude — Haiku 4.5 par défaut (rapide et cheap), override possible par env.
# Web search tool avec max 3 uses pour rester raisonnable sur le coût.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5")
CLAUDE_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_WEB_SEARCH_MAX_USES = 3

REQ_TIMEOUT = 90
MAX_RETRIES = 6  # Tier 1 Anthropic = beaucoup de 429, on est patient
RETRY_WAIT_429 = 60  # 60s, 120s, 180s… (suffisant pour la fenêtre RPM)
# Délai par défaut entre appels — par défaut prudent pour Tier 1 Anthropic.
# Override via --delay ou env CLAUDE_CALL_DELAY.
CALL_DELAY = float(os.environ.get("CLAUDE_CALL_DELAY", "3.0"))

# Codes APE génériques à rejeter (on les remplacera par grounded search)
GENERIC_APE_CODES = {"9499Z", "9412Z", "9499", "9412", ""}

# API publique recherche-entreprises — gratuite, rate-limit ~7 req/s.
RECHERCHE_API_URL = "https://recherche-entreprises.api.gouv.fr/search"
RECHERCHE_DELAY = 0.15

# Wikipedia FR — filet de sécurité quand Gemini grounded rend null.
# API gratuite, pas de clé, MediaWiki user-agent requis.
WIKIPEDIA_API_URL = "https://fr.wikipedia.org/w/api.php"
WIKIPEDIA_UA = "FranceOpenData/0.3 (https://franceopendata.org; contact@franceopendata.org)"
WIKIPEDIA_DELAY = 0.2

SAVE_EVERY = 50


SYSTEM_PROMPT = """Tu es un documentaliste qui identifie l'activité d'entités françaises pour un site de finances publiques.

MÉTHODE :
1. Utilise d'abord google_search pour trouver l'entité (site officiel, Wikipedia, data.gouv.fr, presse).
2. Si un SIREN est fourni, tu peux chercher directement "SIREN {siren}" pour accéder aux fiches officielles.
3. Résume l'activité en 1 phrase neutre, factuelle, basée sur ce que tu lis.

CRITÈRES DE SORTIE :
- activite_verifiee : 1 phrase (≤160 car.) précise et factuelle. Format type "Bailleur social de...", "Établissement public chargé de...", "Association qui gère...", "Entreprise de...". Indique le statut juridique si connu.
- perimetre_geographique : "Paris Xe" / "Paris" / "Île-de-France" / "national" / "international" / null.
- null uniquement si vraiment aucune information n'existe (très rare pour les entités publiques ou subventionnées).

Réponds UNIQUEMENT avec un JSON :
{"activite_verifiee": "...", "perimetre_geographique": "..."}
"""


# --- SIRENE cache (étape 1) ---------------------------------------------------


def load_sirene_cache() -> dict[str, dict[str, Any]]:
    if not SIRENE_CACHE.exists():
        return {}
    try:
        with SIRENE_CACHE.open(encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    return data.get("items", {}) if isinstance(data, dict) else {}


def _normalize_nom(s: str) -> str:
    """Normalise un nom pour matching insensible aux accents / ponctuation."""
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def build_sirene_name_index(sirene: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Index inverse nom_normalisé → entrée SIRENE. En cas de collision, on
    garde la première entrée rencontrée (le cache itère déjà par ordre stable)
    — ça privilégie les SIREN historiques."""
    idx: dict[str, dict[str, Any]] = {}
    for entry in sirene.values():
        nom = _normalize_nom(entry.get("nom") or "")
        if nom and nom not in idx:
            idx[nom] = entry
    return idx


def lookup_sirene(
    siret: str,
    name: str,
    sirene: dict[str, dict[str, Any]],
    name_index: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    """Cherche dans SIRENE par SIRET en priorité, puis par nom normalisé."""
    if siret and siret.isdigit() and len(siret) >= 9:
        entry = sirene.get(siret[:9])
        if entry:
            return entry
    key = _normalize_nom(name)
    if key:
        entry = name_index.get(key)
        if entry:
            return entry
    return None


def fetch_wikipedia_summary(query: str) -> dict[str, Any] | None:
    """Cherche une page Wikipedia FR via MediaWiki search + extracts.
    Retourne {'activite': <1re phrase>, 'url': <url>, 'title': <titre page>}
    ou None si rien de pertinent."""
    q = (query or "").strip()
    if len(q) < 3:
        return None
    # 1. Recherche plein-texte pour trouver le titre le plus pertinent
    try:
        r = requests.get(
            WIKIPEDIA_API_URL,
            params={"action": "query", "list": "search", "srsearch": q, "srlimit": 1, "format": "json"},
            headers={"User-Agent": WIKIPEDIA_UA},
            timeout=15,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    hits = (r.json() or {}).get("query", {}).get("search", [])
    if not hits:
        return None
    title = hits[0].get("title") or ""
    if not title:
        return None

    # 2. Récupère l'intro textuelle de la page trouvée
    try:
        r = requests.get(
            WIKIPEDIA_API_URL,
            params={
                "action": "query",
                "prop": "extracts",
                "exintro": True,
                "explaintext": True,
                "titles": title,
                "redirects": 1,
                "format": "json",
            },
            headers={"User-Agent": WIKIPEDIA_UA},
            timeout=15,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    pages = (r.json() or {}).get("query", {}).get("pages") or {}
    for p in pages.values():
        extract = (p.get("extract") or "").strip()
        if not extract or "peut désigner" in extract[:200]:
            continue
        # Première phrase, coupée à ~220 caractères
        first = re.split(r"(?<=[.!?])\s+", extract)[0].strip()
        if len(first) < 30:
            continue
        return {
            "activite": first[:220],
            "url": f"https://fr.wikipedia.org/wiki/{title.replace(' ', '_')}",
            "title": title,
        }
    return None


def fetch_siren_by_name(name: str) -> dict[str, Any] | None:
    """Interroge recherche-entreprises.api.gouv.fr par nom — renvoie un dict
    au même format que sirene_companies.json, ou None si rien de pertinent."""
    q = (name or "").strip()
    if len(q) < 3:
        return None
    try:
        r = requests.get(RECHERCHE_API_URL, params={"q": q, "per_page": 1}, timeout=20)
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    results = (r.json() or {}).get("results", [])
    if not results:
        return None
    e = results[0]
    siege = e.get("siege", {}) or {}
    return {
        "siren": e.get("siren") or "",
        "nom": e.get("nom_complete") or e.get("nom_raison_sociale") or "",
        "activite_principale": siege.get("activite_principale"),
        "libelle_activite": siege.get("libelle_activite_principale") or "",
        "commune": siege.get("libelle_commune") or "",
        "adresse": siege.get("adresse") or "",
        "etat": e.get("etat_administratif") or "",
        "_source": "recherche-entreprises.api",
    }


def sirene_to_activity(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Extrait activite + code APE. Retourne None si APE générique ou vide."""
    ape = (entry.get("activite_principale") or "").strip().upper()
    libelle = (entry.get("libelle_activite") or "").strip()
    if not libelle:
        return None
    # On rejette les codes génériques (autres orgas associatives etc.)
    if ape in GENERIC_APE_CODES:
        return None
    return {"libelle": libelle, "ape": ape}


# --- Gemini grounded (étape 2) ------------------------------------------------


def fmt_eur(n: float) -> str:
    if n >= 1e6:
        return f"{n/1e6:.2f} M€".replace(".", ",")
    if n >= 1e3:
        return f"{round(n/1e3)} k€"
    return f"{round(n)} €"


def build_user_prompt(b: dict[str, Any], sirene_entry: dict[str, Any] | None = None) -> str:
    raw_name = b.get("beneficiaire") or ""
    # Si SIRENE a retourné un nom officiel, on le privilégie (source fiable,
    # résout les troncatures "CAISSE ECOLES 15 EME ARRON" → "CAISSE DES
    # ECOLES DU 15E ARRONDISSEMENT DE PARIS").
    official_name = (sirene_entry or {}).get("nom", "").strip() if sirene_entry else ""
    display_name = official_name or raw_name
    nature = b.get("nature_juridique") or "—"
    direction = b.get("direction") or "—"
    theme = b.get("thematique") or "—"
    montant = float(b.get("montant_total") or 0)
    siren_hint = ""
    if sirene_entry and sirene_entry.get("siren"):
        siren_hint = f"\n- SIREN : {sirene_entry['siren']}"

    name_block = f"- Nom officiel (INSEE) : {official_name}\n- Nom dans les données source : {raw_name}" if official_name and official_name != raw_name else f"- Nom : {display_name}"

    return (
        f"Bénéficiaire de subvention de la Ville de Paris :\n"
        f"{name_block}{siren_hint}\n"
        f"- Nature juridique : {nature}\n"
        f"- Direction instruite : {direction}\n"
        f"- Thématique : {theme}\n"
        f"- Montant total reçu : {fmt_eur(montant)}\n\n"
        f"Effectue une recherche Google puis retourne le JSON défini par le "
        f"system prompt. Pour une institution publique française connue, tu "
        f"dois toujours produire une activite_verifiee."
    )


def call_gemini_grounded(user_prompt: str) -> dict[str, Any]:
    """Appel Gemini 3 Flash avec google_search — renvoie le JSON + _citations."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY / GEMINI_API_KEY non définie")

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
    }

    for attempt in range(MAX_RETRIES):
        r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload, timeout=REQ_TIMEOUT)
        if r.status_code == 429:
            wait = RETRY_WAIT_429 * (attempt + 1)
            print(f"  ⚠ rate-limit, pause {wait}s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code != 200:
            raise RuntimeError(f"Gemini HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Gemini response mal formée : {e} / {str(data)[:300]}") from e

        # unwrap fences
        if text.startswith("```"):
            lines = text.split("\n")
            while lines and lines[0].startswith("```"):
                lines.pop(0)
            while lines and lines[-1].startswith("```"):
                lines.pop()
            text = "\n".join(lines)
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            text = m.group(0)
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"JSON decode error: {e} · raw: {text[:400]}") from e

        citations: list[dict[str, Any]] = []
        search_queries: list[str] = []
        try:
            gm = data["candidates"][0].get("groundingMetadata") or {}
            for gc in gm.get("groundingChunks", []):
                web = gc.get("web") or {}
                if web.get("uri"):
                    citations.append({"url": web["uri"], "title": web.get("title", "")})
            search_queries = gm.get("webSearchQueries") or []
        except Exception:
            pass
        parsed["_citations"] = citations
        parsed["_search_queries"] = search_queries
        parsed["_raw_text"] = text
        return parsed

    raise RuntimeError("Max retries exceeded")


def call_claude_web_search(user_prompt: str) -> dict[str, Any]:
    """Appel Claude (Haiku) avec le tool `web_search`. Renvoie le même format
    que call_gemini_grounded : {activite_verifiee, perimetre_geographique,
    _citations, _search_queries, _raw_text}.

    Le tool web_search est géré côté Anthropic : le modèle décide quand lancer
    une recherche, les résultats sont injectés dans la conversation et cités
    dans la réponse finale via des blocks `citations`.
    """
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY non définie")

    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 1024,
        "temperature": 0.2,
        "system": SYSTEM_PROMPT,
        "tools": [
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": CLAUDE_WEB_SEARCH_MAX_USES,
            }
        ],
        "messages": [{"role": "user", "content": user_prompt}],
    }
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    for attempt in range(MAX_RETRIES):
        r = requests.post(CLAUDE_URL, headers=headers, json=payload, timeout=REQ_TIMEOUT)
        if r.status_code == 429:
            wait = RETRY_WAIT_429 * (attempt + 1)
            print(f"  ⚠ Claude rate-limit, pause {wait}s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code != 200:
            raise RuntimeError(f"Claude HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()

        # Concatène tous les blocks text et collecte les citations (URLs) et
        # les queries de web_search.
        text_parts: list[str] = []
        citations: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        search_queries: list[str] = []
        for block in data.get("content", []) or []:
            btype = block.get("type")
            if btype == "text":
                text_parts.append(block.get("text") or "")
                for c in block.get("citations") or []:
                    url = c.get("url") or ""
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        citations.append({"url": url, "title": c.get("title") or ""})
            elif btype == "server_tool_use" and block.get("name") == "web_search":
                q = (block.get("input") or {}).get("query") or ""
                if q:
                    search_queries.append(q)
            elif btype == "web_search_tool_result":
                # Peut contenir des URLs supplémentaires dans content[].url
                for item in block.get("content", []) or []:
                    url = item.get("url") or ""
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        citations.append({"url": url, "title": item.get("title") or ""})

        text = "".join(text_parts).strip()
        # Extrait le JSON final du texte — peut être entouré de commentaires
        if text.startswith("```"):
            lines = text.split("\n")
            while lines and lines[0].startswith("```"):
                lines.pop(0)
            while lines and lines[-1].startswith("```"):
                lines.pop()
            text = "\n".join(lines)
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            text_json = m.group(0)
        else:
            text_json = text

        try:
            parsed = json.loads(text_json)
        except json.JSONDecodeError:
            # Pas de JSON parseable — on renvoie quand même un shape compatible
            parsed = {"activite_verifiee": None, "perimetre_geographique": None}

        parsed["_citations"] = citations
        parsed["_search_queries"] = search_queries
        parsed["_raw_text"] = text
        return parsed

    raise RuntimeError("Claude max retries exceeded")


def confiance_from_citations(n: int) -> float:
    """Heuristique simple : plus de citations = plus de confiance."""
    if n >= 3:
        return 0.8
    if n == 2:
        return 0.65
    if n == 1:
        return 0.5
    return 0.0


# --- Cache + iteration --------------------------------------------------------


def load_cache() -> dict[str, dict[str, Any]]:
    if not CACHE_PATH.exists():
        return {}
    with CACHE_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    return data.get("items", {}) if isinstance(data, dict) else {}


def save_cache(items: dict[str, dict[str, Any]]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": GEMINI_MODEL,
        "count": len(items),
        "items": items,
    }
    with CACHE_PATH.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


def iter_beneficiaires(year: int | None) -> list[dict[str, Any]]:
    """Dédup par beneficiaire_normalise, toutes années confondues (sauf filtre)."""
    files = sorted(SUBVENTIONS_DIR.glob("beneficiaires_*.json"), reverse=True)
    if year:
        files = [f for f in files if f.stem.endswith(str(year))]
    seen: set[str] = set()
    items: list[dict[str, Any]] = []
    for f in files:
        try:
            with f.open(encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        for b in data.get("data", []):
            key = (b.get("beneficiaire_normalise") or "").strip()
            if not key or key in seen:
                continue
            seen.add(key)
            items.append(b)
    return items


# --- Orchestration par item ---------------------------------------------------


def process_beneficiaire(
    b: dict[str, Any],
    sirene: dict[str, dict[str, Any]],
    sirene_name_index: dict[str, dict[str, Any]],
    provider: str = "claude",
    verbose: bool = False,
) -> dict[str, Any]:
    name = b.get("beneficiaire") or ""
    key = b.get("beneficiaire_normalise") or ""
    siret = (b.get("siret") or "").strip()

    base = {
        "beneficiaire": name,
        "beneficiaire_normalise": key,
        "siret": siret,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": GEMINI_MODEL,
    }

    # Étape 1 : SIRENE (SIRET si présent, sinon fallback nom dans le cache).
    sirene_entry = lookup_sirene(siret, name, sirene, sirene_name_index)

    # Étape 1.5 : API recherche-entreprises si rien dans le cache.
    # On enrichit le cache en mémoire pour que le nom s'y retrouve à la prochaine occurrence.
    if not sirene_entry:
        fetched = fetch_siren_by_name(name)
        time.sleep(RECHERCHE_DELAY)
        if fetched and fetched.get("siren"):
            sirene[fetched["siren"]] = fetched
            nkey = _normalize_nom(fetched.get("nom") or "")
            if nkey and nkey not in sirene_name_index:
                sirene_name_index[nkey] = fetched
            sirene_entry = fetched
            if verbose:
                print(f"  ↳ resolved SIREN {fetched['siren']} via recherche-entreprises")

    if sirene_entry:
        # On enrichit le base avec le SIREN retrouvé — utile côté front.
        if sirene_entry.get("siren") and not base["siret"]:
            base["siret"] = sirene_entry["siren"]
        activity = sirene_to_activity(sirene_entry)
        if activity:
            if verbose:
                print(f"  ✓ SIRENE APE {activity['ape']} → {activity['libelle'][:70]}")
            commune = (sirene_entry.get("commune") or "").strip()
            perimetre = commune or None
            return {
                **base,
                "activite_verifiee": activity["libelle"],
                "perimetre_geographique": perimetre,
                "sources": [],
                "confiance": 0.9,
                "source_type": "sirene_ape",
            }

    # Étape 2 : LLM grounded (provider=claude par défaut, gemini en option)
    grounded_source_type = "claude_web" if provider == "claude" else "grounded_search"
    grounded_model = CLAUDE_MODEL if provider == "claude" else GEMINI_MODEL
    base["model"] = grounded_model
    try:
        if provider == "claude":
            result = call_claude_web_search(build_user_prompt(b, sirene_entry))
        else:
            result = call_gemini_grounded(build_user_prompt(b, sirene_entry))
    except Exception as e:
        if verbose:
            print(f"  ⚠ grounded error: {e}")
        return {
            **base,
            "activite_verifiee": None,
            "perimetre_geographique": None,
            "sources": [],
            "confiance": 0.0,
            "source_type": "fallback_none",
            "_error": str(e)[:200],
        }

    activite = result.get("activite_verifiee")
    if isinstance(activite, str):
        # Strip Claude inline citation tags <cite index="...">…</cite>
        activite = re.sub(r"</?cite[^>]*>", "", activite)
        activite = re.sub(r"\s+", " ", activite).strip() or None
    perimetre = result.get("perimetre_geographique")
    if isinstance(perimetre, str):
        perimetre = re.sub(r"</?cite[^>]*>", "", perimetre)
        perimetre = perimetre.strip() or None
    citations = result.get("_citations") or []
    search_queries = result.get("_search_queries") or []

    # Si Gemini a rien trouvé de crédible → tentons le filet SIRENE avant fallback
    if not activite or not citations:
        if verbose:
            print(f"  ↩ Gemini null (queries={len(search_queries)} cites={len(citations)})")
            if search_queries:
                print(f"     queries: {search_queries[:3]}")

        # Filet 1 : Wikipedia FR (très bonne couverture sur les institutions publiques
        # françaises, palie les angles morts du google_search Gemini).
        wiki_query = (sirene_entry or {}).get("nom") or name
        wiki = fetch_wikipedia_summary(wiki_query)
        time.sleep(WIKIPEDIA_DELAY)
        if wiki:
            if verbose:
                print(f"  ↳ wikipedia fallback → {wiki['title']}")
            return {
                **base,
                "activite_verifiee": wiki["activite"],
                "perimetre_geographique": None,
                "sources": [{"url": wiki["url"], "title": "fr.wikipedia.org"}],
                "confiance": 0.7,
                "source_type": "wikipedia",
            }

        # Filet 2 : libellé INSEE s'il est non vide (souvent générique mais mieux que null).
        if sirene_entry and sirene_entry.get("libelle_activite"):
            libelle = sirene_entry["libelle_activite"].strip()
            commune = (sirene_entry.get("commune") or "").strip() or None
            if verbose:
                print(f"  ↳ sirene_libelle fallback → {libelle[:70]}")
            return {
                **base,
                "activite_verifiee": libelle,
                "perimetre_geographique": commune,
                "sources": [],
                "confiance": 0.4,
                "source_type": "sirene_libelle",
            }

        return {
            **base,
            "activite_verifiee": None,
            "perimetre_geographique": None,
            "sources": [],
            "confiance": 0.0,
            "source_type": "fallback_none",
        }

    if verbose:
        print(f"  ✓ grounded ({len(citations)} citations) → {activite[:70]}")

    return {
        **base,
        "activite_verifiee": activite,
        "perimetre_geographique": perimetre,
        "sources": citations[:5],
        "confiance": confiance_from_citations(len(citations)),
        "source_type": grounded_source_type,
    }


def main() -> int:
    global CALL_DELAY  # noqa: PLW0603

    parser = argparse.ArgumentParser(description="Enrichit les bénéficiaires via cascade SIRENE → LLM grounded (Claude ou Gemini)")
    parser.add_argument("--year", type=int)
    parser.add_argument("--limit", type=int, help="Limite le nombre de bénéficiaires")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--provider", choices=["claude", "gemini"], default="claude",
                        help="LLM provider (défaut: claude, plus fiable)")
    parser.add_argument("--delay", type=float, default=None,
                        help=f"Délai entre appels LLM en secondes (défaut: {CALL_DELAY})")
    args = parser.parse_args()

    # Override delay si fourni
    if args.delay is not None:
        CALL_DELAY = args.delay
        print(f"⏱  Délai entre appels : {CALL_DELAY}s")

    if args.provider == "claude" and not ANTHROPIC_API_KEY and not args.dry_run:
        print("❌ ANTHROPIC_API_KEY non définie (requis pour --provider claude).", file=sys.stderr)
        return 1
    if args.provider == "gemini" and not GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY / GEMINI_API_KEY non définie (requis pour --provider gemini).", file=sys.stderr)
        return 1

    cache = load_cache()
    sirene = load_sirene_cache()
    sirene_name_index = build_sirene_name_index(sirene)
    print(f"📦 Cache bénéficiaires : {len(cache)} entrées")
    print(f"📦 Cache SIRENE : {len(sirene)} entreprises · index nom : {len(sirene_name_index)}")

    bens = iter_beneficiaires(args.year)
    pending = [b for b in bens if (b.get("beneficiaire_normalise") or "") not in cache]
    print(f"📋 Bénéficiaires uniques : {len(bens)} · à traiter : {len(pending)}")

    if args.limit:
        pending = pending[: args.limit]
        print(f"🔒 Limite : {len(pending)}")

    if not pending:
        print("✅ Cache à jour.")
        return 0

    stats = {"sirene_ape": 0, "grounded_search": 0, "claude_web": 0, "wikipedia": 0, "sirene_libelle": 0, "fallback_none": 0, "errors": 0}
    processed = 0
    total = len(pending)
    t_start = time.time()

    for b in pending:
        key = b.get("beneficiaire_normalise") or ""
        name = (b.get("beneficiaire") or "")[:70]
        if args.verbose:
            print(f"[{processed + 1}/{total}] {name}")

        if args.dry_run:
            cache[key] = {
                "beneficiaire": b.get("beneficiaire", ""),
                "beneficiaire_normalise": key,
                "siret": b.get("siret") or "",
                "activite_verifiee": "(dry-run stub)",
                "perimetre_geographique": None,
                "sources": [],
                "confiance": 0.0,
                "source_type": "fallback_none",
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "model": "dry-run",
            }
        else:
            try:
                result = process_beneficiaire(b, sirene, sirene_name_index,
                                              provider=args.provider, verbose=args.verbose)
            except Exception as e:
                stats["errors"] += 1
                print(f"  ⚠ {name}: {e}", flush=True)
                processed += 1
                continue
            cache[key] = result
            stats[result.get("source_type", "fallback_none")] = (
                stats.get(result.get("source_type", "fallback_none"), 0) + 1
            )
            # Rate-limit uniquement après un appel LLM effectif (Claude/Gemini)
            if result.get("source_type") in ("grounded_search", "claude_web", "fallback_none"):
                if "_error" not in result and result.get("source_type") != "sirene_ape":
                    time.sleep(CALL_DELAY)

        processed += 1
        if processed % 10 == 0 or processed == total:
            elapsed = time.time() - t_start
            rate = processed / elapsed if elapsed > 0 else 0
            eta = int((total - processed) / rate) if rate > 0 else 0
            pct = 100 * processed / total
            print(
                f"  [{processed:>4}/{total}] {pct:5.1f}%  ·  {rate:4.1f} items/s  ·  "
                f"ETA {eta//60:02d}m{eta%60:02d}s  ·  "
                f"APE={stats['sirene_ape']} claude={stats['claude_web']} "
                f"gemini={stats['grounded_search']} wiki={stats['wikipedia']} "
                f"libelle={stats['sirene_libelle']} "
                f"none={stats['fallback_none']} err={stats['errors']}",
                flush=True,
            )
        if processed % SAVE_EVERY == 0:
            save_cache(cache)

    save_cache(cache)
    print(f"💾 Cache écrit : {CACHE_PATH.relative_to(PROJECT_ROOT)} ({len(cache)} entrées)")
    print(
        f"📊 Résumé : SIRENE-APE={stats['sirene_ape']}  ·  "
        f"claude-web={stats['claude_web']}  ·  "
        f"gemini={stats['grounded_search']}  ·  "
        f"wikipedia={stats['wikipedia']}  ·  "
        f"sirene-libelle={stats['sirene_libelle']}  ·  "
        f"fallback={stats['fallback_none']}  ·  erreurs={stats['errors']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
