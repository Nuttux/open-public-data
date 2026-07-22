#!/usr/bin/env python3
"""
Judge photos LLM — prend le rapport de sample_photo_availability.py,
envoie les candidates (thumbs) à Gemini 3 Flash multimodal et lui
demande de juger :

- quelle photo est la meilleure pour ce projet (ou aucune)
- score de qualité globale 0-10
- recommandation stratégique : photo_dediee / generique_typologique / pictogramme

Objectif : valider la stratégie photo sur un échantillon AVANT de
brancher un pipeline complet. Le script peut ensuite servir pour la
production avec les mêmes critères.

Entrée :
    pipeline/output/sample_photos_report.json (produit par sample_photo_availability.py)

Sortie :
    pipeline/output/judged_photos_report.json   (per-project verdict)
    pipeline/output/judged_photos_report.md     (human-readable)
    pipeline/output/judged_photos_summary.md    (stratégie recommandée, agrégat)

Usage :
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/judge_photos_llm.py
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/judge_photos_llm.py --limit 10
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/judge_photos_llm.py --verbose
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
OUT_DIR = PROJECT_ROOT / "pipeline" / "output"
SAMPLE_JSON = OUT_DIR / "sample_photos_report.json"
ENRICHED_JSON = OUT_DIR / "sample_photos_enriched.json"  # optionnel : après grounded fetch
OUT_JSON = OUT_DIR / "judged_photos_report.json"
OUT_MD = OUT_DIR / "judged_photos_report.md"
SUMMARY_MD = OUT_DIR / "judged_photos_summary.md"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

USER_AGENT = "Qipu-PhotoJudge/0.1 (https://qipu.org; contact@qipu.org)"
REQ_TIMEOUT = 20
MAX_RETRIES = 3
RETRY_WAIT_429 = 30

# Max candidates per project to evaluate — keep low to control payload size & cost
MAX_CANDIDATES = 9
# Gemini responses grow with the number of rejected_reasons. 4096 gives comfortable margin.
MAX_OUTPUT_TOKENS = 4096

SYSTEM_PROMPT = """Tu es un directeur artistique et journaliste data. Tu juges des photos candidates pour illustrer un projet d'investissement public parisien, dans le cadre d'un site éditorial qui vise neutralité, clarté, et cohérence visuelle.

Tu reçois :
- Le contexte du projet (nom, typologie, arrondissement, chapitre)
- N photos candidates avec leur source (Wikimedia / Unsplash / Pexels) et leurs dimensions

Tu dois choisir LA MEILLEURE photo parmi les candidates (ou aucune), et noter la qualité globale du set.

