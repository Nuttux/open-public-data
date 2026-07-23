#!/usr/bin/env python3
"""
Export Recife (Brazil) city data from BigQuery (dbt_br_marts) to JSON.

Outputs (website/public/data/br/recife/):
    - index.json          : file manifest + shared provenance.
    - budget.json         : executed budget by FUNÇÃO × ano (Saúde, Educação…)
      + monthly execution curve + headline totals. The "what the money is for"
      view. Source: mart_br_recife_budget_funcao, mart_br_recife_budget_mensal.
    - quem_recebe.json    : the who-receives page payload — headline (orgs
      count, total paid, subvenção slice) + top recipients + subvenção-only
      ranking. ORGANISATIONS (CNPJ) ONLY — no CPF individuals anywhere.
      Source: mart_br_recife_quem_recebe.
    - recipients.json     : per-CNPJ fiche detail (by-year + contracts), keyed
      by cnpj — the recipient drawer/fiche reads this. Orgs only.
    - quem_recebe_search.json : slim search index (all orgs). Lazy-loaded.
    - contratos.json      : contracts list + headline + modalidade mix; the
      contract fiche reads its row from here. CPF contractors are masked
      ("pessoa física"). Source: mart_br_recife_contratos.
    - licitacoes.json     : procurement context — modalidade mix, savings,
      recent awards, in-progress pipeline. Source: mart_br_recife_licitacoes.

Data contract (ADR-0010 D2): every file carries generated_at + source_pipeline;
every block carries source/source_url (the CKAN dataset page from the synced
catalog — never hardcoded) and as_of (the resource last_modified). No hardcoded
numbers — everything flows from BigQuery marts.

Privacy: CPF individuals are never classified, searched or exposed. quem_recebe
/recipients/search are org-only; contract CPF names are masked.

Usage:
    python pipeline/scripts/export/export_br_recife.py
Prereq: dbt build --select tag:br --target prod
"""

import json
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
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "br" / "recife"

SOURCE_PIPELINE = (
    "configs/countries/br.yaml → sync_ckan_dataset.py → raw.br_recife_* → "
    "dbt_br_staging → dbt_br_analytics → dbt_br_marts → export_br_recife.py"
)

TOP_RECIPIENTS = 200
TOP_SUBVENCAO = 60
MASK_PESSOA_FISICA = "Pessoa física"


