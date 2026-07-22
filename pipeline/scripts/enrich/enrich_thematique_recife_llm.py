#!/usr/bin/env python3
"""
Thematic classification (Recife) — assign each CNPJ recipient a citizen theme,
in Portuguese. Adapted from enrich_thematique_llm.py.

This is the DOCUMENTED OPTION for the ambiguous tail. The PRIMARY theme path is
deterministic and grounded: seed_mapping_tema_recife.csv (CNAE-section →
tema, paying-agency regex → tema), joined in dbt. Run this LLM pass only to
resolve recipients the deterministic cascade leaves as 'Outros'.

Themes (pt, grounded in Recife's secretariat structure):
  Saúde e assistência · Educação · Infraestrutura e obras · Infraestrutura urbana ·
  Transporte e mobilidade · Cultura, esporte e lazer · Meio ambiente ·
  Segurança urbana · Gestão pública · Serviços financeiros · Desenvolvimento
  econômico · Comércio e suprimentos · Sociedade civil · Outros

Provider: gemini-3-flash-preview default; --provider claude (claude-sonnet-5)
for keyless-Gemini environments. Cache keyed by cnpj →
`pipeline/cache/enrichment/recife_tematica.json`, loaded into
`raw.br_recife_enrich_tema` (additive dbt join, raw untouched).

Usage:
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/enrich_thematique_recife_llm.py --limit 100
    ANTHROPIC_API_KEY=xxx python pipeline/scripts/enrich/enrich_thematique_recife_llm.py --provider claude --limit 100
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "br" / "recife"
CNPJ_CACHE = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "recife_cnpj.json"
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "recife_tematica.json"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")

TEMAS = [
    "Saúde e assistência", "Educação", "Infraestrutura e obras", "Infraestrutura urbana",
    "Transporte e mobilidade", "Cultura, esporte e lazer", "Meio ambiente",
    "Segurança urbana", "Gestão pública", "Serviços financeiros",
    "Desenvolvimento econômico", "Comércio e suprimentos", "Sociedade civil", "Outros",
]
BATCH_SIZE = 12
MAX_RETRIES = 3
PROJECT_ID = "open-data-france-484717"
BQ_TABLE = "raw.br_recife_enrich_tema"

SYSTEM_PROMPT = f"""Você classifica organizações pagas pela Prefeitura do Recife em UM tema de política pública.

Temas permitidos (use exatamente um destes rótulos):
{json.dumps(TEMAS, ensure_ascii=False)}

