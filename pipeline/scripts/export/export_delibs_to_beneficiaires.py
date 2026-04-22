#!/usr/bin/env python3
"""
Aggregate `subventions_delibs/session_*.json` (scraped + LLM/SIRENE-enriched)
into `subventions/beneficiaires_{year}.json` for the website preview.

Sessions are grouped by the 4-digit year prefix of their `delib_id`
("2025 DAC 249" → 2025).  Output shape matches the consolidated export
produced from BigQuery by `export_subventions_data.py`, with a few
fields left null (no thematique classifier, no nature_juridique source).

The resulting year is non-consolidated (single source = Conseil de Paris
ordres du jour) and must be labelled as such on the UI.

Usage:
    python export_delibs_to_beneficiaires.py --year 2025
    python export_delibs_to_beneficiaires.py --year 2025 --update-index
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DELIBS_DIR = ROOT / "website" / "public" / "data" / "subventions_delibs"
OUTPUT_DIR = ROOT / "website" / "public" / "data" / "subventions"
SIRENE_CACHE = ROOT / "website" / "public" / "data" / "enrichment" / "deliberations_sirene.json"

JUNK_BENEF_PATTERNS = [
    re.compile(r"^\s*titre\s+de\b", re.I),
    re.compile(r"^\s*budget\b", re.I),
    re.compile(r"^\s*autorisation\b", re.I),
    re.compile(r"^\s*(la\s+)?présente\s+délibération", re.I),
    re.compile(r"^\s*public\s+", re.I),  # "public Paris Musées" — truncated
    re.compile(r"^\s*d['’]?investissement\b", re.I),
]

INSEE_NATURE_PREFIX = {
    "1": "Personnes physiques",
    "2": "Autres",
    "3": "Autres personnes de droit privé",
    "4": "Etablissements publics",
    "5": "Entreprises",
    "6": "Autres personnes de droit privé",
    "7": "Etablissements publics",
    "8": "Autres personnes de droit privé",
    "9": "Associations",
}

DIRECTION_TO_THEMATIQUE = {
    "Direction des affaires culturelles": "Culture",
    "Direction des Solidarités": "Social - Solidarité",
    "Direction des familles et de la petite enfance": "Social - Petite enfance",
    "Direction des affaires scolaires": "Éducation",
    "Direction de la Jeunesse et des sports": "Sport",
    "Direction de la Santé publique": "Santé",
    "Direction du logement et de l'habitat": "Logement",
    "Direction de l'urbanisme": "Logement",
    "Direction de l'Attractivité et de l'Emploi": "Économie",
    "Délégation générale aux relations internationales": "International",
    "Délégation générale des outre-mer": "International",
    "Direction des Espaces verts et de l'Environnement": "Environnement",
    "Direction de la propreté et de l'eau": "Environnement",
    "Direction de la Transition écologique et du Climat": "Environnement",
    "Direction de la voirie et des déplacements": "Transport",
    "Direction de la Police municipale et de la Prévention": "Sécurité",
    "Préfecture de police": "Sécurité",
    "Direction des ressources humaines": "Administration",
    "Direction des affaires juridiques": "Administration",
    "Secrétariat général": "Administration",
}

ENTITY_PREFIX_TO_NATURE = [
    (re.compile(r"^\s*(association|fondation|fonds de dotation|amicale|comit[ée])\b", re.I),
     "Associations"),
    (re.compile(r"^\s*(sa|sas|sasu|sarl|eurl|scic|scop|snc|sci|sem)\b", re.I),
     "Entreprises"),
    (re.compile(r"^\s*(commune|ville|mairie|département|région|établissement public|epic|epa|cpam|caf|universit[ée]|cnrs|inserm|centre hospitalier|ap-hp|rectorat)\b", re.I),
     "Etablissements publics"),
]


def norm_name(s: str) -> str:
    s = re.sub(r"[^\w\s]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def guess_nature(beneficiary: str) -> str | None:
    for pat, label in ENTITY_PREFIX_TO_NATURE:
        if pat.search(beneficiary):
            return label
    return None


def is_junk_benef(beneficiary: str) -> bool:
    return any(p.match(beneficiary) for p in JUNK_BENEF_PATTERNS)


def load_sirene_nature_index() -> dict[str, str]:
    if not SIRENE_CACHE.exists():
        return {}
    payload = json.loads(SIRENE_CACHE.read_text(encoding="utf-8"))
    items = payload.get("items", {})
    idx: dict[str, str] = {}
    for rec in (items.values() if isinstance(items, dict) else items):
        if not rec:
            continue
        code = (rec.get("nature_juridique") or "").strip()
        siret = (rec.get("siret") or "").strip()
        if not code or not siret:
            continue
        idx[siret] = INSEE_NATURE_PREFIX.get(code[:1], "Autres")
    return idx


def year_from_delib(delib_id: str | None) -> int | None:
    if not delib_id:
        return None
    m = re.match(r"(\d{4})", delib_id.strip())
    return int(m.group(1)) if m else None


def aggregate(year: int) -> dict:
    rows_by_key: dict[str, dict] = {}
    sessions_used: list[int] = []
    total_articles = 0
    sirene_nature = load_sirene_nature_index()

    for path in sorted(DELIBS_DIR.glob("session_*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        session_year_hits = 0
        for art in payload.get("articles", []):
            if art.get("is_admin"):
                continue
            y = year_from_delib(art.get("delib_id"))
            if y != year:
                continue
            benef = (art.get("beneficiary") or "").strip()
            amount = art.get("amount_eur")
            if not benef or amount in (None, 0):
                continue
            if is_junk_benef(benef):
                continue
            try:
                amount = float(amount)
            except (TypeError, ValueError):
                continue
            session_year_hits += 1
            total_articles += 1

            siret = (art.get("siret") or "").strip() or None
            key = siret or norm_name(benef) or benef.lower()
            cur = rows_by_key.get(key)
            if cur is None:
                nature = None
                if siret and siret in sirene_nature:
                    nature = sirene_nature[siret]
                if not nature:
                    nature = guess_nature(benef)
                cur = {
                    "annee": year,
                    "beneficiaire": benef,
                    "beneficiaire_normalise": norm_name(benef).upper() or benef.upper(),
                    "nature_juridique": nature,
                    "direction": None,
                    "secteurs_activite": None,
                    "thematique": None,
                    "sous_categorie": None,
                    "source_thematique": "direction_heuristic",
                    "montant_total": 0.0,
                    "nb_subventions": 0,
                    "objet_principal": None,
                    "siret": siret,
                    "_directions": Counter(),
                    "_motifs": [],
                }
                rows_by_key[key] = cur
            cur["montant_total"] += amount
            cur["nb_subventions"] += 1
            if art.get("direction_name"):
                cur["_directions"][art["direction_name"]] += 1
            if art.get("motif") and len(cur["_motifs"]) < 3:
                cur["_motifs"].append(art["motif"])
            if not cur["siret"] and siret:
                cur["siret"] = siret
            if len(benef) > len(cur["beneficiaire"]):
                cur["beneficiaire"] = benef

        if session_year_hits:
            sessions_used.append(payload.get("session_id"))

    rows: list[dict] = []
    for cur in rows_by_key.values():
        directions = cur.pop("_directions")
        motifs = cur.pop("_motifs")
        if directions:
            top_dir, _ = directions.most_common(1)[0]
            cur["direction"] = top_dir
            cur["thematique"] = DIRECTION_TO_THEMATIQUE.get(top_dir) or "Non classifié"
        else:
            cur["thematique"] = "Non classifié"
        if motifs:
            cur["objet_principal"] = motifs[0][:280]
        rows.append(cur)

    rows.sort(key=lambda r: -r["montant_total"])

    total_montant = sum(r["montant_total"] for r in rows)
    return {
        "year": year,
        "generated_at": datetime.now().isoformat(),
        "source": "Conseil de Paris — ordres du jour (non consolidé)",
        "preview": True,
        "sessions_used": sorted({s for s in sessions_used if s}),
        "total_montant": total_montant,
        "nb_beneficiaires": len(rows),
        "nb_subventions_total": sum(r["nb_subventions"] for r in rows),
        "data": rows,
    }


def write_beneficiaires(year: int, payload: dict) -> Path:
    out = OUTPUT_DIR / f"beneficiaires_{year}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


def update_index(year: int, payload: dict) -> None:
    idx_path = OUTPUT_DIR / "index.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    years = sorted(set(idx.get("availableYears", [])) | {year}, reverse=True)
    idx["availableYears"] = years
    totals = idx.setdefault("totalsByYear", {})
    totals[str(year)] = {
        "montant_total": payload["total_montant"],
        "nb_subventions": payload["nb_subventions_total"],
    }
    preview_years = sorted(set(idx.get("previewYears", [])) | {year}, reverse=True)
    idx["previewYears"] = preview_years
    idx["generated_at"] = datetime.now().isoformat()
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--update-index", action="store_true",
                    help="Also add the year to subventions/index.json as previewYears.")
    args = ap.parse_args()

    payload = aggregate(args.year)
    path = write_beneficiaires(args.year, payload)
    print(f"→ {path.name}  {payload['nb_beneficiaires']} bénéficiaires  "
          f"{payload['total_montant']/1e6:.1f} M€  "
          f"(sessions {payload['sessions_used']})")

    if args.update_index:
        update_index(args.year, payload)
        print(f"→ index.json mis à jour (availableYears + previewYears)")


if __name__ == "__main__":
    main()
