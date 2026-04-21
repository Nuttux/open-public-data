#!/usr/bin/env python3
"""
Fill the gaps left by the regex-based deliberation scraper using Gemini.

For each article in `session_<id>.json` that is missing either the
beneficiary or the amount, pull the corresponding article body from the
cached PDF and ask Gemini 3 Flash to return a structured record:

    { article_num, beneficiary, amount_eur, siret, motif, dossier }

Articles that already have both beneficiary and amount from the regex
pass are left alone (fast path). The output is written back in-place.

Usage:
    GOOGLE_API_KEY=xxx python enrich_deliberations_llm.py --session 152
    GOOGLE_API_KEY=xxx python enrich_deliberations_llm.py --session 152 --dry-run

Cost estimate: ~500-700 gap articles per session × ~800 input tokens each
= ~400k input tokens / session on Gemini 3 Flash ≈ USD 0.05-0.10.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import pypdf
import requests

ROOT = Path(__file__).resolve().parents[3]
DELIBS_DIR = ROOT / "website" / "public" / "data" / "subventions_delibs"
PDF_CACHE = ROOT / "pipeline" / "cache" / "delibs" / "pdf"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

MAX_RETRIES = 3
RETRY_WAIT_429 = 8
BATCH_SIZE = 8  # articles per LLM call

# Same dekern + article splitter as the scraper — duplicated here to avoid
# cross-package imports (the scraper lives under pipeline/scripts/sync).

_ARTICLE_RE = re.compile(r"\bArticle\s+(\d+)\b\s*[:\-]", re.IGNORECASE)


def _dekern(text: str) -> str:
    s = text.replace("\u00a0", " ").replace("\n", "  ")
    s = re.sub(r"[ \t]{2,}", "\x01", s)
    s = s.replace(" ", "")
    return s.replace("\x01", " ")


def extract_article_body(pdf_path: Path, article_num: int | None) -> str | None:
    """Pull the text of a given article number from a cached PDF. Returns
    None if the article boundary can't be resolved."""
    try:
        reader = pypdf.PdfReader(str(pdf_path))
    except Exception:  # noqa: BLE001
        return None
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    dek = _dekern(text)
    parts = _ARTICLE_RE.split(dek)
    if len(parts) < 3:
        # No clear article split → return the whole body (single-article delib).
        return dek[:3000] if article_num is None else None

    it = iter(parts[1:])
    for art_num_str, body in zip(it, it):
        try:
            n = int(art_num_str)
        except ValueError:
            continue
        if article_num is not None and n == article_num:
            return body.strip()[:3000]
    # If we didn't find the requested article, return whole text trimmed.
    return None


SYSTEM_PROMPT = """Tu es un assistant d'extraction de données pour des délibérations du Conseil de Paris.

Chaque article d'une délibération attribue une subvention. Pour chaque entrée reçue, retourne un JSON strict contenant :
- "article_num": le numéro d'article (copie-le depuis l'entrée)
- "beneficiary": nom de l'organisation bénéficiaire (association, société, fondation, régie…). Si l'article n'attribue pas de subvention à une organisation (p. ex. article d'autorisation de signature, article budgétaire générique), retourne null.
- "amount_eur": montant de la subvention en euros (nombre). Pour "30 000 € en fonctionnement et 5 000 € en investissement", additionne et retourne 35000. Retourne null si l'article ne fixe pas de montant.
- "siret": numéro SIRET à 14 chiffres si présent dans le texte, sinon null.
- "motif": en une phrase (max 200 caractères), l'objet/projet de la subvention. null si absent.
- "dossier": référence Paris Asso, SIMPA, ou dossier interne (nombres/lettres). null si absent.

Réponds UNIQUEMENT avec un JSON array d'objets, dans le même ordre que les entrées reçues. Pas de prose, pas de markdown."""


def call_gemini(prompt: str) -> list[dict]:
    if not GEMINI_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY / GEMINI_API_KEY non définie")
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "maxOutputTokens": 4096,
        },
    }
    for attempt in range(MAX_RETRIES):
        r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload, timeout=60)
        if r.status_code == 429:
            wait = RETRY_WAIT_429 * (attempt + 1)
            print(f"  ⚠ rate-limit, pause {wait}s")
            time.sleep(wait)
            continue
        if r.status_code != 200:
            raise RuntimeError(f"Gemini HTTP {r.status_code}: {r.text[:200]}")
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(text)
    raise RuntimeError("Max retries exceeded")


