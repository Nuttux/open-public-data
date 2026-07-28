#!/usr/bin/env python3
"""Compose plain-English text for the SF register's repetitive contract families.

Some families are templated enough that a rule beats writing each row: the
title carries a stable prefix plus one variable part, and the columns supply
the rest. Three qualify, measured over the active register:

    PUC power agreements (CLP / CPSF)      34 signatures
    Airport numbered projects              68 signatures
    Term contracts (TC#####)              420 signatures  (49 more had nothing
                                          readable after the code and were left
                                          as the register wrote them)

Each rule composes ONLY from the row's own columns and the readable remainder
of its title. Nothing is inferred: `CLP` and `CPSF` are never expanded (their
meaning is unverified — see us_sf_title_expand.KEEP), the Airport's project
numbers are quoted as project numbers, and a term contract's subject is
whatever the register wrote after the TC code.

Reviewing this file reviews all 522 outputs, which is the point of doing it by
rule. Hand-written entries always win: this only fills signatures the cache
does not already have.

Usage:
    python pipeline/scripts/enrich/compose_sf_contract_families.py --dry-run
    python pipeline/scripts/enrich/compose_sf_contract_families.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "export"))
from us_sf_title_tier import title_tier  # noqa: E402
from us_sf_title_expand import expand_title  # noqa: E402

CACHE = ROOT / "pipeline" / "cache" / "enrichment" / "vulgarization_sf_contracts.json"
ACTIVE = ROOT / "website" / "public" / "data" / "us" / "sf" / "contracts_active.json"


def sig(title: str | None, ctype: str | None) -> str:
    return f"{re.sub(r'\\s+', ' ', (title or '').strip()).upper()}|{ctype or ''}"


def dept_words(department: str | None) -> str:
    """"PUC Public Utilities Commsn" -> "the Public Utilities Commission"."""
    name = re.sub(r"^[A-Z]{2,4}\s+", "", (department or "").strip())
    fixes = {
        "Public Utilities Commsn": "Public Utilities Commission",
        "Municipal Transprtn Agncy": "Municipal Transportation Agency",
        "Airport Commission": "Airport Commission",
        "GSA - City Administrator": "City Administrator's office",
        "Children;Youth & Families": "Children, Youth and Their Families",
        "Economic & Wrkfrce Dvlpmnt": "Office of Economic and Workforce Development",
        "Recreation & Park Commsn": "Recreation and Park Commission",
    }
    name = fixes.get(name, name)
    return f"the {name}" if name else "the City"


def readable(fragment: str, department_code: str | None = None) -> str:
    """Make a run-together register fragment legible, orthographically only.

    "DBCargoBldg626.1" -> "Cargo Building 626.1": split lower->Upper and
    letter->digit boundaries, drop the design-build marker, then run the
    shared shorthand map. No word is added.
    """
    text = re.sub(r"^DBT?(?:\b|(?=[A-Z]))[\s-]*", "", fragment.strip())
    text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)
    text = re.sub(r"(?<=[A-Za-z])(?=\d)", " ", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" -–&.")
    return expand_title(text, department_code) or text


def has_real_word(text: str) -> bool:
    """At least one token that reads as English (4+ letters, 2+ vowels)."""
    return any(
        len(tok) >= 4 and sum(1 for ch in tok if ch in "aeiouAEIOU") >= 2
        for tok in re.findall(r"[A-Za-z]+", text)
    )


# ── family rules ─────────────────────────────────────────────────────────────


def puc_power(row: dict) -> tuple[str, str] | None:
    """PUC electricity agreements. The title's keyword says which instrument."""
    t = row.get("title_plain") or row["title"]
    if (row.get("department_code") or "") != "PUC" or not re.search(r"\b(CLP|CPSF)\b", t, re.I):
        return None
    up = t.upper()
    if "PPA" in up:
        kind, what = "Power purchase agreement", "buys electricity from a generator under a long-term purchase agreement"
    elif "SHARECOST" in up or "SHARE COST" in up:
        kind, what = "Shared-cost energy agreement", "shares the cost of a generation resource with another public power buyer"
    elif "ESA" in up:
        kind, what = "Energy storage agreement", "holds an agreement covering battery storage, which stores electricity to release when demand is higher"
    elif "RA" in re.findall(r"[A-Z]+", up):
        kind, what = "Resource adequacy agreement", "holds a capacity agreement, the kind that reserves generation to be available when the grid needs it"
    elif "REC" in up or "RECS" in up:
        kind, what = "Energy and renewable certificates", "buys electricity together with the certificates that record it as renewable"
    else:
        kind, what = "Electricity supply agreement", "holds an electricity supply agreement"
    dept = dept_words(row.get("department"))
    paid = float(row.get("paid_usd") or 0)
    tail = (
        " Nothing has been paid yet, which is normal for an agreement that pays per unit delivered."
        if paid <= 0
        else ""
    )
    return (
        kind,
        f"{dept[0].upper() + dept[1:]} {what}. The register's title is an internal "
        f"programme code, so it does not name the source further.{tail}",
    )