CRITÈRES DE QUALITÉ (par ordre décroissant d'importance) :

1. COHÉRENCE CONTEXTUELLE
   - Idéal : photo du projet lui-même (si trouvé sur Wikimedia)
   - Acceptable : photo d'un équipement du même type (générique mais cohérent)
   - À REJETER : photo hors-sujet (personnes, objets, paysages non liés)

2. QUALITÉ TECHNIQUE
   - Résolution suffisante (>= 800px largeur), format paysage 16:9 ou 3:2 privilégié
   - Photo nette, bien exposée, non floue

3. NEUTRALITÉ ÉDITORIALE
   - PAS de logo d'entreprise, de texte/légende dans l'image, de captures d'écran
   - PAS de visage en gros plan (problème de droit à l'image)
   - PAS de photos promotionnelles marketing (saturation excessive, composition commerciale)

4. COHÉRENCE GLOBALE DU GRID
   - Préférer photos au ton naturel (pas sur-saturées, pas HDR agressif)
   - Éviter mix portrait/paysage (favoriser paysage)
   - Préférer photos prises à distance moyenne (pas macro, pas drone extrême)

SCORE GLOBAL 0-10 :
- 10 : photo dédiée parfaite du projet (Wikimedia match direct)
- 7-9 : photo générique très cohérente (bonne école primaire générique)
- 4-6 : photo acceptable mais imparfaite (légèrement hors-sujet)
- 1-3 : aucune vraiment bonne, toutes à problème
- 0 : rien d'utilisable

RECOMMANDATION STRATÉGIQUE :
- "photo_dediee" : on a trouvé une vraie photo du projet (rare, généralement >= 8/10)
- "generique_typologique" : on prend une bonne photo générique de la typologie (5-8)
- "pictogramme" : aucun candidat utilisable, on fallback sur un pictogramme SVG typologie

Tu réponds UNIQUEMENT en JSON, format :
{
  "best_index": 2 OR null,
  "score": 7,
  "reason": "Photo d'une école primaire générique parisienne, bonne résolution, pas de personnes identifiables.",
  "recommendation": "generique_typologique",
  "rejected_reasons": {"0": "visage en gros plan", "1": "logo visible"}
}

"best_index" est l'INDEX (0-based) de la photo retenue dans la liste fournie. `null` si aucune acceptable.
`rejected_reasons` optionnel — ne liste que les photos explicitement rejetées (pas "best_index").
"""


def fetch_image_base64(url: str) -> tuple[bytes | None, str | None]:
    """Télécharge une image et la retourne en bytes + mime type."""
    try:
        r = requests.get(url, timeout=REQ_TIMEOUT, headers={"User-Agent": USER_AGENT})
    except requests.RequestException as e:
        return None, f"fetch error: {e}"
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}"
    content_type = r.headers.get("content-type", "image/jpeg").split(";")[0]
    if not content_type.startswith("image/"):
        return None, f"bad content-type {content_type}"
    if len(r.content) > 4_000_000:  # 4 MB hard cap per image (Gemini payload hygiene)
        return None, f"image too big ({len(r.content)} bytes)"
    return r.content, content_type


def build_candidates(item: dict[str, Any]) -> list[dict[str, Any]]:
    """Collecte jusqu'à MAX_CANDIDATES candidats.

    Ordre de priorité :
      1. grounded_search (Gemini + Google Search) → photos depuis paris.fr, wiki, presse
      2. Wikimedia (direct puis générique)
      3. Unsplash (générique typologie)
      4. Pexels (générique typologie)
    """
    out: list[dict[str, Any]] = []

    grounded = (item.get("grounded_search") or {}).get("photos_valid") \
        or (item.get("grounded_search") or {}).get("photos") \
        or []
    for r in grounded:
        if r.get("_valid") is False:
            continue
        url = (r.get("image_url") or "").strip()
        if not url:
            continue
        out.append({
            "source": f"Grounded · {r.get('source', 'web')}",
            "url": url,
            "thumb": url,  # pas de thumb pour grounded — on utilisera l'URL directe
            "title": (r.get("description") or "")[:120],
            "license": (r.get("rights_note") or r.get("source") or ""),
            "author": r.get("source") or "",
            "width": None,
            "height": None,
            "source_page": r.get("source_page"),
        })
        if len(out) >= MAX_CANDIDATES:
            return out

    for src_key, src_label in [
        ("wiki_direct", "Wikimedia (direct)"),
        ("wiki_generic", "Wikimedia (fallback)"),
        ("unsplash", "Unsplash"),
        ("pexels", "Pexels"),
    ]:
        for r in item.get(src_key) or []:
            if "error" in r or "skip" in r or not r.get("url"):
                continue
            out.append({
                "source": src_label,
                "url": r.get("url"),
                "thumb": r.get("thumb") or r.get("url"),
                "title": (r.get("title") or "")[:120],
                "license": r.get("license") or "",
                "author": r.get("author") or "",
                "width": r.get("width"),
                "height": r.get("height"),
            })
            if len(out) >= MAX_CANDIDATES:
                return out
    return out


def call_gemini_multimodal(context_text: str, images: list[tuple[bytes, str]]) -> dict[str, Any]:
    """Envoie le contexte + N images à Gemini 3 Flash et parse le verdict."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY / GEMINI_API_KEY non définie")

    parts: list[dict[str, Any]] = [{"text": context_text}]
    for idx, (data, mime) in enumerate(images):
        parts.append({"text": f"\n--- Photo candidate #{idx} ---\n"})
        parts.append({
            "inlineData": {
                "mimeType": mime,
                "data": base64.b64encode(data).decode("ascii"),
            }
        })

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
        },
    }

    for attempt in range(MAX_RETRIES):
        r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload, timeout=120)
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
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Response was truncated mid-string — try to salvage by closing
            # the last valid key/value and the outer object.
            last_comma = max(text.rfind("\","), text.rfind("\",\n"))
            if last_comma > 0:
                salvaged = text[: last_comma + 1] + "\n}"
                try:
                    return json.loads(salvaged)
                except json.JSONDecodeError:
                    pass
            # Last resort: pull just best_index/score/recommendation if visible
            fallback: dict[str, Any] = {}
            m = re.search(r'"best_index"\s*:\s*(\d+|null)', text)
            if m:
                fallback["best_index"] = None if m.group(1) == "null" else int(m.group(1))
            m = re.search(r'"score"\s*:\s*(\d+)', text)
            if m:
                fallback["score"] = int(m.group(1))
            m = re.search(r'"recommendation"\s*:\s*"([^"]+)"', text)
            if m:
                fallback["recommendation"] = m.group(1)
            fallback["reason"] = "(réponse tronquée, salvage partiel)"
            return fallback

    raise RuntimeError("Max retries exceeded")