def _f(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


def _ts(v):
    return v.isoformat() if v is not None else None


def rows(client, table, extra=""):
    q = f"SELECT * FROM `{PROJECT_ID}.{DATASET}.{table}` {extra}"
    return [dict(r) for r in client.query(q).result()]


def source_block(sample):
    """Provenance straight from a mart row (source_* columns)."""
    return {
        "name": sample.get("source_name"),
        "portal": sample.get("source_portal"),
        "license": sample.get("source_license"),
        "source_url": sample.get("source_url"),
        "as_of": _ts(sample.get("source_rows_updated_at")),
    }


# ---------------------------------------------------------------------------
# budget.json
# ---------------------------------------------------------------------------

def fetch_population():
    """Recife population for per-capita scaling — from SICONFI RREO (official,
    the same figure the Tesouro uses for its own per-capita indicators). Sourced,
    not hardcoded; returns None gracefully if the API is unreachable."""
    import requests
    url = ("https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo?an_exercicio=2024"
           "&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2002&id_ente=2611606")
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        pop = r.json()["items"][0].get("populacao")
        return {
            "populacao": int(pop),
            "ano": 2024,
            "source": "SICONFI — Tesouro Nacional (RREO)",
            "source_url": "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo",
        } if pop else None
    except Exception:
        return None


def build_budget(client, log):
    funcao = rows(client, "mart_br_recife_budget_funcao")
    mensal = rows(client, "mart_br_recife_budget_mensal", "ORDER BY ano, mes")
    if not funcao:
        raise RuntimeError("mart_br_recife_budget_funcao is empty")
    src = source_block(funcao[0])
    populacao = fetch_population()

    # roll subfunção rows up to função × ano
    by_funcao = defaultdict(lambda: {"pago": 0.0, "empenhado": 0.0, "subfuncoes": []})
    anos = sorted({r["ano"] for r in funcao})
    per_ano = {a: {"pago": 0.0, "empenhado": 0.0, "funcoes": {}} for a in anos}
    for r in funcao:
        a = r["ano"]
        f = r["funcao"]
        node = per_ano[a]["funcoes"].setdefault(
            f, {"funcao": f, "codigo": r["funcao_codigo"], "pago": 0.0,
                "empenhado": 0.0, "subfuncoes": []})
        node["pago"] += _f(r["pago"]) or 0
        node["empenhado"] += _f(r["empenhado"]) or 0
        if r["subfuncao"] and (_f(r["pago"]) or 0) > 0:
            node["subfuncoes"].append({
                "subfuncao": r["subfuncao"],
                "pago": _f(r["pago"]) or 0,
            })
        per_ano[a]["pago"] += _f(r["pago"]) or 0
        per_ano[a]["empenhado"] += _f(r["empenhado"]) or 0

    anos_payload = []
    for a in anos:
        funcoes = sorted(per_ano[a]["funcoes"].values(), key=lambda x: -x["pago"])
        for fn in funcoes:
            fn["subfuncoes"] = sorted(fn["subfuncoes"], key=lambda x: -x["pago"])[:8]
        anos_payload.append({
            "ano": a,
            "total_pago": round(per_ano[a]["pago"], 2),
            "total_empenhado": round(per_ano[a]["empenhado"], 2),
            "funcoes": funcoes,
        })

    curva = [{
        "ano": r["ano"], "mes": r["mes"],
        "pago": _f(r["pago"]) or 0, "empenhado": _f(r["empenhado"]) or 0,
    } for r in mensal]

    latest = max(anos)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "br", "scale": "city", "place": "recife",
        "unit": "BRL",
        "as_of": src["as_of"],
        "source": src,
        "perimeter": (
            "Despesa municipal executada por função (Despesa Funcional "
            "Programática). Valores 'pago' = movimento mensal somado no ano. "
            "Empenhado ≈ liquidado no arquivo-fonte; a diferença para o pago "
            "são restos a pagar."
        ),
        "populacao": populacao,
        "anos_disponiveis": anos,
        "ano_mais_recente": latest,
        "anos": anos_payload,
        "curva_mensal": curva,
    }


# ---------------------------------------------------------------------------
# quem_recebe.json + recipients.json + search
# ---------------------------------------------------------------------------

def _load_enrichment(client):
    """cnpj → enriched profile (perfil + tema + plain-language). Additive; the
    mart LEFT-joins so absent enrichment is just missing keys, never an error."""
    try:
        er = rows(client, "mart_br_recife_recebe_enriched")
    except Exception:
        return {}
    out = {}
    for r in er:
        out[r["cnpj"]] = {
            "tema": r.get("ode_tema"),
            "tema_fonte": r.get("ode_tema_fonte"),
            "razao_social": r.get("ode_razao_social"),
            "cnae": r.get("ode_cnae_descricao"),
            "setor": r.get("ode_cnae_secao"),
            "porte": r.get("ode_porte"),
            "natureza": r.get("ode_natureza_juridica"),
            "situacao": r.get("ode_situacao"),
            "resumo": r.get("ode_resumo"),
            "o_que_financia": r.get("ode_o_que_financia"),
        }
    return out


