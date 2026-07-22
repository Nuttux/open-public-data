#!/usr/bin/env python3
"""
Enrich CNPJ (Receita Federal) — the SIRENE analog for Recife.

For each unique CNPJ (organisation) that received municipal payments or holds a
contract, fetch the Receita Federal registry profile via BrasilAPI (free, no
key, proxies the Minha Receita open dataset):

  - razão social (official) + nome fantasia
  - CNAE principal (code + description) → sector
  - porte (size) + natureza jurídica
  - situação cadastral (active / suspended / closed)
  - município / UF + start date

CPF individuals are NEVER enriched (they are excluded upstream — only CNPJ
`is_org` recipients reach the exports this reads). Recipients are processed
Pareto-first (biggest payees + all subvenção orgs first).

Cache: `pipeline/cache/enrichment/recife_cnpj.json` (keyed by cnpj). The cache
is also loaded into BigQuery `raw.br_recife_enrich_cnpj` so dbt can LEFT JOIN it
onto the credor spine WITHOUT mutating raw (enriched fields are additive,
`ode_*` — ADR-0001 raw→stg→core→mart, enrichment joins in, never overwrites).

Usage:
    python pipeline/scripts/enrich/enrich_cnpj.py                 # all pending
    python pipeline/scripts/enrich/enrich_cnpj.py --limit 300     # top-300 pending
    python pipeline/scripts/enrich/enrich_cnpj.py --no-bq         # cache only
    python pipeline/scripts/enrich/enrich_cnpj.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "br" / "recife"
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "recife_cnpj.json"

API_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
REQUEST_DELAY = 0.35   # ~3 req/s — BrasilAPI proxies Minha Receita, be gentle
MAX_RETRIES = 3

PROJECT_ID = "open-data-france-484717"
BQ_TABLE = "raw.br_recife_enrich_cnpj"


def collect_cnpjs() -> list[str]:
    """Unique CNPJs from the Recife exports, Pareto-ordered: subvenção orgs and
    biggest payees first, then contract-only orgs. CPF never appears here."""
    order: list[str] = []
    seen: set[str] = set()

    def add(cnpj: str | None):
        if cnpj and cnpj.isdigit() and len(cnpj) == 14 and cnpj not in seen:
            seen.add(cnpj)
            order.append(cnpj)

    # 1. recipients ranked by paid amount (search index is sorted desc)
    search = DATA_DIR / "quem_recebe_search.json"
    if search.exists():
        items = json.loads(search.read_text(encoding="utf-8")).get("items", [])
        # subvenção orgs first, then by amount (already desc)
        for it in sorted(items, key=lambda x: (not x.get("is_subvencao"), -(x.get("total_pago") or 0))):
            add(it.get("cnpj"))

    # 2. contract org counterparties (fills any not seen as payees)
    contratos = DATA_DIR / "contratos.json"
    if contratos.exists():
        for c in json.loads(contratos.read_text(encoding="utf-8")).get("contratos", []):
            if c.get("is_org"):
                add(c.get("fornecedor_cnpj"))

    return order


def _cnae_secao(cnae_code: str | None) -> str | None:
    """Map a CNAE 7-digit code's 2-digit division to a coarse sector label (pt),
    for a stable citizen-facing bucket independent of the LLM theme pass."""
    if not cnae_code:
        return None
    try:
        div = int(str(cnae_code).zfill(7)[:2])
    except ValueError:
        return None
    table = [
        (range(1, 4), "Agropecuária"), (range(5, 10), "Indústria extrativa"),
        (range(10, 34), "Indústria"), (range(35, 40), "Energia e água"),
        (range(41, 44), "Construção"), (range(45, 48), "Comércio"),
        (range(49, 54), "Transporte e logística"), (range(55, 57), "Alojamento e alimentação"),
        (range(58, 64), "Informação e comunicação"), (range(64, 67), "Finanças"),
        (range(68, 69), "Imobiliário"), (range(69, 76), "Serviços profissionais"),
        (range(77, 83), "Serviços administrativos"), (range(84, 85), "Administração pública"),
        (range(85, 86), "Educação"), (range(86, 89), "Saúde e assistência social"),
        (range(90, 94), "Cultura, esporte e lazer"), (range(94, 97), "Associações e serviços"),
    ]
    for rng, label in table:
        if div in rng:
            return label
    return None


def fetch_cnpj(cnpj: str) -> dict[str, Any] | None:
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(API_URL.format(cnpj=cnpj), timeout=25)
        except requests.RequestException as e:
            print(f"  ⚠ {cnpj}: {e}")
            time.sleep(1 + attempt)
            continue
        if r.status_code == 429:
            print("  ⚠ rate-limit, pause 8s")
            time.sleep(8)
            continue
        if r.status_code == 404:
            return {"cnpj": cnpj, "situacao": "NÃO ENCONTRADO"}
        if r.status_code != 200:
            time.sleep(1 + attempt)
            continue
        e = r.json()
        cnae = str(e.get("cnae_fiscal") or "") or None
        return {
            "cnpj": cnpj,
            "razao_social": e.get("razao_social") or "",
            "nome_fantasia": e.get("nome_fantasia") or "",
            "cnae_codigo": cnae,
            "cnae_descricao": e.get("cnae_fiscal_descricao") or "",
            "cnae_secao": _cnae_secao(cnae),
            "porte": e.get("porte") or "",
            "natureza_juridica": e.get("natureza_juridica") or "",
            "situacao": e.get("descricao_situacao_cadastral") or "",
            "municipio": e.get("municipio") or "",
            "uf": e.get("uf") or "",
            "data_inicio_atividade": e.get("data_inicio_atividade") or "",
            "opcao_mei": bool(e.get("opcao_pelo_mei")),
        }
    return None


def load_cache() -> dict[str, dict[str, Any]]:
    if not CACHE_PATH.exists():
        return {}
    data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return data.get("items", {}) if isinstance(data, dict) else {}


def save_cache(items: dict[str, dict[str, Any]]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "Receita Federal via BrasilAPI (brasilapi.com.br/api/cnpj)",
        "source_url": "https://brasilapi.com.br/api/cnpj/v1/",
        "count": len(items),
        "items": items,
    }
    CACHE_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")


def load_to_bq(items: dict[str, dict[str, Any]]) -> None:
    """Load the cache into raw.br_recife_enrich_cnpj (WRITE_TRUNCATE). Additive
    enrichment table — dbt LEFT JOINs it; raw credor is never touched.

    EXPLICIT schema: cnpj MUST be STRING (autodetect infers INT64 and silently
    drops leading zeros, breaking the join to the 14-digit credor cnpj)."""
    from google.cloud import bigquery
    client = bigquery.Client(project=PROJECT_ID)
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    rows = [{**v, "opcao_mei": bool(v.get("opcao_mei")), "_synced_at": now} for v in items.values()]
    schema = [
        bigquery.SchemaField("cnpj", "STRING"),
        bigquery.SchemaField("razao_social", "STRING"),
        bigquery.SchemaField("nome_fantasia", "STRING"),
        bigquery.SchemaField("cnae_codigo", "STRING"),
        bigquery.SchemaField("cnae_descricao", "STRING"),
        bigquery.SchemaField("cnae_secao", "STRING"),
        bigquery.SchemaField("porte", "STRING"),
        bigquery.SchemaField("natureza_juridica", "STRING"),
        bigquery.SchemaField("situacao", "STRING"),
        bigquery.SchemaField("municipio", "STRING"),
        bigquery.SchemaField("uf", "STRING"),
        bigquery.SchemaField("data_inicio_atividade", "STRING"),
        bigquery.SchemaField("opcao_mei", "BOOL"),
        bigquery.SchemaField("_synced_at", "TIMESTAMP"),
    ]
    job = client.load_table_from_json(
        rows, f"{PROJECT_ID}.{BQ_TABLE}",
        job_config=bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE, schema=schema),
    )
    job.result()
    print(f"💾 BigQuery: {len(rows)} rows → {BQ_TABLE}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich CNPJ orgs via BrasilAPI")
    parser.add_argument("--limit", type=int, help="Max pending CNPJs to fetch")
    parser.add_argument("--no-bq", action="store_true", help="Cache only, skip BigQuery load")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cache = load_cache()
    print(f"📦 Cache: {len(cache)} CNPJs")
    all_cnpjs = collect_cnpjs()
    pending = [c for c in all_cnpjs if c not in cache]
    print(f"📋 Unique CNPJs: {len(all_cnpjs)} · pending: {len(pending)}")
    if args.limit:
        pending = pending[: args.limit]

    if args.dry_run:
        print(f"Dry run — would fetch {len(pending)} CNPJs (first 5: {pending[:5]})")
        return 0

    processed = errors = 0
    total = len(pending)
    t0 = time.time()
    for cnpj in pending:
        result = fetch_cnpj(cnpj)
        if result:
            cache[cnpj] = result
        else:
            errors += 1
        time.sleep(REQUEST_DELAY)
        processed += 1
        if processed % 20 == 0 or processed == total:
            el = time.time() - t0
            rate = processed / el if el else 0
            eta = int((total - processed) / rate) if rate else 0
            print(f"  [{processed:>4}/{total}] {100*processed/total:5.1f}% · {rate:4.1f} req/s · "
                  f"ETA {eta//60:02d}m{eta%60:02d}s · {errors} err", flush=True)
        if processed % 100 == 0:
            save_cache(cache)

    save_cache(cache)
    print(f"💾 Cache: {len(cache)} CNPJs ({errors} errors)")
    if not args.no_bq and cache:
        load_to_bq(cache)
    return 0


if __name__ == "__main__":
    sys.exit(main())