def fmt_eur(n: float) -> str:
    if n >= 1e9: return f"{n/1e9:.2f} Md€".replace(".", ",")
    if n >= 1e6: return f"{n/1e6:.1f} M€".replace(".", ",")
    if n >= 1e3: return f"{round(n/1e3)} k€"
    return f"{round(n)} €"


def build_context(item: dict[str, Any], candidates: list[dict[str, Any]]) -> str:
    """Prompt utilisateur avec le contexte projet + liste des candidats."""
    lines = [
        "PROJET À ILLUSTRER",
        f"- Nom : {item.get('nom', '')}",
        f"- Typologie devinée : {item.get('typologie_guess', '')}",
        f"- Arrondissement : {item.get('arrondissement', 0)}ᵉ",
        f"- Chapitre : {item.get('chapitre', '')}",
        f"- Montant : {fmt_eur(float(item.get('montant_eur', 0)))}",
        f"- Tier : {item.get('tier', '').upper()}",
        "",
        f"CANDIDATES ({len(candidates)}) — évalue chaque photo jointe dans l'ordre, index 0 à {len(candidates)-1}.",
        "",
    ]
    for i, c in enumerate(candidates):
        lines.append(
            f"#{i} · source: {c['source']} · titre: {c['title']!r} · "
            f"licence: {c['license']} · auteur: {c['author']} · "
            f"taille: {c.get('width', '?')}×{c.get('height', '?')}"
        )
    lines.append("")
    lines.append("Réponds en JSON uniquement comme défini par le system prompt.")
    return "\n".join(lines)


def judge_item(item: dict[str, Any], verbose: bool = False) -> dict[str, Any]:
    """Juge UN projet — fetch les thumbs, appelle Gemini, renvoie le verdict."""
    candidates = build_candidates(item)
    if not candidates:
        return {
            "id": item.get("id"),
            "nom": item.get("nom"),
            "tier": item.get("tier"),
            "candidates_count": 0,
            "best": None,
            "score": 0,
            "reason": "aucune candidate (toutes les sources vides)",
            "recommendation": "pictogramme",
        }

    # Fetch thumbs
    images: list[tuple[bytes, str]] = []
    fetched_candidates: list[dict[str, Any]] = []
    for c in candidates:
        data, err = fetch_image_base64(c["thumb"])
        if data:
            images.append((data, err or "image/jpeg"))
            fetched_candidates.append(c)
        elif verbose:
            print(f"  ⚠ skip {c['source']}: {err}")

    if not images:
        return {
            "id": item.get("id"),
            "nom": item.get("nom"),
            "tier": item.get("tier"),
            "candidates_count": 0,
            "best": None,
            "score": 0,
            "reason": "impossible de fetch aucun thumb",
            "recommendation": "pictogramme",
        }

    context = build_context(item, fetched_candidates)
    try:
        verdict = call_gemini_multimodal(context, images)
    except Exception as e:
        return {
            "id": item.get("id"),
            "nom": item.get("nom"),
            "tier": item.get("tier"),
            "candidates_count": len(fetched_candidates),
            "best": None,
            "score": 0,
            "reason": f"erreur Gemini : {e}",
            "recommendation": "pictogramme",
        }

    best_idx = verdict.get("best_index")
    best = None
    if isinstance(best_idx, int) and 0 <= best_idx < len(fetched_candidates):
        best = {**fetched_candidates[best_idx], "index": best_idx}

    return {
        "id": item.get("id"),
        "nom": item.get("nom"),
        "tier": item.get("tier"),
        "montant_eur": item.get("montant_eur"),
        "arrondissement": item.get("arrondissement"),
        "typologie_guess": item.get("typologie_guess"),
        "candidates_count": len(fetched_candidates),
        "best": best,
        "score": verdict.get("score"),
        "reason": verdict.get("reason"),
        "recommendation": verdict.get("recommendation"),
        "rejected_reasons": verdict.get("rejected_reasons") or {},
    }


