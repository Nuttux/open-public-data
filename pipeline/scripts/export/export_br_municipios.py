#!/usr/bin/env python3
"""
Export the budget of every Brazilian município (SICONFI through Base dos
Dados, dbt_br_marts) to one JSON per município, in the same shape as
Recife's budget.json (BudgetData), plus the manifest the site ships.

Outputs:
    pipeline/data/br_municipios/<id_municipio>.json   one per município
    website/src/data/br-municipios-manifest.json      slug → identity, years, totals
    gs://qipu-communes-budget/br-municipios/<id>.json  with --upload (gsutil -m)

Data contract (ADR-0010 D2): every file carries generated_at + source_pipeline,
a source block with the portal and its URL, and no hardcoded number.

Usage:
    python pipeline/scripts/export/export_br_municipios.py [--upload] [--only 2611606,2609600]
Prereq: dbt build --select stg_br_siconfi_despesas_funcao+ stg_br_municipios+ --target prod
"""

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger  # noqa: E402

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_br_marts"
ROOT = Path(__file__).parent.parent.parent.parent
OUT_DIR = ROOT / "pipeline" / "data" / "br_municipios"
MANIFEST = ROOT / "website" / "src" / "data" / "br-municipios-manifest.json"
BUCKET = "gs://qipu-communes-budget/br-municipios"

SOURCE_PIPELINE = (
    "basedosdados.br_me_siconfi.municipio_despesas_funcao + municipio_receitas_orcamentarias → "
    "stg_br_siconfi_despesas_funcao / stg_br_siconfi_receitas → core_br_municipio_despesas / core_br_municipio_receitas → "
    "mart_br_municipio_budget / mart_br_municipio_receitas / mart_br_municipios → export_br_municipios.py"
)
SOURCE = {
    "name": "SICONFI — Tesouro Nacional (DCA, Anexos I-C e I-E)",
    "portal": "Sistema de Informações Contábeis e Fiscais do Setor Público Brasileiro",
    "license": "Dados abertos do Tesouro Nacional",
    "source_url": "https://siconfi.tesouro.gov.br/siconfi/pages/public/consulta_finbra/finbra_list.jsf",
    "mirror": "https://basedosdados.org/dataset/br-me-siconfi",
    "as_of": None,
}
POP_SOURCE = {"source": "IBGE — estimativas de população", "source_url": "https://www.ibge.gov.br/estatisticas/sociais/populacao/9103-estimativas-de-populacao.html"}
PERIMETER = (
    "Despesas orçamentárias pagas pelo município, exceto intraorçamentárias, por função e subfunção "
    "de governo, e receitas orçamentárias realizadas, líquidas das deduções (FUNDEB, transferências "
    "constitucionais, outras), por origem, tal como declaradas ao Tesouro Nacional (DCA)."
)