def build_quem_recebe(client, log):
    qr = rows(client, "mart_br_recife_quem_recebe")
    contratos = rows(client, "mart_br_recife_contratos")
    enrich = _load_enrichment(client)
    if not qr:
        raise RuntimeError("mart_br_recife_quem_recebe is empty")
    src = source_block(qr[0])

    # contracts indexed by CNPJ (org only) for the recipient fiche
    contr_by_doc = defaultdict(list)
    for c in contratos:
        if c.get("is_org") and c.get("doc"):
            contr_by_doc[c["doc"]].append(c)

    recipients = {}  # cnpj -> aggregate
    for r in qr:
        cnpj = r["cnpj"]
        rec = recipients.setdefault(cnpj, {
            "cnpj": cnpj, "nome": r["nome"],
            "total_pago": 0.0, "total_empenhado": 0.0, "subvencao_pago": 0.0,
            "is_subvencao": False, "by_year": [], "principal_orgao": None,
        })
        rec["total_pago"] += _f(r["total_pago"]) or 0
        rec["total_empenhado"] += _f(r["total_empenhado"]) or 0
        rec["subvencao_pago"] += _f(r["subvencao_pago"]) or 0
        rec["is_subvencao"] = rec["is_subvencao"] or bool(r["is_subvencao_any"])
        rec["by_year"].append({
            "ano": r["ano"],
            "pago": _f(r["total_pago"]) or 0,
            "n_empenhos": r["n_empenhos"],
            "principal_orgao": r["principal_orgao"],
        })

    # finalize
    all_recs = []
    for rec in recipients.values():
        rec["by_year"] = sorted(rec["by_year"], key=lambda x: x["ano"])
        # principal orgao = the most recent year's
        rec["principal_orgao"] = rec["by_year"][-1]["principal_orgao"] if rec["by_year"] else None
        rec["total_pago"] = round(rec["total_pago"], 2)
        rec["total_empenhado"] = round(rec["total_empenhado"], 2)
        rec["subvencao_pago"] = round(rec["subvencao_pago"], 2)
        cs = contr_by_doc.get(rec["cnpj"], [])
        rec["contratos"] = sorted(
            [{
                "contrato_id": c["contrato_id"], "numero": c["numero_contrato"],
                "objeto": c["objeto"], "orgao": c["orgao_contratante"],
                "valor": _f(c["valor_contrato"]), "situacao": c["situacao"],
                "ano": c["ano_contrato"],
            } for c in cs],
            key=lambda x: -(x["valor"] or 0))[:20]
        rec["n_contratos"] = len(cs)
        # additive enrichment (perfil + tema + plain-language) — never overwrites
        e = enrich.get(rec["cnpj"], {})
        rec["tema"] = e.get("tema")
        rec["perfil"] = {k: e.get(k) for k in ("cnae", "setor", "porte", "natureza",
                                               "situacao", "razao_social")} if e.get("cnae") else None
        rec["resumo"] = e.get("resumo")
        rec["o_que_financia"] = e.get("o_que_financia")
        all_recs.append(rec)

    all_recs.sort(key=lambda x: -x["total_pago"])
    total_pago = sum(r["total_pago"] for r in all_recs)
    total_subv = sum(r["subvencao_pago"] for r in all_recs)
    n_subv = sum(1 for r in all_recs if r["is_subvencao"])
    # concentration + median (mirrors the Paris subventions headline)
    paid_desc = [r["total_pago"] for r in all_recs if r["total_pago"] > 0]
    top10 = sum(paid_desc[:10])
    concentration_top10 = (top10 / total_pago) if total_pago else 0.0
    n = len(paid_desc)
    mediana = 0.0
    if n:
        mid = n // 2
        mediana = paid_desc[mid] if n % 2 else (paid_desc[mid - 1] + paid_desc[mid]) / 2

    def slim(r):
        s = {k: r[k] for k in ("cnpj", "nome", "total_pago", "subvencao_pago",
                               "is_subvencao", "principal_orgao", "n_contratos")}
        s["tema"] = r.get("tema")
        s["resumo"] = r.get("resumo")
        return s

    top = [slim(r) for r in all_recs[:TOP_RECIPIENTS]]
    top_subv = [slim(r) for r in
                sorted([r for r in all_recs if r["is_subvencao"]],
                       key=lambda x: -x["subvencao_pago"])[:TOP_SUBVENCAO]]

    # theme breakdown across ALL org recipients (deterministic tema cascade)
    tema_agg = defaultdict(lambda: {"n": 0, "pago": 0.0})
    for r in all_recs:
        tm = r.get("tema") or "Outros"
        tema_agg[tm]["n"] += 1
        tema_agg[tm]["pago"] += r["total_pago"]
    temas = sorted(
        [{"tema": k, "n_organizacoes": v["n"], "pago": round(v["pago"], 2)}
         for k, v in tema_agg.items()],
        key=lambda x: -x["pago"])

    anos = sorted({r["ano"] for r in qr})
    # per-year series for the evolution chart (org recipients)
    anos_series = []
    for a in anos:
        yr = [r for r in qr if r["ano"] == a]
        anos_series.append({
            "ano": a,
            "total_pago": round(sum(_f(r["total_pago"]) or 0 for r in yr), 2),
            "n_orgs": len({r["cnpj"] for r in yr}),
            "subvencao": round(sum(_f(r["subvencao_pago"]) or 0 for r in yr), 2),
        })
    page = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "br", "scale": "city", "place": "recife",
        "unit": "BRL", "as_of": src["as_of"], "source": src,
        "perimeter": (
            "Organizações (CNPJ) que receberam pagamentos da Prefeitura do "
            "Recife (Despesa por Credor Empenho), 2024-2026. Pessoas físicas "
            "(CPF) não são listadas nem pesquisáveis. 'subvenção' = repasse "
            "via Modalidade de Aplicação 50 (transferências a instituições "
            "privadas sem fins lucrativos)."
        ),
        "anos_disponiveis": anos,
        "anos_series": anos_series,
        "headline": {
            "n_organizacoes": len(all_recs),
            "total_pago": round(total_pago, 2),
            "subvencao_total": round(total_subv, 2),
            "n_organizacoes_subvencionadas": n_subv,
            "mediana": round(mediana, 2),
            "concentracao_top10": round(concentration_top10, 4),
        },
        "top_recebedores": top,
        "top_subvencoes": top_subv,
        "temas": temas,
        "enrichment": {
            "n_com_perfil": sum(1 for r in all_recs if r.get("perfil")),
            "n_com_resumo": sum(1 for r in all_recs if r.get("resumo")),
            "perfil_source": "Receita Federal via BrasilAPI",
            "tema_method": "CNAE-seção + órgão pagador (mapeamento determinístico)",
            "resumo_model": "LLM (gemini-3-flash-preview padrão; claude-sonnet-5 nesta execução)",
        },
    }

    recipients_map = {r["cnpj"]: r for r in all_recs}
    search = [{"cnpj": r["cnpj"], "nome": r["nome"], "total_pago": r["total_pago"],
               "is_subvencao": r["is_subvencao"], "tema": r.get("tema"),
               "orgao": r.get("principal_orgao")} for r in all_recs]
    search_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE, "unit": "BRL",
        "count": len(search), "items": search,
    }
    recipients_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE, "unit": "BRL",
        "source": src, "count": len(recipients_map), "items": recipients_map,
    }
    return page, recipients_payload, search_payload