def air_project(row: dict) -> tuple[str, str] | None:
    """Airport contracts whose title is a bare project number."""
    t = row.get("title_plain") or row["title"]
    if (row.get("department_code") or "") != "AIR":
        return None
    m = re.match(r"^(\d{4,5}\.\d+)\s*[-–]?\s*(.*)$", t)
    if not m:
        return None
    number, rest = m.group(1), m.group(2).strip(" -–")
    ctype = row.get("contract_type") or ""
    noun = "construction" if ctype.startswith("Construction") else "work"
    subject = readable(rest, "AIR") if rest else ""
    if subject and has_real_word(subject):
        title = f"Airport {noun}: {subject}"
        body = (
            f"The Airport Commission is paying a supplier for this under project "
            f"{number}. The subject comes from the register's own abbreviated label."
        )
    else:
        title = f"Airport {noun}, project {number}"
        body = (
            f"The Airport Commission is paying a supplier under project {number}. "
            f"The register's title is only the Airport's project number, so it does "
            f"not say what is being built."
        )
    return title[:120], body


def term_contract(row: dict) -> tuple[str, str] | None:
    """TC##### term contracts — the subject is whatever follows the code."""
    t = row.get("title_plain") or row["title"]
    m = re.match(r"^(?:OCA\s*\|\s*)?TC\s*(\d{4,6}[A-Za-z]?)\s*[-–:]?\s*(.*)$", t, re.I)
    if not m:
        return None
    number, rest = m.group(1), m.group(2).strip(" -–:")
    subject = readable(rest, row.get("department_code"))
    if not has_real_word(subject):
        return None  # nothing readable after the code — leave it alone
    subject = subject[0].upper() + subject[1:]
    # Deliberately NOT "department X buys this": a term contract is held
    # centrally but ordered against by whichever department needs it, and the
    # title often names a different department than the signing one.
    return (
        subject[:120],
        f"{subject}, bought on term contract {number}. Term contracts are standing "
        f"arrangements: departments order against them over the contract period "
        f"rather than buying once.",
    )


RULES = (("puc_power", puc_power), ("air_project", air_project), ("term_contract", term_contract))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sample", type=int, default=10)
    args = ap.parse_args()

    payload = json.loads(CACHE.read_text(encoding="utf-8"))
    items: dict[str, dict] = payload["items"]
    before = len(items)
    rows = json.loads(ACTIVE.read_text(encoding="utf-8"))["rows"]

    added: dict[str, int] = {}
    samples: dict[str, list[tuple[str, str, str]]] = {}
    for row in rows:
        s = sig(row.get("title"), row.get("contract_type"))
        if s in items:
            continue  # hand-written or already composed — never overwrite
        for name, rule in RULES:
            out = rule(row)
            if not out:
                continue
            title, body = out
            items[s] = {
                "title_clear": title,
                "what_concretely": body,
                "tier": title_tier(row["title"]),
                "model": f"in-session (rule: {name})",
                "sample_contract_no": row["contract_no"],
            }
            added[name] = added.get(name, 0) + 1
            samples.setdefault(name, [])
            if len(samples[name]) < args.sample:
                samples[name].append((row["title"], title, body))
            break

    for name, _ in RULES:
        print(f"  {added.get(name, 0):5d}  {name}")
        for raw, title, body in samples.get(name, [])[:4]:
            print(f"          {raw[:38]:40s} -> {title[:56]}")
            print(f"          {'':40s}    {body[:96]}…")
    print(f"\nsignatures {before} -> {len(items)} (+{len(items) - before})")

    if args.dry_run:
        print("--dry-run: nothing written.")
        return 0
    payload["items"] = items
    payload["count"] = len(items)
    payload["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    payload["model"] = "in-session (hand-written + deterministic family rules)"
    CACHE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"💾 {CACHE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
