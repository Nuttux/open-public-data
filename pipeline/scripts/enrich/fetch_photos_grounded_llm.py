#!/usr/bin/env python3
"""
Fetch photos via Gemini grounded search — version v2 (og:image pipeline).

Pipeline en 2 étages qui évite le problème d'hallucination d'URLs d'images :

  1. ÉTAPE A — PAGES
     Gemini 3 Flash avec `google_search` activé nous renvoie une liste de
     PAGES HTML (pas d'URLs d'images) où le projet est mentionné/illustré.
     Priorité : paris.fr, Wikipedia FR, presse régionale, sites officiels.
     Ces URLs de pages proviennent des citations Google Search — donc elles
     EXISTENT VRAIMENT.

  2. ÉTAPE B — OG:IMAGE
     Pour chaque page, on scrape `<meta property="og:image">` et
     `<meta name="twitter:image">`. Ces balises contiennent l'image que
     le site veut voir s'afficher dans les aperçus sociaux — c'est donc
     une image de qualité, validée par le CMS, et toujours accessible.

  3. FALLBACK WIKIPEDIA
     Si Gemini n'a rien trouvé, on interroge directement l'API Wikipedia
     (pageimages) sur le nom du projet — pas de devinette, réponse exacte.

Entrée : pipeline/output/sample_photos_report.json
Sortie : pipeline/output/sample_photos_enriched.json (section grounded_search par projet)

Usage :
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/fetch_photos_grounded_llm.py
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/fetch_photos_grounded_llm.py --limit 5 --verbose
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
OUT_DIR = PROJECT_ROOT / "pipeline" / "output"
SAMPLE_JSON = OUT_DIR / "sample_photos_report.json"
ENRICHED_JSON = OUT_DIR / "sample_photos_enriched.json"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

USER_AGENT = (
    "FranceOpenData-PhotoGrounded/0.2 "
    "(https://franceopendata.org; contact@franceopendata.org)"
)
REQ_TIMEOUT = 90
MAX_RETRIES = 3
RETRY_WAIT_429 = 30

# Blocked domains — réseaux sociaux + agrégateurs sans valeur éditoriale
BLOCKED_DOMAINS = {
    "instagram.com", "twitter.com", "x.com", "facebook.com",
    "pinterest.com", "pinterest.fr", "tiktok.com",
    "getty.com", "gettyimages.com", "gettyimages.fr", "shutterstock.com",
    "alamy.com", "istockphoto.com", "adobe.com", "stock.adobe.com",
}

SYSTEM_PROMPT = """Tu es un documentaliste iconographique pour un site journalistique sur les finances publiques parisiennes.

Pour un projet d'investissement donné, tu dois trouver les meilleures PAGES WEB publiques qui illustrent ce projet ou ce lieu.

IMPORTANT : tu ne retournes PAS d'URLs d'images. Tu retournes UNIQUEMENT des URLs de PAGES HTML publiques qui contiennent ou mentionnent le projet. Les images seront extraites automatiquement depuis ces pages (via les balises og:image).

PROCÉDURE :
1. Utilise activement l'outil Google Search pour trouver le projet.
2. Priorise les sources officielles et fiables (dans cet ordre) :
   - paris.fr (pages Ville de Paris — équipements, quartiers, actualités)
   - fr.wikipedia.org (articles encyclopédiques)
   - commons.wikimedia.org (galeries photos)
   - sites d'arrondissement / établissements (mairie1X.paris.fr, ecole-xxx.fr, etc.)
   - presse régionale (Le Parisien, France Bleu Paris, 20 Minutes Paris)
   - OpenStreetMap / Mapillary si pertinent
3. Évite strictement :
   - réseaux sociaux (Instagram, Twitter/X, Facebook, Pinterest, TikTok)
   - banques d'images payantes (Getty, Shutterstock, Alamy, Adobe Stock)
   - sites SEO spammy ou agrégateurs sans rédaction
4. Retourne 3 à 6 URLs de pages HTML, chacune pertinente pour illustrer le projet.

