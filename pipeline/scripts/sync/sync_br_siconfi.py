#!/usr/bin/env python3
"""
Copy the Brazilian long-tail sources from the Base dos Dados public mirror
(BigQuery, US region) into our raw dataset (EU region) — BigQuery cannot read
across regions, so a filtered copy is made in a US scratch dataset, then
copied table by table to raw (EU).

Tables (raw.*):
    br_siconfi_despesas_funcao   SICONFI DCA Anexo I-E, 2017+, three stages, coded contas
    br_bd_municipios             the 5 570 municípios (IBGE code, name, UF, regions)
    br_ibge_populacao            IBGE population estimates per município, 2017+

Usage:
    python pipeline/scripts/sync/sync_br_siconfi.py
Then: dbt build --select stg_br_siconfi_despesas_funcao+ stg_br_municipios+
"""

import subprocess
import sys

PROJECT = "open-data-france-484717"
TMP = "raw_us_tmp"
RAW = "raw"

QUERIES = {
    "br_siconfi_despesas_funcao": (
        "SELECT ano, sigla_uf, id_municipio, estagio, portaria, conta, id_conta_bd, conta_bd, valor "
        "FROM `basedosdados.br_me_siconfi.municipio_despesas_funcao` "
        "WHERE ano >= 2017 AND id_conta_bd IS NOT NULL "
        "AND estagio IN ('Despesas Empenhadas', 'Despesas Liquidadas', 'Despesas Pagas')"
    ),
    "br_bd_municipios": (
        "SELECT id_municipio, id_municipio_6, nome, capital_uf, id_uf, sigla_uf, nome_uf, nome_regiao, "
        "nome_mesorregiao, nome_microrregiao, nome_regiao_metropolitana "
        "FROM `basedosdados.br_bd_diretorios_brasil.municipio`"
    ),
    "br_ibge_populacao": (
        "SELECT ano, sigla_uf, id_municipio, populacao FROM `basedosdados.br_ibge_populacao.municipio` WHERE ano >= 2017"
    ),
}


def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd[:6]), "…" if len(cmd) > 6 else "")
    subprocess.run(cmd, check=True)


def main() -> int:
    subprocess.run(["bq", "mk", "--location=US", "-d", f"{PROJECT}:{TMP}"], check=False, capture_output=True)
    for table, sql in QUERIES.items():
        run(["bq", "query", "--use_legacy_sql=false", "--location=US", "--replace",
             f"--destination_table={PROJECT}:{TMP}.{table}", sql])
        run(["bq", "cp", "-f", f"{PROJECT}:{TMP}.{table}", f"{PROJECT}:{RAW}.{table}"])
    print("done: raw.br_siconfi_despesas_funcao, raw.br_bd_municipios, raw.br_ibge_populacao")
    return 0


if __name__ == "__main__":
    sys.exit(main())
