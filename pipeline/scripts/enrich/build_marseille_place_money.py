#!/usr/bin/env python3
"""
Build the place ↔ money crosswalk for Marseille civic places, mirroring the two
grant relations a Paris lieu carries (deliberations aside):

  • operator  — the place IS the beneficiary (MuCEM, Friche, La Criée). Matched
                on the beneficiary NAME, kept deliberately narrow (one specific
                entity per place) to avoid over-attributing neighbourhood orgs.
                Carries a per-year breakdown so the fiche shows the annual détail.
  • residents — OTHER orgs whose grant *objet* literally names the place
                ("… à la Friche de la Belle de Mai"). The objet is the proof.
                Honest and thin: most Marseille grants don't name a venue.

Source of truth: core_marseille_subventions (row-level, has `objet`) in the dev
BigQuery target. Read-only; writes JSON only.

Output: website/public/data/fr/marseille/places/_money.json
          { slug: { operator: {...}|null, residents: [ {beneficiaire, montant_total,
                     nb, preuve} ] } }
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "website" / "public" / "data" / "fr" / "marseille" / "places" / "_money.json"

CORE = "open-data-france-484717.dbt_paris_dev_claudecode_analytics.core_marseille_subventions"

# Per place: a NARROW operator name-regex (one specific entity) and a residents
# objet-regex (grants naming the place). Either may be None. Operator regexes are
# anchored to the exact institution so neighbourhood namesakes never slip in.
PLACES = {
    "mucem": {
        "operator": r"(?i)^MUSEE DES CIVILISATIONS.*MUCEM$|(?i)\bMUCEM\b",
        "residents": r"(?i)\bMUCEM\b",
    },
    "friche-belle-de-mai": {
        "operator": r"(?i)^FRICHE LA BELLE DE MAI$",
        "residents": r"(?i)friche.{0,12}belle de mai|belle de mai.{0,12}friche",
    },
    "la-criee": {
        "operator": r"(?i)^THEATRE NATIONAL.*CRIEE$|^THEATRE NATIONAL LA CRIEE$",
        "residents": r"(?i)\bla cri[ée]e\b",
    },
    # Residents only where the objet names the ACTUAL building. Marseille grants
    # that mention a landmark word almost always mean a namesake school/street
    # ("MISE A DISPO ECOLE LONGCHAMP", "ECOLE PHARO", "ECOLE LE CORBUSIER") — not
    # the monument — so those places get no residents. The Alcazar library is the
    # one honest case: orgs lent its patio / auditorium / salle de conférence.
    "bibliotheque-alcazar": {"operator": None, "residents": r"(?i)(patio|foyer|auditorium|salle|conf[ée]rence).{0,20}alcazar|alcazar.{0,20}(patio|foyer|auditorium|salle)"},
}

# Grants that value in-kind premises given to a *school* named after a landmark
# ("MISE A DISPO ECOLE …") are never the landmark itself — a hard exclude.
RESIDENT_EXCLUDE = r"(?i)\becole\b|\bmaternelle\b|\b[ée]l[ée]mentaire\b"


def bq(sql: str) -> list[dict]:
    out = subprocess.run(
        ["bq", "query", "--use_legacy_sql=false", "--format=json", "--max_rows=1000", sql],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr)
    return json.loads(out.stdout or "[]")


def build_operator(regex: str) -> dict | None:
    rows = bq(f"""
        SELECT beneficiaire, annee, ROUND(SUM(montant),2) AS montant, COUNT(*) AS nb
        FROM `{CORE}`
        WHERE REGEXP_CONTAINS(beneficiaire, r'''{regex}''')
        GROUP BY beneficiaire, annee
    """)
    if not rows:
        return None
    # Pick the single dominant beneficiary (largest cumulative) — one operator.
    by_ben: dict[str, dict] = {}
    for r in rows:
        e = by_ben.setdefault(r["beneficiaire"], {"total": 0.0, "nb": 0, "rows": []})
        e["total"] += float(r["montant"]); e["nb"] += int(r["nb"])
        e["rows"].append({"annee": int(r["annee"]), "montant": float(r["montant"])})
    ben, agg = max(by_ben.items(), key=lambda kv: kv[1]["total"])
    if agg["total"] < 50000:
        return None
    yr_rows = sorted(agg["rows"], key=lambda x: x["annee"])
    annees = [yr_rows[0]["annee"], yr_rows[-1]["annee"]]
    return {
        "beneficiaire": ben,
        "montant_total": round(agg["total"], 2),
        "nb_subventions": agg["nb"],
        "rows": yr_rows,
        "annees": annees,
    }


def build_residents(regex: str, exclude_ben: str | None) -> list[dict]:
    rows = bq(f"""
        SELECT beneficiaire,
               ROUND(SUM(montant),2) AS montant_total,
               COUNT(*) AS nb,
               ARRAY_AGG(objet ORDER BY montant DESC LIMIT 1)[OFFSET(0)] AS preuve
        FROM `{CORE}`
        WHERE REGEXP_CONTAINS(objet, r'''{regex}''') AND objet IS NOT NULL
          AND NOT REGEXP_CONTAINS(objet, r'''{RESIDENT_EXCLUDE}''')
        GROUP BY beneficiaire
        HAVING montant_total > 0
        ORDER BY montant_total DESC
        LIMIT 8
    """)
    res = []
    for r in rows:
        if exclude_ben and r["beneficiaire"] == exclude_ben:
            continue  # the operator's own grants aren't "residents"
        preuve = " ".join((r.get("preuve") or "").split())
        if len(preuve) > 180:
            preuve = preuve[:180].rstrip() + "…"
        res.append({
            "beneficiaire": r["beneficiaire"],
            "montant_total": float(r["montant_total"]),
            "nb": int(r["nb"]),
            "preuve": preuve,
        })
    return res


def main() -> int:
    out: dict[str, dict] = {}
    for slug, cfg in PLACES.items():
        op = build_operator(cfg["operator"]) if cfg.get("operator") else None
        residents = build_residents(cfg["residents"], op["beneficiaire"] if op else None) if cfg.get("residents") else []
        if op or residents:
            out[slug] = {"operator": op, "residents": residents}
            print(f"  {slug}: operator={'✓' if op else '—'} residents={len(residents)}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"wrote {len(out)} place-money records → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
