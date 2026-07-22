#!/usr/bin/env python3
"""
POC stub: build Marseille `investissements` JSON files from CA presentation
PDFs (rapport de présentation du compte administratif).

Reproduces inline what the BQ pipeline would do (sync → stg → core → mart →
export) to unblock front rendering before the canonical pipeline is wired.

Workflow (in-session, no external LLM call — see memory
`feedback_enrichment_in_session`):
  1. Download CA PDF from marseille.fr
  2. Convert with `pdftotext -layout` → store .txt under
     pipeline/cache/pdf_extracts/marseille/[year]/ca.txt
  3. Pure-regex parsing of « Thématique X » sections to extract projects
     (name + arrondissement + amount in M€/K€)
  4. Emit a seed CSV per year under
     pipeline/seeds/cities/marseille/seed_pdf_investissements_{year}.csv
  5. Build front-ready JSONs:
       website/public/data/marseille/investissements/index.json
       website/public/data/marseille/investissements/investissements_{year}.json
       website/public/data/marseille/investissements/investissement_tendances.json

POC limits accepted:
  - 1-2 years (2023, 2024) targeted; older years skipped (different layouts)
  - Granularity: arrondissement (no full address — Paris-style geocoding N/A)
  - If regex misses some projects in a thematic section, accept it (POC)
  - No lat/lon (only arrondissement) → no map points, only ranking + KPI

Optional flag `--use-llm` is documented but **not implemented** (default OFF).
For phase 2: route the .txt sections through an LLM with structured output
to recover projects the regex misses.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).parent.parent.parent.parent  # repo root
CACHE_DIR = ROOT / "pipeline" / "cache" / "pdf_extracts" / "marseille"
SEED_DIR = ROOT / "pipeline" / "seeds" / "cities" / "marseille"
OUT_DIR = ROOT / "website" / "public" / "data" / "marseille" / "investissements"

# Source PDFs — CA presentation reports published by Ville de Marseille.
# Reference: docs/marseille-data-inventory.md, section E.
PDFS: dict[int, str] = {
    2023: "https://www.marseille.fr/sites/default/files/contenu/mairie/Budget/pdf/rapport_de_presentation_du_compte_administratif_2023.pdf",
    2024: "https://www.marseille.fr/sites/default/files/contenu/mairie/Budget/pdf/rapport-de-presentation-compte-administratif-2024.pdf",
}

USER_AGENT = "qipu-poc/1.0 (contact@qipu.org)"

# ─── PDF download + text extraction ────────────────────────────────────────


def download_pdf(year: int, url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 100_000:
        print(f"    cached: {target.name} ({target.stat().st_size/1e6:.1f} MB)")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=120) as resp:
        target.write_bytes(resp.read())
    print(f"    downloaded: {target.name} ({target.stat().st_size/1e6:.1f} MB)")


def pdf_to_text(pdf_path: Path, txt_path: Path) -> None:
    if txt_path.exists() and txt_path.stat().st_size > 1000:
        print(f"    cached: {txt_path.name} ({txt_path.stat().st_size/1024:.0f} KB)")
        return
    if shutil.which("pdftotext") is None:
        raise RuntimeError(
            "pdftotext not found in PATH. Install via `brew install poppler` (macOS) "
            "or `apt install poppler-utils` (Debian/Ubuntu)."
        )
    txt_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), str(txt_path)],
        check=True,
    )
    print(f"    extracted: {txt_path.name} ({txt_path.stat().st_size/1024:.0f} KB)")


# ─── Parsing helpers ───────────────────────────────────────────────────────


# Map of normalized French thematic labels to a coarse, stable taxonomy. Keys
# are the slug-normalized section titles found in CA Marseille narratives;
# values pair (display_label_fr, display_label_en).
THEMATIQUE_LABELS = [
    ("écoles", ("Écoles, petite enfance, jeunesse", "Schools, early childhood, youth")),
    ("ecoles", ("Écoles, petite enfance, jeunesse", "Schools, early childhood, youth")),
    ("sécurité", ("Sécurité (BMPM, police, vidéo)", "Security (BMPM, police, video)")),
    ("securite", ("Sécurité (BMPM, police, vidéo)", "Security (BMPM, police, video)")),
    ("environnement", ("Environnement, cadre de vie", "Environment, living conditions")),
    ("sports", ("Sports, nautisme, plages", "Sports, nautical, beaches")),
    ("urbanisme", ("Urbanisme, habitat", "Urban planning, housing")),
    ("habitat", ("Urbanisme, habitat", "Urban planning, housing")),
    ("social", ("Social, solidarité, santé", "Social, solidarity, health")),
    ("solidarit", ("Social, solidarité, santé", "Social, solidarity, health")),
    ("santé", ("Social, solidarité, santé", "Social, solidarity, health")),
    ("moyens", ("Moyens municipaux transverses", "Cross-cutting municipal means")),
    ("immobilier", ("Immobilier et patrimoine", "Real estate and heritage")),
    ("patrimoine", ("Immobilier et patrimoine", "Real estate and heritage")),
    ("culture", ("Culture", "Culture")),
    ("attractivit", ("Attractivité économique", "Economic attractiveness")),
    ("économique", ("Attractivité économique", "Economic attractiveness")),
    ("accueil", ("Accueil et vie citoyenne", "Reception and civic life")),
    ("citoyenne", ("Accueil et vie citoyenne", "Reception and civic life")),
]


def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower()


def classify_thematique(raw_title: str) -> tuple[str, str]:
    """Map a raw « Thématique … » title to a stable (label_fr, label_en) tuple.
    Falls back to the raw title (cleaned) if no match — still POC-acceptable."""
    norm = _normalize(raw_title)
    for key, labels in THEMATIQUE_LABELS:
        if key in norm:
            return labels
    cleaned = re.sub(r"[«»\"']", "", raw_title).strip(" -:")
    return (cleaned[:60], cleaned[:60])


# Regex to find « Thématique "Title" » section headers in the narrative.
# Strict form: must have French quotation marks « … » or straight quotes "…"
# AROUND the title — that filters out filler matches like
# « Cette thématique représente … » which never have quotes.
THEMATIQUE_HEADER = re.compile(
    r"Thématique\s*(?:«\s*([^«»\n]{3,80}?)\s*»|\"([^\"\n]{3,80}?)\")",
)

# Number formats encountered: "19,3 M€", "650 000 euros", "+ 0,8 M€",
# "850 K€", "1 million d'euros", "324 k€", "1 M€", "12,5°M€" (typo seen in PDF)
# We capture amount + unit; "+/-" prefixes are normalized as deltas (not amounts).
AMOUNT_RX = re.compile(
    r"""
    (?<![+\-±])             # not a delta
    (?<![\w])               # not glued to a word (avoid '13e' matches)
    (\d{1,3}(?:[\s ]\d{3})*  # 12 / 1 234 / 1 234
       (?:[,\.]\d+)?              # optional decimal
    |\d+(?:[,\.]\d+)?)            # or plain decimal
    \s*°?\s*                       # tolerate stray ° (PDF artefact)
    (M\s*€|M€|millions?\s*d['’]\s*euros?|million\s*d['’]\s*euros?)  # mega
    | (\d{1,3}(?:[\s ]\d{3})*(?:[,\.]\d+)?|\d+(?:[,\.]\d+)?)\s*(K\s*€|k\s*€|K€|k€)  # kilo
    | (\d{1,3}(?:[\s ]\d{3})*)\s*(euros?|€)(?!\s*(?:par|/))  # raw euros
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Arrondissement detection: "13e", "13ème", "13e arr.", "13ᵉ arrondissement",
# "1er arr", "13eme arrondissement", "(15e)", "dans le 13eme".
ARR_RX = re.compile(
    r"""(?:^|[\s(])(\d{1,2})\s*(?:er|ère|e|ᵉ|ème|eme)\s*(?:arr\.?|arrondissement|\)|[\s,;])""",
    re.IGNORECASE | re.VERBOSE,
)


