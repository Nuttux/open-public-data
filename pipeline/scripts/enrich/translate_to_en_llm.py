#!/usr/bin/env python3
"""
Traduit FR → EN en batch via Claude API les contenus user-visibles :

- Noms de projets d'investissement (id → str)        → projet_names_en.json
- Vulgarisations projets (3 champs × N projets)      → vulgarization_projets_en.json
- Vulgarisations marchés publics (3 champs × N)      → vulgarization_marches_en.json

Pourquoi ce pipeline existe :

Les fichiers `*_en.json` précédents avaient été générés avec un prompt qui
faisait du token-replace mot-à-mot ("street belliard", "le neighborhood",
"nouvwater") au lieu de traduire en anglais naturel. On les régénère ici avec
un prompt strict et des règles de préservation (proper nouns, codes M57,
montants, dates restent identiques).

Idempotent : on charge l'existant et on ne re-traduit que les entrées
manquantes ou explicitement marquées --force.

Usage :
    ANTHROPIC_API_KEY=sk-... python pipeline/scripts/enrich/translate_to_en_llm.py
    ANTHROPIC_API_KEY=sk-... python pipeline/scripts/enrich/translate_to_en_llm.py --kind names --limit 50
    ANTHROPIC_API_KEY=sk-... python pipeline/scripts/enrich/translate_to_en_llm.py --kind vulgarization-projets
    ANTHROPIC_API_KEY=sk-... python pipeline/scripts/enrich/translate_to_en_llm.py --kind vulgarization-marches
    ANTHROPIC_API_KEY=sk-... python pipeline/scripts/enrich/translate_to_en_llm.py --force            # ignore existing cache

Modèle : claude-haiku-4-5 par défaut (suffisant pour la traduction et bon
rapport qualité/prix). Override via CLAUDE_MODEL=...
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import anthropic

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
INV_DIR = PROJECT_ROOT / "website" / "public" / "data" / "map"
ENRICH_DIR = PROJECT_ROOT / "website" / "public" / "data" / "enrichment"

NAMES_OUT = ENRICH_DIR / "projet_names_en.json"
VULG_PROJ_FR = ENRICH_DIR / "vulgarization_projets.json"
VULG_PROJ_OUT = ENRICH_DIR / "vulgarization_projets_en.json"
VULG_MARCHES_FR = ENRICH_DIR / "vulgarization_marches.json"
VULG_MARCHES_OUT = ENRICH_DIR / "vulgarization_marches_en.json"

MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5")
BATCH_SIZE_NAMES = 30           # noms = courts, on en passe plus
BATCH_SIZE_VULG = 8             # vulgarisations = ~3 champs × 200-400 chars
PROGRESS_INTERVAL = 5
MAX_RETRIES = 3
RETRY_WAIT_429 = 30


# ─── Prompts ─────────────────────────────────────────────────────────────────

NAMES_SYSTEM = """You translate French municipal-budget project titles into clear, concise English.

Strict rules:
- Translate to natural, idiomatic English. Do NOT do word-by-word substitution.
- Preserve proper nouns: street names, neighborhood names, district numbers, building names, school names, monument names. ("Rue Belliard", "Porte de la Chapelle", "Petit Palais", "ZAC Paris Rive Gauche" stay exactly as-is.)
- Drop redundant filler ("etc.", "PHASE1", "TVX") only when it does not change meaning.
- Use British English spelling (rationalise, organisation, programme).
- Preserve original capitalisation style: if input is ALL CAPS, output is ALL CAPS; if Title Case, output is Title Case.
- Numbers, years, amounts, M57 codes (e.g. "EP MUSEES", "SUB EQUIPEMENT") — translate the surrounding words, keep the codes if they are abbreviations of administrative concepts.
- Do not add explanations, parentheticals, or commentary. Only the translation.
- Output is JSON only, no prose."""

NAMES_USER_TEMPLATE = """Translate each French project title to English. Return a JSON object mapping the original ID to the English title.

Input (JSON, id → French title):
{batch_json}

Output JSON only, schema: {{"id1": "English title", "id2": "...", ...}}
Do not wrap in markdown code fences."""


VULG_PROJ_SYSTEM = """You translate French municipal investment-project descriptions into natural English.

Each entry has 3 fields:
- description_claire    : 1 sentence (≤130 chars) — what it is, plainly
- quoi_concretement     : 2-3 sentences (≤320 chars) — concrete scope (renovation / construction / replacement / use / location)
- pourquoi_ca_compte    : 1 sentence (≤140 chars) — impact on residents

Strict rules:
- Translate naturally to British English. Do NOT do word-by-word substitution.
- Preserve proper nouns exactly: street names ("rue Belliard"), district names ("Porte de la Chapelle"), neighbourhood names, monument names, school names, "Ville de Paris", "Conseil de Paris", "Île-de-France".
- Use British English spelling (renovation, neighbourhood, organisation, behaviour).
- Preserve numbers, years, amounts.
- Keep the same number of sentences and roughly the same length per field.
- The arrondissement suffix in French ("18e", "19ᵉ") becomes "18th", "19th" in English (1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st…).
- Do not add explanations or commentary. Only the translation.
- Output is JSON only, no prose, no markdown fences."""

VULG_PROJ_USER_TEMPLATE = """Translate each entry's three text fields. Return a JSON object mapping project id to a dict with keys: description_claire, quoi_concretement, pourquoi_ca_compte.

