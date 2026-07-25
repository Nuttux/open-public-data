#!/usr/bin/env python3
"""
Recon: does PNCP (Lei 14.133) carry the procurement money Recife's own portal
stopped publishing after 2021?

WHY
    Recife's CKAN `contratos` dataset has `valorcontrato1` populated through
    2021 and then effectively empty (98.5% missing in 2022 … 100% in 2025).
    Lei 14.133/2021 makes publication on the Portal Nacional de Contratações
    Públicas mandatory for municipalities — a contract is only legally
    effective once published there — so PNCP is where the money should be.

WHY NOT pncp.gov.br
    That host is unreachable from Europe. Verified 2026-07-25 from a French
    residential IP, both inside and outside the tool sandbox: connection
    refused / timeout, single A record 189.9.176.245. It is not a sandbox
    artifact. To hit pncp.gov.br directly you need egress from Brazil (a VM in
    GCP southamerica-east1 / AWS sa-east-1, or a BR VPN) — see --base.

    We therefore default to the Compras.gov.br open-data mirror, which
    re-serves the PNCP Lei 14.133 procurement records and IS reachable.

⚠ RESULT OF THAT ATTEMPT — THE MIRROR IS A DEAD END FOR MUNICIPALITIES
    Measured 2026-07-25, sweeping all modalidades for Recife (IBGE 2611606),
    publication year 2024: 5 880 contratações returned, and **zero municipal**.
    Breakdown by esfera was F=5 720, E=144, N=16 (Sistema S). The top
    contracting entities were COMANDO DO EXERCITO, JUSTIÇA FEDERAL, UFRPE,
    UFPE, FIOCRUZ… Not one row named Recife as the contracting entity.

    Reading: dadosabertos.compras.gov.br re-serves only bodies that transact
    through the FEDERAL SIASG/Compras.gov.br system. Recife's Prefeitura
    publishes straight to PNCP, so it never appears here. The IBGE filter
    matched federal units that merely SIT in Recife.

    Encouraging detail: 90.3 % of those rows DO carry a non-zero
    valorTotalHomologado — so the money field is reliably populated in
    PNCP-sourced records. The obstacle is reach, not data quality.

    ⇒ To get Recife's own procurement money you MUST hit pncp.gov.br from a
      Brazilian egress (--base, plus a VM in southamerica-east1 / sa-east-1).
      Do not spend more time on the mirror.

SCOPE CAVEAT
    This endpoint serves CONTRATAÇÕES — the procurement process and its
    awarded value (`valorTotalHomologado`). That is the analogue of our
    `licitacoes`, NOT of our `contratos`. The per-contract ceiling lives on
    pncp.gov.br's /v1/contratos. So a good result here proves AWARDED amounts
    are recoverable for 2021+, not yet that contract ceilings are.

API QUIRKS (learned the hard way, 2026-07-25)
    - `tamanhoPagina` must be 10..500; anything else → 400.
    - `codigoModalidade` is REQUIRED, so we sweep it.
    - The server intermittently returns HTTP 400 with body "Could not open JPA
      EntityManager for transaction". That is a SERVER-SIDE DB failure, not a
      bad request — the identical call succeeds on retry. We therefore retry
      it with backoff, and never treat it as "this modalidade is invalid".
      (Real parameter errors return a short, specific message instead.)
    - `unidadeOrgaoCodigoIbge` filters by where the UNIT SITS, not by who is
      contracting — federal bodies located in Recife match too. Always split
      on `orgaoEntidadeEsferaId` / `orgaoEntidadeCnpj`.

USAGE
    python probe_pncp_recife.py                      # 2021-2026, all modalidades
    python probe_pncp_recife.py --anos 2023 2024
    python probe_pncp_recife.py --base https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
    Results are cached per (ano, modalidade) under --cache, so re-running after
    an interruption resumes instead of re-fetching.
"""
from __future__ import annotations

import argparse
import collections
import functools
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

print = functools.partial(print, flush=True)  # noqa: A001 — long sweep, keep progress visible

DEFAULT_BASE = ("https://dadosabertos.compras.gov.br/modulo-contratacoes/"
                "1_consultarContratacoes_PNCP_14133")
IBGE_RECIFE = 2611606
CNPJ_PREFEITURA = "10565000000192"   # Município do Recife
PAGE = 500
TIMEOUT = 120
RETRIES = 5
MODALIDADES = list(range(1, 15))

# Body fragments that mean "server hiccup, retry" rather than "your request is wrong".
TRANSIENT = ("entitymanager", "jpa", "timeout", "connection", "temporarily")