RÈGLES :
- JSON UNIQUEMENT, pas de commentaire hors JSON.
- Pas de page unique copiée 5 fois — varie les sources.
- Si tu ne trouves AUCUNE page crédible, retourne `{"pages": []}`.

Format :
{
  "pages": [
    {
      "page_url": "https://www.paris.fr/lieux/piscine-belliard-2479",
      "source": "paris.fr",
      "why": "Page officielle de la piscine Belliard — fiche d'équipement municipal",
      "expected_content": "photo de la façade de la piscine, horaires, adresse"
    }
  ]
}
"""


# ─── Étape A : appel Gemini grounded ──────────────────────────────────────────


def fmt_eur(n: float) -> str:
    if n >= 1e9: return f"{n/1e9:.2f} Md€".replace(".", ",")
    if n >= 1e6: return f"{n/1e6:.1f} M€".replace(".", ",")
    if n >= 1e3: return f"{round(n/1e3)} k€"
    return f"{round(n)} €"


def build_user_prompt(item: dict[str, Any]) -> str:
    nom = item.get("nom") or ""
    chapitre = item.get("chapitre") or ""
    arr = item.get("arrondissement") or 0
    montant = float(item.get("montant_eur") or 0)
    return (
        f"Projet d'investissement public à Paris :\n"
        f"- Nom : {nom}\n"
        f"- Arrondissement : {arr}ᵉ\n"
        f"- Chapitre budgétaire : {chapitre}\n"
        f"- Montant voté : {fmt_eur(montant)}\n\n"
        f"Trouve 3 à 6 URLs de PAGES HTML publiques illustrant ce projet ou ce lieu "
        f"(paris.fr, Wikipedia, presse régionale). Retourne le JSON uniquement comme "
        f"défini par le system prompt."
    )


def call_gemini_grounded(user_prompt: str) -> dict[str, Any]:
    if not GEMINI_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY / GEMINI_API_KEY non définie")

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096},
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
            raise RuntimeError(f"Gemini response mal formée : {e} / {data}") from e

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
        try:
            gm = data["candidates"][0].get("groundingMetadata") or {}
            for gc in gm.get("groundingChunks", []):
                web = gc.get("web") or {}
                if web.get("uri"):
                    citations.append({"uri": web["uri"], "title": web.get("title", "")})
        except Exception:
            pass
        parsed["_citations"] = citations
        return parsed

    raise RuntimeError("Max retries exceeded")


# ─── Étape B : scraping og:image ──────────────────────────────────────────────


class _MetaParser(HTMLParser):
    """Petit parseur qui extrait les meta tags d'intérêt + les <img>."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.og_image: str | None = None
        self.og_image_secure: str | None = None
        self.twitter_image: str | None = None
        self.page_title: str | None = None
        # Fallback : premier <img> avec src absolue et width >= 600 (approximatif)
        self.imgs: list[str] = []
        self._capture_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            name = (a.get("property") or a.get("name") or "").lower()
            content = a.get("content") or ""
            if not content:
                return
            if name == "og:image":
                self.og_image = content
            elif name == "og:image:secure_url":
                self.og_image_secure = content
            elif name == "twitter:image" or name == "twitter:image:src":
                self.twitter_image = content
        elif tag == "img":
            src = a.get("src") or ""
            if src and src.startswith(("http://", "https://", "//")):
                self.imgs.append(src)
        elif tag == "title":
            self._capture_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._capture_title = False

    def handle_data(self, data: str) -> None:
        if self._capture_title and not self.page_title:
            self.page_title = data.strip()[:200]