def parse_amount(num_str: str, unit: str) -> float:
    """Convert a captured number+unit pair to euros."""
    cleaned = num_str.replace(" ", " ").replace(" ", "").replace(",", ".")
    try:
        v = float(cleaned)
    except ValueError:
        return 0.0
    u = unit.lower().replace(" ", "").replace("°", "")
    if u.startswith("m") or "million" in u:
        return v * 1_000_000.0
    if u.startswith("k"):
        return v * 1_000.0
    return v  # raw euros


def find_amount(text: str) -> float | None:
    """Return the first amount mentioned in `text`, in euros, or None."""
    m = AMOUNT_RX.search(text)
    if not m:
        return None
    if m.group(1) and m.group(2):
        return parse_amount(m.group(1), m.group(2))
    if m.group(3) and m.group(4):
        return parse_amount(m.group(3), m.group(4))
    if m.group(5) and m.group(6):
        return parse_amount(m.group(5), m.group(6))
    return None


def find_arr(text: str) -> int | None:
    """Return the first arrondissement number (1-16) in `text`, or None."""
    for m in ARR_RX.finditer(text):
        n = int(m.group(1))
        if 1 <= n <= 16:
            return n
    return None


def split_thematique_sections(text: str) -> list[tuple[str, str]]:
    """Return a list of (raw_title, body) tuples, one per Thématique section.
    Sections end at the next Thématique header or at a hard cap (~3000 chars)."""
    matches = list(THEMATIQUE_HEADER.finditer(text))
    sections: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        title = (m.group(1) or m.group(2) or "").strip(" «»\"'.")
        if not title:
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else min(start + 4000, len(text))
        body = text[start:end]
        sections.append((title, body))
    return sections