def fetch(base: str, params: dict) -> dict | None:
    url = f"{base}?{urllib.parse.urlencode(params)}"
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", "replace")[:200]
            except Exception:  # noqa: BLE001
                pass
            transient = any(t in body.lower() for t in TRANSIENT)
            if not transient and e.code < 500:
                print(f"      ! HTTP {e.code} (permanent): {body[:110]}")
                return None
            if attempt == RETRIES:
                print(f"      ! HTTP {e.code} after {RETRIES} tries: {body[:80]}")
                return None
            time.sleep(min(3 * attempt, 20))
        except Exception as e:  # noqa: BLE001
            if attempt == RETRIES:
                print(f"      ! {type(e).__name__}: {e}")
                return None
            time.sleep(min(3 * attempt, 20))
    return None


def sweep(base: str, ano: int, mod: int) -> list[dict]:
    rows: list[dict] = []
    page = 1
    while True:
        d = fetch(base, {
            "dataPublicacaoPncpInicial": f"{ano}-01-01",
            "dataPublicacaoPncpFinal": f"{ano}-12-31",
            "codigoModalidade": mod,
            "unidadeOrgaoCodigoIbge": IBGE_RECIFE,
            "pagina": page,
            "tamanhoPagina": PAGE,
        })
        if not d:
            break
        batch = d.get("resultado") or []
        rows.extend(batch)
        if page >= (d.get("totalPaginas") or 1) or not batch:
            break
        page += 1
    return rows


def money(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--anos", nargs="+", type=int,
                    default=[2021, 2022, 2023, 2024, 2025, 2026])
    ap.add_argument("--base", default=DEFAULT_BASE,
                    help="override to hit pncp.gov.br directly from a BR egress")
    ap.add_argument("--cache", default="pncp_cache")
    ap.add_argument("--out", default="pncp_recife_recon.json")
    args = ap.parse_args()

    os.makedirs(args.cache, exist_ok=True)
    all_rows: list[dict] = []

    for ano in args.anos:
        print(f"\n=== {ano} ===")
        for mod in MODALIDADES:
            cf = os.path.join(args.cache, f"{ano}_{mod}.json")
            if os.path.exists(cf):                      # resume
                rows = json.load(open(cf, encoding="utf-8"))
                print(f"  mod {mod:>2}: {len(rows):>6} (cached)")
            else:
                rows = sweep(args.base, ano, mod)
                json.dump(rows, open(cf, "w", encoding="utf-8"), ensure_ascii=False)
                if rows:
                    nome = rows[0].get("modalidadeNome", "?")
                    print(f"  mod {mod:>2}: {len(rows):>6}  {nome}")
            all_rows.extend(rows)

    print("\n" + "=" * 74)
    print(f"TOTAL rows: {len(all_rows)}")
    if not all_rows:
        print("No data — check connectivity.")
        return

    print(f"by esfera: {dict(collections.Counter(r.get('orgaoEntidadeEsferaId') for r in all_rows))}")
    muni = [r for r in all_rows if r.get("orgaoEntidadeEsferaId") == "M"]
    pref = [r for r in all_rows if r.get("orgaoEntidadeCnpj") == CNPJ_PREFEITURA]
    print(f"municipal rows: {len(muni)}   |   Prefeitura ({CNPJ_PREFEITURA}) rows: {len(pref)}")

    print("\n--- municipal contracting entities ---")
    ent = collections.defaultdict(lambda: {"n": 0, "hom": 0.0, "nome": ""})
    for r in muni:
        e = ent[r.get("orgaoEntidadeCnpj")]
        e["n"] += 1
        e["hom"] += money(r.get("valorTotalHomologado"))
        e["nome"] = r.get("orgaoEntidadeRazaoSocial") or ""
    for cnpj, v in sorted(ent.items(), key=lambda x: -x[1]["n"])[:15]:
        star = " ←PREFEITURA" if cnpj == CNPJ_PREFEITURA else ""
        print(f"  {cnpj}  n={v['n']:>5}  R$ {v['hom']:>18,.2f}  {v['nome'][:40]}{star}")

    # THE question: is the money actually populated, by year?
    for label, rows in (("MUNICIPAL (all entities)", muni), ("PREFEITURA only", pref)):
        if not rows:
            continue
        print(f"\n--- money coverage — {label} ---")
        print(f"{'ano':>6} {'n':>7} {'c/ valor':>9} {'%':>7}   {'soma homologado':>22}")
        per = collections.defaultdict(lambda: [0, 0, 0.0])
        for r in rows:
            s = per[r.get("anoCompraPncp")]
            s[0] += 1
            if money(r.get("valorTotalHomologado")) > 0:
                s[1] += 1
                s[2] += money(r.get("valorTotalHomologado"))
        for y in sorted(k for k in per if k):
            n, c, tot = per[y]
            print(f"{y:>6} {n:>7} {c:>9} {100*c/n if n else 0:>6.1f}%   R$ {tot:>19,.2f}")

    json.dump(all_rows, open(args.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\nraw rows → {args.out}   (cache: {args.cache}/)")


if __name__ == "__main__":
    main()
