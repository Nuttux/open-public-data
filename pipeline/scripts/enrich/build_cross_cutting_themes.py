#!/usr/bin/env python3
"""
Construit les **panneaux thématiques cross-cutting** (Stage 2C+2D) :
agrégats Santé / Éducation / Solidarité qui recoupent plusieurs
institutions (Sécu + État + Local).

Entrée :
    pipeline/seeds/seed_cross_cutting_themes.csv (catalogue éditorial des
        composants par thème — bucket / level2 / level3 / fraction / source)
    website/public/data/national/daily_bread.json (totaux institutions
        S1311/S1313/S1314, breakdowns APUL bloc/dept/region)
    website/public/data/national/daily_bread_drilldown.json (shares
        chainés level2/level3 par bucket)

Sortie :
    website/public/data/national/cross_cutting_themes.json

Schéma :
    {
      "generated_at": "...",
      "source_pipeline": "scripts/enrich/build_cross_cutting_themes.py",
      "themes": {
        "sante": {
          "key": "sante",
          "label_fr": "...", "label_en": "...",
          "subtitle_fr": "...", "subtitle_en": "...",
          "total_annual_eur": 410_000_000_000,
          "share_of_total_apu": 0.227,
          "components": [
            {
              "key": "...",
              "bucket": "secu" | "etat" | "local_communal" | "local_dept" | "local_region",
              "label_fr": "...", "label_en": "...",
              "annual_eur": 367_000_000_000,
              "share_of_theme": 0.895,
              "fraction_applied": 1.0,
              "drill_url": "/france/budget/bucket/secu/cnam_maladie",
              "source": "...", "source_url": "...",
              "note": "..."
            }, ...
          ],
          "caveats_fr": "...", "caveats_en": "..."
        },
        ...
      }
    }

Conventions de projection (alignées sur le budget page) :
    - secu        : annual_eur = S1314 × level2.share_of_parent (× level3.share_of_parent if any) × fraction
    - etat        : annual_eur = state_breakdown.total_net_cp_eur × level2.share_of_parent (× level3.share_of_parent if any) × fraction
                    (PAS S1311 — sinon surestimation 1,51× car le drilldown
                     État est normalisé sur la somme des 33 missions PLF
                     ≈ 447 Md€, pas sur S1311 ≈ 676 Md€ qui inclut ODAC,
                     transferts UE et régimes spéciaux non rattachés)
    - local_communal : annual_eur = S1313 × part_communes_epci × level2.share_of_parent (× level3 if any) × fraction
    - local_dept     : annual_eur = S1313 × part_departements   × level2.share_of_parent (× level3 if any) × fraction
    - local_region   : annual_eur = S1313 × part_regions        × level2.share_of_parent (× level3 if any) × fraction

Validation :
    - Σ components.annual_eur ≈ total_annual_eur (exact, sum)
    - Σ components.share_of_theme ≈ 1.0 ± 0.001
    - bucket / level2 / level3 résolvables dans drilldown.json (sinon TODO)
    - source / source_url non-null
    - parité label_fr / label_en
    - keys ^[a-z0-9_]+$ uniques par thème
"""

from __future__ import annotations

import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
SEED_PATH = ROOT / "pipeline" / "seeds" / "seed_cross_cutting_themes.csv"
PUBLIC_NATIONAL_DIR = ROOT / "website" / "public" / "data" / "national"
DAILY_BREAD_PATH = PUBLIC_NATIONAL_DIR / "daily_bread.json"
DRILLDOWN_PATH = PUBLIC_NATIONAL_DIR / "daily_bread_drilldown.json"
OUTPUT_PATH = PUBLIC_NATIONAL_DIR / "cross_cutting_themes.json"

VALID_BUCKETS = {"secu", "etat", "local_communal", "local_dept", "local_region"}
KEY_RE = re.compile(r"^[a-z0-9_]+$")

# ─── Métadonnées thèmes (hors-CSV : libellés, intro, caveats) ────────────────