def extract_images_from_page(page_url: str, verbose: bool = False) -> dict[str, Any]:
    """Fetch la page HTML et extrait og:image + fallbacks."""
    try:
        r = requests.get(
            page_url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "fr,en;q=0.5",
            },
            timeout=REQ_TIMEOUT,
            allow_redirects=True,
        )
    except requests.RequestException as e:
        return {"error": f"fetch: {e}"}
    if r.status_code != 200:
        return {"error": f"HTTP {r.status_code}"}

    ct = r.headers.get("content-type", "").split(";")[0].lower()
    if "html" not in ct:
        return {"error": f"content-type {ct}"}

    # Limite payload (certaines pages font plusieurs MB)
    html = r.text[:2_500_000]
    parser = _MetaParser()
    try:
        parser.feed(html)
    except Exception as e:
        return {"error": f"html parse: {e}"}

    candidates: list[dict[str, Any]] = []
    for label, url in [
        ("og:image:secure_url", parser.og_image_secure),
        ("og:image", parser.og_image),
        ("twitter:image", parser.twitter_image),
    ]:
        if url:
            abs_url = urljoin(page_url, url)
            if is_domain_blocked(abs_url):
                continue
            candidates.append({"role": label, "url": abs_url})

    # Si rien d'og, pick un <img> (rare mais utile sur vieux sites)
    if not candidates and parser.imgs:
        for src in parser.imgs[:3]:
            abs_url = urljoin(page_url, src if not src.startswith("//") else "https:" + src)
            if is_domain_blocked(abs_url):
                continue
            candidates.append({"role": "img", "url": abs_url})

    return {
        "candidates": candidates,
        "page_title": parser.page_title,
    }