def extract_projects_from_section(
    body: str,
    thematique_fr: str,
    thematique_en: str,
    year: int,
) -> list[dict]:
    """Parse a Thématique section body into a list of project dicts.

    POC heuristic:
      - Cut on bullet markers ("→", "-", "•") and on hard newlines that
        precede a clear new project line
      - For each fragment, require BOTH an amount AND a clear project label
        (the substring before the amount, trimmed) — discard otherwise
      - Use the first arrondissement mention as the geographic anchor
      - Discard fragments obviously about deltas or evolutions only (no project)
    """
    # Normalize bullets:
    #   "→" introduces a top-level bullet (one per project group)
    #   "- " or "•" introduces a sub-bullet (often « name (Xeme arr.), montant »)
    body = body.replace("→", "\n→")
    body = re.sub(r"(?<=\n)[ \t]*[-•][ \t]+", "\n- ", body)
    # Split on top-level markers AND sub-bullets — both are project candidates.
    fragments = re.split(r"\n(?:→[ \t]*|-\s+)", body)
    projects: list[dict] = []
    seen_labels: set[str] = set()
    for frag in fragments:
        frag = frag.strip()
        if len(frag) < 20:
            continue
        # Some fragments contain a leading prose block followed by an inline
        # sub-list "name (Xe arr.), montant ; name (Xe arr.), montant". When
        # the fragment has multiple « X arr » markers AND multiple amounts,
        # try to split it further on commas/semicolons.
        sub_fragments = _maybe_split_inline_list(frag)
        for sub in sub_fragments:
            if len(sub) < 15:
                continue
            amount = find_amount(sub)
            if amount is None or amount < 50_000:  # ignore < 50 k€ noise
                continue
            # Truncate label at clauses that introduce the cost
            #   "..., soit X M€"  /  "...  pour X M€"  / first sentence
            label_src = re.split(
                r"(?:\.\s|,\s+soit\b|\bsoit\b|,\s*\(?\+|,\s+pour\b|\bplus\s+de\b)",
                sub, maxsplit=1,
            )[0]
            label = re.sub(r"\s+", " ", label_src).strip(" ,;:-—«»\"'.")
            if len(label) < 8 or len(label) > 220:
                continue
            # Skip "Cette/Ce/Ces … thématique/poste/volet …" headers and
            # "Le premier/deuxième … poste …" framing sentences.
            if re.match(
                r"^(?:cette|ces|ce|le|la|les|l['’])\s+"
                r"(?:premier|deuxième|deuxieme|second|troisième|troisieme|quatrième|quatrieme|cinquième|cinquieme)?"
                r"\s*(?:thématique|volet|poste|ann|exercice|montant|cumul)",
                label, re.IGNORECASE,
            ):
                continue
            # Skip generic "Près de X M€ de dépenses…" recap sentences
            if re.match(r"^(?:près\s+de|environ|au\s+total|ce\s+volet)", label, re.IGNORECASE):
                continue
            # De-duplicate within the same section
            key = label[:90].lower()
            if key in seen_labels:
                continue
            seen_labels.add(key)
            arr = find_arr(sub) or 0
            projects.append({
                "id": f"marseille_{year}_{len(projects):04d}",
                "annee": year,
                "arrondissement": arr,
                "thematique": thematique_fr,
                "thematique_en": thematique_en,
                "nom_projet": label,
                "montant": round(amount, 2),
                "source": "PDF_CA",
            })
    return projects