THEME_META = {
    "sante": {
        "label_fr": "Santé en France",
        "label_en": "Health in France",
        "subtitle_fr": "Combien la France finance-t-elle la santé chaque année ?",
        "subtitle_en": "How much does France fund health each year?",
        "caveats_fr": (
            "Estimation agrégée. La frontière santé / social est conventionnelle : "
            "la part santé du bloc communal et des départements est estimée à partir "
            "des sous-fonctions OFGL (PMI, hygiène publique, APA), le reste est "
            "compté en solidarité. Les retraites (CNAV) ne sont pas incluses ici."
        ),
        "caveats_en": (
            "Aggregate estimate. The health/social boundary is conventional: the "
            "health share of municipal and departmental spending is estimated from "
            "OFGL sub-functions (PMI, public hygiene, APA); the rest is counted in "
            "solidarity. Retirement pensions (CNAV) are excluded here."
        ),
    },
    "education": {
        "label_fr": "Éducation en France",
        "label_en": "Education in France",
        "subtitle_fr": "Combien la France finance-t-elle l'enseignement chaque année ?",
        "subtitle_en": "How much does France fund education each year?",
        "caveats_fr": (
            "Périmètre : enseignement scolaire (État) + enseignement supérieur et "
            "recherche (État) + écoles primaires (communes) + collèges "
            "(départements) + lycées et formation professionnelle (régions). "
            "L'apprentissage et la formation continue privée ne sont pas inclus."
        ),
        "caveats_en": (
            "Scope: schooling (State) + higher education and research (State) + "
            "primary schools (municipalities) + middle schools (departments) + "
            "high schools and vocational training (regions). Apprenticeship and "
            "private continuous training are excluded."
        ),
    },
    "solidarite": {
        "label_fr": "Solidarité en France",
        "label_en": "Solidarity in France",
        "subtitle_fr": "Combien la France finance-t-elle la solidarité chaque année ?",
        "subtitle_en": "How much does France fund solidarity each year?",
        "caveats_fr": (
            "Périmètre : famille (CNAF) + chômage (UNEDIC) + mission Solidarité "
            "(État) + action sociale du bloc communal (CCAS, hors part santé) + "
            "RSA, ASE, action sociale et hébergement des départements (hors APA "
            "et santé/PMI). La part santé/dépendance des collectivités est "
            "comptée dans le panneau Santé."
        ),
        "caveats_en": (
            "Scope: family (CNAF) + unemployment (UNEDIC) + Solidarity mission "
            "(State) + social action of the municipal block (CCAS, excluding "
            "health share) + RSA, child welfare, social action and housing of "
            "departments (excluding APA and health/PMI). Health/dependency "
            "shares of local authorities are counted in the Health panel."
        ),
    },
    "securite_globale": {
        "label_fr": "Sécurité globale en France",
        "label_en": "Overall security in France",
        "subtitle_fr": "Combien la France finance-t-elle la sécurité au sens large chaque année ?",
        "subtitle_en": "How much does France fund security in the broad sense each year?",
        "caveats_fr": (
            "La sécurité est un enjeu trans-institutionnel : sécurité intérieure "
            "(police, gendarmerie), justice, défense extérieure, action "
            "diplomatique, et sécurité civile / police municipale au niveau "
            "local s'agglomèrent ici. La frontière avec d'autres fonctions "
            "(renseignement, antiterrorisme transversal, douanes, services "
            "pénitentiaires) reste fluide. Aucune fraction estimée — chaque "
            "composante recouvre l'intégralité d'une mission ou d'une fonction "
            "OFGL."
        ),
        "caveats_en": (
            "Security is a cross-institutional issue: internal security (police, "
            "gendarmerie), justice, external defence, diplomatic action, plus "
            "civil safety / municipal police at the local level are aggregated "
            "here. The boundary with other functions (intelligence, "
            "counter-terrorism, customs, prison services) remains fluid. No "
            "estimated fraction — each component covers an entire mission or "
            "OFGL function."
        ),
    },
    "logement": {
        "label_fr": "Logement et urbanisme en France",
        "label_en": "Housing and urban planning in France",
        "subtitle_fr": "Combien la France finance-t-elle le logement et l'urbanisme chaque année ?",
        "subtitle_en": "How much does France fund housing and urban planning each year?",
        "caveats_fr": (
            "Le logement croise l'État (politique du logement, aides à la "
            "pierre via la mission Cohésion des territoires), la Sécurité "
            "sociale (aides personnalisées au logement APL/ALS/ALF, versées "
            "par la CAF pour le compte du FNAL), et les collectivités "
            "(aménagement urbain, logement social, fonds de solidarité "
            "logement). La fraction 60 % appliquée à la mission « Cohésion "
            "des territoires » est éditoriale (volet logement-urbanisme du "
            "périmètre, hors aménagement rural strict). Le logement militaire, "
            "agricole et le parc des opérateurs ne sont pas comptabilisés ici."
        ),
        "caveats_en": (
            "Housing cuts across the State (housing policy and bricks-and-mortar "
            "subsidies via the Territorial Cohesion mission), Social Security "
            "(personalized housing benefits APL/ALS/ALF, paid by CAF on behalf "
            "of FNAL), and local authorities (urban planning, social housing, "
            "housing solidarity funds). The 60 % fraction applied to the "
            "Territorial Cohesion mission is editorial (housing and urban "
            "planning scope, excluding strict rural development). Military, "
            "agricultural and operator-owned housing are not counted here."
        ),
    },
    "transports": {
        "label_fr": "Transports et mobilité en France",
        "label_en": "Transport and mobility in France",
        "subtitle_fr": "Combien la France finance-t-elle les transports et la mobilité chaque année ?",
        "subtitle_en": "How much does France fund transport and mobility each year?",
        "caveats_fr": (
            "Les transports sont financés par l'État (programme 203 "
            "« Infrastructures et services de transports » + AFITF, hors "
            "écologie strictement environnementale et énergie), les régions "
            "(TER + transports interurbains, ~35 % de leurs dépenses), les "
            "départements (routes départementales et transport scolaire), et "
            "les communes (voirie locale, transport urbain via les syndicats "
            "AOM). La fraction 60 % appliquée à la mission « Écologie, "
            "développement et mobilité durables » est éditoriale et "
            "conservatrice. Les redevances et péages versés directement par "
            "les usagers (péages d'autoroute, billets SNCF) ne sont pas "
            "comptés."
        ),
        "caveats_en": (
            "Transport is funded by the State (program 203 « Infrastructure "
            "and transport services » + AFITF, excluding strictly "
            "environmental ecology and energy), regions (regional trains TER "
            "and intercity transport, ~35 % of their spending), departments "
            "(departmental roads and school transport), and municipalities "
            "(local roads, urban transport via mobility authorities). The "
            "60 % fraction applied to the « Ecology, development and "
            "sustainable mobility » mission is editorial and conservative. "
            "Tolls and fares paid directly by users (motorway tolls, SNCF "
            "tickets) are not counted."
        ),
    },
}