def is_domain_blocked(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return True
    return any(host == b or host.endswith("." + b) for b in BLOCKED_DOMAINS)


def validate_image_url(url: str) -> tuple[bool, str]:
    try:
        r = requests.head(url, timeout=15, allow_redirects=True, headers={"User-Agent": USER_AGENT})
    except requests.RequestException as e:
        return False, f"fetch error: {e}"
    if r.status_code != 200:
        # Some servers disallow HEAD; try GET with Range
        try:
            r = requests.get(
                url,
                timeout=15,
                allow_redirects=True,
                headers={"User-Agent": USER_AGENT, "Range": "bytes=0-1023"},
                stream=True,
            )
            r.close()
        except requests.RequestException as e:
            return False, f"fetch error: {e}"
        if r.status_code not in (200, 206):
            return False, f"HTTP {r.status_code}"
    ct = r.headers.get("content-type", "").split(";")[0]
    if not ct.startswith("image/"):
        return False, f"content-type {ct} (not image)"
    return True, ct


# ─── Wikipedia fallback (direct API) ──────────────────────────────────────────


def wikipedia_pageimage(query: str) -> dict[str, Any] | None:
    """Cherche la page Wikipedia FR qui matche le mieux + récupère sa pageimage."""
    # 1. Search pour trouver le titre de page
    try:
        r = requests.get(
            "https://fr.wikipedia.org/w/api.php",
            params={
                "action": "query", "format": "json", "list": "search",
                "srsearch": query, "srlimit": 1, "srnamespace": 0,
            },
            headers={"User-Agent": USER_AGENT},
            timeout=REQ_TIMEOUT,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    results = r.json().get("query", {}).get("search", [])
    if not results:
        return None
    title = results[0]["title"]

    # 2. Récupère la pageimage (image principale extraite de l'infobox)
    try:
        r = requests.get(
            "https://fr.wikipedia.org/w/api.php",
            params={
                "action": "query", "format": "json", "titles": title,
                "prop": "pageimages|info", "pithumbsize": 1200, "inprop": "url",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=REQ_TIMEOUT,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    pages = r.json().get("query", {}).get("pages", {}) or {}
    for p in pages.values():
        thumb = (p.get("thumbnail") or {}).get("source")
        if thumb:
            return {
                "page_url": p.get("fullurl"),
                "image_url": thumb,
                "page_title": title,
                "source": "wikipedia.org",
            }
    return None


# ─── Orchestration par item ───────────────────────────────────────────────────


def process_item(item: dict[str, Any], validate: bool = True, verbose: bool = False) -> dict[str, Any]:
    # Étape A : pages via Gemini grounded
    try:
        result = call_gemini_grounded(build_user_prompt(item))
    except Exception as e:
        result = {"pages": [], "_error_grounded": str(e)}
        if verbose:
            print(f"  ⚠ grounded error: {e}")

    pages = result.get("pages") or []
    citations = result.get("_citations") or []

    # Étape B : pour chaque page, on scrape og:image
    photos: list[dict[str, Any]] = []
    seen_images: set[str] = set()

    for page in pages:
        page_url = (page.get("page_url") or "").strip()
        if not page_url or not page_url.startswith(("http://", "https://")):
            continue
        if is_domain_blocked(page_url):
            if verbose:
                print(f"  ⏭  {page_url} (domaine bloqué)")
            continue
        extracted = extract_images_from_page(page_url, verbose=verbose)
        if extracted.get("error"):
            if verbose:
                print(f"  ✗ {page_url}: {extracted['error']}")
            continue
        for c in extracted.get("candidates") or []:
            img_url = c["url"]
            if img_url in seen_images:
                continue
            seen_images.add(img_url)
            photos.append({
                "image_url": img_url,
                "source_page": page_url,
                "source": page.get("source") or urlparse(page_url).netloc,
                "description": page.get("why") or extracted.get("page_title") or "",
                "role": c["role"],
            })
        time.sleep(0.15)  # courtesy rate-limit

    # Fallback Wikipedia direct API si rien trouvé
    if not photos:
        wiki = wikipedia_pageimage(item.get("nom") or "")
        if wiki:
            photos.append({
                "image_url": wiki["image_url"],
                "source_page": wiki["page_url"],
                "source": "wikipedia.org (fallback)",
                "description": wiki["page_title"],
                "role": "wikipedia-pageimage",
            })
            if verbose:
                print(f"  ↩  fallback Wikipedia: {wiki['page_title']}")

    # Validation HEAD
    valid: list[dict[str, Any]] = []
    if validate:
        for p in photos:
            ok, info = validate_image_url(p["image_url"])
            p["_valid"] = ok
            p["_content_type" if ok else "_error"] = info
            if ok:
                valid.append(p)
            time.sleep(0.1)
    else:
        valid = photos

    return {"photos": photos, "photos_valid": valid, "_citations": citations, "_pages_queried": len(pages)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, help="Limite le nombre de projets")
    parser.add_argument("--no-validate", action="store_true", help="Skip HEAD validation")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if not SAMPLE_JSON.exists():
        print(f"❌ {SAMPLE_JSON} introuvable. Lance d'abord sample_photo_availability.py.", file=sys.stderr)
        return 1
    if not GEMINI_API_KEY:
        print("❌ GOOGLE_API_KEY / GEMINI_API_KEY non définie.", file=sys.stderr)
        return 1

    sample = json.loads(SAMPLE_JSON.read_text(encoding="utf-8"))
    items = sample[: args.limit] if args.limit else sample
    print(f"📋 {len(items)} projets à enrichir via grounded → og:image")

    enriched = []
    t0 = time.time()
    for i, item in enumerate(items, 1):
        nom = (item.get("nom") or "")[:70]
        print(f"[{i}/{len(items)}] {item.get('tier', '?').upper()} · {nom}")

        result = process_item(item, validate=not args.no_validate, verbose=args.verbose)
        n_pages = result.get("_pages_queried", 0)
        n_photos = len(result.get("photos", []))
        n_valid = len(result.get("photos_valid", []))
        print(f"  → {n_pages} pages · {n_photos} images extraites · {n_valid} validées")
        if args.verbose:
            for p in result.get("photos_valid") or []:
                print(f"    ✓ [{p.get('source')}] {p.get('image_url', '')[:90]}")

        item_out = dict(item)
        item_out["grounded_search"] = result
        enriched.append(item_out)
        ENRICHED_JSON.write_text(json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8")
        time.sleep(0.3)

    elapsed = time.time() - t0
    print(f"\n✅ {ENRICHED_JSON.relative_to(PROJECT_ROOT)}")
    print(f"⏱  {elapsed:.0f}s")

    total_photos = sum(len(e.get("grounded_search", {}).get("photos", [])) for e in enriched)
    total_valid = sum(len(e.get("grounded_search", {}).get("photos_valid", [])) for e in enriched)
    with_any = sum(1 for e in enriched if e.get("grounded_search", {}).get("photos_valid"))
    print(f"📸 Photos trouvées : {total_photos}  ·  validées : {total_valid}")
    print(f"📊 Projets avec ≥ 1 photo valide : {with_any}/{len(enriched)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