# ---------------------------------------------------------------------------
# contratos.json
# ---------------------------------------------------------------------------

def build_contratos(client, log):
    contratos = rows(client, "mart_br_recife_contratos")
    if not contratos:
        raise RuntimeError("mart_br_recife_contratos is empty")
    src = source_block(contratos[0])

    modalidade_mix = defaultdict(lambda: {"n": 0, "valor": 0.0})
    items = []
    n_ativos = 0
    valor_ativo = 0.0
    for c in contratos:
        is_org = bool(c.get("is_org"))
        nome = c["razao_social"] if is_org else MASK_PESSOA_FISICA
        val = _f(c["valor_contrato"])
        mod = c["modalidade"] or "—"
        modalidade_mix[mod]["n"] += 1
        modalidade_mix[mod]["valor"] += val or 0
        if c["is_ativo"]:
            n_ativos += 1
            valor_ativo += val or 0
        items.append({
            "contrato_id": c["contrato_id"],
            "numero": c["numero_contrato"],
            "ano": c["ano_contrato"],
            "orgao": c["orgao_contratante"],
            "objeto": c["objeto"],
            "modalidade": mod,
            "fornecedor": nome,
            "fornecedor_cnpj": c["doc"] if is_org else None,
            "is_org": is_org,
            "valor": val,
            "situacao": c["situacao"],
            "vigencia_inicio": _ts(c["vigencia_inicio"]),
            "vigencia_fim": _ts(c["vigencia_fim"]),
            "is_ativo": bool(c["is_ativo"]),
        })

    items.sort(key=lambda x: -(x["valor"] or 0))
    mix = sorted([{"modalidade": k, "n": v["n"], "valor": round(v["valor"], 2)}
                  for k, v in modalidade_mix.items()], key=lambda x: -x["valor"])
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "br", "scale": "city", "place": "recife",
        "unit": "BRL", "as_of": src["as_of"], "source": src,
        "perimeter": (
            "Contratos administrativos da Prefeitura do Recife (histórico "
            "completo). Contratados pessoa física (CPF) aparecem como 'Pessoa "
            "física', sem identificação. valor = valor total do contrato."
        ),
        "headline": {
            "n_contratos": len(items),
            "n_ativos": n_ativos,
            "valor_ativo_total": round(valor_ativo, 2),
        },
        "modalidade_mix": mix,
        "contratos": items,
    }