ORDERED_THEMES = [
    "sante",
    "education",
    "solidarite",
    "securite_globale",
    "logement",
    "transports",
]


# ─── Loaders ─────────────────────────────────────────────────────────────────

def _load_seed() -> list[dict]:
    """Lit le seed CSV et renvoie une liste d'enregistrements (filtrés)."""
    rows: list[dict] = []
    with open(SEED_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            theme = (r.get("theme_key") or "").strip()
            if not theme:
                continue
            try:
                fraction = float((r.get("fraction") or "1.0").strip())
            except ValueError:
                fraction = 1.0
            rows.append({
                "theme_key": theme,
                "component_id": (r.get("component_id") or "").strip(),
                "bucket": (r.get("bucket") or "").strip(),
                "level2": (r.get("level2") or "").strip(),
                "level3": (r.get("level3") or "").strip() or None,
                "fraction": fraction,
                "label_fr": (r.get("label_fr") or "").strip(),
                "label_en": (r.get("label_en") or "").strip(),
                "note": (r.get("note") or "").strip() or None,
                "source": (r.get("source") or "").strip(),
                "source_url": (r.get("source_url") or "").strip(),
            })
    return rows


def _load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ─── Résolution montants ─────────────────────────────────────────────────────

def _resolve_level2_share(drilldown_bucket: dict, level2_key: str) -> tuple[float, dict | None]:
    """Returns (share_of_parent, level2_entry) or (0, None) if not found."""
    for entry in drilldown_bucket.get("level2", []) or []:
        if entry.get("key") == level2_key:
            return float(entry.get("share_of_parent") or 0.0), entry
    return 0.0, None


def _resolve_level3_share(level2_entry: dict, level3_key: str) -> float:
    for entry in level2_entry.get("level3", []) or []:
        if entry.get("key") == level3_key:
            return float(entry.get("share_of_parent") or 0.0)
    return 0.0


def _project_amount(
    component: dict,
    *,
    inst_totals: dict,
    apul_breakdown: dict,
    drilldown: dict,
    state_total_net_cp_eur: float,
    todos: list[str],
) -> tuple[float, str]:
    """Compute annual_eur for a single seed row + return drill_url.

    Conventions (mirror the live budget page):
        secu        : S1314 × level2.share × (level3.share if any) × fraction
        etat        : total_net_cp_eur × level2.share × (level3.share if any) × fraction
                       (= mission cp_eur si level2 est une mission)
                       PAS S1311 — sinon surestimation 1,51× (cf. README ci-dessous)
        local_*     : S1313 × scale_share × level2.share × (level3.share if any) × fraction

    Pourquoi `total_net_cp_eur` et pas S1311 pour État ?
        Les `share_of_parent` du drilldown État sont normalisés sur la **somme
        des 33 missions PLF** (≈ 447 Md€), pas sur S1311 (≈ 676 Md€). S1311
        inclut ~229 Md€ d'opérateurs (ODAC), transferts UE, régimes spéciaux
        non rattachés à une mission — non attribuables à un thème éditorial.
        Multiplier S1311 par les shares PLF surestime d'un facteur ~1,51×.
    """
    bucket = component["bucket"]
    level2 = component["level2"]
    level3 = component["level3"]
    fraction = component["fraction"]
    component_id = component["component_id"]

    if bucket not in VALID_BUCKETS:
        todos.append(f"{component_id}: invalid bucket {bucket!r}")
        return 0.0, ""

    # Resolve denominator + drilldown bucket
    if bucket == "secu":
        institution_total = inst_totals.get("S1314", {}).get("annual_eur") or 0
        dd_bucket = drilldown["buckets"].get("secu") or {}
        scale_factor = 1.0
        drill_url = f"/france/budget/bucket/secu/{level2}"
    elif bucket == "etat":
        # Base = total_net_cp_eur (somme des missions PLF, ≈ 447 Md€), PAS S1311.
        # Cf. docstring : éviter la surestimation 676/447 ≈ 1,51×.
        institution_total = state_total_net_cp_eur
        dd_bucket = drilldown["buckets"].get("etat") or {}
        scale_factor = 1.0
        drill_url = f"/france/budget/bucket/etat/{level2}"
    elif bucket == "local_communal":
        institution_total = inst_totals.get("S1313", {}).get("annual_eur") or 0
        scale_factor = (apul_breakdown.get("part_communes_epci") or {}).get("value") or 0.0
        dd_bucket = drilldown["buckets"].get("local") or {}
        drill_url = f"/france/budget/bucket/local/{level2}"
    elif bucket == "local_dept":
        institution_total = inst_totals.get("S1313", {}).get("annual_eur") or 0
        scale_factor = (apul_breakdown.get("part_departements") or {}).get("value") or 0.0
        dd_bucket = (drilldown["buckets"].get("local") or {}).get("departement") or {}
        drill_url = f"/france/budget/bucket/local/dept/{level2}"
    else:  # local_region
        institution_total = inst_totals.get("S1313", {}).get("annual_eur") or 0
        scale_factor = (apul_breakdown.get("part_regions") or {}).get("value") or 0.0
        dd_bucket = (drilldown["buckets"].get("local") or {}).get("region") or {}
        drill_url = f"/france/budget/bucket/local/region/{level2}"

    # Resolve level2 share
    l2_share, l2_entry = _resolve_level2_share(dd_bucket, level2)
    if l2_entry is None:
        todos.append(
            f"{component_id}: level2 key {level2!r} not found in {bucket} drilldown"
        )
        return 0.0, drill_url
    l3_share = 1.0
    if level3:
        l3_share = _resolve_level3_share(l2_entry, level3)
        if l3_share == 0.0:
            todos.append(
                f"{component_id}: level3 key {level3!r} not found under "
                f"{bucket}.{level2}"
            )

    amount = institution_total * scale_factor * l2_share * l3_share * fraction
    return float(amount), drill_url


# ─── Build ───────────────────────────────────────────────────────────────────

def build_themes() -> tuple[dict, list[str]]:
    """Returns (payload, todos)."""
    seed = _load_seed()
    db = _load_json(DAILY_BREAD_PATH)
    drilldown = _load_json(DRILLDOWN_PATH)

    inst_totals = db["apu_subsectors"]["institutions"]
    apul_breakdown = db["subsector_breakdowns"]["apul_breakdown"]["items"]
    state_total_net_cp_eur = float(
        db.get("state_breakdown", {}).get("total_net_cp_eur") or 0
    )

    total_apu_unconsolidated = sum(
        (inst_totals.get(k) or {}).get("annual_eur") or 0
        for k in ("S1311", "S1313", "S1314")
    )

    todos: list[str] = []
    themes_out: dict = {}

    # Group rows by theme_key
    by_theme: dict[str, list[dict]] = {}
    for row in seed:
        by_theme.setdefault(row["theme_key"], []).append(row)

    for theme_key in ORDERED_THEMES:
        rows = by_theme.get(theme_key, [])
        if not rows:
            todos.append(f"theme {theme_key!r}: no seed rows")
            continue
        meta = THEME_META.get(theme_key)
        if meta is None:
            todos.append(f"theme {theme_key!r}: no metadata in THEME_META")
            continue

        components = []
        seen_keys: set[str] = set()
        for row in rows:
            cid = row["component_id"]
            if not cid or not KEY_RE.match(cid):
                todos.append(f"{theme_key}: bad component_id {cid!r}")
                continue
            if cid in seen_keys:
                todos.append(f"{theme_key}: duplicate component_id {cid!r}")
                continue
            seen_keys.add(cid)
            if not row["label_fr"] or not row["label_en"]:
                todos.append(f"{cid}: missing label_fr/label_en")
            if not row["source"] or not row["source_url"]:
                todos.append(f"{cid}: missing source/source_url")
            amount, drill_url = _project_amount(
                row,
                inst_totals=inst_totals,
                apul_breakdown=apul_breakdown,
                drilldown=drilldown,
                state_total_net_cp_eur=state_total_net_cp_eur,
                todos=todos,
            )
            components.append({
                "key": cid,
                "bucket": row["bucket"],
                "level2": row["level2"],
                "level3": row["level3"],
                "label_fr": row["label_fr"],
                "label_en": row["label_en"],
                "annual_eur": round(amount),
                "fraction_applied": row["fraction"],
                "drill_url": drill_url,
                "source": row["source"],
                "source_url": row["source_url"],
                "note": row["note"],
            })

        # Total + share_of_theme per component
        total_amount = sum(c["annual_eur"] for c in components)
        if total_amount > 0:
            for c in components:
                c["share_of_theme"] = round(c["annual_eur"] / total_amount, 6)
        else:
            for c in components:
                c["share_of_theme"] = 0.0

        # Sort components by amount desc
        components.sort(key=lambda c: c["annual_eur"], reverse=True)

        share_of_apu = (
            total_amount / total_apu_unconsolidated
            if total_apu_unconsolidated > 0
            else 0.0
        )

        themes_out[theme_key] = {
            "key": theme_key,
            "label_fr": meta["label_fr"],
            "label_en": meta["label_en"],
            "subtitle_fr": meta["subtitle_fr"],
            "subtitle_en": meta["subtitle_en"],
            "total_annual_eur": total_amount,
            "share_of_total_apu": round(share_of_apu, 6),
            "components": components,
            "caveats_fr": meta["caveats_fr"],
            "caveats_en": meta["caveats_en"],
        }

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": "scripts/enrich/build_cross_cutting_themes.py",
        "audit_promise": (
            "Tous les montants sont calculés depuis daily_bread.json (totaux S1311/"
            "S1313/S1314, breakdowns APUL) et daily_bread_drilldown.json (shares "
            "level2/level3 par bucket). Aucun montant n'est hardcodé : la "
            "fraction éditoriale (frontière santé/social du bloc communal et "
            "des départements) provient du seed seed_cross_cutting_themes.csv."
        ),
        "denominator_total_apu_eur": total_apu_unconsolidated,
        "themes": themes_out,
    }
    return payload, todos


