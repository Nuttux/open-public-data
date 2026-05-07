#!/usr/bin/env python3
"""
Export daily_bread.json — toutes les constantes nécessaires au calculateur
"Ce que je finance" (page /daily-bread) en un seul JSON, avec sources.

Lit :
    - pipeline/seeds/seed_fiscal_constants.csv  (barème IR, CSG, cotisations, TVA…)
    - pipeline/seeds/seed_db_equivalents.csv    (équivalences concrètes)
    - pipeline/seeds/seed_apul_subsectors.csv   (décomposition APUL communes/dép/régions
                                                 + décomposition ASSO maladie/retraite/famille…)
    - website/public/data/national/eurostat_apu_subsectors.json
                                                 (parts S1311/S1313/S1314 dans APU non consolidé)
    - website/public/data/communes-all/index.json
                                                 (moyenne nationale dépenses €/hab pondérée par pop)

Pas de BigQuery / dbt : les seeds national-tier sont déjà désactivés dans
dbt_project.yml et toutes les sources nationales suivent le pattern
"sync direct → JSON" (cf sync_eurostat_*, sync_etat_lfi).

Output:
    website/public/data/national/daily_bread.json

Usage:
    python pipeline/scripts/export/export_daily_bread.py
"""

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
SEEDS_DIR = ROOT / "pipeline" / "seeds"
NATIONAL_DIR = ROOT / "website" / "public" / "data" / "national"
COMMUNES_ALL = ROOT / "website" / "public" / "data" / "communes-all" / "index.json"
OUTPUT_PATH = NATIONAL_DIR / "daily_bread.json"


def _cast_value(s: str) -> float | int | str:
    """Cast string to int / float / str."""
    s = (s or "").strip()
    if not s:
        return 0
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        return s


def _read_seed(name: str) -> list[dict]:
    """Read a CSV seed and return list of dicts."""
    path = SEEDS_DIR / name
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def _build_keyed(rows: list[dict], cast: bool = True) -> dict:
    """Index a seed by `key`, optionally casting `value`."""
    out = {}
    for r in rows:
        key = r.pop("key")
        if cast and "value" in r:
            r["value"] = _cast_value(r["value"])
        out[key] = r
    return out


