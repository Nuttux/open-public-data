#!/usr/bin/env python3
"""
Vulgarize Recife recipients — plain-Portuguese descriptions of who an
organisation is and what the municipal money funds. Adapted from
vulgarize_subventions_llm.py to pt-BR and the Recife data.

For each CNPJ organisation (Pareto-first), produce two fields:
  - resumo          : 1 phrase (≤120 chars) — what the organisation does,
                      grounded in its CNAE + name.
  - o_que_financia  : 1-2 phrases (≤220 chars) — what the City's payments to
                      it concretely fund, grounded in the paying agency
                      (principal_orgao) and whether it is a subvenção.

Grounding inputs (no invention): razão social, CNAE description, paying
agency, subvenção flag, amount. CPF individuals are never processed.

Provider: gemini-3-flash-preview is the project default (context matters more
than model — project_enrichment_model_choice). A `--provider claude` path is
provided for environments without a Gemini key; use a STRONG Claude model
(claude-sonnet-5), never the haiku fallback (project_enrichment_model_choice
"piège du fallback haiku").

Cache: `pipeline/cache/enrichment/recife_vulgarizacao.json` (keyed by cnpj),
also loaded into BigQuery `raw.br_recife_enrich_vulgar` for the additive dbt
join (never overwrites raw).

Usage:
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_recife_llm.py --limit 60
    ANTHROPIC_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_recife_llm.py --provider claude --limit 60
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
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "recife_vulgarizacao.json"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")

BATCH_SIZE = 10
MAX_RETRIES = 3
RETRY_WAIT_429 = 30

PROJECT_ID = "open-data-france-484717"
BQ_TABLE = "raw.br_recife_enrich_vulgar"

SYSTEM_PROMPT = """Você é um jornalista de dados que explica, em português claro, para quem a Prefeitura do Recife paga e o que esse dinheiro financia.

Para cada organização recebida, produza dois campos:

- resumo: 1 frase (máx. 120 caracteres). O que a organização faz, com base no CNAE e no nome. Se for banco/instituição financeira, diga que é agente financeiro. Sem jargão.

- o_que_financia: 1 ou 2 frases (máx. 220 caracteres). O que os pagamentos da Prefeitura a essa organização concretamente custeiam, usando o órgão pagador para contextualizar. Se for subvenção, diga que é repasse a entidade sem fins lucrativos.

