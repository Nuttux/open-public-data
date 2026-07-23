#!/usr/bin/env python3
"""
Place↔obra crosswalk (Recife) — match public-works contracts to civic
facilities by naming their distinctive proper-name in the contract `objeto`.

There is NO spending→facility key in Recife's data (contract addresses are the
*contractor's*). The only honest link is an objeto that names the facility. This
is high-precision by construction: match ONLY when the facility's DISTINCTIVE
name (≥2 significant tokens, generics/bairros stripped) appears in an obra-type
objeto. Precision measured ~75%+ on the sample; because the matched objeto is
surfaced on the fiche, every attribution is verifiable, not a bald number.

Framing: "obras que mencionam este equipamento" — NOT "total spent here"
(we catch objeto-mentions only, never all spending).

Output:
  - cache: pipeline/cache/enrichment/recife_place_obras.json (slug → detail)
  - BigQuery raw.br_recife_place_obras (slug, obras_total, n_obras) for the map
    metric — additive; the places mart LEFT-joins it.

Usage: python pipeline/scripts/enrich/build_recife_place_obras.py
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "br" / "recife"
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "recife_place_obras.json"
PROJECT_ID = "open-data-france-484717"
BQ_TABLE = "raw.br_recife_place_obras"

GENERIC = set("""US UBS USF CS UPA UPAE POLICLINICA HOSPITAL MATERNIDADE POSTO UNIDADE SAUDE FAMILIA
ESCOLA MUNICIPAL CRECHE ENSINO FUNDAMENTAL INFANTIL EDUCACAO CENTRO EDUCACIONAL
PRACA PARQUE JARDIM LARGO GINASIO QUADRA ESTADIO ACADEMIA POLIESPORTIVO CAMPO
RECIFE PREFEITURA DA DE DO DOS DAS E EM COM PROF PROFESSOR PROFESSORA DR DRA DOM PADRE PE
MAESTRO SANTA SANTO SAO VER VEREADOR DEPUTADO GOVERNADOR PRESIDENTE COMENDADOR
COMPAZ CIDADE BAIRRO I II III IV V N COMUNIDADE TRABALHO CONCEICAO REDENCAO CRIANCAS PONTE""".split())
OBRA = re.compile(r"REFORMA|CONSTRU|REQUALIFICA|AMPLIA|MANUTEN|ENGENHARIA|RECUPERA|CLIMATIZA|OBRA")


def norm(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9 ]", " ", s.upper())


def distinctive(name: str) -> str:
    toks = [t for t in norm(name).split() if t and t not in GENERIC and not t.isdigit() and len(t) > 2]
    return " ".join(toks) if len(toks) >= 2 else ""


def main() -> int:
    places = json.loads((DATA_DIR / "places.json").read_text(encoding="utf-8"))["places"]
    contratos = json.loads((DATA_DIR / "contratos.json").read_text(encoding="utf-8"))["contratos"]
    bairros = {norm(p.get("bairro") or "") for p in places if p.get("bairro")}

    pp = []
    for p in places:
        d = distinctive(p["nome"])
        if d and d not in bairros:
            pp.append((p["slug"], p["nome"], re.compile(r"\b" + re.escape(d) + r"\b"), d))

    hits = defaultdict(lambda: {"obras_total": 0.0, "n_obras": 0, "contratos": []})
    for c in contratos:
        o = norm(c.get("objeto"))
        if not o or not OBRA.search(o):
            continue
        for slug, nome, rx, d in pp:
            if rx.search(o):
                h = hits[slug]
                h["obras_total"] += c.get("valor") or 0
                h["n_obras"] += 1
                h["contratos"].append({
                    "contrato_id": c.get("contrato_id"), "numero": c.get("numero"),
                    "objeto": c.get("objeto"), "valor": c.get("valor"),
                    "ano": c.get("ano"), "match_via": d,
                })
                break  # one facility per contract (first/most-distinctive wins)

    for h in hits.values():
        h["obras_total"] = round(h["obras_total"], 2)
        h["contratos"] = sorted(h["contratos"], key=lambda x: -(x["valor"] or 0))[:20]

    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps({
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "method": "distinctive-name phrase match (≥2 tokens) in obra-type objeto",
        "count": len(hits), "items": dict(hits),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(h["obras_total"] for h in hits.values())
    print(f"💾 {len(hits)} facilities matched · R$ {total/1e6:,.1f} mi in identified obras → {CACHE_PATH.name}")

    from google.cloud import bigquery
    client = bigquery.Client(project=PROJECT_ID)
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    rows = [{"slug": s, "obras_total": h["obras_total"], "n_obras": h["n_obras"], "_synced_at": now}
            for s, h in hits.items()]
    schema = [bigquery.SchemaField("slug", "STRING"), bigquery.SchemaField("obras_total", "FLOAT64"),
              bigquery.SchemaField("n_obras", "INT64"), bigquery.SchemaField("_synced_at", "TIMESTAMP")]
    client.load_table_from_json(rows, f"{PROJECT_ID}.{BQ_TABLE}", job_config=bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE, schema=schema)).result()
    print(f"💾 BigQuery: {len(rows)} rows → {BQ_TABLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
