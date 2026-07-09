#!/usr/bin/env python3
"""
Aggregate the three sub-builds (etat / secu / local) into the final
daily_bread_drilldown.json contract consumed by the Daily Bread drawer.

Sub-builds:
    build_drilldown_etat.py   -> _drilldown_etat.json   (S1311, missions+programmes)
    build_drilldown_secu.py   -> _drilldown_secu.json   (S1314, branches ASSO + level3)
    build_drilldown_local.py  -> _drilldown_local.json  (S1313, fonctions OFGL)

Final output:
    website/public/data/national/daily_bread_drilldown.json

Schema (see project brief):
    {
      "generated_at": "...",
      "source_pipeline": "scripts/enrich/build_drilldown.py",
      "buckets": {
        "secu":  { code, label_fr, label_en, level2: [...] },
        "etat":  { code, label_fr, label_en, level2: [...] },
        "local": { code, label_fr, label_en, level2: [...] }
      }
    }

Validation (auto-eval, raises on hard violations, warns on soft):
    - keys present: secu, etat, local
    - sum(share_of_parent) at level2 in [0.95, 1.05] per bucket
    - same for level3 within each level2 that has level3
    - every entry has non-null `source` AND `source_url`
    - every entry has a non-empty `label_en`
    - every `key` matches ^[a-z0-9_]+$ and is unique within its parent
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Re-use the sub-builders so the orchestrator is the single entrypoint.
sys.path.insert(0, str(Path(__file__).parent))
from build_drilldown_etat import build_etat_bucket  # noqa: E402
from build_drilldown_local import build_local_bucket  # noqa: E402
from build_drilldown_secu import build_secu_bucket  # noqa: E402

ROOT = Path(__file__).parent.parent.parent.parent
# Canonical published output (consumed by the website + Daily Bread drawer).
PUBLIC_NATIONAL_DIR = ROOT / "website" / "public" / "data" / "national"
OUTPUT_PATH = PUBLIC_NATIONAL_DIR / "daily_bread_drilldown.json"

# Curated FR→EN label seed. Sub-builders fall back to `label_en = label_fr`
# when they have no translation (documented TODO at programme grain) — the
# orchestrator patches those from this seed so the EN site never shows FR
# programme/action names.
LABELS_EN_SEED = ROOT / "pipeline" / "seeds" / "seed_drilldown_labels_en.csv"

# FR action labels embed a "Action NN — " prefix (PLF convention). The seed
# is keyed on the stem (prefix stripped) so identical actions across
# programmes share one translation; EN labels drop the prefix, matching the
# curated hints in build_drilldown_etat_actions.py.
_ACTION_PREFIX = re.compile(r"^Action\s+\S+\s+—\s+")

_KEY_OK = re.compile(r"^[a-z0-9_]+$")
SHARE_TOL_LO = 0.95
SHARE_TOL_HI = 1.05


def _load_labels_en() -> dict[str, str]:
    """Load the FR-stem → EN seed. Missing file → empty overlay (soft)."""
    if not LABELS_EN_SEED.exists():
        return {}
    import csv
    overlay: dict[str, str] = {}
    with open(LABELS_EN_SEED, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            fr = (row.get("label_fr") or "").strip()
            en = (row.get("label_en") or "").strip()
            if fr and en:
                overlay[fr] = en
    return overlay


def apply_en_overrides(payload: dict) -> tuple[int, list[str]]:
    """Patch entries whose `label_en` fell back to FR, from the seed.

    Returns (patched_count, still_untranslated_fr_labels).
    """
    overlay = _load_labels_en()
    patched = 0
    missing: list[str] = []

    def visit(entry: dict) -> None:
        nonlocal patched
        fr = entry.get("label_fr")
        en = entry.get("label_en")
        if fr and en == fr:
            stem = _ACTION_PREFIX.sub("", fr)
            translated = overlay.get(stem) or overlay.get(fr)
            if translated:
                entry["label_en"] = translated
                patched += 1
            else:
                missing.append(fr)
        for child_key in ("level2", "level3", "level4", "aggregations"):
            for child in entry.get(child_key) or []:
                visit(child)
        for block_key in ("departement", "region"):
            block = entry.get(block_key)
            if block:
                visit(block)

    for bucket in (payload.get("buckets") or {}).values():
        visit(bucket)
    return patched, missing


def _check_entry(entry: dict, ctx: str, errors: list[str]) -> None:
    """Validate a single level2/level3 entry."""
    key = entry.get("key")
    if not key or not isinstance(key, str) or not _KEY_OK.match(key):
        errors.append(f"{ctx}: bad/missing key {key!r}")
    if not entry.get("label_fr"):
        errors.append(f"{ctx}[{key}]: missing label_fr")
    if not entry.get("label_en"):
        errors.append(f"{ctx}[{key}]: missing label_en")
    if not entry.get("source"):
        errors.append(f"{ctx}[{key}]: missing source")
    if not entry.get("source_url"):
        errors.append(f"{ctx}[{key}]: missing source_url")
    s = entry.get("share_of_parent")
    if s is None or not isinstance(s, (int, float)):
        errors.append(f"{ctx}[{key}]: bad share_of_parent={s!r}")


def _check_level2_block(level2: list[dict], ctx: str, errors: list[str],
                        warnings: list[str]) -> float:
    """Validate a level2 list (level3+level4 recursively). Returns sum(share)."""
    seen_l2: set = set()
    sum_l2 = 0.0
    for m in level2:
        _check_entry(m, ctx, errors)
        k = m.get("key")
        if k in seen_l2:
            errors.append(f"{ctx}: duplicate key {k!r}")
        seen_l2.add(k)
        s = m.get("share_of_parent")
        if isinstance(s, (int, float)):
            sum_l2 += s

        level3 = m.get("level3") or []
        if level3:
            seen_l3: set = set()
            sum_l3 = 0.0
            for p in level3:
                _check_entry(p, f"{ctx}[{k}].level3", errors)
                pk = p.get("key")
                if pk in seen_l3:
                    errors.append(f"{ctx}[{k}].level3: duplicate key {pk!r}")
                seen_l3.add(pk)
                sp = p.get("share_of_parent")
                if isinstance(sp, (int, float)):
                    sum_l3 += sp

                level4 = p.get("level4") or []
                if level4:
                    seen_l4: set = set()
                    sum_l4 = 0.0
                    for a in level4:
                        _check_entry(a, f"{ctx}[{k}].level3[{pk}].level4", errors)
                        ak = a.get("key")
                        if ak in seen_l4:
                            errors.append(
                                f"{ctx}[{k}].level3[{pk}].level4: duplicate "
                                f"key {ak!r}"
                            )
                        seen_l4.add(ak)
                        sa = a.get("share_of_parent")
                        if isinstance(sa, (int, float)):
                            sum_l4 += sa
                    if not (SHARE_TOL_LO <= sum_l4 <= SHARE_TOL_HI):
                        errors.append(
                            f"{ctx}[{k}].level3[{pk}].level4: sum"
                            f"(share_of_parent)={sum_l4:.4f} outside "
                            f"[{SHARE_TOL_LO}, {SHARE_TOL_HI}]"
                        )

            if not (SHARE_TOL_LO <= sum_l3 <= SHARE_TOL_HI):
                errors.append(
                    f"{ctx}[{k}].level3: sum(share_of_parent)={sum_l3:.4f} "
                    f"outside [{SHARE_TOL_LO}, {SHARE_TOL_HI}]"
                )
            else:
                warnings.append(f"{ctx}[{k}].level3 sum={sum_l3:.4f} (ok)")

    return sum_l2


def validate_drilldown(payload: dict) -> tuple[list[str], list[str]]:
    """Run the auto-eval contract checks. Returns (errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []

    buckets = payload.get("buckets") or {}
    expected = {"secu", "etat", "local"}
    missing = expected - set(buckets.keys())
    if missing:
        errors.append(f"Missing buckets: {sorted(missing)}")

    for bucket_name, bucket in buckets.items():
        ctx = f"buckets.{bucket_name}"
        if not bucket.get("code"):
            errors.append(f"{ctx}: missing code")
        if not bucket.get("label_fr"):
            errors.append(f"{ctx}: missing label_fr")
        if not bucket.get("label_en"):
            errors.append(f"{ctx}: missing label_en")

        level2 = bucket.get("level2") or []
        if not level2:
            errors.append(f"{ctx}: empty level2")
            continue

        sum_l2 = _check_level2_block(level2, f"{ctx}.level2", errors, warnings)
        if not (SHARE_TOL_LO <= sum_l2 <= SHARE_TOL_HI):
            errors.append(
                f"{ctx}.level2: sum(share_of_parent)={sum_l2:.4f} outside "
                f"[{SHARE_TOL_LO}, {SHARE_TOL_HI}]"
            )
        else:
            warnings.append(f"{ctx}.level2 sum={sum_l2:.4f} (ok)")

        # Validate `aggregations` (etat editorial buckets) if present.
        aggregations = bucket.get("aggregations") or []
        if aggregations:
            seen_agg: set = set()
            sum_agg = 0.0
            for agg in aggregations:
                ak = agg.get("key")
                if not ak or not _KEY_OK.match(ak):
                    errors.append(f"{ctx}.aggregations: bad key {ak!r}")
                if ak in seen_agg:
                    errors.append(f"{ctx}.aggregations: duplicate key {ak!r}")
                seen_agg.add(ak)
                if not agg.get("label_fr"):
                    errors.append(f"{ctx}.aggregations[{ak}]: missing label_fr")
                if not agg.get("label_en"):
                    errors.append(f"{ctx}.aggregations[{ak}]: missing label_en")
                missions = agg.get("missions") or []
                if not isinstance(missions, list):
                    errors.append(f"{ctx}.aggregations[{ak}]: missions not list")
                sa = agg.get("share_of_parent")
                if isinstance(sa, (int, float)):
                    sum_agg += sa
                else:
                    errors.append(f"{ctx}.aggregations[{ak}]: bad share_of_parent")
            if not (SHARE_TOL_LO <= sum_agg <= SHARE_TOL_HI):
                errors.append(
                    f"{ctx}.aggregations: sum(share_of_parent)={sum_agg:.4f} "
                    f"outside [{SHARE_TOL_LO}, {SHARE_TOL_HI}]"
                )
            else:
                warnings.append(f"{ctx}.aggregations sum={sum_agg:.4f} (ok)")

        # Validate optional dept/region sub-buckets (S1313 only in practice).
        for sub_key in ("departement", "region"):
            sub = bucket.get(sub_key)
            if not sub:
                continue
            sub_ctx = f"{ctx}.{sub_key}"
            if not sub.get("label_fr"):
                errors.append(f"{sub_ctx}: missing label_fr")
            if not sub.get("label_en"):
                errors.append(f"{sub_ctx}: missing label_en")
            sub_level2 = sub.get("level2") or []
            if not sub_level2:
                errors.append(f"{sub_ctx}: empty level2")
                continue
            sum_sub = _check_level2_block(
                sub_level2, f"{sub_ctx}.level2", errors, warnings
            )
            if not (SHARE_TOL_LO <= sum_sub <= SHARE_TOL_HI):
                errors.append(
                    f"{sub_ctx}.level2: sum(share_of_parent)={sum_sub:.4f} "
                    f"outside [{SHARE_TOL_LO}, {SHARE_TOL_HI}]"
                )
            else:
                warnings.append(f"{sub_ctx}.level2 sum={sum_sub:.4f} (ok)")

    return errors, warnings


def build_drilldown() -> dict:
    # Fetch the PLF actions index once (used to graft level4 onto etat
    # programmes). Lives in the etat sub-build but exposed as an explicit
    # arg so the orchestrator owns the network round-trip.
    from build_drilldown_etat_actions import build_etat_actions_index
    actions_index = build_etat_actions_index()

    secu = build_secu_bucket()
    etat = build_etat_bucket(actions_index=actions_index)
    local = build_local_bucket()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": "scripts/enrich/build_drilldown.py",
        "audit_promise": (
            "Toute valeur (share_of_parent, label, source) provient d'un seed "
            "CSV, d'une donnée synchronisée (etat_lfi_2025.json) ou d'une "
            "agrégation directe du dataset PLF (data.economie.gouv.fr) — "
            "aucune valeur hardcodée dans ce script."
        ),
        "buckets": {
            "secu": secu,
            "etat": etat,
            "local": local,
        },
    }