Input (JSON, id → {{description_claire, quoi_concretement, pourquoi_ca_compte}}):
{batch_json}

Output JSON only, schema: {{"id1": {{"description_claire": "...", "quoi_concretement": "...", "pourquoi_ca_compte": "..."}}, "id2": {{...}}}}"""


VULG_MARCHES_SYSTEM = """You translate French public-procurement contract descriptions into natural English.

Each entry has up to 3 fields:
- description_claire    : 1 sentence — what the contract delivers in plain language
- quoi_concretement     : 2-3 sentences — concrete scope (services / works / supplies, location, duration)
- pourquoi_ca_compte    : 1 sentence — why it matters to residents

Strict rules:
- Translate naturally to British English. Do NOT do word-by-word substitution.
- Preserve proper nouns: street names, district names, monument names, supplier names ("ARCADIS ESG", "EIFFAGE", "RATP"), framework names ("CCAG", "DECP", "M57"), "Ville de Paris", "Conseil de Paris".
- Use British English spelling (organisation, behaviour, programme).
- Preserve numbers, years, amounts, contract numbers.
- Keep the same number of sentences and roughly the same length per field.
- Do not add explanations or commentary. Only the translation.
- Output is JSON only, no prose, no markdown fences."""

VULG_MARCHES_USER_TEMPLATE = """Translate each entry's text fields. Return a JSON object mapping marché number to a dict with the same keys (omit a key if the input has no value for it).

Input (JSON, marché → {{description_claire, quoi_concretement, pourquoi_ca_compte, ...}}):
{batch_json}

