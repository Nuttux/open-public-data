#!/usr/bin/env python3
"""
Build the `secu` bucket (S1314 — Administrations de Sécurité sociale) of
daily_bread_drilldown.json.

Sources (all already seeded — we read CSV, not invent values):
    pipeline/seeds/seed_apul_subsectors.csv
        rows asso_part_* — level2 share by branch within ASSO (PLFSS 2025).
    pipeline/seeds/seed_ondam_subobjectifs.csv
        level3 for CNAM (ONDAM sub-objectives).
    pipeline/seeds/seed_drees_retraites_branches.csv
        level3 for CNAV (regimes within retirement).
    pipeline/seeds/seed_secu_famille_prestations.csv
        level3 for CNAF (family / housing / RSA / activity bonus).
    pipeline/seeds/seed_unedic_prestations.csv
        level3 for UNEDIC (ARE + others).

Branches without a published level3 (AT-MP + CNSA autonomy, grouped in the
ASSO seed) are emitted with no `level3` key — the UI must show "détail non
disponible — source agrégée seulement".

Output:
    website/public/data/national/_drilldown_secu.json
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
SEEDS_DIR = ROOT / "pipeline" / "seeds"

_KEY_OK = re.compile(r"^[a-z0-9_]+$")


def _read_seed(name: str) -> list[dict]:
    with open(SEEDS_DIR / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _slug(value: str) -> str:
    s = value.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def _level3_from_seed(seed_name: str, key_prefix: str | None = None) -> list[dict]:
    """Convert a stack-style seed (key, label_fr, label_en, share, source,
    source_url, ...) into level3 entries for the drilldown contract.

    Renormalizes shares to sum to 1.0 to absorb seed rounding (each row's
    `share` is published as 2-3 sig figs in the source PDFs).
    """
    rows = _read_seed(seed_name)
    if not rows:
        return []

    total_share = sum(float(r["share"]) for r in rows if r.get("share"))
    if total_share <= 0:
        return []

    out: list[dict] = []
    for r in rows:
        raw_key = r["key"].strip()
        key = f"{key_prefix}_{raw_key}" if key_prefix else raw_key
        key = _slug(key)
        if not _KEY_OK.match(key):
            raise ValueError(f"Bad key {key!r} from seed {seed_name}")
        share = float(r["share"]) / total_share
        out.append({
            "key": key,
            "label_fr": r["label_fr"],
            "label_en": r["label_en"] or r["label_fr"],
            "share_of_parent": round(share, 6),
            "source": r["source"],
            "source_url": r["source_url"],
        })
    return out


# Mapping of asso_part_* row keys to the level2 branches we want to expose.
# The ASSO seed groups AT-MP + autonomy in one row (`asso_part_at_mp_autonomie`)
# so we keep that grain rather than inventing a synthetic split.
LEVEL2_DEFS = [
    # (seed key, drilldown key, label_fr, label_en, level3 seed or None)
    (
        "asso_part_cnam_maladie",
        "cnam_maladie",
        "Assurance maladie (CNAM)",
        "Health insurance (CNAM)",
        "seed_ondam_subobjectifs.csv",
    ),
    (
        "asso_part_cnav_retraites",
        "cnav_retraites",
        "Retraites (CNAV + autres régimes de base)",
        "Pensions (CNAV + other base schemes)",
        "seed_drees_retraites_branches.csv",
    ),
    (
        "asso_part_caf_famille",
        "cnaf_famille",
        "Famille / logement / solidarité (CNAF)",
        "Family / housing / solidarity (CNAF)",
        "seed_secu_famille_prestations.csv",
    ),
    (
        "asso_part_unedic_chomage",
        "unedic_chomage",
        "Assurance chômage (UNEDIC)",
        "Unemployment insurance (UNEDIC)",
        "seed_unedic_prestations.csv",
    ),
    (
        "asso_part_at_mp_autonomie",
        "atmp_autonomie",
        "AT-MP + autonomie (CNSA)",
        "Work injury (AT-MP) + autonomy (CNSA)",
        None,  # no published level3 at this grain in our seeds
    ),
]


def build_secu_bucket() -> dict:
    asso_rows = {r["key"]: r for r in _read_seed("seed_apul_subsectors.csv")}

    # Sanity: verify all expected keys present
    missing = [k for k, *_ in LEVEL2_DEFS if k not in asso_rows]
    if missing:
        raise ValueError(f"seed_apul_subsectors.csv missing rows: {missing}")

    # Renormalize ASSO shares (raw seed sums to 1.00 by construction; PLFSS
    # rounding could leave ±1 % — we still renormalize defensively).
    asso_share_total = sum(
        float(asso_rows[k]["value"]) for k, *_ in LEVEL2_DEFS
    )

    level2: list[dict] = []
    for asso_key, dd_key, lbl_fr, lbl_en, l3_seed in LEVEL2_DEFS:
        row = asso_rows[asso_key]
        raw_share = float(row["value"])
        share = raw_share / asso_share_total

        entry: dict = {
            "key": dd_key,
            "label_fr": lbl_fr,
            "label_en": lbl_en,
            "share_of_parent": round(share, 6),
            "source": row["source"],
            "source_url": row["source_url"],
        }

        if l3_seed:
            l3 = _level3_from_seed(l3_seed, key_prefix=dd_key)
            if l3:
                entry["level3"] = l3
        level2.append(entry)

    # Sort by share desc
    level2.sort(key=lambda x: x["share_of_parent"], reverse=True)

    return {
        "code": "S1314",
        "label_fr": "Sécurité sociale (ASSO)",
        "label_en": "Social security (ASSO)",
        "year": 2024,
        "level2": level2,
        "notes_fr": (
            "level2 = branches ASSO (CNAM / CNAV / CNAF / UNEDIC / AT-MP+CNSA), "
            "shares PLFSS 2025 renormalisés. level3 fourni pour CNAM (sous-"
            "objectifs ONDAM), CNAV (régimes), CNAF (prestations) et UNEDIC ; "
            "AT-MP + autonomie (CNSA) sans level3 publié à ce grain — "
            "détail non disponible côté seeds."
        ),
    }


def main() -> int:
    """Standalone debug entrypoint — prints summary + dumps to stdout if -v."""
    import sys as _sys
    bucket = build_secu_bucket()
    n2 = len(bucket["level2"])
    n3 = sum(len(m.get("level3", [])) for m in bucket["level2"])
    sum2 = sum(m["share_of_parent"] for m in bucket["level2"])
    print(f"[secu] level2={n2} level3_total={n3} sum(level2)={sum2:.4f}")
    if "-v" in _sys.argv:
        json.dump(bucket, _sys.stdout, ensure_ascii=False, indent=2)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