# ─── Validation ──────────────────────────────────────────────────────────────

def validate(payload: dict) -> list[str]:
    errors: list[str] = []
    themes = payload.get("themes") or {}
    for tk, theme in themes.items():
        if not theme.get("label_fr") or not theme.get("label_en"):
            errors.append(f"{tk}: missing label_fr/label_en")
        if not theme.get("subtitle_fr") or not theme.get("subtitle_en"):
            errors.append(f"{tk}: missing subtitle_fr/subtitle_en")
        components = theme.get("components") or []
        if not components:
            errors.append(f"{tk}: no components")
            continue
        sum_amounts = sum(c["annual_eur"] for c in components)
        if abs(sum_amounts - theme["total_annual_eur"]) > 1:
            errors.append(
                f"{tk}: Σ components.annual_eur={sum_amounts} ≠ "
                f"total_annual_eur={theme['total_annual_eur']}"
            )
        sum_shares = sum(c.get("share_of_theme") or 0.0 for c in components)
        if abs(sum_shares - 1.0) > 0.001:
            errors.append(f"{tk}: Σ share_of_theme={sum_shares:.6f} ≠ 1.0")
        for c in components:
            if not c.get("source") or not c.get("source_url"):
                errors.append(f"{tk}.{c['key']}: missing source")
            if not c.get("drill_url"):
                errors.append(f"{tk}.{c['key']}: missing drill_url")
            if c.get("annual_eur", 0) <= 0:
                errors.append(f"{tk}.{c['key']}: zero or negative annual_eur")
    return errors


