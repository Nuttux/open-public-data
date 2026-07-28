#!/usr/bin/env python3
"""Patch already-built SF contract exports with the generated explanations.

This is a BRIDGE, not the mechanism. `export_us_sf_contracts.py` reads
`vulgarization_sf_contracts.json` as an input (see `load_vulgarization`), so a
normal export already carries the text. This script exists so the text can be
seen without re-running the export against BigQuery — useful while iterating on
the enrichment itself.

Running it after an export is harmless (idempotent). Running an export after it
is also harmless, which is the whole point of having put the read inside the
export: the SF place glosses were lost exactly once by relying on an
apply-afterwards step, and that is not repeated here.

Usage:
    python pipeline/scripts/enrich/apply_sf_contract_vulgarization.py
    python pipeline/scripts/enrich/apply_sf_contract_vulgarization.py --check
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "export"))
from us_sf_title_expand import expand_title  # noqa: E402
CACHE = ROOT / "pipeline" / "cache" / "enrichment" / "vulgarization_sf_contracts.json"
DATA = ROOT / "website" / "public" / "data" / "us" / "sf"
FIELDS = ("title_clear", "what_concretely")


def key(title: str | None, ctype: str | None) -> str:
    return f"{re.sub(r'\\s+', ' ', (title or '').strip()).upper()}|{ctype or ''}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report coverage, write nothing")
    args = ap.parse_args()

    if not CACHE.exists():
        print(f"❌ no cache at {CACHE.relative_to(ROOT)}", file=sys.stderr)
        return 1
    items = json.loads(CACHE.read_text(encoding="utf-8")).get("items", {})
    print(f"📦 {len(items)} signatures")

    active_path = DATA / "contracts_active.json"
    active = json.loads(active_path.read_text(encoding="utf-8"))
    # authority_family is a new export field; backfill it from the per-contract
    # fiches so the page can group by it without a BigQuery round trip.
    fam_by_no: dict[str, str] = {}
    recon_by_no: dict[str, bool] = {}
    for fp in (DATA / "contracts" / "fiche").glob("*.json"):
        c = json.loads(fp.read_text(encoding="utf-8")).get("contract") or {}
        if c.get("contract_no") and c.get("authority_family"):
            fam_by_no[c["contract_no"]] = c["authority_family"]
        if c.get("contract_no") and c.get("src_arithmetic_consistent") is not None:
            recon_by_no[c["contract_no"]] = c["src_arithmetic_consistent"]
    hit = 0
    money = total = 0.0
    for row in active["rows"]:
        total += row.get("agreed_usd") or 0
        # deterministic shorthand expansion, same chain the export now uses
        expanded = expand_title(row.get("title_plain") or row.get("title"),
                                row.get("department_code"))
        if expanded:
            row["title_plain"] = expanded
        fam = fam_by_no.get(row.get("contract_no"))
        if fam:
            row["authority_family"] = fam
        if row.get("contract_no") in recon_by_no:
            row["src_arithmetic_consistent"] = recon_by_no[row["contract_no"]]
        found = items.get(key(row.get("title"), row.get("contract_type"))) or {}
        wrote = False
        for f in FIELDS:
            v = (found.get(f) or "").strip()
            if v:
                row[f] = v
                wrote = True
            else:
                row.pop(f, None)
        if wrote:
            hit += 1
            money += row.get("agreed_usd") or 0
    print(
        f"   contracts_active.json: {hit}/{len(active['rows'])} rows "
        f"· ${money / 1e9:.1f}B of ${total / 1e9:.1f}B ({money / total:.0%})"
    )

    # The overview carries its own copy of the top sole-source rows, and the
    # page renders those directly — patch them too or that one list stays in
    # register shorthand while every other list is readable.
    ov_path = DATA / "contracts_overview.json"
    ov = json.loads(ov_path.read_text(encoding="utf-8"))
    ov_hit = 0
    for row in ov.get("sole_source", {}).get("top_contracts", []):
        expanded = expand_title(row.get("title_plain") or row.get("title"), None)
        if expanded:
            row["title_plain"] = expanded
        found = items.get(key(row.get("title"), None)) or {}
        # overview rows carry no contract_type, so match on title alone by
        # scanning the signatures that share it
        if not found:
            prefix = key(row.get("title"), "").rstrip("|")
            for sig_key, val in items.items():
                if sig_key.split("|", 1)[0] == prefix:
                    found = val
                    break
        clear = (found.get("title_clear") or "").strip()
        if clear:
            row["title_clear"] = clear
            ov_hit += 1
    print(f"   contracts_overview.json: {ov_hit}/{len(ov.get('sole_source', {}).get('top_contracts', []))} sole-source top rows")

    fiche_dir = DATA / "contracts" / "fiche"
    f_hit = f_total = 0
    fiche_writes: list[tuple[Path, dict]] = []
    for path in sorted(fiche_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        c = payload.get("contract") or {}
        f_total += 1
        expanded = expand_title(c.get("title_plain") or c.get("title"),
                                c.get("department_code"))
        if expanded and c.get("title_plain") != expanded:
            c["title_plain"] = expanded
            changed_plain = True
        else:
            changed_plain = False
        found = items.get(key(c.get("title"), c.get("contract_type"))) or {}
        changed = False
        for f in FIELDS:
            v = (found.get(f) or "").strip() or None
            if c.get(f) != v:
                c[f] = v
                changed = True
        if found.get("title_clear"):
            f_hit += 1
        if changed or changed_plain:
            fiche_writes.append((path, payload))
    print(f"   fiches: {f_hit}/{f_total} carry generated text ({len(fiche_writes)} to rewrite)")

    if args.check:
        print("\n--check: nothing written.")
        return 0

    active_path.write_text(
        json.dumps(active, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    ov_path.write_text(json.dumps(ov, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for path, payload in fiche_writes:
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\n💾 wrote contracts_active.json + {len(fiche_writes)} fiches")
    return 0


if __name__ == "__main__":
    sys.exit(main())
