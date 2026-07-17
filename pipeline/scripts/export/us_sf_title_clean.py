#!/usr/bin/env python3
"""Deterministic SF contract-title cleaner (Block 3).

59% of the register's titles start with department shorthand ("PW ",
"AIR-", "PUC_", "DPH - ", "ADMGA ...") and many are ALL-CAPS admin strings.
There is NO descriptive text anywhere in the source to fall back on
(scope_of_work is capped at 50 chars and is ≈ the title — measured,
docs/us/block-studies/3-contracts.md §5), and the ~6k LLM title-
vulgarization batch is gated on a separate eval. This module is the
NO-LLM fallback that ships with the page: rule-based, reversible in
spirit (the raw title is always published next to it), and deliberately
conservative — it must never invent content.

Rules, in order:
  1. whitespace normalization;
  2. strip leading department-code prefixes — ONLY tokens anchored to the
     row's own department_code (or an explicit alias: PW for DPW, SFMTA
     for MTA, DT for TIS), incl. sub-program variants that START with the
     code (ADMGA, ADMRM…). A generic "strip any caps token" would mangle
     vendor names (KONICA, UCSF) — measured risk, hence the whitelist;
  3. underscores → spaces;
  4. ALL-CAPS strings (≥75% uppercase alpha, ≥8 alpha chars) are
     title-cased with protections: tokens with digits or '&' and 1-2
     letter tokens stay verbatim, a small curated acronym list stays
     uppercase, joining words are lowercased;
  5. returns None when nothing readable remains (caller falls back to the
     raw title).

Self-test: python3 us_sf_title_clean.py --test
"""

from __future__ import annotations

import re
import sys

# Aliases observed in titles that do not literally equal department_code.
DEPT_ALIASES: dict[str, tuple[str, ...]] = {
    "DPW": ("PW",),
    "MTA": ("SFMTA",),
    "TIS": ("DT",),
}

# Curated acronyms that must stay uppercase when title-casing.
ACRONYM_KEEP = {
    "IHSS", "HVAC", "HIV", "AIDS", "LGBTQ", "SFO", "SFPD", "SFFD", "SFMTA",
    "MOU", "RFP", "RFQ", "GOS", "CBTC", "LRV", "LRVS", "ADA", "IT", "COVID",
    "UCSF", "UASI", "AWSS", "CNG", "LED", "GPS", "VOIP", "DBE", "LBE",
    "PPA", "EMS", "ERP", "SFUSD", "TAY", "SRO", "CDBG", "HOPWA", "FEMA",
    "DHS", "EV", "USA", "CCSF", "SF", "SOMA", "ADU", "EIR", "CEQA", "JV",
}

# Joining words lowercased inside title-cased output (never the first token).
STOPWORDS = {
    "OF", "THE", "TO", "AT", "IN", "ON", "BY", "FOR", "AND", "OR", "A",
    "AN", "WITH", "PER",
}

# "/" is NOT a prefix separator: "SFMTA/MTC Clipper MOU" names two parties —
# stripping the first would misattribute the agreement.
_SEP_AFTER_PREFIX = re.compile(r"^[\s_\-.:,]+")
_LEAD_TOKEN = re.compile(r"^([A-Z]{2,6})(?=[\s_\-.:,])")


def _prefix_candidates(department_code: str | None) -> tuple[str, ...]:
    if not department_code:
        return ()
    code = department_code.strip().upper()
    if not code:
        return ()
    return (code, *DEPT_ALIASES.get(code, ()))


def _strip_dept_prefixes(text: str, department_code: str | None) -> str:
    """Strip up to 3 leading dept-anchored shorthand tokens."""
    candidates = _prefix_candidates(department_code)
    if not candidates:
        return text
    out = text
    for _ in range(3):
        m = _LEAD_TOKEN.match(out)
        if not m:
            break
        token = m.group(1)
        anchored = any(
            token == cand or (token.startswith(cand) and len(token) <= 6)
            for cand in candidates
        )
        if not anchored:
            break
        rest = _SEP_AFTER_PREFIX.sub("", out[m.end():])
        if not rest:            # title was only the prefix — keep as-is
            break
        out = rest
    return out


_VOWELS = set("AEIOUaeiou")


def _case_runs(token: str) -> str:
    """Capitalize each alpha run: CHECK-WRIT → Check-Writ, COV/SERV → Cov/Serv."""
    return re.sub(
        r"[A-Za-z]+",
        lambda m: m.group(0)[0].upper() + m.group(0)[1:].lower(),
        token,
    )


def _smart_title_case(text: str) -> str:
    tokens = text.split(" ")
    out: list[str] = []
    for i, token in enumerate(tokens):
        core = re.sub(r"[^A-Za-z]", "", token)
        if not core:
            out.append(token)
        elif any(ch.isdigit() for ch in token) or "&" in token:
            out.append(token)                       # WD-2747, PG&E, FY22
        elif core.upper() in ACRONYM_KEEP:
            out.append(token)                       # IHSS, HVAC…
        elif i > 0 and core.upper() in STOPWORDS:
            out.append(token.lower())               # OF, FOR, AND…
        elif not (set(core) & _VOWELS):
            out.append(token)                       # CLP, BLCK, SVC — abbrev.
        elif len(core) <= 2:
            out.append(token)                       # FI, WM, JO…
        else:
            out.append(_case_runs(token))
    return " ".join(out)