Output JSON only."""


# ─── Helpers ─────────────────────────────────────────────────────────────────


def load_json(path: Path) -> Any:
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=False)
    tmp.replace(path)


def call_claude(client: anthropic.Anthropic, system: str, user: str, max_tokens: int = 4096) -> str:
    """Calls Claude with retries on 429/5xx."""
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return resp.content[0].text  # type: ignore[index, union-attr]
        except anthropic.RateLimitError as e:
            last_exc = e
            wait = RETRY_WAIT_429 * (attempt + 1)
            print(f"    rate-limited, waiting {wait}s…", file=sys.stderr)
            time.sleep(wait)
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
            last_exc = e
            wait = 5 * (attempt + 1)
            print(f"    API error ({type(e).__name__}), waiting {wait}s…", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"max retries exceeded: {last_exc}")


def parse_json_strict(raw: str) -> dict:
    raw = raw.strip()
    # strip optional code fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
    return json.loads(raw)


# ─── Stage: project names ────────────────────────────────────────────────────


def collect_project_names() -> dict[str, str]:
    """All distinct (id, FR name) from the investissements_complet_*.json files."""
    out: dict[str, str] = {}
    for f in sorted(glob.glob(str(INV_DIR / "investissements_complet_*.json"))):
        d = load_json(Path(f))
        for p in (d.get("data") or []):
            pid = p.get("id")
            name = (p.get("nom_projet") or "").strip()
            if not pid or not name:
                continue
            if name.lower() in {"projet non nomme", "projet non nommé", "non nomme", "non nommé"}:
                continue
            if pid not in out:
                out[pid] = name
    return out


def translate_names(client: anthropic.Anthropic, force: bool, limit: int | None) -> None:
    fr_map = collect_project_names()
    existing = load_json(NAMES_OUT) or {}

    todo = {k: v for k, v in fr_map.items() if force or k not in existing or _looks_french(existing.get(k, ""))}
    if limit:
        todo = dict(list(todo.items())[:limit])

    print(f"[names] FR={len(fr_map)}  cached={len(existing)}  todo={len(todo)}")
    if not todo:
        print("[names] nothing to do")
        return

    items = list(todo.items())
    written = dict(existing)

    for batch_start in range(0, len(items), BATCH_SIZE_NAMES):
        batch = items[batch_start: batch_start + BATCH_SIZE_NAMES]
        batch_json = json.dumps(dict(batch), ensure_ascii=False)
        prompt = NAMES_USER_TEMPLATE.format(batch_json=batch_json)
        try:
            raw = call_claude(client, NAMES_SYSTEM, prompt, max_tokens=2048)
            translated = parse_json_strict(raw)
        except Exception as e:
            print(f"[names] batch {batch_start} failed: {e}", file=sys.stderr)
            continue

        for k, _ in batch:
            v = translated.get(k)
            if isinstance(v, str) and v.strip():
                written[k] = v.strip()

        if (batch_start // BATCH_SIZE_NAMES) % PROGRESS_INTERVAL == 0:
            save_json(NAMES_OUT, written)
            print(f"[names] flushed at batch {batch_start} ({len(written)} entries)")

    save_json(NAMES_OUT, written)
    print(f"[names] DONE — {len(written)} entries → {NAMES_OUT.relative_to(PROJECT_ROOT)}")


# ─── Stage: vulgarization-projets ────────────────────────────────────────────


VULG_FIELDS = ("description_claire", "quoi_concretement", "pourquoi_ca_compte")


def translate_vulg(
    client: anthropic.Anthropic,
    fr_path: Path,
    out_path: Path,
    system: str,
    user_template: str,
    force: bool,
    limit: int | None,
    label: str,
) -> None:
    fr_data = load_json(fr_path)
    if not fr_data or "items" not in fr_data:
        print(f"[{label}] no FR source at {fr_path}")
        return
    fr_items: dict = fr_data["items"]

    existing = (load_json(out_path) or {})
    existing_items: dict = existing.get("items", {}) if isinstance(existing, dict) else {}

    todo_keys = []
    for k, v in fr_items.items():
        if not force and k in existing_items:
            ev = existing_items[k]
            if isinstance(ev, dict) and any(isinstance(ev.get(f), str) and ev[f] and not _looks_french(ev[f]) for f in VULG_FIELDS):
                continue
        todo_keys.append(k)

    if limit:
        todo_keys = todo_keys[:limit]

    print(f"[{label}] FR={len(fr_items)}  cached={len(existing_items)}  todo={len(todo_keys)}")
    if not todo_keys:
        print(f"[{label}] nothing to do")
        return

    written_items = dict(existing_items)

    for batch_start in range(0, len(todo_keys), BATCH_SIZE_VULG):
        batch_keys = todo_keys[batch_start: batch_start + BATCH_SIZE_VULG]
        batch_dict = {}
        for k in batch_keys:
            v = fr_items[k]
            if not isinstance(v, dict):
                continue
            entry = {f: v[f] for f in VULG_FIELDS if isinstance(v.get(f), str) and v[f]}
            if entry:
                batch_dict[k] = entry

        if not batch_dict:
            continue

        batch_json = json.dumps(batch_dict, ensure_ascii=False)
        prompt = user_template.format(batch_json=batch_json)
        try:
            raw = call_claude(client, system, prompt, max_tokens=4096)
            translated = parse_json_strict(raw)
        except Exception as e:
            print(f"[{label}] batch {batch_start} failed: {e}", file=sys.stderr)
            continue

        for k, en in translated.items():
            if not isinstance(en, dict):
                continue
            written_items[k] = en

        if (batch_start // BATCH_SIZE_VULG) % PROGRESS_INTERVAL == 0:
            save_json(out_path, {
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "model": MODEL,
                "count": len(written_items),
                "items": written_items,
            })
            print(f"[{label}] flushed at batch {batch_start} ({len(written_items)} entries)")

    save_json(out_path, {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": MODEL,
        "count": len(written_items),
        "items": written_items,
    })
    print(f"[{label}] DONE — {len(written_items)} entries → {out_path.relative_to(PROJECT_ROOT)}")


# ─── French-detection (skip junk EN cache) ───────────────────────────────────

_FR_STOPWORDS = {
    "le", "la", "les", "des", "du", "de", "et", "ou", "que", "qui", "dans", "pour",
    "par", "avec", "depuis", "ce", "cette", "ces", "leur", "leurs", "une", "un",
    "aux", "au", "sur",
}
_FR_PATTERNS = ("l'", "d'", "n'", "qu'", "c'", "j'", "s'", "m'", "t'")


def _looks_french(s: str) -> bool:
    if not isinstance(s, str) or len(s) < 8:
        return False
    sl = s.lower()
    if any(p in sl for p in _FR_PATTERNS):
        return True
    words = [w.strip(".,;:!?()[]{}\"'") for w in sl.split()]
    fr_count = sum(1 for w in words if w in _FR_STOPWORDS)
    return fr_count >= 2


# ─── Entry point ─────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--kind",
        choices=["names", "vulgarization-projets", "vulgarization-marches", "all"],
        default="all",
    )
    parser.add_argument("--limit", type=int, default=None, help="cap items per kind (debug)")
    parser.add_argument("--force", action="store_true", help="re-translate already-cached entries")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: set ANTHROPIC_API_KEY", file=sys.stderr)
        return 1

    client = anthropic.Anthropic(api_key=api_key)
    print(f"using model: {MODEL}")

    if args.kind in ("names", "all"):
        translate_names(client, force=args.force, limit=args.limit)
    if args.kind in ("vulgarization-projets", "all"):
        translate_vulg(
            client,
            VULG_PROJ_FR,
            VULG_PROJ_OUT,
            VULG_PROJ_SYSTEM,
            VULG_PROJ_USER_TEMPLATE,
            force=args.force,
            limit=args.limit,
            label="vulg-projets",
        )
    if args.kind in ("vulgarization-marches", "all"):
        translate_vulg(
            client,
            VULG_MARCHES_FR,
            VULG_MARCHES_OUT,
            VULG_MARCHES_SYSTEM,
            VULG_MARCHES_USER_TEMPLATE,
            force=args.force,
            limit=args.limit,
            label="vulg-marches",
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