def build_fiscal_constants() -> dict:
    """Build fiscal constants block from seed_fiscal_constants.csv."""
    rows = _read_seed("seed_fiscal_constants.csv")
    keyed = _build_keyed(rows, cast=True)

    # Re-shape IR brackets into an ordered list
    ir_baremes = []
    for i in range(1, 6):
        seuil_key = f"ir_tranche_{i}_seuil"
        taux_key = f"ir_tranche_{i}_taux"
        if taux_key not in keyed:
            continue
        # Last bracket has no seuil (Infinity)
        seuil = keyed[seuil_key]["value"] if seuil_key in keyed else None
        taux = keyed[taux_key]["value"]
        ir_baremes.append({
            "tranche": i,
            "seuil_haut_eur_par_part": seuil,  # null = pas de borne sup
            "taux_marginal": taux,
        })

    # Look up source (same article CGI for all IR brackets)
    ir_source = keyed["ir_tranche_1_taux"]
    plafond = keyed["ir_plafond_demi_part"]

    return {
        "ir": {
            "year": int(ir_source.get("year") or 2025),
            "baremes": ir_baremes,
            "plafond_demi_part_eur": plafond["value"],
            "source": ir_source["source"],
            "source_url": ir_source["source_url"],
            "date_reference": ir_source["date_reference"],
            "notes": "Barème IR par tranche en EUR / part fiscale. Le plafond du quotient familial limite l'avantage fiscal procuré par les demi-parts supplémentaires.",
        },
        "csg_crds": {
            "taux_total_activite": keyed["csg_crds_total_activite"]["value"],
            "taux_csg_seul": keyed["csg_taux_activite"]["value"],
            "taux_crds_seul": keyed["crds_taux"]["value"],
            "taux_csg_deductible_ir": keyed["csg_taux_deductible"]["value"],
            "assiette_abattement": keyed["csg_assiette_abattement"]["value"],
            "year": int(keyed["csg_crds_total_activite"].get("year") or 2025),
            "source": keyed["csg_crds_total_activite"]["source"],
            "source_url": keyed["csg_crds_total_activite"]["source_url"],
            "date_reference": keyed["csg_crds_total_activite"]["date_reference"],
            "notes": (
                "CSG (9,2%) + CRDS (0,5%) sur 98,25% du brut (abattement 1,75% "
                "frais professionnels). 6,8% de la CSG est déductible du revenu "
                "imposable IR."
            ),
        },
        "cotisations_salariales": {
            "taux_hors_csg_moyen": keyed["cotisations_salariees_hors_csg_taux_moyen"]["value"],
            "taux_total_sur_brut": keyed["prelevements_sur_brut_total_taux_moyen"]["value"],
            "year": int(keyed["cotisations_salariees_hors_csg_taux_moyen"].get("year") or 2024),
            "source": keyed["cotisations_salariees_hors_csg_taux_moyen"]["source"],
            "source_url": keyed["cotisations_salariees_hors_csg_taux_moyen"]["source_url"],
            "date_reference": keyed["cotisations_salariees_hors_csg_taux_moyen"]["date_reference"],
            "notes": (
                "Taux moyen pondéré des cotisations salariales hors CSG/CRDS "
                "(privé non-cadre / cadre, vieillesse + maladie + AGIRC-ARRCO). "
                "Total sur brut = cotisations (12,5%) + CSG/CRDS (9,7%) ≈ 22%, "
                "soit un ratio brut/net standard ~1,29."
            ),
        },
        "tva": {
            "taux_moyen_consommation": keyed["tva_taux_moyen_consommation"]["value"],
            "propension_consommer": keyed["propension_consommer"]["value"],
            "taux_effectif_sur_disponible": keyed["tva_effective_sur_disponible"]["value"],
            "year": int(keyed["tva_taux_moyen_consommation"].get("year") or 2024),
            "source": keyed["tva_taux_moyen_consommation"]["source"],
            "source_url": keyed["tva_taux_moyen_consommation"]["source_url"],
            "date_reference": keyed["tva_taux_moyen_consommation"]["date_reference"],
            "notes": (
                "Taux effectif TVA sur revenu disponible = 12,2% (taux moyen pondéré "
                "consommation, INSEE T_TES) × 85% (propension à consommer moyenne, "
                "INSEE comptes ménages). Lisse les disparités par décile."
            ),
        },
        # ── PFU / capital (dividendes, intérêts, plus-values mobilières) ──
        "pfu": {
            "taux_total": keyed["pfu_taux_total"]["value"],
            "taux_ir": keyed["pfu_taux_ir"]["value"],
            "taux_prelevements_sociaux": keyed["pfu_taux_prelevements_sociaux"]["value"],
            "year": int(keyed["pfu_taux_total"].get("year") or 2025),
            "source": keyed["pfu_taux_total"]["source"],
            "source_url": keyed["pfu_taux_total"]["source_url"],
            "date_reference": keyed["pfu_taux_total"]["date_reference"],
            "notes": (
                "PFU global 30 % sur revenus du capital = 12,8 % IR libératoire "
                "+ 17,2 % prélèvements sociaux. Option barème IR + 17,2 % PS "
                "possible (option globale annuelle, intéressante si TMI < 30 %)."
            ),
        },
        # ── Pensions / retraite : abattement IR ──
        "pension": {
            "abattement_taux": keyed["abattement_pension_taux"]["value"],
            "abattement_plafond_eur": keyed["abattement_pension_plafond"]["value"],
            "abattement_plancher_eur": keyed["abattement_pension_plancher"]["value"],
            "year": int(keyed["abattement_pension_taux"].get("year") or 2025),
            "source": keyed["abattement_pension_taux"]["source"],
            "source_url": keyed["abattement_pension_taux"]["source_url"],
            "date_reference": keyed["abattement_pension_taux"]["date_reference"],
            "notes": (
                "Abattement de 10 % sur les pensions pour le calcul de l'IR, "
                "plafonné à 4 399 € par foyer fiscal et plancher 449 € par "
                "bénéficiaire (LFI 2025, revenus 2024)."
            ),
        },
        # ── Micro-entrepreneur : cotisations URSSAF + abattements + versement libératoire ──
        "micro": {
            "cotisations": {
                "vente": keyed["micro_cotis_vente"]["value"],
                "services_bic": keyed["micro_cotis_services_bic"]["value"],
                "services_bnc": keyed["micro_cotis_services_bnc"]["value"],
                "services_bnc_cipav": keyed["micro_cotis_services_bnc_cipav"]["value"],
            },
            "cfp": {
                "vente": keyed["micro_cfp_vente"]["value"],
                "services_bic": keyed["micro_cfp_services_bic"]["value"],
                "services_bnc": keyed["micro_cfp_services_bnc"]["value"],
            },
            "abattements_ir": {
                "vente": keyed["micro_abattement_vente"]["value"],
                "services_bic": keyed["micro_abattement_services_bic"]["value"],
                "services_bnc": keyed["micro_abattement_services_bnc"]["value"],
            },
            "versement_liberatoire": {
                "vente": keyed["micro_versement_liberatoire_vente"]["value"],
                "services_bic": keyed["micro_versement_liberatoire_services_bic"]["value"],
                "services_bnc": keyed["micro_versement_liberatoire_services_bnc"]["value"],
            },
            "year": int(keyed["micro_cotis_vente"].get("year") or 2025),
            "source": keyed["micro_cotis_vente"]["source"],
            "source_url": keyed["micro_cotis_vente"]["source_url"],
            "date_reference": keyed["micro_cotis_vente"]["date_reference"],
            "notes": (
                "Cotisations URSSAF micro-entrepreneur sur CA encaissé (pas de "
                "déduction de charges) + CFP (formation professionnelle). "
                "Abattements forfaitaires CGI art. 50-0 / 102 ter pour calcul de "
                "l'IR. Versement libératoire optionnel sous condition de RFR."
            ),
        },
        # ── CSG/CRDS/CASA sur pensions (4 tranches selon RFR/part) ──
        "csg_retraite": _build_csg_retraite_tranches(),
    }


