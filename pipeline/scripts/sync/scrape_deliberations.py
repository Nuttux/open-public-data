#!/usr/bin/env python3
"""
Scrape Paris Conseil de Paris deliberations — extract subvention articles.

Bridges the gap between the opendata.paris.fr "Subventions accordées"
consolidated dataset (last year = 2024) and the current fiscal year by
parsing individual deliberations voted at the Conseil de Paris.

Pipeline:
    1. Enumerate session IDs in a range (defaults to recent sessions).
    2. For each session, fetch the per-direction page listing deliberations.
    3. Filter titles containing "Subvention" (case-insensitive).
    4. Download each PDF to a local cache.
    5. Parse articles with pypdf + article-level regex.
    6. Emit a JSON per session with one record per article:
         { delib_id, direction, session_date, article_num,
           beneficiary, siret, amount_eur, motif, address }

Usage:
    # 2025 sessions discovery + parse (start with one)
    python scrape_deliberations.py --session 145

    # All 2025 sessions (auto-range)
    python scrape_deliberations.py --year 2025

    # Dry run — discover links, skip download
    python scrape_deliberations.py --session 145 --dry-run

Output:
    website/public/data/subventions_delibs/<session_id>.json
    pipeline/cache/delibs/pdf/<id_entite>.pdf
    pipeline/cache/delibs/html/session_<id>_dir_<did>.html
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

import pypdf
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[3]
PIPELINE = ROOT / "pipeline"
CACHE = PIPELINE / "cache" / "delibs"
PDF_CACHE = CACHE / "pdf"
HTML_CACHE = CACHE / "html"
OUT = ROOT / "website" / "public" / "data" / "subventions_delibs"

BASE = "https://a06-v7.apps.paris.fr/a06/"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "FranceOpenData-Scraper/0.1 (+contact@franceopendata.org)"})


# ─────────────────────────────────────────────────────────────────────────
# HTML index — discover delibs per session+direction
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class DelibLink:
    delib_id: str        # "2025 DAC 399"
    id_entite: int
    title: str
    direction_id: int
    direction_name: str
    session_id: int


def fetch_html(url: str, cache_path: Path) -> str:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    resp = SESSION.get(url, timeout=30)
    resp.raise_for_status()
    cache_path.write_text(resp.text, encoding="utf-8")
    return resp.text


def list_directions(session_id: int) -> list[tuple[int, str]]:
    url = f"{BASE}jsp/site/Portal.jsp?page=odjcp.synthese_directions&id_seance={session_id}"
    html = fetch_html(url, HTML_CACHE / f"session_{session_id}_directions.html")
    soup = BeautifulSoup(html, "html.parser")
    out: list[tuple[int, str]] = []
    for a in soup.select("a[href*='id_direction=']"):
        href = a.get("href", "")
        m = re.search(r"id_direction=(\d+)", href)
        if not m:
            continue
        out.append((int(m.group(1)), a.get_text(strip=True)))
    # Deduplicate, preserve order
    seen: set[int] = set()
    uniq: list[tuple[int, str]] = []
    for did, name in out:
        if did in seen:
            continue
        seen.add(did)
        uniq.append((did, name))
    return uniq


def list_delibs(session_id: int, direction_id: int, direction_name: str) -> list[DelibLink]:
    url = f"{BASE}jsp/site/Portal.jsp?page=odjcp.detail_direction&id_seance={session_id}&id_direction={direction_id}"
    html = fetch_html(url, HTML_CACHE / f"session_{session_id}_dir_{direction_id}.html")
    soup = BeautifulSoup(html, "html.parser")
    out: list[DelibLink] = []
    for a in soup.select("a[href*='DoDownload.jsp'][href*='id_type_entite=6']"):
        href = a.get("href", "")
        m = re.search(r"id_entite=(\d+)", href)
        if not m:
            continue
        id_entite = int(m.group(1))
        delib_id = a.get_text(strip=True)
        # Title is the text after the link in the same <p> or sibling.
        # Walk up, grab the paragraph text, strip the link text.
        parent = a.find_parent(["p", "li", "div"])
        raw = parent.get_text(" ", strip=True) if parent else ""
        title = raw.replace(delib_id, "", 1).lstrip(" :—-").strip()
        out.append(DelibLink(
            delib_id=delib_id,
            id_entite=id_entite,
            title=title,
            direction_id=direction_id,
            direction_name=direction_name,
            session_id=session_id,
        ))
    return out


def keep_subvention(link: DelibLink) -> bool:
    t = link.title.lower()
    return "subvention" in t or "financement" in t or "subventionnement" in t


# ─────────────────────────────────────────────────────────────────────────
# PDF download + parse
# ─────────────────────────────────────────────────────────────────────────

def download_pdf(id_entite: int) -> Path:
    path = PDF_CACHE / f"{id_entite}.pdf"
    if path.exists() and path.stat().st_size > 0:
        return path
    url = f"{BASE}jsp/site/plugins/odjcp/DoDownload.jsp?id_entite={id_entite}&id_type_entite=6"
    PDF_CACHE.mkdir(parents=True, exist_ok=True)
    resp = SESSION.get(url, timeout=60)
    resp.raise_for_status()
    path.write_bytes(resp.content)
    return path


def extract_text(pdf_path: Path) -> str:
    try:
        reader = pypdf.PdfReader(str(pdf_path))
    except Exception as e:  # noqa: BLE001
        print(f"  pypdf error on {pdf_path.name}: {e}", file=sys.stderr)
        return ""
    chunks: list[str] = []
    for page in reader.pages:
        try:
            chunks.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001
            chunks.append("")
    return "\n".join(chunks)


# ─────────────────────────────────────────────────────────────────────────
# Article extraction — regex per format
# ─────────────────────────────────────────────────────────────────────────

# Amounts embed spaces-as-thousands in the PDF text stream (normalise).
SPACE_DIGITS_RE = re.compile(r"(?<=\d)\s+(?=\d)")
AMOUNT_RE = re.compile(r"(\d[\d ]{0,12}(?:,\d{1,2})?)\s*euros?", re.IGNORECASE)
SIRET_RE = re.compile(r"(?:N°\s*SIRET|SIRET)\s*[:\-]?\s*(\d{14})", re.IGNORECASE)
ARTICLE_RE = re.compile(r"\bArticle\s+(\d+)\b\s*[:\-]", re.IGNORECASE)

# Beneficiary extraction runs a cascade of patterns on flattened text and
# returns the first that matches. Order matters: most specific first.
BEN_PATTERNS = [
    # "est attribuée à l'association <NAME>" / "à la société <NAME>" / ...
    re.compile(
        r"attribu[ée]e?\s+(?:à|au|aux)\s+(?:l[’']\s*(?:association|entreprise|établissement|organisme|EHPAD)\s+|la\s+(?:société|fondation|coopérative|mutuelle|régie)\s+|le\s+(?:groupement|comité|centre|syndicat|collectif)\s+)?([A-ZÀ-Ÿ][A-Za-zÀ-Ÿ0-9&'’,\-\s]{2,140}?)(?=\s*,|\s+dont\s+|\s+pour\s+|\s+sise?\s+|\s+situ[ée]|\s+\(|\s+SIRET|\s+N°|\s+afin)",
        re.IGNORECASE,
    ),
    # "subvention de X euros à <NAME>"  (short form)
    re.compile(
        r"subvention[^.]{0,80}\s+à\s+(?:l[’']\s*(?:association|entreprise|établissement|organisme|EHPAD)\s+|la\s+(?:société|fondation|coopérative|mutuelle|régie)\s+|le\s+(?:groupement|comité|centre|syndicat|collectif)\s+)?([A-ZÀ-Ÿ][A-Za-zÀ-Ÿ0-9&'’,\-\s]{2,120}?)(?=\s*,|\s+dont\s+|\s+pour\s+|\s+sise?\s+|\s+situ[ée]|\s+\(|\s+SIRET|\s+N°|\s+afin|\.)",
        re.IGNORECASE,
    ),
    # Bare "à l'association X" early in the article.
    re.compile(
        r"à\s+(?:l[’']\s*(?:association|entreprise|établissement|organisme|EHPAD)\s+|la\s+(?:société|fondation|coopérative|mutuelle|régie)\s+|le\s+(?:groupement|comité|centre|syndicat|collectif)\s+)([A-ZÀ-Ÿ][A-Za-zÀ-Ÿ0-9&'’,\-\s]{2,120}?)(?=\s*,|\s+dont\s+|\s+pour\s+|\s+sise?\s+|\s+situ[ée]|\s+\(|\s+SIRET|\s+N°|\.)",
        re.IGNORECASE,
    ),
]

DOSSIER_RE = re.compile(r"(?:Dossier|N°\s*Paris\s+Asso|N°\s*dossier)\s*[:\-]?\s*(\d{4,})", re.IGNORECASE)


@dataclass
class Article:
    delib_id: str
    direction_id: int
    direction_name: str
    session_id: int
    article_num: int | None
    beneficiary: str | None
    siret: str | None
    amount_eur: float | None
    amount_raw: str | None
    motif: str | None
    dossier: str | None


def parse_amount(raw: str) -> float | None:
    cleaned = SPACE_DIGITS_RE.sub("", raw).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _flatten(text: str) -> str:
    """Normalise whitespace — PDF extraction often breaks mid-sentence.
    Collapse runs of whitespace (including newlines) to single spaces so
    beneficiary/motif regexes can span the original line breaks."""
    return re.sub(r"\s+", " ", text)


def extract_articles(text: str, link: DelibLink) -> list[Article]:
    # Normalise intra-number spaces produced by PDF extraction.
    norm = SPACE_DIGITS_RE.sub("", text)
    # Split on "Article N :" boundaries — first segment is the preamble (title).
    parts = ARTICLE_RE.split(text)
    articles: list[Article] = []
    # parts pattern: [preamble, art_num_1, body_1, art_num_2, body_2, ...]
    if len(parts) < 3:
        # Single-article delib or text lacking "Article N". Fall back:
        # treat the whole body as one article.
        articles.append(_parse_body(text, link, None))
        return articles

    # Iterate pairs (article_num, body) after the preamble.
    it = iter(parts[1:])
    for art_num_str, body in zip(it, it):
        try:
            art_num = int(art_num_str)
        except ValueError:
            art_num = None
        articles.append(_parse_body(body, link, art_num))
    return articles


def _parse_body(body: str, link: DelibLink, article_num: int | None) -> Article:
    flat = _flatten(body)  # collapse line breaks from PDF extraction
    # Siret
    siret_m = SIRET_RE.search(flat)
    siret = siret_m.group(1) if siret_m else None
    # Amount — take the first occurrence (usually the subvention itself).
    amount_m = AMOUNT_RE.search(flat)
    amount_raw = amount_m.group(1).strip() if amount_m else None
    amount_eur = parse_amount(amount_m.group(1)) if amount_m else None
    # Beneficiary — cascade of patterns
    beneficiary: str | None = None
    for pat in BEN_PATTERNS:
        m = pat.search(flat)
        if m:
            cand = m.group(1).strip(" .,;")
            # Filter out obvious junk (all lowercase, too many words, common verbs)
            if 2 <= len(cand.split()) <= 12 and not cand.lower().startswith(("et ", "ou ", "pour ", "afin ")):
                beneficiary = cand
                break
    # Dossier
    doss_m = DOSSIER_RE.search(flat)
    dossier = doss_m.group(1) if doss_m else None
    # Motif — first sentence after "pour" up to the first period.
    motif = None
    motif_m = re.search(r"\bpour\s+([^.]{10,280})", flat, re.IGNORECASE)
    if motif_m:
        motif = motif_m.group(1).strip(" .,;")

    return Article(
        delib_id=link.delib_id,
        direction_id=link.direction_id,
        direction_name=link.direction_name,
        session_id=link.session_id,
        article_num=article_num,
        beneficiary=beneficiary,
        siret=siret,
        amount_eur=amount_eur,
        amount_raw=amount_raw,
        motif=motif,
        dossier=dossier,
    )


# ─────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────

def process_session(session_id: int, dry_run: bool = False) -> dict:
    print(f"== Session {session_id} ==")
    dirs = list_directions(session_id)
    print(f"  {len(dirs)} directions discovered")
    all_links: list[DelibLink] = []
    for did, dname in dirs:
        links = list_delibs(session_id, did, dname)
        subv = [l for l in links if keep_subvention(l)]
        if subv:
            print(f"  [{dname[:60]:<60}] total {len(links):3d}, subv {len(subv):3d}")
        all_links.extend(subv)
    print(f"  total subvention delibs: {len(all_links)}")

    articles: list[Article] = []
    if not dry_run:
        for i, link in enumerate(all_links, 1):
            try:
                pdf_path = download_pdf(link.id_entite)
                text = extract_text(pdf_path)
                arts = extract_articles(text, link)
                articles.extend(arts)
                print(f"  [{i:3d}/{len(all_links)}] {link.delib_id:<20} {len(arts):3d} arts  ({link.title[:60]})")
                time.sleep(0.15)  # politeness
            except requests.HTTPError as e:
                print(f"  [{i:3d}/{len(all_links)}] {link.delib_id} HTTP {e.response.status_code} — skipped")
            except Exception as e:  # noqa: BLE001
                print(f"  [{i:3d}/{len(all_links)}] {link.delib_id} error: {e}")

    payload = {
        "session_id": session_id,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "Conseil de Paris — ordre du jour + projets de délibérations",
        "nb_delibs": len(all_links),
        "nb_articles": len(articles),
        "delibs": [asdict(l) for l in all_links],
        "articles": [asdict(a) for a in articles],
    }
    if not dry_run:
        OUT.mkdir(parents=True, exist_ok=True)
        outfile = OUT / f"session_{session_id}.json"
        outfile.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  → {outfile.relative_to(ROOT)}  ({len(articles)} articles)")
    return payload


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", type=int, action="append", help="Explicit session id (repeatable).")
    ap.add_argument("--session-range", type=str, help="Range like 145-159.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    sessions: list[int] = []
    if args.session:
        sessions.extend(args.session)
    if args.session_range:
        lo, hi = [int(x) for x in args.session_range.split("-")]
        sessions.extend(range(lo, hi + 1))
    if not sessions:
        print("Pass --session N or --session-range LO-HI", file=sys.stderr)
        sys.exit(2)

    for sid in sessions:
        process_session(sid, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
