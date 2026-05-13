#!/usr/bin/env python3
"""
Pilot: extract marché public delibs from Conseil de Paris sessions.

Sibling of scrape_deliberations.py. Same portal, different filter:
    keep titles containing marché | attribution | avenant | accord-cadre |
    modification de contrat | maîtrise d'œuvre | travaux pour | marché public.

For each PDF, extract (numero_marche, fournisseur, objet_court,
operation_liee, lot_num, montant) and emit a JSON per session under
website/public/data/marches_delibs/session_<id>.json.

Pilot goal: measure what fraction of Ville de Paris marchés of a given
year are referenced in delibs with an exploitable operation_liee.

Usage:
    # explore mode — dump raw text of first 3 marché PDFs for a session
    python scrape_marches_delibs.py --session 155 --explore

    # full extraction + coverage report
    python scrape_marches_delibs.py --session 155

    # range
    python scrape_marches_delibs.py --session-range 150-157
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import time
from dataclasses import dataclass, asdict, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).resolve().parent
OUT = ROOT / "pipeline" / "cache" / "wip" / "marches_delibs"

# Import sibling module without requiring a package setup.
# Register in sys.modules BEFORE exec so @dataclass in the module can resolve
# its own module via sys.modules.get(cls.__module__).
_spec = importlib.util.spec_from_file_location(
    "scrape_deliberations", SCRIPT_DIR / "scrape_deliberations.py"
)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
sys.modules["scrape_deliberations"] = _mod
_spec.loader.exec_module(_mod)

list_directions = _mod.list_directions
list_delibs = _mod.list_delibs
download_pdf = _mod.download_pdf
extract_text = _mod.extract_text
_dekern = _mod._dekern
_flatten = _mod._flatten
DelibLink = _mod.DelibLink


# ─────────────────────────────────────────────────────────────────────────
# Filter
# ─────────────────────────────────────────────────────────────────────────

MARCHE_KWS = (
    "marché",
    "attribution",
    "avenant",
    "accord-cadre",
    "accord cadre",
    "modification de contrat",
    "maîtrise d'œuvre",
    "maitrise d'oeuvre",
    "travaux",
)

# Exclude subventions (separate pipeline) and irrelevant domain uses of
# "marché" (marchés découverts = open-air markets, not procurement).
EXCLUDE_KWS = (
    "subvention",
    "marché couvert",
    "marché découvert",
    "marché forain",
    "marché aux puces",
    "marché des ternes",
    "marchés aux puces",
)


def keep_marche(link: DelibLink) -> bool:
    t = link.title.lower()
    if any(k in t for k in EXCLUDE_KWS):
        return False
    return any(k in t for k in MARCHE_KWS)


# ─────────────────────────────────────────────────────────────────────────
# Extraction — regex tuned on Paris delib PDF text
# ─────────────────────────────────────────────────────────────────────────

# Paris Ville marché numbers: 14 chars, pattern YYYYYYYYLNNNNN where L=F/S/T.
# Also accept older/other formats: 14-15 digit numbers, possibly with -lot suffix.
NUM_MARCHE_RE = re.compile(
    r"march[eé]s?\s*(?:public\s*)?n[°ºo]?\s*[:.]?\s*"
    r"(20\d{12}(?:-\d{1,2})?|20\d{10,13}[A-Z]\d{3,6}(?:-\d{1,2})?|\d{14,15}(?:-\d{1,2})?)",
    re.IGNORECASE,
)

# Standalone 14-char marché number (fallback when "marché n°" not literal)
STANDALONE_NUM_RE = re.compile(r"\b(20\d{6}[FST]\d{5})\b")

LOT_RE = re.compile(r"lot\s*n[°ºo]?\s*(\d{1,3})", re.IGNORECASE)

# Amount in euros (reuse normalisation from sibling module)
SPACE_DIGITS_RE = re.compile(r"(?<=\d)\s+(?=\d)")
AMOUNT_RE = re.compile(r"(\d[\d ]{0,12}(?:,\d{1,2})?)\s*(?:euros?|€)", re.IGNORECASE)

# Fournisseur / titulaire — cascade
FOURNISSEUR_PATTERNS = [
    re.compile(
        r"titulaire[^.]{0,40}\s*[:\-]?\s*"
        r"(?:la\s+(?:soci[ée]t[ée]|entreprise)\s+|l['’]\s*entreprise\s+)?"
        r"([A-ZÀ-Ÿ][A-Za-zÀ-Ÿ0-9&'’\-\.\s/]{2,120}?)"
        r"(?=\s*,|\s+sise?\s+|\s+domicili|\s+SIRET|\s+N°\s*SIRET|\s+pour\s+|\.)",
        re.IGNORECASE,
    ),
    re.compile(
        r"attribu[ée]e?\s+(?:à|au)\s+"
        r"(?:la\s+(?:soci[ée]t[ée]|entreprise)\s+|l['’]\s*entreprise\s+)?"
        r"([A-ZÀ-Ÿ][A-Za-zÀ-Ÿ0-9&'’\-\.\s/]{2,120}?)"
        r"(?=\s*,|\s+sise?\s+|\s+SIRET|\s+pour\s+|\s+dont\s+|\.)",
        re.IGNORECASE,
    ),
]

SIRET_RE = re.compile(r"(?:N°\s*SIRET|SIRET)\s*[:\-]?\s*(\d{14})", re.IGNORECASE)


@dataclass
class MarcheRecord:
    delib_id: str
    direction_id: int
    direction_name: str
    session_id: int
    title: str
    numeros_marche: list[str] = field(default_factory=list)
    fournisseur: str | None = None
    siret: str | None = None
    lot_num: str | None = None
    montant_eur: float | None = None
    # operation_liee = raw title for now; refined extraction later.
    operation_hint: str | None = None


def parse_amount(raw: str) -> float | None:
    cleaned = SPACE_DIGITS_RE.sub("", raw).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_marche_record(text: str, link: DelibLink) -> MarcheRecord:
    dekerned = _dekern(text)
    flat = _flatten(dekerned)

    nums: list[str] = []
    for m in NUM_MARCHE_RE.finditer(flat):
        nums.append(m.group(1))
    for m in STANDALONE_NUM_RE.finditer(flat):
        if m.group(1) not in nums:
            nums.append(m.group(1))

    lot_m = LOT_RE.search(link.title) or LOT_RE.search(flat[:2000])
    lot_num = lot_m.group(1) if lot_m else None

    amt_m = AMOUNT_RE.search(flat)
    montant = parse_amount(amt_m.group(1)) if amt_m else None

    fournisseur = None
    for pat in FOURNISSEUR_PATTERNS:
        mm = pat.search(flat)
        if mm:
            cand = re.sub(r"\s+", " ", mm.group(1)).strip(" .,;")
            if 2 <= len(cand) <= 120 and len(cand.split()) <= 16:
                fournisseur = cand
                break

    siret_m = SIRET_RE.search(flat)
    siret = siret_m.group(1) if siret_m else None

    return MarcheRecord(
        delib_id=link.delib_id,
        direction_id=link.direction_id,
        direction_name=link.direction_name,
        session_id=link.session_id,
        title=link.title,
        numeros_marche=list(dict.fromkeys(nums)),  # dedup preserving order
        fournisseur=fournisseur,
        siret=siret,
        lot_num=lot_num,
        montant_eur=montant,
        operation_hint=link.title,  # refined downstream
    )


# ─────────────────────────────────────────────────────────────────────────
# Coverage report
# ─────────────────────────────────────────────────────────────────────────

def load_our_marches() -> dict[str, dict]:
    """numero_marche → marché record (all years)."""
    out: dict[str, dict] = {}
    base = ROOT / "website" / "public" / "data" / "marches-publics"
    for f in base.glob("marches_*.json"):
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        for m in d.get("data", []):
            num = m.get("numero_marche")
            if num:
                out[num] = m
    return out


def report_coverage(records: list[MarcheRecord]) -> dict:
    our = load_our_marches()
    total_nums = 0
    matched_exact = 0
    matched_prefix = 0
    unmatched = []
    for r in records:
        for n in r.numeros_marche:
            total_nums += 1
            if n in our:
                matched_exact += 1
            elif any(k.startswith(n[:10]) for k in our):
                matched_prefix += 1
            else:
                unmatched.append(n)
    return {
        "delibs_scanned": len(records),
        "numeros_extracted": total_nums,
        "matched_exact": matched_exact,
        "matched_prefix_only": matched_prefix,
        "unmatched": unmatched[:20],
        "coverage_rate": round(matched_exact / total_nums, 3) if total_nums else 0.0,
    }


# ─────────────────────────────────────────────────────────────────────────
# Modes
# ─────────────────────────────────────────────────────────────────────────

def explore_session(session_id: int, limit: int = 3) -> None:
    """Dump raw dekerned text of first N marché PDFs for regex tuning."""
    print(f"== EXPLORE session {session_id} ==\n")
    dirs = list_directions(session_id)
    kept: list[DelibLink] = []
    for did, dname in dirs:
        for link in list_delibs(session_id, did, dname):
            if keep_marche(link):
                kept.append(link)
    print(f"  {len(kept)} délibés marché dans la session\n")
    for link in kept[:limit]:
        print("─" * 80)
        print(f"  {link.delib_id}  |  {link.direction_name}")
        print(f"  TITRE: {link.title}")
        print("─" * 80)
        try:
            pdf = download_pdf(link.id_entite)
            text = extract_text(pdf)
            print(_dekern(text)[:3000])
        except Exception as e:
            print(f"  error: {e}")
        print("\n")
        time.sleep(0.3)


def process_session(session_id: int, dry_run: bool = False) -> dict:
    print(f"== Session {session_id} — marchés ==")
    dirs = list_directions(session_id)
    kept: list[DelibLink] = []
    for did, dname in dirs:
        for link in list_delibs(session_id, did, dname):
            if keep_marche(link):
                kept.append(link)
    print(f"  {len(kept)} délibés marché identifiés")

    records: list[MarcheRecord] = []
    if not dry_run:
        for i, link in enumerate(kept, 1):
            try:
                pdf = download_pdf(link.id_entite)
                text = extract_text(pdf)
                rec = extract_marche_record(text, link)
                records.append(rec)
                nums_str = ",".join(rec.numeros_marche[:2]) or "—"
                four_str = (rec.fournisseur or "—")[:35]
                print(f"  [{i:3d}/{len(kept)}] {link.delib_id:<18} nums=[{nums_str:<35}] four={four_str:<35} {link.title[:70]}")
                time.sleep(0.15)
            except Exception as e:
                print(f"  [{i:3d}/{len(kept)}] {link.delib_id} error: {e}")

    coverage = report_coverage(records) if records else {}
    payload = {
        "session_id": session_id,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "Conseil de Paris — délibés filtrés marché/attribution/avenant",
        "nb_delibs": len(kept),
        "nb_records": len(records),
        "coverage_vs_table": coverage,
        "records": [asdict(r) for r in records],
    }
    if not dry_run:
        OUT.mkdir(parents=True, exist_ok=True)
        outfile = OUT / f"session_{session_id}.json"
        outfile.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n  → {outfile.relative_to(ROOT)}")
        print(f"  couverture: {coverage.get('matched_exact', 0)}/{coverage.get('numeros_extracted', 0)} "
              f"numéros matchent notre table ({coverage.get('coverage_rate', 0) * 100:.0f}%)")
    return payload


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", type=int, action="append")
    ap.add_argument("--session-range", type=str)
    ap.add_argument("--explore", action="store_true",
                    help="Dump raw text of first 3 marché PDFs for regex tuning.")
    ap.add_argument("--explore-limit", type=int, default=3)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    sessions: list[int] = []
    if args.session:
        sessions.extend(args.session)
    if args.session_range:
        lo, hi = [int(x) for x in args.session_range.split("-")]
        sessions.extend(range(lo, hi + 1))
    if not sessions:
        print("Pass --session N or --session-range LO-HI", file=sys.stderr)
        sys.exit(2)

    for sid in sessions:
        if args.explore:
            explore_session(sid, limit=args.explore_limit)
        else:
            process_session(sid, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