def main() -> int:
    payload = build_drilldown()

    patched, missing_en = apply_en_overrides(payload)
    print(f"[i18n] label_en patched from seed: {patched}")
    if missing_en:
        print(f"[i18n] WARNING: {len(missing_en)} label(s) still FR-only "
              f"(add to {LABELS_EN_SEED.name}):")
        for lbl in sorted(set(missing_en))[:20]:
            print(f"    - {lbl}")

    errors, warnings = validate_drilldown(payload)

    print("=" * 60)
    print("Drilldown validation")
    print("=" * 60)
    for w in warnings:
        print(f"  [info] {w}")
    if errors:
        print()
        for e in errors:
            print(f"  [ERROR] {e}")
        print()
        print(f"FAIL: {len(errors)} contract violation(s).")
        return 1

    PUBLIC_NATIONAL_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    # ─ Cross-cutting themes (Stage 2C+2D) ────────────────────────────────
    # Dépend de daily_bread_drilldown.json qu'on vient d'écrire — on
    # chaîne ici plutôt que dans run_enrichment.py (qui est LLM-only).
    try:
        from build_cross_cutting_themes import main as build_cct_main
        print()
        print("=" * 60)
        print("Cross-cutting themes (Sante / Education / Solidarite)")
        print("=" * 60)
        cct_rc = build_cct_main()
        if cct_rc != 0:
            print("[WARN] cross-cutting themes build returned non-zero")
    except Exception as exc:  # pragma: no cover — diagnostic
        print(f"[WARN] cross-cutting themes build skipped: {exc}")

    # Summary
    print()
    for name, bucket in payload["buckets"].items():
        n2 = len(bucket["level2"])
        n3 = sum(len(m.get("level3", [])) for m in bucket["level2"])
        n4 = sum(
            len(p.get("level4", []))
            for m in bucket["level2"]
            for p in m.get("level3", [])
        )
        n_progs_with_l4 = sum(
            1
            for m in bucket["level2"]
            for p in m.get("level3", [])
            if p.get("level4")
        )
        sum2 = sum(m["share_of_parent"] for m in bucket["level2"])
        line = (
            f"  [{name}] level2={n2} level3_total={n3} level4_total={n4} "
            f"(progs_with_l4={n_progs_with_l4}) sum(level2)={sum2:.4f}"
        )
        agg = bucket.get("aggregations") or []
        if agg:
            line += f"  aggregations={len(agg)}"
        for sub_key in ("departement", "region"):
            sub = bucket.get(sub_key)
            if sub:
                line += f"  {sub_key}_level2={len(sub['level2'])}"
        print(line)
    print()
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