def _maybe_split_inline_list(frag: str) -> list[str]:
    """If a fragment looks like an inline list of « name (Xe arr.), montant ; …»
    split on commas/semicolons that immediately follow an amount mention.
    Otherwise return the fragment unchanged as a singleton list."""
    # Look for patterns like "X M€," or "X K€;" followed by something
    parts = re.split(r"(?<=[€¤])(?:\s*[,;])\s+(?=[A-ZÉÈÊÀÂÔÛŒ«\"]|l['’])", frag)
    if len(parts) > 1:
        return parts
    return [frag]


def parse_year(year: int, txt_path: Path) -> list[dict]:
    text = txt_path.read_text(encoding="utf-8", errors="replace")
    sections = split_thematique_sections(text)
    print(f"    parsed {len(sections)} Thématique sections")
    all_projects: list[dict] = []
    by_them: dict[str, int] = defaultdict(int)
    for raw_title, body in sections:
        them_fr, them_en = classify_thematique(raw_title)
        prj = extract_projects_from_section(body, them_fr, them_en, year)
        all_projects.extend(prj)
        by_them[them_fr] += len(prj)
    # Re-id sequentially across the year
    for i, p in enumerate(all_projects):
        p["id"] = f"marseille_{year}_{i:04d}"
    print(f"    extracted {len(all_projects)} projects across {len(by_them)} themes")
    for them, count in sorted(by_them.items(), key=lambda kv: -kv[1]):
        print(f"      · {them}: {count}")
    return all_projects


# ─── Outputs ───────────────────────────────────────────────────────────────


def write_seed_csv(year: int, projects: list[dict]) -> Path:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    path = SEED_DIR / f"seed_pdf_investissements_{year}.csv"
    fields = ["id", "annee", "arrondissement", "thematique", "thematique_en",
              "nom_projet", "montant", "source"]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(projects)
    print(f"  → seed: {path.relative_to(ROOT)}")
    return path


