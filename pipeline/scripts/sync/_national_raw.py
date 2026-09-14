"""
Chargement sûr des tables raw_national — le socle commun des chargeurs nationaux.

POURQUOI (2026-09-14). Les chargeurs annuels (DGFiP, OFGL, REI, Fonds vert)
faisaient `bq load --replace` sur leur première année : relancés tels quels,
ils effaçaient l'historique. Ils figeaient aussi leurs années (LATEST_YEARS =
[2024, 2023]) : la DGFiP a publié les balances 2025 des communes et l'OFGL ses
agrégats 2025 sans qu'aucun ne soit chargé, et l'OFGL 2024 était tronqué dans
la table (1,12 M de lignes pour 1,70 M publiées). Ce module donne deux gestes,
et seulement deux, pour écrire dans raw_national :

  replace_year     remplace UNE année d'une table multi-années. Le fichier est
                   chargé dans une table temporaire ; son nombre de lignes doit
                   égaler celui annoncé par la source ; il doit peser au moins
                   MIN_KEEP_RATIO des lignes qu'il remplace ; alors seulement,
                   une transaction supprime l'année et insère la nouvelle. Les
                   autres années ne sont jamais touchées.

  replace_snapshot remplace une table qui est un état courant (répertoire des
                   élus, stock SIRENE) : même table temporaire, même garde de
                   volume, puis `bq cp -f` et l'empreinte de la version source
                   écrite dans la description de la table.

Chaque changement effectif est annoncé sur une ligne `NATIONAL CHANGED <table>`
et, si NATIONAL_CHANGES_FILE est défini, ajouté à ce fichier : c'est ce que lit
run_national.sh --cadence=annual pour savoir quoi reconstruire.

NATIONAL_RAW_DATASET permet de viser un jeu de test (jamais pour contourner une
garde : les gardes sont les mêmes partout).
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

PROJECT_ID = "open-data-france-484717"
DATASET_ID = os.environ.get("NATIONAL_RAW_DATASET", "raw_national")
MIN_KEEP_RATIO = 0.9


class GuardError(SystemExit):
    """Une garde a refusé d'écrire : la table reste telle qu'elle était."""


def bq(*args: str, capture: bool = False) -> str:
    res = subprocess.run(
        ["bq", f"--project_id={PROJECT_ID}", *args],
        check=True, capture_output=capture, text=True,
    )
    return res.stdout if capture else ""


def fq(table: str) -> str:
    return f"`{PROJECT_ID}.{DATASET_ID}.{table}`"


def table_info(table: str) -> dict | None:
    try:
        out = bq("show", "--format=json", f"{DATASET_ID}.{table}", capture=True)
    except subprocess.CalledProcessError:
        return None
    info = json.loads(out[out.index("{"):])
    fields = [f["name"] for f in info.get("schema", {}).get("fields", [])]
    return {"rows": int(info.get("numRows", 0)), "description": info.get("description") or "", "fields": fields}


def query(sql: str) -> list[dict]:
    out = bq("query", "--use_legacy_sql=false", "--format=json", "--max_rows=100000", sql, capture=True)
    out = out[out.index("["):] if "[" in out else "[]"
    return json.loads(out)


def rows_by_year(table: str, year_col: str) -> dict[int, int]:
    """Lignes par année dans la table ({} si la table n'existe pas)."""
    if table_info(table) is None:
        return {}
    return {int(r["y"]): int(r["n"]) for r in query(
        f"SELECT {year_col} AS y, COUNT(*) AS n FROM {fq(table)} WHERE {year_col} IS NOT NULL GROUP BY 1"
    )}


def meta(table: str) -> dict:
    """Empreintes de version rangées en JSON dans la description ({} sinon)."""
    info = table_info(table)
    if not info:
        return {}
    try:
        d = json.loads(info["description"])
        return d if isinstance(d, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def set_meta(table: str, data: dict) -> None:
    bq("update", "--description", json.dumps(data, ensure_ascii=False, sort_keys=True), f"{DATASET_ID}.{table}")


def announce(table: str, detail: str) -> None:
    print(f"NATIONAL CHANGED {table} ({detail})")
    path = os.environ.get("NATIONAL_CHANGES_FILE")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(table + "\n")


def _load_temp(temp: str, path: Path, schema: str, load_args: tuple[str, ...]) -> int:
    print(f"  bq load → {DATASET_ID}.{temp}")
    bq("load", "--replace", *load_args, f"{DATASET_ID}.{temp}", str(path), *([schema] if schema else []))
    info = table_info(temp)
    return info["rows"] if info else 0


def replace_year(
    table: str, year_col: str, year: int, path: Path, schema: str, *,
    expected_rows: int, load_args: tuple[str, ...] = (), force: bool = False,
) -> None:
    """Remplace l'année `year` de `table` par le fichier `path`, sans toucher aux autres."""
    before = rows_by_year(table, year_col).get(year, 0)
    temp = f"{table}__annee_{year}"
    loaded = _load_temp(temp, path, schema, load_args)
    if loaded != expected_rows:
        raise GuardError(
            f"✗ [{table} {year}] {loaded:,} lignes chargées pour {expected_rows:,} annoncées par la source "
            f"— table temporaire {temp} laissée pour examen, {table} inchangée."
        )
    if before and loaded < MIN_KEEP_RATIO * before and not force:
        bq("rm", "-f", "-t", f"{DATASET_ID}.{temp}")
        raise GuardError(
            f"✗ [{table} {year}] {loaded:,} lignes contre {before:,} aujourd'hui (< {MIN_KEEP_RATIO:.0%}) : "
            "source en baisse ou tronquée, on n'écrase pas. --force pour passer outre."
        )
    cols = ", ".join(f"`{c}`" for c in table_info(temp)["fields"]) if table_info(table) else "*"
    if table_info(table) is None:
        bq("cp", "-f", f"{DATASET_ID}.{temp}", f"{DATASET_ID}.{table}")
    else:
        bq("query", "--use_legacy_sql=false",
           f"BEGIN TRANSACTION; "
           f"DELETE FROM {fq(table)} WHERE {year_col} = {year}; "
           f"INSERT INTO {fq(table)} ({cols}) SELECT {cols} FROM {fq(temp)}; "
           f"COMMIT TRANSACTION;")
    after = rows_by_year(table, year_col).get(year, 0)
    bq("rm", "-f", "-t", f"{DATASET_ID}.{temp}")
    if after != loaded:
        raise GuardError(f"✗ [{table} {year}] {after:,} lignes après remplacement pour {loaded:,} chargées.")
    announce(table, f"{year} : {before:,} → {after:,} lignes")


def replace_snapshot(
    table: str, path: Path, schema: str, *, version: dict,
    load_args: tuple[str, ...] = (), force: bool = False,
) -> bool:
    """Remplace une table-état si la version source a changé. Renvoie True si écrit."""
    info = table_info(table)
    if info and meta(table).get("version") == version and not force:
        print(f"  = {table} : version source inchangée ({info['rows']:,} lignes) — rien à faire")
        return False
    temp = f"{table}__nouveau"
    loaded = _load_temp(temp, path, schema, load_args)
    if loaded <= 0:
        raise GuardError(f"✗ [{table}] fichier vide — table inchangée, {temp} laissée pour examen.")
    if info and loaded < MIN_KEEP_RATIO * info["rows"] and not force:
        bq("rm", "-f", "-t", f"{DATASET_ID}.{temp}")
        raise GuardError(
            f"✗ [{table}] {loaded:,} lignes contre {info['rows']:,} aujourd'hui (< {MIN_KEEP_RATIO:.0%}) : "
            "on n'écrase pas. --force pour passer outre."
        )
    bq("cp", "-f", f"{DATASET_ID}.{temp}", f"{DATASET_ID}.{table}")
    bq("rm", "-f", "-t", f"{DATASET_ID}.{temp}")
    set_meta(table, {"version": version})
    announce(table, f"{info['rows'] if info else 0:,} → {loaded:,} lignes")
    return True


def is_version_current(table: str, version: dict) -> bool:
    return meta(table).get("version") == version