# ─── Entrypoint ──────────────────────────────────────────────────────────────

def main() -> int:
    payload, todos = build_themes()

    print("=" * 60)
    print("Cross-cutting themes — build summary")
    print("=" * 60)
    for tk, theme in payload["themes"].items():
        n = len(theme["components"])
        total_md = theme["total_annual_eur"] / 1e9
        share_apu_pct = theme["share_of_total_apu"] * 100
        print(
            f"  [{tk}] components={n} total={total_md:.1f} Md€ "
            f"({share_apu_pct:.1f} % APU non-consolidé)"
        )
        for c in theme["components"]:
            cm = c["annual_eur"] / 1e9
            print(
                f"      - {c['key']:42s} {cm:7.2f} Md€ "
                f"({(c['share_of_theme']*100):5.1f} % du thème) "
                f"[{c['bucket']}/{c['level2']}"
                + (f"/{c['level3']}" if c['level3'] else "")
                + f", frac={c['fraction_applied']}]"
            )

    print()
    if todos:
        print("TODOs (non-fatal warnings):")
        for t in todos:
            print(f"  [todo] {t}")
        print()

    errors = validate(payload)
    if errors:
        print("Validation errors:")
        for e in errors:
            print(f"  [ERROR] {e}")
        print(f"\nFAIL: {len(errors)} validation error(s).")
        return 1

    PUBLIC_NATIONAL_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