def _is_shouting(text: str) -> bool:
    alpha = [c for c in text if c.isalpha()]
    if len(alpha) < 8:
        return False
    upper = sum(1 for c in alpha if c.isupper())
    return upper / len(alpha) >= 0.75


def clean_title(raw: str | None, department_code: str | None) -> str | None:
    """Cleaned display title, or None when no useful cleaning applies.

    Callers publish the result as `title_plain` ONLY when it differs from
    the raw title; the raw title is always published alongside.
    """
    if not raw:
        return None
    text = re.sub(r"\s+", " ", raw).strip()
    if not text:
        return None

    text = _strip_dept_prefixes(text, department_code)
    if "_" in text:
        text = re.sub(r"\s+", " ", text.replace("_", " ")).strip()
    if _is_shouting(text):
        text = _smart_title_case(text)
    if text and text[0].islower():
        text = text[0].upper() + text[1:]

    text = text.strip()
    if len(text) < 3:
        return None
    original = re.sub(r"\s+", " ", raw).strip()
    return text if text != original else None


# ---------------------------------------------------------------------------
# Self-test — every case is a real title from the register (sampled live
# 2026-07-16) except the synthetic guards at the end.
# ---------------------------------------------------------------------------
_CASES: list[tuple[str, str | None, str | None]] = [
    # (raw, department_code, expected title_plain or None if unchanged)
    ("ECN Street Beautification 2017", "ECN", "Street Beautification 2017"),
    ("DPH - Outpatient MH Services", "DPH", "Outpatient MH Services"),
    ("ADMRM: Broker Services", "ADM", "Broker Services"),
    ("AIR-WORK SAFETY CLOTHING", "AIR", "Work Safety Clothing"),
    ("PUC_CLP_BLCK-ENERGY-AUG20", "PUC", "CLP BLCK-ENERGY-AUG20"),  # no-vowel abbrevs stay
    ("WAR_FY23_WM_PUC_Investigation", "WAR", "FY23 WM PUC Investigation"),
    ("HSA: IHSS-IP Mode 19-22", "HSA", "IHSS-IP Mode 19-22"),
    ("ADMGA FY22 GOS Arts", "ADM", "FY22 GOS Arts"),
    ("ADMNB: Tunnel Top (East Nbrhd)", "ADM", "Tunnel Top (East Nbrhd)"),
    ("REC-47312-17/18-Portsm Phase 2", "REC", "47312-17/18-Portsm Phase 2"),
    ("PW PW_St Impv", "DPW", "St Impv"),  # doubled prefix, both stripped
    ("MENTAL HEALTH SERVICES", "DPH", "Mental Health Services"),
    ("SUBSTANCE ABUSE & MENTAL HEALT", "DPH", "Substance Abuse & Mental Healt"),
    ("FISCAL INTERMEDIARY CHECK-WRIT", "DPH", "Fiscal Intermediary Check-Writ"),
    ("DATA PROCESSING OF CLINICAL FI", "DPH", "Data Processing of Clinical FI"),
    ("miscellaneous mechanical items", "PUC", "Miscellaneous mechanical items"),
    ("INS COV/SERV-AIRPORT", "ADM", "Ins Cov/Serv-Airport"),
    # Vendor names and mixed case must survive untouched:
    ("KONICA MINOLTA COPIER LEASE", "ADM", "Konica Minolta Copier Lease"),
    ("BeyondTrust Security SaaS", "DEM", None),
    ("Brilliant Corners - PropC FHSP", "HOM", None),
    ("SFMTA/MTC Clipper MOU", "MTA", None),  # slash blocks token match — kept
    ("AWSS - NEW CISTERNS F, WD-2747", "PUC", "AWSS - New Cisterns F, WD-2747"),
    ("*FINAL/1604N* JO 1604N FOR SVC", "PUC", "*FINAL/1604N* JO 1604N for SVC"),
    ("4153 20th St Apt 5", "MYR", None),
    ("COVID 19", "DPH", None),  # only 7 alpha chars — not "shouting"
    # Guards:
    ("h", "MYR", None),                       # too short → fallback to raw
    ("", "DPH", None),
    (None, "DPH", None),
    ("DPH", "DPH", None),                     # prefix only — kept as-is
    ("MYR-181664-22", "MYR", "181664-22"),
]


def _self_test() -> int:
    failures = 0
    for raw, dept, expected in _CASES:
        got = clean_title(raw, dept)
        if got != expected:
            failures += 1
            print(f"FAIL raw={raw!r} dept={dept} expected={expected!r} got={got!r}")
    total = len(_CASES)
    print(f"{total - failures}/{total} cases pass")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--test" in sys.argv:
        sys.exit(_self_test())
    print(__doc__)
