#!/usr/bin/env python3
"""
Build the `etat` bucket of daily_bread_drilldown.json.

Reads:
    website/public/data/national/etat_lfi_2025.json (already synced from
    data.economie.gouv.fr — plf25-depenses-2025-selon-destination)

Emits a structure conforming to the drilldown contract:
    {
      "code": "S1311",
      "label_fr": "État central",
      "label_en": "Central state",
      "level2": [
        { "key": "ec", "label_fr": "...", "label_en": "...",
          "share_of_parent": 0.1987, "source": "...", "source_url": "...",
          "level3": [ {"key": "ec_140", ...}, ... ] }
      ]
    }

Strategy:
- level2 = missions (PLF) excluding "Remboursements et dégrèvements" (RD)
  because the BG NET total excludes RD by construction (bg_net_cp == sum(missions ex-RD)).
- level3 = programmes inside each mission, share_of_parent = programme.cp / mission.cp.
- Mission/programme codes are normalized into slug-safe `key`s:
    mission key  : <code>            (e.g. "EC" -> "ec")
    programme key: <code>_<programme> (e.g. "EC_140" -> "ec_140")

Source provenance carries through from etat_lfi_2025.json
(`source` + `source_url`).

Usage:
    python pipeline/scripts/enrich/build_drilldown_etat.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
NATIONAL_DIR = ROOT / "website" / "public" / "data" / "national"

# Local sibling import so this module remains runnable standalone.
sys.path.insert(0, str(Path(__file__).parent))
from build_drilldown_etat_actions import build_etat_actions_index  # noqa: E402


# Mission code -> English label. Keys are PLF mission codes (alpha pair).
# Curated translation of the official French mission labels.
MISSION_LABEL_EN: dict[str, str] = {
    "RD": "Tax refunds & rebates",
    "EC": "Public schooling",
    "EB": "Government debt service & financial commitments",
    "DA": "Defense",
    "RA": "Research & higher education",
    "SE": "Solidarity, integration & equal opportunity",
    "SB": "Public security",
    "VA": "Territorial cohesion",
    "TB": "Labor, employment & social ministries",
    "TA": "Ecology, sustainable development & mobility",
    "JA": "Justice",
    "GA": "Public finance management",
    "RB": "Special pension schemes",
    "AV": "Investing for France 2030",
    "AD": "Public development aid",
    "AB": "General & territorial state administration",
    "AC": "Agriculture, food & forestry",
    "RC": "Relations with local authorities",
    "AQ": "Public broadcasting",
    "CB": "Culture",
    "DB": "Economy",
    "AA": "External action of the State",
    "OA": "Overseas territories",
    "IA": "Immigration, asylum & integration",
    "MB": "Veterans, remembrance & links with the Nation",
    "SA": "Health",
    "SF": "Sport, youth & community life",
    "PB": "Constitutional powers",
    "DC": "Government action management",
    "CA": "State advisory & oversight bodies",
    "TR": "Public-sector transformation",
    "MA": "Media, books & cultural industries",
    "PC": "Unallocated appropriations",
    "PR": "Recovery plan",
}


_KEY_OK = re.compile(r"^[a-z0-9_]+$")


# ─── Editorial 9-bucket aggregations + autres énuméré ─────────────────────
#
# Mirrors `STATE_BUCKET_DEFS` in website/src/lib/daily-bread.ts so the
# drilldown drawer can read the same groupings without re-implementing
# the mapping. The TS file is the source of truth — when it changes,
# update this list too.
#
# Le bucket "autres" énumère explicitement ses contenus dans le label
# (agriculture, Outre-mer, action extérieure, économie, anciens
# combattants…) pour préserver la dignité de chaque domaine.
STATE_BUCKET_DEFS: list[dict] = [
    {
        "key": "education_recherche",
        "label_fr": "Éducation, recherche",
        "label_en": "Education and research",
        "codes": ["EC", "RA"],
    },
    {
        "key": "defense",
        "label_fr": "Défense",
        "label_en": "Defense",
        "codes": ["DA"],
    },
    {
        "key": "securite",
        "label_fr": "Sécurité (police, gendarmerie, sécurité civile)",
        "label_en": "Security (police, gendarmerie, civil safety)",
        "codes": ["SB"],
    },
    {
        "key": "justice",
        "label_fr": "Justice",
        "label_en": "Justice",
        "codes": ["JA"],
    },
    {
        "key": "solidarite_insertion",
        "label_fr": "Solidarité et insertion",
        "label_en": "Social protection and inclusion",
        "codes": ["SE"],
    },
    {
        "key": "travail_emploi",
        "label_fr": "Travail et emploi",
        "label_en": "Labour and employment",
        "codes": ["TB"],
    },
    {
        "key": "ecologie_logement_transports",
        "label_fr": "Écologie, logement, transports, territoires",
        "label_en": "Ecology, housing, transport, territories",
        "codes": ["TA", "VA", "RC"],
    },
    {
        "key": "culture_medias_sport",
        "label_fr": "Culture, médias, sport, jeunesse",
        "label_en": "Culture, media, sport, youth",
        "codes": ["CB", "MA", "SF", "AQ"],
    },
    {
        "key": "dette",
        "label_fr": "Service de la dette",
        "label_en": "Debt service",
        "codes": ["EB"],
    },
    # "autres" handled in code (complement of the 9 above).
]
AUTRES_DEF = {
    "key": "autres",
    "label_fr": "Agriculture, Outre-mer, action extérieure, économie, anciens combattants…",
    "label_en": "Agriculture, overseas, foreign affairs, economy, veterans…",
}


def _slug(value: str) -> str:
    """Normalize a mission/programme code to a slug-safe key fragment."""
    s = value.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def _en_label_for_mission(code: str, fr_label: str) -> str:
    en = MISSION_LABEL_EN.get(code)
    if en:
        return en
    # Fallback: keep the French label so we never emit empty EN.
    return fr_label


def _build_aggregations(level2: list[dict], source: str, source_url: str) -> list[dict]:
    """Build the editorial 5-bucket aggregations from level2 missions.

    Mirrors `computeStateBuckets()` in website/src/lib/daily-bread.ts.
    `share_of_parent` per bucket = sum of member missions' share_of_parent.
    `missions` field lists the slug-safe mission keys of the bucket.

    `source` / `source_url` are propagated from the underlying PLF dataset
    (the aggregations are a derived re-grouping, not a separate data
    source) so every entry carries provenance per the drilldown contract.
    """
    used: set[str] = set()
    aggs: list[dict] = []
    by_key = {m["key"]: m for m in level2}

    for d in STATE_BUCKET_DEFS:
        member_keys = [_slug(c) for c in d["codes"]]
        member_keys = [k for k in member_keys if k in by_key]
        used.update(member_keys)
        share = sum(by_key[k]["share_of_parent"] for k in member_keys)
        aggs.append({
            "key": d["key"],
            "label_fr": d["label_fr"],
            "label_en": d["label_en"],
            "share_of_parent": round(share, 6),
            "missions": member_keys,
            "source": source,
            "source_url": source_url,
        })

    # "autres" = complement (everything in level2 not yet assigned).
    other_keys = [m["key"] for m in level2 if m["key"] not in used]
    other_share = sum(by_key[k]["share_of_parent"] for k in other_keys)
    aggs.append({
        "key": AUTRES_DEF["key"],
        "label_fr": AUTRES_DEF["label_fr"],
        "label_en": AUTRES_DEF["label_en"],
        "share_of_parent": round(other_share, 6),
        "missions": other_keys,
        "source": source,
        "source_url": source_url,
    })

    aggs.sort(key=lambda x: x["share_of_parent"], reverse=True)
    return aggs


def build_etat_bucket(actions_index: dict | None = None) -> dict:
    """Build the etat bucket. If `actions_index` is omitted, fetch it.

    `actions_index` is the structure returned by
    `build_drilldown_etat_actions.build_etat_actions_index()`:
        { mission_key: { programme_key: [action, ...] } }
    """
    src_path = NATIONAL_DIR / "etat_lfi_2025.json"
    if not src_path.exists():
        raise FileNotFoundError(f"Missing {src_path} — run sync_etat_lfi.py first.")

    with open(src_path, encoding="utf-8") as f:
        lfi = json.load(f)

    source = lfi["source"]
    source_url = lfi["source_url"]
    net_cp = lfi["totals"]["bg_net_cp"]
    if not net_cp:
        raise ValueError("etat_lfi_2025.json totals.bg_net_cp is null/zero.")

    if actions_index is None:
        actions_index = build_etat_actions_index()

    level2: list[dict] = []
    for m in lfi["missions"]:
        # Skip RD: not part of NET budget; already excluded from bg_net_cp.
        if m["code"] == "RD":
            continue
        mission_key = _slug(m["code"])
        if not _KEY_OK.match(mission_key):
            raise ValueError(f"Bad mission key {mission_key!r} from code {m['code']!r}")

        mission_cp = m["cp"]
        share = mission_cp / net_cp if net_cp else 0.0

        level3: list[dict] = []
        programmes = m.get("programmes") or []
        prog_total_cp = sum(p["cp"] for p in programmes)
        for p in programmes:
            prog_key = f"{mission_key}_{_slug(str(p['code']))}"
            if not _KEY_OK.match(prog_key):
                raise ValueError(f"Bad programme key {prog_key!r}")
            p_share = p["cp"] / prog_total_cp if prog_total_cp else 0.0

            entry = {
                "key": prog_key,
                "label_fr": p["label"],
                # No curated EN translation per programme: keep FR label as
                # `label_en` so downstream UI never receives an empty string.
                # Documented: EN translation TODO at programme grain (200+ rows).
                "label_en": p["label"],
                "share_of_parent": round(p_share, 6),
                "source": source,
                "source_url": source_url,
            }

            # Graft level4 actions if available for this programme.
            actions = (actions_index.get(mission_key) or {}).get(prog_key) or []
            if actions:
                # Strip the internal cp_eur/ae_eur fields from the published
                # entries — the contract is share-based. We keep them only
                # in the actions_index for debug; not exposed in JSON.
                published_actions = [
                    {
                        "key": a["key"],
                        "label_fr": a["label_fr"],
                        "label_en": a["label_en"],
                        "share_of_parent": a["share_of_parent"],
                        "source": a["source"],
                        "source_url": a["source_url"],
                    }
                    for a in actions
                ]
                entry["level4"] = published_actions

            level3.append(entry)

        level2.append({
            "key": mission_key,
            "label_fr": m["label"],
            "label_en": _en_label_for_mission(m["code"], m["label"]),
            "share_of_parent": round(share, 6),
            "source": source,
            "source_url": source_url,
            **({"level3": level3} if level3 else {}),
        })

    # Sort level2 by share desc to match the spirit of the contract example.
    level2.sort(key=lambda x: x["share_of_parent"], reverse=True)

    aggregations = _build_aggregations(level2, source, source_url)

    return {
        "code": "S1311",
        "label_fr": "État central",
        "label_en": "Central state",
        "perimeter_fr": lfi["perimeter_label_fr"],
        "perimeter_en": lfi["perimeter_label_en"],
        "year": lfi["exercice"],
        "loi": lfi["loi"],
        "total_net_cp_eur": net_cp,
        "level2": level2,
        "aggregations": aggregations,
        "notes_fr": (
            "level2 = missions PLF (hors « Remboursements et dégrèvements », "
            "déjà exclues du BG net). level3 = programmes de la mission. "
            "level4 = actions PLF (depuis le même dataset, agrégées par "
            "(mission, programme, action)). aggregations = regroupement "
            "éditorial en 5 buckets (mirror de `computeStateBuckets` côté UI). "
            "Les shares_of_parent au niveau 2 somment à 1.0 sur le BG net ; "
            "au niveau 3, à 1.0 sur le CP de la mission parent ; au niveau 4, "
            "à 1.0 sur le CP du programme parent."
        ),
    }


def main() -> int:
    """Standalone debug entrypoint — prints summary + dumps to stdout if -v."""
    import sys as _sys
    bucket = build_etat_bucket()
    n2 = len(bucket["level2"])
    n3 = sum(len(m.get("level3", [])) for m in bucket["level2"])
    sum2 = sum(m["share_of_parent"] for m in bucket["level2"])
    print(f"[etat] level2={n2} level3_total={n3} sum(level2)={sum2:.4f}")
    if "-v" in _sys.argv:
        json.dump(bucket, _sys.stdout, ensure_ascii=False, indent=2)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
