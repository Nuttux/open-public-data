#!/usr/bin/env python3
"""
POC stub: build Marseille `qui-recoit` (subventions) JSON files directly from the
data.gouv.fr SCDL CSVs (slugs `marseille-subventions-{2017..2022}`).

Reproduces inline what the BQ pipeline would do (sync → stg → core → mart →
export) to unblock front rendering before the canonical export is wired.

Outputs (matching the Paris file layout, but under data/marseille/subventions/):
  website/public/data/marseille/subventions/index.json
  website/public/data/marseille/subventions/beneficiaires_{year}.json
  website/public/data/marseille/subventions/beneficiaires_search.json

⚠ POC limits (flag in /ville/marseille/subventions page.tsx):
  - Subventions Ville uniquement (data.gouv.fr SCDL).
    Métropole AMP (data.ampmetropole.fr `subventions-attribuees-depuis-2022`)
    deferred to phase 2.
  - No vulgarization / SIRENE / thematique enrichment for Marseille (cache empty).
  - Drill-down beneficiary routes /ville/marseille/subventions/association/[slug]
    not implemented in POC (would 404).
  - No Marseille editorial articles yet (posts: []).
"""

from __future__ import annotations

import csv
import io
import json
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

OUT_DIR = (
    Path(__file__).parent.parent.parent.parent
    / "website" / "public" / "data" / "marseille" / "subventions"
)
YEARS = [2017, 2018, 2019, 2020, 2021, 2022]
DATAGOUV_API = "https://www.data.gouv.fr/api/1/datasets/{slug}/"
SLUG_TPL = "marseille-subventions-{year}"


def fetch_csv_for_slug(slug: str) -> bytes:
    api_url = DATAGOUV_API.format(slug=slug)
    req = Request(api_url, headers={"User-Agent": "qipu-poc/1.0"})
    with urlopen(req, timeout=30) as resp:
        meta = json.load(resp)
    csv_resources = [
        r for r in meta.get("resources", [])
        if "csv" in (r.get("format") or "").lower()
    ]
    if not csv_resources:
        raise RuntimeError(f"No CSV resource in {slug}")
    csv_resources.sort(key=lambda r: r.get("last_modified") or "", reverse=True)
    url = csv_resources[0]["url"]
    print(f"  fetching {url}")
    req = Request(url, headers={"User-Agent": "qipu-poc/1.0"})
    with urlopen(req, timeout=120) as resp:
        return resp.read()


def _first(row: dict, *keys: str) -> str:
    """Return the first non-empty value across alias keys (tolerates trailing spaces)."""
    for k in keys:
        # Try exact, then trimmed-key match (some files have ` nomBeneficiaire `)
        if k in row and row[k] is not None and str(row[k]).strip() != "":
            return str(row[k]).strip()
        for rk, rv in row.items():
            if rk and rk.strip() == k and rv is not None and str(rv).strip() != "":
                return str(rv).strip()
    return ""


def normalise_name(name: str) -> str:
    """Normalise for grouping: uppercase, strip diacritics, collapse spaces."""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.upper()
    s = " ".join(s.split())
    return s


def norm_search(name: str) -> str:
    """Normalise for search: lowercase, strip diacritics + non-alnum."""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    out = []
    for ch in s:
        if ch.isalnum() or ch == " ":
            out.append(ch)
        else:
            out.append(" ")
    return " ".join("".join(out).split())


def parse_subv_csv(csv_bytes: bytes, year: int) -> list[dict]:
    """Parse SCDL Marseille subventions CSV with year-to-year header tolerance.

    Marseille SCDL header columns observed (2017-2022):
      nomAttribuant, idAttribuant, typeAttribuant, anneeAttribution,
      nomBeneficiaire (sometimes "nomBeneficiaire " with trailing space),
      typeBeneficiaire (sometimes TypeBeneficiaire / with space),
      montant, nature, objetAideNature
    """
    text = csv_bytes.decode("utf-8", errors="replace")
    head = text.split("\n", 1)[0]
    sep = ";" if head.count(";") > head.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=sep)
    rows = []
    for r in reader:
        nom = _first(r, "nomBeneficiaire", "NomBeneficiaire")
        if not nom:
            continue
        montant_raw = _first(r, "montant", "Montant", "montantTotal")
        try:
            montant = float(montant_raw.replace(",", ".").replace(" ", ""))
        except ValueError:
            continue
        if montant <= 0:
            continue
        annee_raw = _first(r, "anneeAttribution", "AnneeAttribution")
        try:
            annee = int(annee_raw)
        except ValueError:
            annee = year
        rows.append({
            "annee": annee,
            "nom_beneficiaire": nom,
            "type_beneficiaire": _first(r, "typeBeneficiaire", "TypeBeneficiaire"),
            "montant": montant,
            "nature": _first(r, "nature", "Nature"),
            "objet": _first(r, "objetAideNature", "ObjetAideNature", "objet"),
        })
    return rows