def _build_csg_retraite_tranches() -> dict:
    """Build CSG/CRDS/CASA brackets for pensions from seed_csg_retraite_tranches.csv."""
    rows = _read_seed("seed_csg_retraite_tranches.csv")
    tranches = []
    src = ""
    src_url = ""
    date_ref = ""
    year = 2025
    for r in rows:
        seuil_min_raw = (r.get("seuil_rfr_par_part_min") or "").strip()
        seuil_max_raw = (r.get("seuil_rfr_par_part_max") or "").strip()
        tranches.append({
            "tranche": int(r["tranche"]),
            "seuil_rfr_par_part_min": float(seuil_min_raw) if seuil_min_raw else 0.0,
            "seuil_rfr_par_part_max": float(seuil_max_raw) if seuil_max_raw else None,
            "taux_csg": float(r["taux_csg"]),
            "taux_crds": float(r["taux_crds"]),
            "taux_casa": float(r["taux_casa"]),
            "taux_total": float(r["taux_total"]),
        })
        src = r["source"]
        src_url = r["source_url"]
        date_ref = r["date_reference"]
    return {
        "tranches": tranches,
        "year": year,
        "source": src,
        "source_url": src_url,
        "date_reference": date_ref,
        "notes": (
            "Taux de CSG/CRDS/CASA sur les pensions de retraite par tranche de "
            "RFR/part fiscale (RFR de l'année N-2). Tranche 1 = exonération, "
            "tranche 2 = taux réduit (CSG 3,8 % + CRDS 0,5 %), tranche 3 = "
            "taux médian (CSG 6,6 % + CRDS 0,5 % + CASA 0,3 %), tranche 4 = "
            "taux normal (CSG 8,3 % + CRDS 0,5 % + CASA 0,3 %)."
        ),
    }


def build_apu_subsectors() -> dict:
    """Build APU sub-sectors block from Eurostat sync output."""
    src = NATIONAL_DIR / "eurostat_apu_subsectors.json"
    if not src.exists():
        print(f"  ⚠ {src.name} missing — run sync_eurostat_apu_subsectors.py first")
        return {}
    with open(src, encoding="utf-8") as f:
        data = json.load(f)

    # Keep only S1311 / S1313 / S1314 with their non-consolidated shares.
    # `annual_eur` est calculé en amont par sync_eurostat_apu_subsectors.py via
    # nama_10_gdp (PIB FR à prix courants × value_pct_gdp/100). Les drawers
    # Sécu/Local/État peuvent ensuite afficher le national absolu sans hardcode.
    institutions = {}
    for s in data["sectors"]:
        if s["code"] in ("S1311", "S1313", "S1314"):
            institutions[s["code"]] = {
                "label_fr": s["label_fr"],
                "label_en": s["label_en"],
                "value_pct_gdp": s["value_pct_gdp"],
                "share": s["share_of_unconsolidated"],
                "annual_eur": s.get("annual_eur"),
            }

    return {
        "year": data["year"],
        "source": data["source"],
        "source_url": data["source_url"],
        "fetched_at": data["fetched_at"],
        "institutions": institutions,
        "totals": data["totals"],
        "notes_fr": (
            "Décomposition non consolidée S1311/S1313/S1314 — "
            "lecture « qui dépense quoi avant transferts intra-admin ». "
            "Les ratios sont normalisés sur leur somme (et non sur S13). "
            "`institutions.<code>.annual_eur` est en € (= value_pct_gdp/100 × PIB FR) "
            "et permet aux drawers d'afficher le national absolu sans hardcode."
        ),
    }


def build_apul_subsectors() -> dict:
    """Local + ASSO sub-decompositions from seed_apul_subsectors.csv."""
    rows = _read_seed("seed_apul_subsectors.csv")
    apul = {}
    asso = {}
    for r in rows:
        key = r["key"]
        entry = {
            "label_fr": r["label_fr"],
            "label_en": r["label_en"],
            "value": _cast_value(r["value"]),
            "year": int(r["year"]) if r.get("year") else None,
            "source": r["source"],
            "source_url": r["source_url"],
            "date_reference": r["date_reference"],
            "notes": r.get("notes"),
        }
        if key.startswith("apul_"):
            apul[key.replace("apul_", "")] = entry
        elif key.startswith("asso_"):
            asso[key.replace("asso_", "")] = entry

    return {
        "apul_breakdown": {
            "description_fr": "Décomposition des dépenses des APUL (S1313) entre niveaux territoriaux.",
            "description_en": "Breakdown of local government (S1313) by territorial level.",
            "items": apul,
        },
        "asso_breakdown": {
            "description_fr": "Décomposition des dépenses ASSO (S1314) par caisse / branche.",
            "description_en": "Breakdown of social security funds (S1314) by branch.",
            "items": asso,
        },
    }