# ---------------------------------------------------------------------------
# licitacoes.json
# ---------------------------------------------------------------------------

def build_licitacoes(client, log):
    lic = rows(client, "mart_br_recife_licitacoes")
    if not lic:
        raise RuntimeError("mart_br_recife_licitacoes is empty")
    src = source_block(lic[0])
    modalidade_mix = defaultdict(lambda: {"n": 0, "homologado": 0.0})
    homologado_total = 0.0
    n_concluidas = n_andamento = 0
    concluidas = []
    andamento = []
    for r in lic:
        if r["status"] == "concluida":
            n_concluidas += 1
            mod = r["modalidade"] or "—"
            modalidade_mix[mod]["n"] += 1
            modalidade_mix[mod]["homologado"] += _f(r["valor_homologado"]) or 0
            homologado_total += _f(r["valor_homologado"]) or 0
            concluidas.append({
                "processo": r["processo_numero"], "ano": r["processo_ano"],
                "modalidade": mod, "orgao": r["orgao"], "objeto": r["objeto"],
                "fornecedor": r["razao_social"] if r["doc_tipo"] == "cnpj" else (
                    MASK_PESSOA_FISICA if r["doc_tipo"] == "cpf" else r["razao_social"]),
                "valor_estimado": _f(r["valor_estimado"]),
                "valor_homologado": _f(r["valor_homologado"]),
                "economia": _f(r["economia"]),
                "data": _ts(r["data_conclusao"]),
            })
        else:
            n_andamento += 1
            andamento.append({
                "processo": r["processo_numero"], "ano": r["processo_ano"],
                "modalidade": r["modalidade"], "orgao": r["orgao"],
                "objeto": r["objeto"], "valor_estimado": _f(r["valor_estimado"]),
            })
    concluidas.sort(key=lambda x: -((x["valor_homologado"] or 0)))
    andamento.sort(key=lambda x: -((x["valor_estimado"] or 0)))
    mix = sorted([{"modalidade": k, "n": v["n"], "homologado": round(v["homologado"], 2)}
                  for k, v in modalidade_mix.items()], key=lambda x: -x["homologado"])
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "br", "scale": "city", "place": "recife",
        "unit": "BRL", "as_of": src["as_of"], "source": src,
        "perimeter": (
            "Licitações da Prefeitura do Recife. valor homologado = valor "
            "efetivamente adjudicado. O valor estimado da fonte é pouco "
            "confiável (outliers grosseiros), por isso a 'economia' não é "
            "publicada como métrica."
        ),
        "headline": {
            "n_concluidas": n_concluidas,
            "n_andamento": n_andamento,
            "homologado_total": round(homologado_total, 2),
        },
        "modalidade_mix": mix,
        "concluidas": concluidas[:500],
        "andamento": andamento[:200],
    }