def build_year_json(year: int, projects: list[dict], pdf_url: str) -> dict:
    total = sum(p["montant"] for p in projects)
    by_arr: dict[int, dict] = defaultdict(lambda: {"amount": 0.0, "count": 0})
    by_them: dict[str, dict] = defaultdict(lambda: {"amount": 0.0, "count": 0, "label_en": ""})
    for p in projects:
        a = int(p["arrondissement"])
        by_arr[a]["amount"] += p["montant"]
        by_arr[a]["count"] += 1
        by_them[p["thematique"]]["amount"] += p["montant"]
        by_them[p["thematique"]]["count"] += 1
        by_them[p["thematique"]]["label_en"] = p["thematique_en"]
    nb_geo = sum(1 for p in projects if p["arrondissement"] > 0)
    return {
        "year": year,
        "source": f"PDF CA Marseille {year} (rapport de présentation)",
        "source_url": pdf_url,
        "methodology": "POC stub — parsing regex pur Python des sections « Thématique » du rapport CA Marseille. Granularité arrondissement (pas adresse).",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "stats": {
            "nb_projets": len(projects),
            "nb_geo": nb_geo,
            "pct_geo": round(100.0 * nb_geo / len(projects), 1) if projects else 0.0,
            "total_montant": round(total, 2),
            "nb_thematiques": len(by_them),
        },
        "byChapitre": [
            {
                "label": label,
                "label_en": v["label_en"],
                "amount": round(v["amount"], 2),
                "count": v["count"],
            }
            for label, v in sorted(by_them.items(), key=lambda kv: -kv[1]["amount"])
        ],
        "byArrondissement": [
            {
                "arr": arr,
                "amount": round(v["amount"], 2),
                "count": v["count"],
            }
            for arr, v in sorted(by_arr.items(), key=lambda kv: -kv[1]["amount"])
            if arr > 0
        ],
        "data": projects,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument(
        "--years",
        nargs="+",
        type=int,
        default=sorted(PDFS.keys()),
        help="Years to process (default: all available PDFs)",
    )
    parser.add_argument(
        "--use-llm",
        action="store_true",
        help="(NOT IMPLEMENTED) Route extraction through an LLM — kept as a "
             "documented future flag. Default OFF per memory "
             "feedback_enrichment_in_session.",
    )
    args = parser.parse_args()

    if args.use_llm:
        print("⚠ --use-llm is documented but not implemented in this POC. Proceeding with regex parsing.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    year_results: dict[int, dict] = {}

    print(f"=== Marseille investissements POC (years {args.years}) ===")
    for year in args.years:
        if year not in PDFS:
            print(f"  ! year {year}: no PDF URL configured, skipping")
            continue
        url = PDFS[year]
        pdf_path = CACHE_DIR / str(year) / "ca.pdf"
        txt_path = CACHE_DIR / str(year) / "ca.txt"
        print(f"\n  ── year {year} ──")
        download_pdf(year, url, pdf_path)
        pdf_to_text(pdf_path, txt_path)
        projects = parse_year(year, txt_path)
        if not projects:
            print(f"  ! year {year}: 0 projects extracted, skipping JSON write")
            continue
        write_seed_csv(year, projects)
        year_obj = build_year_json(year, projects, url)
        out_path = OUT_DIR / f"investissements_{year}.json"
        out_path.write_text(json.dumps(year_obj, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  → {out_path.relative_to(ROOT)}")
        year_results[year] = year_obj

    if not year_results:
        print("✗ No year produced data. Aborting index build.")
        return 1

    # ── index.json ────────────────────────────────────────────────────────
    available_years = sorted(year_results.keys())
    latest_year = available_years[-1]
    totals_by_year = {
        str(y): {
            "nb_projets": d["stats"]["nb_projets"],
            "total_montant": d["stats"]["total_montant"],
            "nb_thematiques": d["stats"]["nb_thematiques"],
        }
        for y, d in year_results.items()
    }
    index = {
        "city": "marseille",
        "city_label": "Marseille",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": "marseille.fr — Rapports de présentation des comptes administratifs (PDF)",
        "note": "POC stub Marseille v1 — parsing regex pur Python des sections « Thématique » du CA. Granularité arrondissement, pas d'adresse complète. Pas de géolocalisation lat/lon. Cf. docs/marseille-data-inventory.md section E.",
        "availableYears": available_years,
        "latestYear": latest_year,
        "totalsByYear": totals_by_year,
    }
    (OUT_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n  → {(OUT_DIR / 'index.json').relative_to(ROOT)}")

    # ── investissement_tendances.json (year × thematique totals) ─────────
    trend_years = []
    for y in available_years:
        d = year_results[y]
        trend_years.append({
            "year": y,
            "depenses_total": d["stats"]["total_montant"],
            "depenses_hors_dette": d["stats"]["total_montant"],  # POC: pas de séparation dette
            "par_chapitre": [
                {"label": c["label"], "depenses": c["amount"], "recettes": 0.0}
                for c in d["byChapitre"]
            ],
        })
    tendances = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": "marseille.fr — Rapports de présentation des CA (PDF parsing in-session)",
        "description": "Tendances investissement Marseille — extraites des sections « Thématique » des rapports CA. POC v1.",
        "note_perimetre": "POC : pas de séparation dette/hors-dette. Le total inclut tous les projets > 50 k€ détectés par regex. Sous-couverture probable vs CA réel (parsing partiel des sections).",
        "years": trend_years,
    }
    (OUT_DIR / "investissement_tendances.json").write_text(
        json.dumps(tendances, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  → {(OUT_DIR / 'investissement_tendances.json').relative_to(ROOT)}")

    print(f"\n✓ Done. {len(year_results)} years generated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