def write_md_report(verdicts: list[dict[str, Any]]) -> None:
    total = len(verdicts)
    by_reco: dict[str, int] = {}
    by_tier_score: dict[str, list[int]] = {}
    for v in verdicts:
        reco = v.get("recommendation") or "—"
        by_reco[reco] = by_reco.get(reco, 0) + 1
        tier = v.get("tier") or "?"
        by_tier_score.setdefault(tier, []).append(int(v.get("score") or 0))

    lines = [
        "# Photo judge — verdicts par projet",
        "",
        f"**Total** : {total} projets jugés",
        "",
        "## Agrégat",
        "",
        "Recommandations stratégiques :",
    ]
    for reco, n in sorted(by_reco.items(), key=lambda x: -x[1]):
        pct = 100 * n / total if total else 0
        lines.append(f"- **{reco}** : {n} ({pct:.0f} %)")
    lines.append("")
    lines.append("Score moyen par tier :")
    for tier in ["xxl", "xl", "l", "m", "s"]:
        scores = by_tier_score.get(tier, [])
        if scores:
            avg = sum(scores) / len(scores)
            lines.append(f"- **{tier.upper()}** ({len(scores)} projets) : score moyen {avg:.1f}/10")
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, v in enumerate(verdicts, 1):
        score = v.get("score", 0)
        icon = "🟢" if score >= 7 else "🟡" if score >= 4 else "🔴"
        lines.append(f"## {i}. {icon} [{(v.get('tier') or '?').upper()}] {v.get('nom')}")
        lines.append("")
        lines.append(f"- **Montant** : {fmt_eur(float(v.get('montant_eur') or 0))}  ·  **Arr.** : {v.get('arrondissement')}ᵉ  ·  **Typologie** : `{v.get('typologie_guess')}`")
        lines.append(f"- **Candidats évalués** : {v.get('candidates_count', 0)}")
        lines.append(f"- **Score** : {score}/10")
        lines.append(f"- **Recommandation** : `{v.get('recommendation') or '—'}`")
        lines.append(f"- **Raison** : {v.get('reason') or '—'}")
        best = v.get("best")
        if best:
            lines.append(f"- **Choix** : [#{best.get('index')} · {best.get('source')}]({best.get('url')})")
            thumb = best.get("thumb")
            if thumb:
                lines.append(f"  ![best]({thumb})")
            lines.append(f"  crédit : {best.get('author') or '—'} · licence : {best.get('license') or '—'}")
        rejected = v.get("rejected_reasons") or {}
        if rejected:
            lines.append("- **Rejets** :")
            for idx, reason in rejected.items():
                lines.append(f"  - #{idx} : {reason}")
        lines.append("")
        lines.append("---")
        lines.append("")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")