def build_state_breakdown() -> dict:
    """All missions of État (S1311) from the latest LFI sync.

    Returns the 33 missions of the central State as % of total CP, with
    labels and source. Used both as data source for state-bucket aggregation
    (computeStateBuckets, daily-bread.ts) AND as the per-mission shares for
    the drill-down. No more "OTHER" rollup so small missions (Culture,
    Outre-mer, Action extérieure, Anciens combattants…) gardent leur dignité
    dans la bucketisation éditoriale.
    """
    idx_path = NATIONAL_DIR / "etat_lfi_index.json"
    if not idx_path.exists():
        return {}
    with open(idx_path, encoding="utf-8") as f:
        idx = json.load(f)
    latest = idx.get("latest_year")
    src_path = NATIONAL_DIR / f"etat_lfi_{latest}.json"
    if not src_path.exists():
        return {}
    with open(src_path, encoding="utf-8") as f:
        lfi = json.load(f)

    # Use NET total (excludes "Remboursements et dégrèvements" technical mission)
    net_cp = lfi["totals"]["bg_net_cp"]
    if not net_cp:
        return {}

    # Skip the R&D mission and keep all others, ranked by CP
    missions = [m for m in lfi["missions"] if m["label"] != "Remboursements et dégrèvements"]
    missions_sorted = sorted(missions, key=lambda m: m["cp"], reverse=True)
    total_share = sum(m["cp"] for m in missions_sorted) / net_cp

    out_missions = [
        {
            "code": m["code"],
            "label": m["label"],
            "cp_eur": m["cp"],
            "share_of_state_net": round(m["cp"] / net_cp, 4),
        }
        for m in missions_sorted
    ]

    return {
        "year": lfi["exercice"],
        "source": lfi["source"],
        "source_url": lfi["source_url"],
        "perimeter_label_fr": lfi["perimeter_label_fr"],
        "total_net_cp_eur": net_cp,
        "top_missions_share_total": round(total_share, 4),
        "missions": out_missions,
        "notes_fr": (
            "Décomposition du Budget Général de l'État (BG net hors R&D) par "
            "mission, exhaustive. Ratios par mission appliqués sur la part "
            "S1311 (État + ODAC) du calculateur."
        ),
    }


def build_local_avg_eur_hab() -> dict:
    """Compute population-weighted national avg of dépenses €/hab from communes-all."""
    if not COMMUNES_ALL.exists():
        return {
            "value_eur_hab": None,
            "note": f"{COMMUNES_ALL.name} not found — run sync_ofgl_all_communes.py first",
        }
    with open(COMMUNES_ALL, encoding="utf-8") as f:
        idx = json.load(f)

    total_dep = 0.0
    total_pop = 0
    n_used = 0
    for entry in idx["communes"].values():
        kpis = entry.get("kpis", {})
        dep = kpis.get("depenses_totales", {})
        montant = dep.get("montant")
        pop = entry.get("pop") or 0
        if montant and pop > 0:
            total_dep += montant
            total_pop += pop
            n_used += 1
    avg = total_dep / total_pop if total_pop > 0 else None

    return {
        "value_eur_hab": round(avg, 1) if avg else None,
        "year": idx.get("year"),
        "n_communes_used": n_used,
        "total_pop_used": total_pop,
        "source": idx.get("source"),
        "source_url": idx.get("source_url"),
        "notes_fr": (
            "Moyenne pondérée par la population des dépenses totales communales "
            "€/hab (champ « Dépenses totales hors remboursements de dette », OFGL). "
            "Ne concerne que le bloc communal (~55% des APUL) — borne basse de "
            "ce qu'une commune dépense en moyenne."
        ),
    }


def _build_stack_from_seed(
    seed_name: str,
    *,
    key_field: str = "key",
    scope: str,
    perimeter_fr: str,
    perimeter_en: str,
    notes_fr: str,
) -> dict:
    """Build a stack-style deep-dive payload from a seed CSV.

    Expects columns: <key_field>, label_fr, label_en, montant_md_eur, share,
    source, source_url, date_reference, notes.
    """
    rows = _read_seed(seed_name)
    items = {}
    sum_md = 0.0
    sum_share = 0.0
    src = ""
    src_url = ""
    date_ref = ""
    for r in rows:
        key = r[key_field]
        md = float(r["montant_md_eur"] or 0)
        share = float(r["share"] or 0)
        sum_md += md
        sum_share += share
        items[key] = {
            "label_fr": r["label_fr"],
            "label_en": r["label_en"],
            "montant_md_eur": md,
            "share": share,
            "notes": r.get("notes") or "",
        }
        src = r["source"]
        src_url = r["source_url"]
        date_ref = r.get("date_reference") or ""

    return {
        "scope": scope,
        "perimeter_fr": perimeter_fr,
        "perimeter_en": perimeter_en,
        "total_md_eur": round(sum_md, 1),
        "sum_share": round(sum_share, 4),
        "source": src,
        "source_url": src_url,
        "date_reference": date_ref,
        "items": items,
        "notes_fr": notes_fr,
    }