# ---------------------------------------------------------------------------
# places.json — civic facilities directory (geo)
# ---------------------------------------------------------------------------

def build_places(client, log):
    rows_ = rows(client, "mart_br_recife_places", "ORDER BY familia, nome")
    if not rows_:
        raise RuntimeError("mart_br_recife_places is empty")
    fam = defaultdict(int)
    places = []
    for r in rows_:
        fam[r["familia"]] += 1
        places.append({
            "slug": r["slug"], "nome": r["nome"], "familia": r["familia"],
            "tipo": r["tipo"], "lat": _f(r["lat"]), "lon": _f(r["lon"]),
            "bairro": r["bairro"], "endereco": r["endereco"], "detalhe": r["detalhe"],
            "obras_total": _f(r.get("ode_obras_total")), "n_obras": r.get("ode_n_obras"),
        })
    familias = sorted([{"familia": k, "n": v} for k, v in fam.items()], key=lambda x: -x["n"])
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "br", "scale": "city", "place": "recife",
        "source": {"name": rows_[0].get("source_name"), "source_url": rows_[0].get("source_url")},
        "perimeter": (
            "Equipamentos públicos geolocalizados (saúde, educação, cultura, "
            "esporte, praças). Diretório/identidade — os valores gastos por "
            "local exigem um cruzamento com contratos (etapa seguinte)."
        ),
        "count": len(places),
        "familias": familias,
        "places": places,
    }


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def write_json(name, payload, log):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    kb = path.stat().st_size / 1024
    log.success(f"wrote {name}", extra=f"{kb:,.0f} KiB")


def main():
    log = Logger("export_br_recife")
    log.header("Export Recife (dbt_br_marts) → website/public/data/br/recife/")
    client = bigquery.Client(project=PROJECT_ID)

    log.section("budget")
    budget = build_budget(client, log)
    write_json("budget.json", budget, log)

    log.section("quem_recebe")
    qr, recipients, search = build_quem_recebe(client, log)
    write_json("quem_recebe.json", qr, log)
    write_json("recipients.json", recipients, log)
    write_json("quem_recebe_search.json", search, log)

    log.section("contratos")
    contratos = build_contratos(client, log)
    write_json("contratos.json", contratos, log)

    log.section("licitacoes")
    lic = build_licitacoes(client, log)
    write_json("licitacoes.json", lic, log)

    log.section("places")
    write_json("places.json", build_places(client, log), log)
    # place↔obra evidence detail (from the crosswalk cache) — the fiche lists it
    _obras_cache = Path(__file__).parent.parent.parent / "cache" / "enrichment" / "recife_place_obras.json"
    if _obras_cache.exists():
        oc = json.loads(_obras_cache.read_text(encoding="utf-8"))
        write_json("place_obras.json", {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_pipeline": SOURCE_PIPELINE, "unit": "BRL",
            "method": oc.get("method"), "items": oc.get("items", {}),
        }, log)

    log.section("index")
    index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "br", "scale": "city", "place": "recife", "locale": "pt",
        "portal": budget["source"]["portal"],
        "files": {
            "budget": "budget.json",
            "quem_recebe": "quem_recebe.json",
            "recipients": "recipients.json",
            "quem_recebe_search": "quem_recebe_search.json",
            "contratos": "contratos.json",
            "licitacoes": "licitacoes.json",
            "places": "places.json",
        },
    }
    write_json("index.json", index, log)
    log.success("export OK")


if __name__ == "__main__":
    main()