def _f(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--upload", action="store_true", help="copy the files to the private bucket (gsutil -m)")
    ap.add_argument("--only", default=None, help="comma-separated id_municipio to export (debug)")
    ap.add_argument("--dataset", default=DATASET, help="marts dataset (dbt_br_marts in prod, dbt_br_dev_local_marts from a dev build)")
    args = ap.parse_args()
    log = Logger("export_br_municipios")
    client = bigquery.Client(project=PROJECT_ID)
    dataset = args.dataset
    generated_at = datetime.now(timezone.utc).isoformat()
    only = set(args.only.split(",")) if args.only else None

    # ── The municípios and their yearly totals ──
    muns = {}
    for r in client.query(f"SELECT * FROM `{PROJECT_ID}.{dataset}.mart_br_municipios`").result():
        d = dict(r)
        if only and d["id_municipio"] not in only:
            continue
        muns[d["id_municipio"]] = d
    log.info(f"{len(muns)} municípios in the mart")

    # ── The function rows, município by município (ordered so one pass suffices) ──
    where = f"WHERE id_municipio IN ({','.join(repr(x) for x in only)})" if only else ""
    q = f"""
      SELECT id_municipio, ano, funcao_codigo, funcao, subfuncao_codigo, subfuncao, is_total, is_funcao, pago, empenhado
      FROM `{PROJECT_ID}.{dataset}.mart_br_municipio_budget`
      {where}
      ORDER BY id_municipio, ano, funcao_codigo, subfuncao_codigo
    """
    # ── The revenue side (2026-09-18) : total, origens and their detail, net of deductions ──
    qr = f"""
      SELECT id_municipio, ano, id_conta_bd, conta, nivel, origem_codigo, detalhe_codigo, bruta, deducao_fundeb, deducoes, liquida
      FROM `{PROJECT_ID}.{dataset}.mart_br_municipio_receitas`
      {where}
      ORDER BY id_municipio, ano, id_conta_bd
    """
    receitas = defaultdict(lambda: defaultdict(lambda: {"total": None, "origens": {}}))
    for r in client.query(qr).result(page_size=50000):
        y = receitas[r["id_municipio"]][r["ano"]]
        row = {"bruta": _f(r["bruta"]) or 0.0, "fundeb": _f(r["deducao_fundeb"]) or 0.0, "deducoes": _f(r["deducoes"]) or 0.0, "liquida": _f(r["liquida"]) or 0.0}
        if r["nivel"] == 0:
            y["total"] = row
        elif r["nivel"] == 2:
            o = y["origens"].setdefault(r["origem_codigo"], {"origem": r["conta"], "codigo": r["origem_codigo"], "detalhes": {}})
            o.update(row)
        elif r["nivel"] == 3:
            o = y["origens"].setdefault(r["origem_codigo"], {"origem": None, "codigo": r["origem_codigo"], "detalhes": {}})
            o["detalhes"][r["detalhe_codigo"]] = {"detalhe": r["conta"], "codigo": r["detalhe_codigo"], "liquida": row["liquida"]}
    log.info(f"revenue rows read for {len(receitas)} municípios")

    def receitas_of(mid):
        out = []
        for ano in sorted(receitas.get(mid, {})):
            y = receitas[mid][ano]
            tot = y["total"]
            if not tot or tot["liquida"] <= 0:
                continue
            origens = []
            for o in y["origens"].values():
                if o.get("liquida") is None or o["liquida"] <= 0 or not o.get("origem"):
                    continue
                dets = sorted((d for d in o["detalhes"].values() if d["liquida"] > 0), key=lambda d: -d["liquida"])
                origens.append({"origem": o["origem"], "codigo": o["codigo"], "liquida": o["liquida"], "bruta": o["bruta"], "detalhes": dets})
            origens.sort(key=lambda o: -o["liquida"])
            out.append({"ano": ano, "bruta": tot["bruta"], "deducoes": tot["deducoes"], "fundeb": tot["fundeb"], "liquida": tot["liquida"], "origens": origens})
        return out

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    n_files = 0

    def flush(mid, years):
        nonlocal n_files
        m = muns.get(mid)
        if not m or not years:
            return
        anos = []
        for ano in sorted(years):
            y = years[ano]
            funcoes = []
            for code, f in sorted(y["funcoes"].items(), key=lambda kv: -kv[1]["pago"]):
                subs = sorted(({"subfuncao": s, "pago": v} for s, v in f["sub"].items() if v > 0), key=lambda x: -x["pago"])
                funcoes.append({"funcao": f["nome"], "codigo": code, "pago": f["pago"], "empenhado": f["empenhado"], "subfuncoes": subs})
            anos.append({"ano": ano, "total_pago": y["total_pago"], "total_empenhado": y["total_empenhado"], "funcoes": funcoes})
        anos_disp = [a["ano"] for a in anos if a["total_pago"] > 0]
        if not anos_disp:
            return
        payload = {
            "generated_at": generated_at,
            "source_pipeline": SOURCE_PIPELINE,
            "source": SOURCE,
            "as_of": None,
            "perimeter": PERIMETER,
            "municipio": {"id": mid, "nome": m["nome"], "uf": m["sigla_uf"], "nome_uf": m["nome_uf"], "regiao": m["nome_regiao"], "slug": m["slug"]},
            "populacao": {"populacao": m["populacao"], "ano": m["populacao_ano"], **POP_SOURCE} if m.get("populacao") else None,
            "anos_disponiveis": anos_disp,
            "ano_mais_recente": max(anos_disp),
            "anos": [a for a in anos if a["total_pago"] > 0],
            "curva_mensal": [],
            "partial_year": None,
            "receitas": receitas_of(mid),
        }
        (OUT_DIR / f"{mid}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        n_files += 1
        manifest[m["slug"]] = {
            "id": mid, "nome": m["nome"], "uf": m["sigla_uf"], "pop": m.get("populacao"),
            "anos": anos_disp, "pago": payload["anos"][-1]["total_pago"], "hab": round(_f(m["pago_hab"])) if m.get("pago_hab") else None,
            **({"cap": True} if m.get("capital_uf") else {}),
            **({"rec": _f(m["receita_recente"]), "rec_ano": m["receita_ano"]} if m.get("receita_recente") else {}),
        }

    cur, years = None, {}
    for r in client.query(q).result(page_size=50000):
        mid = r["id_municipio"]
        if mid != cur:
            flush(cur, years)
            cur, years = mid, {}
        y = years.setdefault(r["ano"], {"total_pago": 0.0, "total_empenhado": 0.0, "funcoes": {}})
        pago, emp = _f(r["pago"]) or 0.0, _f(r["empenhado"]) or 0.0
        if r["is_total"]:
            y["total_pago"], y["total_empenhado"] = pago, emp
        elif r["is_funcao"]:
            f = y["funcoes"].setdefault(r["funcao_codigo"], {"nome": r["funcao"], "pago": 0.0, "empenhado": 0.0, "sub": {}})
            f["nome"], f["pago"], f["empenhado"] = r["funcao"] or f["nome"], pago, emp
        elif r["subfuncao"]:
            f = y["funcoes"].setdefault(r["funcao_codigo"], {"nome": r["funcao"], "pago": 0.0, "empenhado": 0.0, "sub": {}})
            f["sub"][r["subfuncao"]] = pago
    flush(cur, years)
    log.info(f"{n_files} files written to {OUT_DIR}")

    MANIFEST.write_text(json.dumps({"generated_at": generated_at, "source": SOURCE["name"], "municipios": dict(sorted(manifest.items()))}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log.info(f"manifest: {len(manifest)} municípios → {MANIFEST}")

    if args.upload:
        cmd = ["gsutil", "-m", "-q", "cp", "-r", str(OUT_DIR) + "/*.json", BUCKET + "/"]
        log.info("uploading: " + " ".join(cmd))
        subprocess.run(" ".join(cmd), shell=True, check=True)
        log.info("uploaded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