def _align_state_deepdive_to_plf(
    deepdive: dict,
    state_breakdown: dict,
    mission_codes: list[str],
    align_note_fr: str,
) -> dict:
    """Rescale a state-anchored deep-dive so its `total_md_eur` matches the
    authoritative PLF figure (sum of `state_breakdown.missions[code].cp_eur`
    for the given mission codes), and per-item `montant_md_eur` + `share`
    are rescaled proportionally.

    Why? Some seeds (`seed_plf_defense_titres.csv`,
    `seed_education_niveaux.csv`, `seed_dette_charges.csv`,
    `seed_etat_autres_ministeres.csv`) embed editorial subtotals that drift
    from the LFI sync (e.g. 50.1 Md€ vs PLF DA 60.0 Md€). The State
    bucket logic in `lib/daily-bread.ts` reads `state_breakdown.missions[].cp_eur`
    directly, so the per-bucket monthly figure for the user is correct —
    but the deepdive header was off, and `defenseShareOfState` (computed
    from `total_md_eur`) was equally off. Authoritative = PLF.

    Per-item sub-shares (T2 personnels share ~48 %, niveau 2nd degré ~38 %,
    OAT ~85 %, opérateurs ~34 %) are kept from the seed (editorial
    decomposition), only the absolute amounts are rescaled.
    """
    if not deepdive or not deepdive.get("items"):
        return deepdive
    missions = {m["code"]: m for m in state_breakdown.get("missions", [])}
    plf_total_eur = sum(
        missions.get(c, {}).get("cp_eur") or 0 for c in mission_codes
    )
    if plf_total_eur <= 0:
        return deepdive
    plf_total_md = plf_total_eur / 1e9
    seed_total_md = float(deepdive.get("total_md_eur") or 0)
    if seed_total_md <= 0:
        return deepdive
    scale = plf_total_md / seed_total_md
    new_items = {}
    new_sum_md = 0.0
    new_sum_share = 0.0
    for k, v in deepdive["items"].items():
        new_md = round(float(v["montant_md_eur"]) * scale, 2)
        new_items[k] = {
            **v,
            "montant_md_eur": new_md,
        }
        new_sum_md += new_md
    # Rebase shares on the new total (preserve item-level proportions).
    if new_sum_md > 0:
        for k, v in new_items.items():
            v["share"] = round(v["montant_md_eur"] / new_sum_md, 4)
            new_sum_share += v["share"]
    out = {
        **deepdive,
        "items": new_items,
        "total_md_eur": round(new_sum_md, 1),
        "sum_share": round(new_sum_share, 4),
        "alignment_note_fr": align_note_fr,
        "alignment_source": (
            "PLF " + str(state_breakdown.get("year") or "") +
            " — state_breakdown.missions["
            + ",".join(mission_codes) + "].cp_eur"
        ),
        "alignment_source_url": state_breakdown.get("source_url"),
    }
    return out


def _build_local_from_seed(
    seed_name: str,
    *,
    scope: str,
    perimeter_fr: str,
    perimeter_en: str,
    notes_fr: str,
) -> dict:
    """Build a local-style deep-dive payload (same shape as bloc_communal)
    from a seed CSV with columns: key, label_fr, label_en, share, eur_hab,
    source, source_url, date_reference, notes.

    No INSEE overlay (only national_avg_weighted).
    """
    rows = _read_seed(seed_name)
    national_avg = {}
    fonctions = []
    src = ""
    src_url = ""
    date_ref = ""
    scope_note_fr = ""
    for r in rows:
        key = r["key"]
        share = float(r["share"] or 0)
        eur_hab = float(r["eur_hab"] or 0)
        national_avg[key] = {
            "share": share,
            "eur_hab": eur_hab,
            "label_fr": r["label_fr"],
            "label_en": r["label_en"],
        }
        fonctions.append(key)
        src = r["source"]
        src_url = r["source_url"]
        date_ref = r.get("date_reference") or ""
        if not scope_note_fr and r.get("notes"):
            scope_note_fr = r["notes"]
    return {
        "scope": scope,
        "perimeter_fr": perimeter_fr,
        "perimeter_en": perimeter_en,
        "year": int(date_ref[:4]) if date_ref else None,
        "source": src,
        "source_url": src_url,
        "scope_note_fr": scope_note_fr,
        "fonctions": fonctions,
        "national_avg_weighted": national_avg,
        "by_insee_top_200": {},
        "notes_fr": notes_fr,
    }


def build_deepdive_sante() -> dict:
    """ONDAM PLFSS 2025 sub-objectives — Health deep-dive (under Sécu)."""
    return _build_stack_from_seed(
        "seed_ondam_subobjectifs.csv",
        scope="ondam_plfss_2025_subobjectifs",
        perimeter_fr="ONDAM voté PLFSS 2025 ventilé en sous-objectifs",
        perimeter_en="Voted ONDAM PLFSS 2025 split by sub-objective",
        notes_fr=(
            "Ventilation de l'ONDAM voté (Objectif national des dépenses "
            "d'assurance maladie) en 5 sous-objectifs PLFSS 2025. Appliqué "
            "à la part CNAM/maladie de la contribution Sécu de l'utilisateur "
            "pour donner le découpage 'à l'intérieur de la Santé'."
        ),
    )


def build_deepdive_defense() -> dict:
    """PLF 2025 Mission Défense — breakdown by titre budgétaire."""
    return _build_stack_from_seed(
        "seed_plf_defense_titres.csv",
        key_field="titre",
        scope="plf2025_mission_defense_titres",
        perimeter_fr="PLF 2025 — Mission Défense ventilée par titre budgétaire",
        perimeter_en="PLF 2025 — Defence Mission split by budget title",
        notes_fr=(
            "Ventilation de la Mission Défense (PLF 2025) en 4 titres "
            "budgétaires (T2 personnels, T3 fonctionnement, T5 équipement, "
            "T6 intervention/OPEX). Appliqué à la part Défense de la "
            "contribution État de l'utilisateur."
        ),
    )