def write_strategy_summary(verdicts: list[dict[str, Any]]) -> None:
    """Rapport agrégé stratégique — pour prendre la décision de branchement."""
    total = len(verdicts)
    by_tier: dict[str, dict[str, Any]] = {}
    for v in verdicts:
        tier = v.get("tier") or "?"
        agg = by_tier.setdefault(tier, {"count": 0, "scores": [], "recos": {}})
        agg["count"] += 1
        agg["scores"].append(int(v.get("score") or 0))
        reco = v.get("recommendation") or "—"
        agg["recos"][reco] = agg["recos"].get(reco, 0) + 1

    lines = [
        "# Stratégie photo recommandée — synthèse",
        "",
        f"Basé sur {total} projets jugés par Gemini 3 Flash multimodal.",
        "",
        "## Par tier de montant",
        "",
        "| Tier | N | Score moyen | Photo dédiée | Générique | Pictogramme |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for tier in ["xxl", "xl", "l", "m", "s"]:
        agg = by_tier.get(tier)
        if not agg:
            continue
        scores = agg["scores"]
        avg = sum(scores) / len(scores) if scores else 0
        dediee = agg["recos"].get("photo_dediee", 0)
        generic = agg["recos"].get("generique_typologique", 0)
        pictogramme = agg["recos"].get("pictogramme", 0)
        lines.append(
            f"| **{tier.upper()}** | {agg['count']} | {avg:.1f}/10 | "
            f"{dediee} | {generic} | {pictogramme} |"
        )
    lines.append("")
    lines.append("## Interprétation")
    lines.append("")
    lines.append("- **photo_dediee** élevée dans XXL/XL → stratégie hybride justifiée : Wikimedia d'abord, générique ensuite.")
    lines.append("- **pictogramme** élevée dans M/S → au-delà d'un certain seuil de petitesse, ne pas chercher de photo du tout.")
    lines.append("- **Score moyen < 5** sur un tier → majorité de photos moyennes, pictogramme plus crédible.")
    lines.append("")
    lines.append("## Prochaine étape")
    lines.append("")
    lines.append("Si la répartition confirme notre pari (XXL/XL → photo dédiée OK, M/S → pictogramme), on")
    lines.append("branche le pipeline full avec un seuil sur le montant (ex. ≥ 1 M€ on cherche photo,")
    lines.append("< 1 M€ on envoie direct pictogramme).")
    SUMMARY_MD.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Juge les photos candidates via Gemini 3 Flash multimodal")
    parser.add_argument("--limit", type=int, help="Limite le nombre de projets jugés")
    parser.add_argument("--verbose", action="store_true", help="Log chaque fetch/call")
    parser.add_argument("--dry-run", action="store_true", help="Simule sans appeler Gemini (skip si pas de clé)")
    parser.add_argument("--source", choices=["sample", "enriched"], default="auto",
                        help="Fichier d'entrée : 'sample' (APIs seules) ou 'enriched' (avec grounded Gemini). "
                             "Défaut: auto — prend enriched s'il existe, sinon sample.")
    args = parser.parse_args()

    if args.source == "enriched" or (args.source == "auto" and ENRICHED_JSON.exists()):
        src = ENRICHED_JSON
    else:
        src = SAMPLE_JSON

    if not src.exists():
        print(f"❌ {src} introuvable.", file=sys.stderr)
        return 1
    print(f"📥 Source : {src.name}")

    if not GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY / GEMINI_API_KEY non définie. Exporte-la ou utilise --dry-run.", file=sys.stderr)
        return 1

    sample = json.loads(src.read_text(encoding="utf-8"))
    items = sample[: args.limit] if args.limit else sample

    verdicts: list[dict[str, Any]] = []
    t0 = time.time()
    for i, item in enumerate(items, 1):
        nom = (item.get("nom") or "")[:70]
        print(f"[{i}/{len(items)}] {item.get('tier', '?').upper()} · {nom}")
        if args.dry_run:
            verdicts.append({
                "id": item.get("id"),
                "nom": item.get("nom"),
                "tier": item.get("tier"),
                "montant_eur": item.get("montant_eur"),
                "arrondissement": item.get("arrondissement"),
                "typologie_guess": item.get("typologie_guess"),
                "candidates_count": len(build_candidates(item)),
                "best": None,
                "score": 5,
                "reason": "(dry-run)",
                "recommendation": "generique_typologique",
            })
        else:
            v = judge_item(item, verbose=args.verbose)
            verdicts.append(v)
            score = v.get("score", 0)
            reco = v.get("recommendation") or "—"
            print(f"  → score {score}/10 · {reco}")

    OUT_JSON.write_text(json.dumps(verdicts, ensure_ascii=False, indent=2), encoding="utf-8")
    write_md_report(verdicts)
    write_strategy_summary(verdicts)

    elapsed = time.time() - t0
    print(f"\n✅ Verdicts : {OUT_JSON.relative_to(PROJECT_ROOT)}")
    print(f"✅ Rapport détaillé : {OUT_MD.relative_to(PROJECT_ROOT)}")
    print(f"✅ Stratégie : {SUMMARY_MD.relative_to(PROJECT_ROOT)}")
    print(f"⏱  {elapsed:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