REGRAS:
1. Não invente. Baseie-se estritamente no nome, CNAE, órgão e valor fornecidos.
2. Tom neutro e factual. Nada de marketing ("entidade exemplar").
3. Se for um banco (Caixa, Banco do Brasil), explique que é intermediário financeiro (folha, financiamentos, tarifas), não um prestador de serviço à cidade.
4. Responda APENAS em JSON, no formato:
[{"cnpj": "...", "resumo": "...", "o_que_financia": "..."}, ...]
"""


def build_prompt(batch: list[dict[str, Any]]) -> str:
    lines = ["Organizações a explicar:", ""]
    for b in batch:
        lines.append(
            f"- cnpj={b['cnpj']} · nome={b['nome']!r} · cnae={b.get('cnae') or '—'} · "
            f"orgao={b.get('orgao') or '—'} · subvencao={'sim' if b.get('is_subvencao') else 'nao'} · "
            f"pago=R$ {b.get('total_pago') or 0:,.0f}"
        )
    return "\n".join(lines)


def _parse_json_list(text: str) -> list[dict[str, Any]]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        last = max(text.rfind("},"), text.rfind("}"))
        if last > 0:
            try:
                return json.loads(text[: last + 1].rstrip(",") + "]")
            except json.JSONDecodeError:
                pass
        raise


def call_gemini(user_prompt: str) -> list[dict[str, Any]]:
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json", "maxOutputTokens": 8192},
    }
    for attempt in range(MAX_RETRIES):
        r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload, timeout=60)
        if r.status_code == 429:
            time.sleep(RETRY_WAIT_429 * (attempt + 1)); continue
        if r.status_code != 200:
            raise RuntimeError(f"Gemini HTTP {r.status_code}: {r.text[:200]}")
        return _parse_json_list(r.json()["candidates"][0]["content"]["parts"][0]["text"])
    raise RuntimeError("Max retries exceeded")


def call_claude(user_prompt: str) -> list[dict[str, Any]]:
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 8192,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    for attempt in range(MAX_RETRIES):
        r = requests.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload, timeout=90)
        if r.status_code == 429:
            time.sleep(RETRY_WAIT_429 * (attempt + 1)); continue
        if r.status_code != 200:
            raise RuntimeError(f"Anthropic HTTP {r.status_code}: {r.text[:200]}")
        # Sonnet-class models may emit a `thinking` block before the text one.
        blocks = r.json().get("content", [])
        text = next((b.get("text", "") for b in blocks if b.get("type") == "text"), "")
        return _parse_json_list(text)
    raise RuntimeError("Max retries exceeded")


def load_cache() -> dict[str, dict[str, Any]]:
    if not CACHE_PATH.exists():
        return {}
    return json.loads(CACHE_PATH.read_text(encoding="utf-8")).get("items", {})


def save_cache(items: dict, model: str) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(
        {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "model": model,
         "count": len(items), "items": items}, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_recipients() -> list[dict[str, Any]]:
    """Recipients to explain, Pareto-first, grounded with the CNPJ CNAE."""
    cnpj_prof = json.loads(CNPJ_CACHE.read_text(encoding="utf-8")).get("items", {}) if CNPJ_CACHE.exists() else {}
    qr = json.loads((DATA_DIR / "quem_recebe.json").read_text(encoding="utf-8"))
    # Use the ranked slices (top payees + top subvenção) — the fiches users hit.
    pool: dict[str, dict] = {}
    for r in qr.get("top_recebedores", []) + qr.get("top_subvencoes", []):
        c = r["cnpj"]
        prof = cnpj_prof.get(c, {})
        pool[c] = {
            "cnpj": c, "nome": r["nome"], "total_pago": r["total_pago"],
            "is_subvencao": r.get("is_subvencao"), "orgao": r.get("principal_orgao"),
            "cnae": prof.get("cnae_descricao") or "",
        }
    return sorted(pool.values(), key=lambda x: -x["total_pago"])


def load_to_bq(items: dict[str, dict[str, Any]]) -> None:
    # Explicit schema — cnpj MUST be STRING (autodetect drops leading zeros).
    from google.cloud import bigquery
    client = bigquery.Client(project=PROJECT_ID)
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    rows = [{"cnpj": c, "resumo": v.get("resumo"), "o_que_financia": v.get("o_que_financia"),
             "model": v.get("model"), "_synced_at": now} for c, v in items.items()]
    schema = [
        bigquery.SchemaField("cnpj", "STRING"),
        bigquery.SchemaField("resumo", "STRING"),
        bigquery.SchemaField("o_que_financia", "STRING"),
        bigquery.SchemaField("model", "STRING"),
        bigquery.SchemaField("_synced_at", "TIMESTAMP"),
    ]
    job = client.load_table_from_json(rows, f"{PROJECT_ID}.{BQ_TABLE}", job_config=bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE, schema=schema))
    job.result()
    print(f"💾 BigQuery: {len(rows)} rows → {BQ_TABLE}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Vulgarize Recife recipients (pt-BR)")
    ap.add_argument("--provider", choices=["gemini", "claude"], default="gemini")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--no-bq", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.provider == "gemini" and not GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY/GEMINI_API_KEY unset (or use --provider claude)."); return 1
    if args.provider == "claude" and not ANTHROPIC_API_KEY and not args.dry_run:
        print("❌ ANTHROPIC_API_KEY unset."); return 1
    model = GEMINI_MODEL if args.provider == "gemini" else CLAUDE_MODEL
    call = call_gemini if args.provider == "gemini" else call_claude

    cache = load_cache()
    print(f"📦 Cache: {len(cache)} · provider={args.provider} model={model}")
    recips = collect_recipients()
    pending = [r for r in recips if r["cnpj"] not in cache]
    if args.limit:
        pending = pending[: args.limit]
    print(f"📋 Recipients: {len(recips)} · pending: {len(pending)}")
    if not pending:
        print("✅ Cache up to date."); return 0

    total = len(pending); processed = 0; t0 = time.time()
    for i in range(0, total, BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        if args.dry_run:
            for b in batch:
                cache[b["cnpj"]] = {"resumo": "(dry-run)", "o_que_financia": "(dry-run)", "model": "dry-run"}
        else:
            try:
                results = call(build_prompt(batch))
            except Exception as e:
                print(f"  ⚠ batch {i//BATCH_SIZE+1}: {e}", flush=True); continue
            by = {str(r.get("cnpj")): r for r in results if r.get("cnpj")}
            for b in batch:
                r = by.get(b["cnpj"]) or by.get(b["cnpj"].lstrip("0"))
                if not r:
                    continue
                cache[b["cnpj"]] = {
                    "resumo": (r.get("resumo") or "").strip(),
                    "o_que_financia": (r.get("o_que_financia") or "").strip(),
                    "model": model,
                }
        processed += len(batch)
        el = time.time() - t0
        print(f"  [{processed:>4}/{total}] {100*processed/total:5.1f}% · "
              f"{processed/el if el else 0:4.1f} it/s", flush=True)
        if processed % (BATCH_SIZE * 3) == 0 or i + BATCH_SIZE >= total:
            save_cache(cache, model)

    save_cache(cache, model)
    print(f"💾 Cache: {len(cache)} entries")
    if not args.no_bq and cache and not args.dry_run:
        load_to_bq(cache)
    return 0


if __name__ == "__main__":
    sys.exit(main())