def build_deepdive_retraites() -> dict:
    return _build_stack_from_seed(
        "seed_drees_retraites_branches.csv",
        scope="drees_retraites_branches_2023",
        perimeter_fr="DREES — Pensions versées en 2023 ventilées par grand régime",
        perimeter_en="DREES — Pensions paid in 2023 split by main scheme",
        notes_fr=(
            "Ventilation des pensions de retraite versées en France par grand "
            "régime (régime général, fonction publique, indépendants, "
            "régimes spéciaux). Appliqué à la part CNAV/retraites de la "
            "contribution Sécu."
        ),
    )


def build_deepdive_famille() -> dict:
    return _build_stack_from_seed(
        "seed_secu_famille_prestations.csv",
        scope="ccss_caf_prestations_2024",
        perimeter_fr="Branche Famille (CAF/CNAF) — prestations versées 2023",
        perimeter_en="Family branch (CAF/CNAF) — benefits paid 2023",
        notes_fr=(
            "Ventilation des prestations versées par la CAF (allocations "
            "familiales, aides au logement, RSA, prime d'activité, AAH/ASPA). "
            "Certaines sont gérées par la CAF mais financées par l'État ou "
            "les départements (RSA, AAH). Appliqué à la part CAF de la "
            "contribution Sécu."
        ),
    )


def build_deepdive_chomage() -> dict:
    return _build_stack_from_seed(
        "seed_unedic_prestations.csv",
        scope="unedic_prestations_2023",
        perimeter_fr="UNEDIC — Allocations chômage versées 2023",
        perimeter_en="UNEDIC — Unemployment benefits paid 2023",
        notes_fr=(
            "Ventilation des allocations chômage versées par l'UNEDIC : "
            "ARE (gros morceau), aides à la formation, autres indemnisations "
            "(AER/ASP/ATA). Appliqué à la part UNEDIC de la contribution Sécu."
        ),
    )


def build_deepdive_education() -> dict:
    return _build_stack_from_seed(
        "seed_education_niveaux.csv",
        scope="depp_rers_2024_niveaux_education",
        perimeter_fr="DEPP RERS 2024 — Dépenses Éducation par niveau",
        perimeter_en="DEPP RERS 2024 — Education spending by level",
        notes_fr=(
            "Ventilation par niveau d'enseignement (1er degré, 2nd degré, "
            "supérieur, recherche). État finance les enseignants ; "
            "communes/départements/régions financent les bâtiments. "
            "Appliqué au bucket Éducation de la contribution État."
        ),
    )


def build_deepdive_dette() -> dict:
    return _build_stack_from_seed(
        "seed_dette_charges.csv",
        scope="aft_dette_charges_2024",
        perimeter_fr="AFT/Bercy — Charge de la dette 2024 ventilée",
        perimeter_en="AFT/Treasury — Debt service 2024 split",
        notes_fr=(
            "Ventilation de la charge de la dette : intérêts long terme "
            "(OAT), court terme (BTF), frais d'émission/couverture. "
            "Appliqué au bucket Charge dette de la contribution État."
        ),
    )


def build_deepdive_autres_ministeres() -> dict:
    return _build_stack_from_seed(
        "seed_etat_autres_ministeres.csv",
        scope="plf2025_autres_ministeres_operateurs",
        perimeter_fr="PLF 2025 — Autres missions hors top 5 + opérateurs",
        perimeter_en="PLF 2025 — Other missions beyond top 5 + operators",
        notes_fr=(
            "Regroupement des missions hors top 5 du budget État : "
            "solidarités/santé/handicap, agriculture, intérieur (hors "
            "sécurité), affaires étrangères + outre-mer, opérateurs "
            "(universités, France Travail, ADEME). Appliqué au bucket "
            "Autres ministères."
        ),
    )


def build_deepdive_departement() -> dict:
    return _build_local_from_seed(
        "seed_ofgl_departements_fonctionnelle.csv",
        scope="ofgl_departements_fonctionnelle_national_avg",
        perimeter_fr="OFGL — Ventilation fonctionnelle moyenne des départements (M52)",
        perimeter_en="OFGL — Functional breakdown of departments (M52, national avg)",
        notes_fr=(
            "Moyenne nationale des dépenses départementales (M52) par "
            "fonction. Action sociale (RSA, APA, ASE, PCH) domine "
            "très largement. Appliquée à la part Département de la "
            "contribution Local."
        ),
    )


def build_deepdive_region() -> dict:
    return _build_local_from_seed(
        "seed_ofgl_regions_fonctionnelle.csv",
        scope="ofgl_regions_fonctionnelle_national_avg",
        perimeter_fr="OFGL — Ventilation fonctionnelle moyenne des régions (M71)",
        perimeter_en="OFGL — Functional breakdown of regions (M71, national avg)",
        notes_fr=(
            "Moyenne nationale des dépenses régionales (M71) par fonction. "
            "Transports (TER), lycées et formation professionnelle "
            "constituent le cœur. Appliquée à la part Région de la "
            "contribution Local."
        ),
    )


