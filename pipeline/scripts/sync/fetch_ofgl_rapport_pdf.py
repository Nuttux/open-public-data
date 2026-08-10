#!/usr/bin/env python3
"""
Fetch the OFGL annual rapport PDF and extract the unified fonctionnelle
ventilation tables (annexe 2F, tables F1, F3, F4) for the bloc communal,
the départements, and the régions+CTU.

Source:
    https://www.collectivites-locales.gouv.fr/etudes-et-statistiques/
        rapports-de-lobservatoire-des-finances-et-de-la-gestion-publique-locales-ofgl
    PDF: Rapport OFGL 2025 (data 2024), annexe 2F.

Why this script:
    - OFGL ne publie pas de dataset open-data fonctionnelle pour
      les régions ni les communes (seulement pour les départements).
    - Le rapport annuel OFGL contient la **nomenclature commune 9 groupes
      / 34 agrégats** harmonisée pour les 3 niveaux de collectivités —
      c'est la seule source qui permet une présentation cohérente.
    - On extrait le texte du PDF avec pdftotext (-layout), on parse les
      tables F1/F3/F4, et on en dérive un raw JSON (cache) + des seeds
      CSV pour le pipeline.

Output:
    pipeline/cache/ofgl_rapport_2025/rapport_2025_full.pdf  (raw download)
    pipeline/cache/ofgl_rapport_2025/full.txt               (pdftotext)
    pipeline/cache/ofgl_rapport_2025/extracted.json         (structured)
    pipeline/seeds/seed_ofgl_local_<scope>_l2.csv           (3 fichiers)
    pipeline/seeds/seed_ofgl_local_<scope>_l3_<groupe>.csv  (~27 fichiers)

Usage:
    python pipeline/scripts/sync/fetch_ofgl_rapport_pdf.py
    python pipeline/scripts/sync/fetch_ofgl_rapport_pdf.py --skip-download
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "ofgl_rapport_2025"
SEEDS = ROOT / "pipeline" / "seeds"

# Direct URL for the full rapport PDF (DGCL collectivités-locales site).
RAPPORT_URL = (
    "https://www.collectivites-locales.gouv.fr/files/files/Etudes-et-statistiques/"
    "OFGL/rapport%202025/Rapport%20OFGL%202025_v0930.pdf"
)
RAPPORT_PUBLIC_PAGE = (
    "https://www.collectivites-locales.gouv.fr/etudes-et-statistiques/"
    "rapports-de-lobservatoire-des-finances-et-de-la-gestion-publique-locales-ofgl"
)
RAPPORT_YEAR_OF_DATA = 2024  # exer du rapport 2025
RAPPORT_EDITION = "2025"

PDF_PATH = CACHE / "rapport_2025_full.pdf"
TEXT_PATH = CACHE / "full.txt"
EXTRACT_PATH = CACHE / "extracted.json"

# The 9 OFGL "groupes" common across M14/M52/M71. Order matters — matches
# the table layout. Keys are stable slugs used in seed file names.
GROUPES: list[tuple[str, str, str]] = [
    ("services_generaux", "Services généraux", "General administration"),
    ("securite_salubrite", "Sécurité et salubrité publiques", "Security & public hygiene"),
    ("enseignement_formation", "Enseignement, formation et apprentissage", "Education, training & apprenticeship"),
    ("culture_sport_jeunesse", "Culture, vie sociale, sport et jeunesse", "Culture, social life, sport & youth"),
    ("sante_action_sociale", "Santé, action sociale", "Health & social action"),
    ("amenagement_habitat", "Aménagement des territoires et habitat", "Territorial planning & housing"),
    ("environnement", "Environnement", "Environment"),
    ("transports_routes_voiries", "Transports, routes et voiries", "Transport, roads & infrastructure"),
    ("action_economique", "Action économique", "Economic action"),
]

# Set of known parent labels for fast lookup.
GROUPE_LABELS: set[str] = {label_fr for _, label_fr, _ in GROUPES}

# Mapping FR -> (key, EN) for output.
GROUPE_BY_LABEL: dict[str, tuple[str, str]] = {
    label_fr: (key, label_en) for key, label_fr, label_en in GROUPES
}

# Each table starts with its F-marker and ends at "TOTAL".
TABLES = [
    {"scope": "commune", "marker": "F1.", "label_match": "Communes de 3 500"},
    {"scope": "dept", "marker": "F3.", "label_match": "Départements"},
    {"scope": "region", "marker": "F4.", "label_match": "Régions et CTU"},
]

# A pdftotext -layout data row is reliably space-aligned: 7 columns
# separated by runs of ≥ 2 spaces. We split on `\s{2,}` and validate that
# the last column is an evolution percentage and the second-to-last is a
# share-of-budget percentage. Everything before the 6 numeric columns is
# the label.
PCT_RE = re.compile(r"^[+-]?[\d ]+,\d+\s*%$")
INT_RE = re.compile(r"^-?[\d ]+$")

# Lines whose stripped label starts with one of these are skipped:
#   "dont :" / "dont:"  → first row of a level4 breakdown
#   ":"                 → continuation rows (e.g. "   : famille et enfance")
#   header / footer noise.
SKIP_PREFIXES = ("dont :", "dont:", ":", "Source", "(1)", "Plan de relance")


def _to_int(s: str) -> int:
    """Parse '20 796' -> 20796. Returns 0 for '-' or empty."""
    s = s.strip()
    if not s or s == "-":
        return 0
    return int(re.sub(r"\s+", "", s))


def _slug(value: str) -> str:
    s = value.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def download_rapport() -> None:
    """Download the rapport PDF if not already cached."""
    CACHE.mkdir(parents=True, exist_ok=True)
    if PDF_PATH.exists() and PDF_PATH.stat().st_size > 1_000_000:
        print(f"[ofgl] cached: {PDF_PATH.relative_to(ROOT)}")
        return
    print(f"[ofgl] downloading {RAPPORT_URL} …")
    r = requests.get(RAPPORT_URL, timeout=120)
    r.raise_for_status()
    with open(PDF_PATH, "wb") as f:
        f.write(r.content)
    print(f"[ofgl] wrote {PDF_PATH.relative_to(ROOT)} ({len(r.content):,} bytes)")


def extract_text() -> None:
    """Run pdftotext -layout on the rapport PDF."""
    if not shutil.which("pdftotext"):
        sys.exit("pdftotext not found — install poppler (`brew install poppler`).")
    print(f"[ofgl] extracting text via pdftotext -layout …")
    subprocess.run(
        ["pdftotext", "-layout", str(PDF_PATH), str(TEXT_PATH)],
        check=False,  # pdftotext prints a benign warning on this PDF
    )
    print(f"[ofgl] wrote {TEXT_PATH.relative_to(ROOT)}")


def _parse_data_line(line: str) -> dict | None:
    """Split a data row into {label, fonct, inv, total, eur_hab, part, evol}.

    Returns None if the line is not a data row.
    """
    parts = re.split(r"\s{2,}", line.strip())
    # Need at least 7 columns and last 2 must be percentages.
    if len(parts) < 7:
        return None
    if not PCT_RE.match(parts[-1]) or not PCT_RE.match(parts[-2]):
        return None
    if not INT_RE.match(parts[-3]):  # eur_hab
        return None
    # Some rows have empty fields collapsed (e.g. APA agrégats with empty
    # investissement column). We accept either:
    #   parts[-6:] = [fonct, inv, total, eur_hab, part, evol]  (7+ cols)
    #   parts[-5:] = [fonct, total, eur_hab, part, evol]       (6 cols)
    if len(parts) >= 7 and INT_RE.match(parts[-6]):
        fonct = parts[-6]
        inv = parts[-5]
        total = parts[-4]
        label = " ".join(parts[:-6]).strip()
    elif INT_RE.match(parts[-5]):
        fonct = parts[-5]
        inv = "0"
        total = parts[-4]
        label = " ".join(parts[:-5]).strip()
    else:
        return None
    if not label:
        return None
    return {
        "label_fr": re.sub(r"\s+", " ", label),
        "fonct_meur": _to_int(fonct),
        "inv_meur": _to_int(inv),
        "total_meur": _to_int(total),
        "eur_hab": _to_int(parts[-3]),
        "part_pct": float(parts[-2].replace(" ", "").replace(",", ".").rstrip("%")),
        "evol_pct": float(parts[-1].replace(" ", "").replace(",", ".").rstrip("%").lstrip("+")),
    }


def find_and_parse_table(lines: list[str], marker: str, label_match: str) -> list[dict]:
    """Locate a table by F-marker and parse its rows up to TOTAL.

    Strategy: scan forward from each occurrence of the marker; collect
    consecutive data rows; pick the longest run as the table body.
    """
    candidates: list[list[dict]] = []
    for i, ln in enumerate(lines):
        if not ln.lstrip().startswith(marker) or label_match not in ln:
            continue
        rows: list[dict] = []
        # Walk up to ~120 lines forward (tables are <100 rows in practice).
        for j in range(i + 1, min(i + 120, len(lines))):
            stripped = lines[j].strip()
            if stripped.startswith("TOTAL"):
                break
            if not stripped:
                continue
            if any(stripped.startswith(p) for p in SKIP_PREFIXES):
                continue
            row = _parse_data_line(lines[j])
            if row is not None:
                rows.append(row)
        candidates.append(rows)
    if not candidates:
        raise RuntimeError(f"Table {marker} not found.")
    return max(candidates, key=len)


def split_groupes_agregats(rows: list[dict]) -> list[dict]:
    """Walk the parsed rows and identify groupes (parents) vs agrégats (children).

    A row is a groupe if its label exactly matches one of the 9 OFGL group labels.
    Otherwise it's an agrégat assigned to the most recent groupe.
    """
    out: list[dict] = []
    current: dict | None = None
    for r in rows:
        if r["label_fr"] in GROUPE_LABELS:
            key, label_en = GROUPE_BY_LABEL[r["label_fr"]]
            current = {
                "key": key,
                "label_fr": r["label_fr"],
                "label_en": label_en,
                "total_meur": r["total_meur"],
                "part_of_total": r["part_pct"] / 100.0,
                "agregats": [],
            }
            out.append(current)
        else:
            if current is None:
                continue
            agr_key = _slug(r["label_fr"])[:60]
            current["agregats"].append({
                "key": agr_key,
                "label_fr": r["label_fr"],
                "total_meur": r["total_meur"],
            })
    return out


def normalize_shares(groupes: list[dict]) -> list[dict]:
    """Compute share_of_groupe for each agrégat, share_of_total for groupe."""
    grand_total = sum(g["total_meur"] for g in groupes)
    if grand_total <= 0:
        raise RuntimeError("Grand total is zero.")
    for g in groupes:
        g["share_of_total"] = g["total_meur"] / grand_total
        g_total = sum(a["total_meur"] for a in g["agregats"])
        if g_total <= 0:
            for a in g["agregats"]:
                a["share_of_groupe"] = 0.0
            continue
        for a in g["agregats"]:
            a["share_of_groupe"] = a["total_meur"] / g_total
    return groupes


def write_seed_l2(scope: str, groupes: list[dict]) -> Path:
    """Write seed_ofgl_local_<scope>_l2.csv — 9 lines (one per groupe)."""
    path = SEEDS / f"seed_ofgl_local_{scope}_l2.csv"
    notes_default = (
        f"OFGL Rapport {RAPPORT_EDITION} – Annexe 2F (nomenclature commune "
        f"9 groupes M14/M52/M71). Données {RAPPORT_YEAR_OF_DATA}. "
        f"Total {scope}, fonctionnement (hors charges fi.) + investissement (hors remb.)."
    )
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "key", "label_fr", "label_en", "share",
            "source", "source_url", "date_reference", "notes",
        ])
        for g in groupes:
            w.writerow([
                g["key"],
                g["label_fr"],
                g["label_en"],
                f"{g['share_of_total']:.6f}",
                f"DGCL/OFGL — Rapport {RAPPORT_EDITION} (annexe 2F, fonctionnelle commune)",
                RAPPORT_PUBLIC_PAGE,
                f"{RAPPORT_YEAR_OF_DATA}-12-31",
                notes_default,
            ])
    return path


def write_seed_l3(scope: str, groupe: dict) -> Path | None:
    """Write seed_ofgl_local_<scope>_l3_<groupe>.csv. Returns None if no agrégats."""
    agrs = [a for a in groupe["agregats"] if a["total_meur"] > 0]
    if not agrs:
        return None
    # Drop noise (<0.5 % of groupe). Renormalise on kept rows.
    kept = [a for a in agrs if a["share_of_groupe"] >= 0.005]
    if not kept:
        kept = agrs
    kept_total = sum(a["total_meur"] for a in kept)
    path = SEEDS / f"seed_ofgl_local_{scope}_l3_{groupe['key']}.csv"
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "key", "label_fr", "label_en", "share",
            "source", "source_url", "date_reference", "notes",
        ])
        for a in kept:
            share = a["total_meur"] / kept_total
            w.writerow([
                a["key"],
                a["label_fr"],
                a["label_fr"],  # EN = FR for level3 (OFGL ne publie qu'en FR ; trad EN à itérer)
                f"{share:.6f}",
                f"DGCL/OFGL — Rapport {RAPPORT_EDITION} (annexe 2F, agrégat sous «{groupe['label_fr']}»)",
                RAPPORT_PUBLIC_PAGE,
                f"{RAPPORT_YEAR_OF_DATA}-12-31",
                f"Sous-agrégat OFGL du groupe «{groupe['label_fr']}», données {RAPPORT_YEAR_OF_DATA}, "
                f"total {a['total_meur']} M€.",
            ])
    return path


def cleanup_legacy_seeds() -> int:
    """Remove the previous-generation seeds we are replacing."""
    legacy_globs = [
        "seed_ofgl_communes_fonctionnelle.csv",
        "seed_ofgl_departements_fonctionnelle.csv",
        "seed_ofgl_regions_fonctionnelle.csv",
        "seed_ofgl_dept_l3_*.csv",
    ]
    n = 0
    for pat in legacy_globs:
        for p in SEEDS.glob(pat):
            p.unlink()
            print(f"  · removed legacy seed: {p.name}")
            n += 1
    return n


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--skip-download", action="store_true",
                   help="Use cached PDF + text instead of re-downloading.")
    p.add_argument("--keep-legacy", action="store_true",
                   help="Do not delete the previous-generation seeds.")
    args = p.parse_args()

    if not args.skip_download:
        download_rapport()
    if not TEXT_PATH.exists() or args.skip_download is False:
        extract_text()
    text = TEXT_PATH.read_text(encoding="utf-8")
    lines = text.split("\n")
    print(f"[ofgl] text size: {len(text):,} chars · {len(lines):,} lines")

    extracted: dict[str, dict] = {
        "edition": RAPPORT_EDITION,
        "year_of_data": RAPPORT_YEAR_OF_DATA,
        "source_pdf": str(PDF_PATH.relative_to(ROOT)),
        "source_url": RAPPORT_URL,
        "scopes": {},
    }

    for table in TABLES:
        scope = table["scope"]
        rows = find_and_parse_table(lines, table["marker"], table["label_match"])
        groupes = split_groupes_agregats(rows)
        if len(groupes) != 9:
            print(
                f"[warn] {scope}: expected 9 groupes, got {len(groupes)}. "
                f"Parsed labels: {[g['label_fr'] for g in groupes]}"
            )
        groupes = normalize_shares(groupes)
        extracted["scopes"][scope] = {
            "table_marker": table["marker"],
            "groupes": groupes,
        }
        n_agr = sum(len(g["agregats"]) for g in groupes)
        print(f"[ofgl] {scope}: {len(groupes)} groupes · {n_agr} agrégats parsed.")

    EXTRACT_PATH.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ofgl] extracted JSON → {EXTRACT_PATH.relative_to(ROOT)}")

    SEEDS.mkdir(parents=True, exist_ok=True)
    if not args.keep_legacy:
        cleanup_legacy_seeds()

    for scope, payload in extracted["scopes"].items():
        l2_path = write_seed_l2(scope, payload["groupes"])
        print(f"  · {scope} l2 → {l2_path.relative_to(ROOT)}  ({len(payload['groupes'])} groupes)")
        for g in payload["groupes"]:
            l3_path = write_seed_l3(scope, g)
            if l3_path:
                print(
                    f"    · l3 [{g['key']:25s}] {len(g['agregats'])} agrégats → "
                    f"{l3_path.relative_to(ROOT)}"
                )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