REGRAS:
1. Baseie-se no nome, CNAE e órgão pagador fornecidos. Não invente.
2. Bancos e instituições financeiras → "Serviços financeiros".
3. Hospitais, clínicas, entidades de saúde/assistência → "Saúde e assistência".
4. Construtoras, engenharia, obras → "Infraestrutura e obras".
5. Se realmente não der para classificar, use "Outros".
6. Responda APENAS em JSON: [{{"cnpj":"...","tema":"...","confianca":0.0-1.0}}, ...]
"""


def build_prompt(batch: list[dict[str, Any]]) -> str:
    lines = ["Organizações a classificar:", ""]
    for b in batch:
        lines.append(f"- cnpj={b['cnpj']} · nome={b['nome']!r} · cnae={b.get('cnae') or '—'} · orgao={b.get('orgao') or '—'}")
    return "\n".join(lines)


def _parse(text: str) -> list[dict[str, Any]]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        last = max(text.rfind("},"), text.rfind("}"))
        return json.loads(text[: last + 1].rstrip(",") + "]") if last > 0 else []


def call_gemini(p: str) -> list[dict]:
    payload = {"systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
               "contents": [{"role": "user", "parts": [{"text": p}]}],
               "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json", "maxOutputTokens": 8192}}
    for a in range(MAX_RETRIES):
        r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload, timeout=60)
        if r.status_code == 429:
            time.sleep(30 * (a + 1)); continue
        if r.status_code != 200:
            raise RuntimeError(f"Gemini {r.status_code}: {r.text[:200]}")
        return _parse(r.json()["candidates"][0]["content"]["parts"][0]["text"])
    raise RuntimeError("retries")


def call_claude(p: str) -> list[dict]:
    h = {"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    payload = {"model": CLAUDE_MODEL, "max_tokens": 4096, "system": SYSTEM_PROMPT,
               "messages": [{"role": "user", "content": p}]}
    for a in range(MAX_RETRIES):
        r = requests.post("https://api.anthropic.com/v1/messages", headers=h, json=payload, timeout=90)
        if r.status_code == 429:
            time.sleep(30 * (a + 1)); continue
        if r.status_code != 200:
            raise RuntimeError(f"Anthropic {r.status_code}: {r.text[:200]}")
        blocks = r.json().get("content", [])
        text = next((b.get("text", "") for b in blocks if b.get("type") == "text"), "")
        return _parse(text)
    raise RuntimeError("retries")


def load_cache() -> dict[str, dict]:
    return json.loads(CACHE_PATH.read_text(encoding="utf-8")).get("items", {}) if CACHE_PATH.exists() else {}


def save_cache(items: dict, model: str) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps({"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": model, "count": len(items), "items": items}, ensure_ascii=False, indent=2), encoding="utf-8")


def collect() -> list[dict]:
    prof = json.loads(CNPJ_CACHE.read_text(encoding="utf-8")).get("items", {}) if CNPJ_CACHE.exists() else {}
    qr = json.loads((DATA_DIR / "quem_recebe.json").read_text(encoding="utf-8"))
    pool: dict[str, dict] = {}
    for r in qr.get("top_recebedores", []) + qr.get("top_subvencoes", []):
        c = r["cnpj"]
        pool[c] = {"cnpj": c, "nome": r["nome"], "orgao": r.get("principal_orgao"),
                   "cnae": prof.get(c, {}).get("cnae_descricao") or "", "pago": r["total_pago"]}
    return sorted(pool.values(), key=lambda x: -x["pago"])


def load_to_bq(items: dict) -> None:
    from google.cloud import bigquery
    client = bigquery.Client(project=PROJECT_ID)
    rows = [{"cnpj": c, "tema": v.get("tema"), "confianca": v.get("confianca"),
             "_synced_at": time.strftime("%Y-%m-%dT%H:%M:%S")} for c, v in items.items()]
    client.load_table_from_json(rows, f"{PROJECT_ID}.{BQ_TABLE}", job_config=bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE, autodetect=True)).result()
    print(f"💾 BigQuery: {len(rows)} → {BQ_TABLE}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["gemini", "claude"], default="gemini")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--no-bq", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.provider == "gemini" and not GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY unset (or --provider claude)."); return 1
    if args.provider == "claude" and not ANTHROPIC_API_KEY and not args.dry_run:
        print("❌ ANTHROPIC_API_KEY unset."); return 1
    model = GEMINI_MODEL if args.provider == "gemini" else CLAUDE_MODEL
    call = call_gemini if args.provider == "gemini" else call_claude
    valid = set(TEMAS)

    cache = load_cache()
    recips = collect()
    pending = [r for r in recips if r["cnpj"] not in cache]
    if args.limit:
        pending = pending[: args.limit]
    print(f"📋 {len(recips)} recipients · pending {len(pending)} · provider={args.provider}")
    if not pending:
        print("✅ up to date"); return 0

    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        if args.dry_run:
            for b in batch:
                cache[b["cnpj"]] = {"tema": "Outros", "confianca": 0, "model": "dry-run"}
        else:
            try:
                res = call(build_prompt(batch))
            except Exception as e:
                print(f"  ⚠ batch {i//BATCH_SIZE+1}: {e}"); continue
            by = {str(r.get("cnpj")): r for r in res if r.get("cnpj")}
            for b in batch:
                r = by.get(b["cnpj"])
                if not r:
                    continue
                tema = r.get("tema") if r.get("tema") in valid else "Outros"
                cache[b["cnpj"]] = {"tema": tema, "confianca": r.get("confianca"), "model": model}
        print(f"  [{min(i+BATCH_SIZE,len(pending))}/{len(pending)}]", flush=True)
        save_cache(cache, model)

    save_cache(cache, model)
    if not args.no_bq and cache and not args.dry_run:
        load_to_bq(cache)
    print(f"💾 {len(cache)} classified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