def build_deepdive_bloc_communal() -> dict:
    """OFGL/DGCL — Bloc communal national average breakdown by fonction."""
    src_path = ROOT / "website" / "public" / "data" / "communes-all" / "fonctionnelle.json"
    if not src_path.exists():
        print(f"  ⚠ {src_path.name} missing — run sync_ofgl_communes_fonctionnelle.py first")
        return {}
    with open(src_path, encoding="utf-8") as f:
        data = json.load(f)

    return {
        "scope": "ofgl_communes_fonctionnelle_national_avg",
        "perimeter_fr": "OFGL/DGCL — Ventilation fonctionnelle moyenne du bloc communal (national pondéré population)",
        "perimeter_en": "OFGL/DGCL — Functional breakdown of the municipal block (national, pop-weighted)",
        "year": data.get("year"),
        "source": data.get("source"),
        "source_url": data.get("source_url"),
        "scope_note_fr": data.get("scope_note_fr"),
        "fonctions": data.get("fonctions", []),
        "national_avg_weighted": data.get("national_avg_weighted", {}),
        "by_insee_top_200": data.get("by_insee_top_200", {}),
        "notes_fr": (
            "Moyenne nationale du bloc communal (communes + EPCI) ventilée "
            "par grande fonction M14. Appliquée à la part bloc communal "
            "de la contribution Local de l'utilisateur."
        ),
    }


def build_equivalents() -> dict:
    """Build equivalents block from seed_db_equivalents.csv."""
    rows = _read_seed("seed_db_equivalents.csv")
    items = {}
    for r in rows:
        key = r["key"]
        items[key] = {
            "label_fr": r["label_fr"],
            "label_en": r["label_en"],
            "value": _cast_value(r["value"]),
            "unit": r["unit"],
            "year": int(r["year"]) if r.get("year") else None,
            "source": r["source"],
            "source_url": r["source_url"],
            "date_reference": r["date_reference"],
            "notes": r.get("notes") or "",
        }
    return {
        "description_fr": (
            "Équivalences concrètes utilisées pour la section « ce que ça finance » "
            "du calculateur Daily Bread. Chaque valeur est une approximation "
            "pédagogique avec sa source officielle."
        ),
        "items": items,
    }