def format_batch(batch: list[tuple[int, dict, str]]) -> str:
    """batch items: (index_in_session, article_meta, article_body_text)"""
    lines = ["Articles à extraire (un par entrée) :", ""]
    for idx, meta, body in batch:
        an = meta.get("article_num")
        hint = f"article_num={an!r}, delib={meta['delib_id']!r}"
        lines.append(f"--- #{idx} ({hint}) ---")
        lines.append(body)
        lines.append("")
    return "\n".join(lines)


def process_session(session_id: int, dry_run: bool = False) -> None:
    path = DELIBS_DIR / f"session_{session_id}.json"
    if not path.exists():
        print(f"No file for session {session_id}", file=sys.stderr)
        return
    with path.open(encoding="utf-8") as f:
        data = json.load(f)

    articles: list[dict] = data["articles"]
    delibs_by_id = {d["delib_id"]: d for d in data["delibs"]}

    # Articles needing LLM help: missing benef or amount.
    gap_idxs = [
        i for i, a in enumerate(articles)
        if not a.get("beneficiary") or not a.get("amount_eur")
    ]
    print(f"Session {session_id}: {len(articles)} articles, {len(gap_idxs)} gaps")

    if dry_run:
        print("Dry-run — no LLM calls.")
        return

    # Group by delib so we only open each PDF once.
    by_delib: dict[str, list[int]] = {}
    for i in gap_idxs:
        by_delib.setdefault(articles[i]["delib_id"], []).append(i)

    pending: list[tuple[int, dict, str]] = []
    skipped = 0
    for delib_id, idxs in by_delib.items():
        link = delibs_by_id.get(delib_id)
        if not link:
            skipped += len(idxs)
            continue
        pdf_path = PDF_CACHE / f"{link['id_entite']}.pdf"
        if not pdf_path.exists():
            skipped += len(idxs)
            continue
        for i in idxs:
            art = articles[i]
            body = extract_article_body(pdf_path, art.get("article_num"))
            if not body:
                skipped += 1
                continue
            pending.append((i, art, body))

    print(f"  pending LLM: {len(pending)}, skipped (no body found): {skipped}")

    filled = 0
    for start in range(0, len(pending), BATCH_SIZE):
        batch = pending[start : start + BATCH_SIZE]
        try:
            results = call_gemini(format_batch(batch))
        except Exception as e:  # noqa: BLE001
            print(f"  batch {start} LLM error: {e}")
            time.sleep(2)
            continue
        for (idx, _meta, _body), res in zip(batch, results):
            art = articles[idx]
            if not art.get("beneficiary") and res.get("beneficiary"):
                art["beneficiary"] = res["beneficiary"]
                art["beneficiary_source"] = "llm"
                filled += 1
            if not art.get("amount_eur") and res.get("amount_eur") not in (None, ""):
                try:
                    art["amount_eur"] = float(res["amount_eur"])
                    art["amount_source"] = "llm"
                    filled += 1
                except (TypeError, ValueError):
                    pass
            if not art.get("siret") and res.get("siret"):
                siret = re.sub(r"\D", "", str(res["siret"]))
                if len(siret) == 14:
                    art["siret"] = siret
                    art["siret_source"] = "llm"
            if not art.get("motif") and res.get("motif"):
                art["motif"] = res["motif"][:280]
            if not art.get("dossier") and res.get("dossier"):
                art["dossier"] = str(res["dossier"])
        print(f"  batch {start // BATCH_SIZE + 1}/{(len(pending) + BATCH_SIZE - 1) // BATCH_SIZE} filled {filled}")
        time.sleep(0.3)

    data["articles"] = articles
    data["llm_enriched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    data["llm_model"] = GEMINI_MODEL
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    # Re-count
    wb = sum(1 for a in articles if a.get("beneficiary"))
    wa = sum(1 for a in articles if a.get("amount_eur"))
    ws = sum(1 for a in articles if a.get("siret"))
    print(f"\n  → benef {wb}/{len(articles)}  amount {wa}/{len(articles)}  SIRET {ws}/{len(articles)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", type=int, action="append", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    for sid in args.session:
        process_session(sid, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