def aggregate_beneficiaires(rows: list[dict]) -> list[dict]:
    """Group rows by normalised beneficiary name → SubvBen entries.

    Mirrors the schema consumed by the front (cf. fusion-data.ts SubvBen):
      beneficiaire, beneficiaire_normalise, nature_juridique, direction,
      secteurs_activite, thematique, sous_categorie, source_thematique,
      montant_total, nb_subventions, objet_principal, siret
    """
    agg: dict[str, dict] = {}
    for r in rows:
        norm = normalise_name(r["nom_beneficiaire"])
        if not norm:
            continue
        if norm not in agg:
            agg[norm] = {
                "annee": r["annee"],
                "beneficiaire": r["nom_beneficiaire"].strip(),
                "beneficiaire_normalise": norm,
                # Map SCDL typeBeneficiaire → loose "nature_juridique" bucket.
                # Marseille SCDL uses {Associations, Entreprises, Etablissements
                # publics, ...} which already matches the front's expected labels.
                "nature_juridique": r["type_beneficiaire"] or None,
                "direction": None,
                "secteurs_activite": None,
                # No thematique enrichment in POC — front gracefully shows
                # "Non classifié" / "Autres" when null.
                "thematique": None,
                "sous_categorie": None,
                "source_thematique": "raw",
                "montant_total": 0.0,
                "nb_subventions": 0,
                # First non-empty objet seen — used by the front in "objet principal".
                "objet_principal": r["objet"] or None,
                "siret": None,
            }
        agg[norm]["montant_total"] += r["montant"]
        agg[norm]["nb_subventions"] += 1
        if not agg[norm]["objet_principal"] and r["objet"]:
            agg[norm]["objet_principal"] = r["objet"]
    out = list(agg.values())
    out.sort(key=lambda b: -b["montant_total"])
    return out


def build_search_payload(per_year: dict[int, list[dict]]) -> dict:
    """Combine all years into the slim search index consumed by QuiRecoitExplorer."""
    flat: dict[str, dict] = {}
    for year, benes in per_year.items():
        for b in benes:
            key = b["beneficiaire_normalise"]
            if key not in flat:
                flat[key] = {
                    "name": b["beneficiaire"],
                    "norm": norm_search(b["beneficiaire"]),
                    "siret": None,
                    "theme": None,
                    "totalAmount": 0.0,
                    "lastActiveYear": year,
                    "nb": 0,
                    "byYear": {},
                }
            flat[key]["totalAmount"] += b["montant_total"]
            flat[key]["nb"] += b["nb_subventions"]
            flat[key]["byYear"][str(year)] = b["montant_total"]
            if year > flat[key]["lastActiveYear"]:
                flat[key]["lastActiveYear"] = year

    data = list(flat.values())
    data.sort(key=lambda x: -x["totalAmount"])
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "POC stub Marseille — data.gouv.fr SCDL",
        "years": sorted(per_year.keys()),
        "count": len(data),
        "data": data,
    }


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"=== Marseille subventions (years {YEARS[0]}-{YEARS[-1]}) ===")

    per_year_benes: dict[int, list[dict]] = {}
    totals_by_year: dict[str, dict] = {}

    for year in YEARS:
        slug = SLUG_TPL.format(year=year)
        print(f"\n--- {year} ---")
        try:
            csv_bytes = fetch_csv_for_slug(slug)
        except Exception as e:
            print(f"  skip {year}: {e}")
            continue
        rows = parse_subv_csv(csv_bytes, year)
        print(f"  parsed {len(rows)} rows")
        benes = aggregate_beneficiaires(rows)
        montant_total = sum(b["montant_total"] for b in benes)
        nb_subventions = sum(b["nb_subventions"] for b in benes)

        per_year_benes[year] = benes
        totals_by_year[str(year)] = {
            "montant_total": montant_total,
            "nb_subventions": nb_subventions,
        }

        out_file = OUT_DIR / f"beneficiaires_{year}.json"
        payload = {
            "year": year,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_montant": montant_total,
            "nb_beneficiaires": len(benes),
            "data": benes,
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(
            f"  → {out_file.name}  "
            f"({montant_total/1e6:.1f} M€, {nb_subventions} subv, {len(benes)} bénéf.)"
        )

    if not per_year_benes:
        print("\nNo data collected — abort.")
        return 1

    # index.json — same shape as Paris (consumed by loadQuiRecoitIndex /
    # loadQuiRecoitData via cityJsonPath).
    available_years = sorted(per_year_benes.keys(), reverse=True)
    index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "POC stub Marseille — data.gouv.fr SCDL `marseille-subventions-{year}`",
        "note": (
            "POC stub Marseille v1 — subventions Ville uniquement. "
            "Métropole AMP `subventions-attribuees-depuis-2022` à ajouter en phase 2."
        ),
        "availableYears": available_years,
        "previewYears": [],
        "totalsByYear": totals_by_year,
        "filters": {
            "thematiques": [],
            "naturesJuridiques": sorted({
                b["nature_juridique"] for benes in per_year_benes.values()
                for b in benes if b["nature_juridique"]
            }),
        },
    }
    out_index = OUT_DIR / "index.json"
    with open(out_index, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"\n=== index → {out_index.name} ({len(available_years)} années) ===")

    # beneficiaires_search.json — slim cross-year index used by QuiRecoitExplorer.
    search = build_search_payload(per_year_benes)
    out_search = OUT_DIR / "beneficiaires_search.json"
    with open(out_search, "w", encoding="utf-8") as f:
        json.dump(search, f, ensure_ascii=False)
    print(f"=== search → {out_search.name} ({search['count']} bénéficiaires uniques) ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