def main() -> int:
    print("→ Daily Bread export")
    NATIONAL_DIR.mkdir(parents=True, exist_ok=True)

    fiscal = build_fiscal_constants()
    apu = build_apu_subsectors()
    apul = build_apul_subsectors()
    state = build_state_breakdown()
    local_avg = build_local_avg_eur_hab()
    equivalents = build_equivalents()
    deepdive_sante = build_deepdive_sante()
    deepdive_retraites = build_deepdive_retraites()
    deepdive_famille = build_deepdive_famille()
    deepdive_chomage = build_deepdive_chomage()
    deepdive_defense = build_deepdive_defense()
    deepdive_education = build_deepdive_education()
    deepdive_dette = build_deepdive_dette()
    deepdive_autres_ministeres = build_deepdive_autres_ministeres()
    deepdive_bloc_communal = build_deepdive_bloc_communal()
    deepdive_departement = build_deepdive_departement()
    deepdive_region = build_deepdive_region()

    # ── Snapshot align (Stage 1 fix, Md€ totals on State-anchored deepdives) ──
    # Recale les deepdives ancrés sur l'État (Défense / Éducation / Dette /
    # Autres) pour que leur `total_md_eur` corresponde EXACTEMENT à
    # `state_breakdown.missions[].cp_eur` (PLF). Évite la divergence visuelle
    # entre la barre top-level (PLF, ex: 60 Md€ Défense) et le DeepDive
    # éditorial (snapshot AFT/Bercy ou DEPP, ex: 50,1 Md€ Défense).
    # Voir aussi `_align_state_deepdive_to_plf` pour la convention.
    # Les codes mission ci-dessous reflètent le mapping `STATE_BUCKET_DEFS`
    # de `website/src/lib/daily-bread.ts`.
    deepdive_defense = _align_state_deepdive_to_plf(
        deepdive_defense, state, mission_codes=["DA"],
        align_note_fr=(
            "Total recalé sur PLF Mission « Défense » (DA). Décomposition "
            "par titre conservée du seed seed_plf_defense_titres.csv "
            "(montants rescalés proportionnellement)."
        ),
    )
    deepdive_education = _align_state_deepdive_to_plf(
        deepdive_education, state, mission_codes=["EC", "RA"],
        align_note_fr=(
            "Total recalé sur PLF Missions « Enseignement scolaire » (EC) "
            "+ « Recherche et enseignement supérieur » (RA), pour matcher "
            "le bucket éditorial UI « Éducation, recherche ». "
            "Décomposition par niveau conservée, montants rescalés."
        ),
    )
    deepdive_dette = _align_state_deepdive_to_plf(
        deepdive_dette, state, mission_codes=["EB"],
        align_note_fr=(
            "Total recalé sur PLF Mission « Engagements financiers de "
            "l'État » (EB). Décomposition (OAT/BTF/frais) conservée."
        ),
    )
    deepdive_autres_ministeres = _align_state_deepdive_to_plf(
        deepdive_autres_ministeres, state,
        mission_codes=[
            "GA", "RB", "AV", "AD", "AB", "AC", "DB", "AA", "OA",
            "IA", "MB", "SA", "PB", "DC", "CA", "TR", "PC", "PR",
        ],
        align_note_fr=(
            "Total recalé sur la somme PLF des 18 missions du bucket "
            "« Autres » (Agriculture, Outre-mer, Action extérieure, "
            "Économie, Anciens combattants, Santé mission étatique, etc.). "
            "Décomposition conservée, montants rescalés."
        ),
    )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": (
            "pipeline/seeds/seed_fiscal_constants.csv + seed_csg_retraite_tranches.csv + "
            "seed_db_equivalents.csv + "
            "seed_apul_subsectors.csv + seed_ondam_subobjectifs.csv + "
            "seed_plf_defense_titres.csv + seed_ofgl_communes_fonctionnelle.csv + "
            "seed_drees_retraites_branches.csv + seed_secu_famille_prestations.csv + "
            "seed_unedic_prestations.csv + seed_education_niveaux.csv + "
            "seed_dette_charges.csv + seed_etat_autres_ministeres.csv + "
            "seed_ofgl_departements_fonctionnelle.csv + seed_ofgl_regions_fonctionnelle.csv + "
            "sync_eurostat_apu_subsectors.json + sync_etat_lfi.json + "
            "sync_ofgl_all_communes/index.json + sync_ofgl_communes_fonctionnelle.json"
        ),
        "audit_promise": (
            "Toute valeur numérique du calculateur Daily Bread est tracée "
            "jusqu'à sa source officielle (CGI, URSSAF, Eurostat, INSEE, "
            "OFGL, DREES, Sécurité sociale)."
        ),
        "fiscal_constants": fiscal,
        "apu_subsectors": apu,
        "subsector_breakdowns": apul,
        "state_breakdown": state,
        "local_avg_dep_eur_hab": local_avg,
        "equivalents": equivalents,
        "deepdive": {
            "sante": deepdive_sante,
            "retraites": deepdive_retraites,
            "famille": deepdive_famille,
            "chomage": deepdive_chomage,
            "defense": deepdive_defense,
            "education": deepdive_education,
            "dette": deepdive_dette,
            "autres_ministeres": deepdive_autres_ministeres,
            "bloc_communal": deepdive_bloc_communal,
            "departement": deepdive_departement,
            "region": deepdive_region,
        },
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"  ✓ Wrote {OUTPUT_PATH.name} ({size_kb:.1f} KB)")
    print(f"\n  Sanity check:")
    print(f"    IR tranches : {len(fiscal['ir']['baremes'])}")
    print(f"    Equivalents : {len(equivalents['items'])} items")
    print(f"    APU sectors : {list(apu.get('institutions', {}).keys())}")
    print(f"    Local avg   : {local_avg.get('value_eur_hab')} €/hab "
          f"(over {local_avg.get('n_communes_used')} communes, "
          f"{(local_avg.get('total_pop_used') or 0) / 1e6:.1f}M hab)")
    print(f"    State top   : "
          f"{state.get('top_missions_share_total', 0) * 100:.0f}% of net BG covered by top 10")
    print(f"    Deepdive Santé    : {len(deepdive_sante.get('items', {}))} sous-objectifs ONDAM, "
          f"total {deepdive_sante.get('total_md_eur', 0)} Md€")
    print(f"    Deepdive Retraites: {len(deepdive_retraites.get('items', {}))} régimes, "
          f"total {deepdive_retraites.get('total_md_eur', 0)} Md€")
    print(f"    Deepdive Famille  : {len(deepdive_famille.get('items', {}))} prestations, "
          f"total {deepdive_famille.get('total_md_eur', 0)} Md€")
    print(f"    Deepdive Chômage  : {len(deepdive_chomage.get('items', {}))} prestations, "
          f"total {deepdive_chomage.get('total_md_eur', 0)} Md€")
    print(f"    Deepdive Défense  : {len(deepdive_defense.get('items', {}))} titres, "
          f"total {deepdive_defense.get('total_md_eur', 0)} Md€")
    print(f"    Deepdive Education: {len(deepdive_education.get('items', {}))} niveaux, "
          f"total {deepdive_education.get('total_md_eur', 0)} Md€")
    print(f"    Deepdive Dette    : {len(deepdive_dette.get('items', {}))} composantes, "
          f"total {deepdive_dette.get('total_md_eur', 0)} Md€")
    print(f"    Deepdive Autres   : {len(deepdive_autres_ministeres.get('items', {}))} familles, "
          f"total {deepdive_autres_ministeres.get('total_md_eur', 0)} Md€")
    print(f"    Deepdive Bloc com.: {len(deepdive_bloc_communal.get('national_avg_weighted', {}))} fonctions")
    print(f"    Deepdive Dépt     : {len(deepdive_departement.get('national_avg_weighted', {}))} fonctions")
    print(f"    Deepdive Région   : {len(deepdive_region.get('national_avg_weighted', {}))} fonctions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
