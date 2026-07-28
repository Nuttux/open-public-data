#!/usr/bin/env python3
"""Expand the SF contract register's own shorthand — deterministically.

`us_sf_title_clean.py` strips department prefixes and fixes ALL-CAPS. It does
not touch the register's consonant-stripping habit, which is what actually
makes titles unreadable: "Gene Friend Rcrtn Ctr Rbd", "Sewp CTRL HVAC & Mac
Upgrd", "Mt Tnnl Constrn Mngnt Srvs".

This module expands that shorthand from a curated map. It is deliberately
mechanical, not clever:

  TIER A — orthographic recovery. The letters are already there in order;
           only vowels are missing. "Rcrtn" -> "Recreation" adds no
           information, it restores characters. 5,128 active titles contain
           966 distinct such tokens, 193 of them four times or more, so one
           map moves thousands of rows at once.

  TIER B — institution names that recur and are unambiguous *given the
           department*. LHH is Laguna Honda Hospital at Public Works; LH is
           the Legion of Honor at the Fine Arts Museum. Same letters,
           different buildings — so tier B is keyed on the token AND
           optionally the department code.

Anything not in either map is left exactly as the register wrote it. There is
no guessing rule and no fallback expansion: an unknown token stays unknown,
which is the honest outcome and keeps this reviewable by reading the maps.

Self-test: python3 us_sf_title_expand.py --test
"""

from __future__ import annotations

import re
import sys

# ── TIER A: consonant-stripped English. Restoring letters, not adding facts. ──
ABBREV: dict[str, str] = {
    # services / management
    "SVCS": "Services", "SVC": "Service", "SRVS": "Services", "SRVCS": "Services",
    "SERV": "Services", "SRV": "Service", "SVS": "Services", "SERVS": "Services",
    "MGMT": "Management", "MNGNT": "Management", "MGNT": "Management",
    "MGT": "Management", "ADMIN": "Administration", "ADMN": "Administration",
    "CNSLT": "Consulting", "CONSLT": "Consulting", "CNSLTNG": "Consulting",
    "COORDIN": "Coordination", "SCHEDUL": "Scheduling", "SUPP": "Support",
    "SUPPRT": "Support", "MAINT": "Maintenance", "MNT": "Maintenance",
    "OPER": "Operations", "OPRN": "Operation", "OPS": "Operations",
    # construction / engineering
    "CONSTRN": "Construction", "CNSTR": "Construction", "CONSTR": "Construction",
    "CNST": "Construction", "CONSTRS": "Constructors", "BLDRS": "Builders",
    "DSGN": "Design", "DESGN": "Design", "PLNNING": "Planning", "PLNG": "Planning",
    "ENGI": "Engineering", "ENGR": "Engineering", "ENGRG": "Engineering",
    "REPL": "Replacement", "RPLC": "Replacement", "RBD": "Rebuild",
    "UPGRD": "Upgrade", "UPGRDS": "Upgrades", "UPGRDES": "Upgrades",
    "IMPR": "Improvement", "IMPRV": "Improvement", "IMPROV": "Improvement",
    "RETR": "Retrofit", "RETRFT": "Retrofit", "DEMO": "Demolition",
    "STRTSCP": "Streetscape", "STRSCP": "Streetscape", "PVMNT": "Pavement",
    "INSTL": "Installation", "INSTALL": "Installation",
    # places / assets
    "CTR": "Center", "CNTR": "Center", "RCRTN": "Recreation", "RECRTN": "Recreation",
    "STN": "Station", "BLDG": "Building", "BLDGS": "Buildings",
    "FCLTY": "Facility", "FCLTYS": "Facilities", "FAC": "Facility",
    "SHRLN": "Shoreline", "PRK": "Park", "BLVD": "Boulevard", "AVE": "Avenue",
    "TNNL": "Tunnel", "TUNN": "Tunnel", "PIER": "Pier", "CAMPS": "Campus",
    "LIB": "Library", "SCHL": "School", "APTS": "Apartments",
    # utilities / water
    "WTR": "Water", "SWR": "Sewer", "SEWR": "Sewer", "STRM": "Storm",
    "CTRL": "Control", "CNTRL": "Control", "PWR": "Power",
    "TRNSM": "Transmission", "TRNSMSN": "Transmission", "CLRNC": "Clearance",
    "CHLRS": "Chillers", "COOLNG": "Cooling", "PMP": "Pump", "PMPS": "Pumps",
    "RESVR": "Reservoir", "TRTMNT": "Treatment", "TRTMT": "Treatment",
    # health
    "PHMCY": "Pharmacy", "PHRMCY": "Pharmacy", "SCNDRY": "Secondary",
    "DIST": "Distribution", "HLTH": "Health", "BEH": "Behavioral",
    "BHVRL": "Behavioral", "MNTL": "Mental", "NRSNG": "Nursing",
    "CLNC": "Clinic", "MED": "Medical", "PATNT": "Patient",
    # general
    "PRJ": "Project", "PROJ": "Project", "PRJCT": "Project", "PROG": "Program",
    "PRGM": "Program", "PRGRM": "Program", "MATL": "Materials",
    "MTRL": "Materials", "BKS": "Books", "EQP": "Equipment", "EQUIP": "Equipment",
    "GNRL": "General", "SPECLZD": "Specialized", "SPCL": "Special",
    "DEVT": "Development", "DVLPMNT": "Development", "DEVLP": "Development",
    "FNCL": "Financial", "FINCL": "Financial", "SRVYNG": "Surveying",
    "INSP": "Inspection", "INSPCT": "Inspection", "RCD": "Record",
    "OVRHL": "Overhaul", "RPR": "Repair", "REP": "Repair",
    "CONSLTNT": "Consultant", "COMM": "Communications", "MKTG": "Marketing",
    "SECRTY": "Security", "SCRTY": "Security", "INSUR": "Insurance",
    "TRNG": "Training", "EDUC": "Education", "NUTR": "Nutrition",
    "CONG": "Congregate", "WKFRC": "Workforce", "EMPLMT": "Employment",
    "MFD": "multi-function device", "MFDS": "multi-function devices",
}

# ── TIER B: recurring institutions. Value may depend on the department. ──────
# key = token, value = either a string, or {dept_code: string, "*": fallback}
INSTITUTIONS: dict[str, object] = {
    "LHH": "Laguna Honda Hospital",
    "ZSFG": "Zuckerberg San Francisco General",
    "SFGH": "San Francisco General Hospital",
    "SFPL": "San Francisco Public Library",
    "HHP": "Hetch Hetchy Power",
    "HHWP": "Hetch Hetchy Water and Power",
    "SEWPCP": "Southeast Water Pollution Control Plant",
    # PUC only, and only where the title does not already name a plant (see
    # the SEP guard in expand_title): "SEWP Control Plant SEP-7" uses it as a
    # suffix code, not as the facility.
    "SEP": {"PUC": "Southeast Plant"},
    "LH": {"FAM": "Legion of Honor"},    # Fine Arts Museum only, NOT Laguna Honda
    "RRH": "rapid re-housing",
    "PSH": "permanent supportive housing",
    "HDM": "home-delivered meals",
    "JOC": "job order contract",
    "BHS": {"DPH": "Behavioral Health Services"},
    "FRC": {"DEC": "Family Resource Center"},
    "CERF": "Community Economic Resilience Fund",
}

# Tokens that must survive untouched: already-correct acronyms, and codes whose
# expansion is unverified (see the tier-3 discipline in us_sf_title_tier.py).
KEEP = {
    "HVAC", "CBTC", "MOU", "RFP", "RFQ", "LBE", "MLBE", "SBDC", "UCSF", "TNDC",
    "PPA", "ESA", "CLP", "CPSF", "CDD", "PCC1", "PSC", "RFGA", "MST", "FCS",
    "ENP", "DAS", "CIP", "WRP", "TC", "OCA", "FTA", "IT", "EV", "LED", "ADA",
    "SFO", "SFMTA", "MTC", "AV", "TI", "GA", "FY", "JV", "EA", "CM", "GC",
    "NACCHO", "NCQA", "SFHDC", "IHSS", "SRO", "CDBG", "PH", "AN", "AS",
}

_TOKEN = re.compile(r"[A-Za-z]+")


def expand_title(title: str | None, department_code: str | None = None) -> str | None:
    """Expand register shorthand in a (already prefix-stripped) title.

    Returns None when nothing changed, so callers can tell an expansion
    happened and fall back to their existing value otherwise.
    """
    if not title:
        return None
    original = title
    changed = False

    def sub(match: re.Match[str]) -> str:
        nonlocal changed
        token = match.group(0)
        upper = token.upper()
        if upper in KEEP:
            return token
        if upper == "SEP" and "PLANT" in original.upper():
            return token  # already names a plant — SEP is a suffix code here
        inst = INSTITUTIONS.get(upper)
        if isinstance(inst, dict):
            code = (department_code or "").upper()
            inst = inst.get(code) or inst.get("*")
        if isinstance(inst, str):
            changed = True
            return inst
        word = ABBREV.get(upper)
        if word:
            changed = True
            # Match the surrounding case: an ALL-CAPS token in an otherwise
            # capitalised title still reads better title-cased.
            return word if token[:1].isupper() or token.isupper() else word.lower()
        return token

    out = _TOKEN.sub(sub, original)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out if changed and out and out != original else None


def _test() -> int:
    cases = [
        ("Gene Friend Rcrtn Ctr Rbd", None, "Gene Friend Recreation Center Rebuild"),
        ("Mt Tnnl Constrn Mngnt Srvs", None, "Mt Tunnel Construction Management Services"),
        ("Investment Management Svcs", None, "Investment Management Services"),
        ("Phmcy Scndry Dist.", None, "Pharmacy Secondary Distribution."),
        ("ZSFG Chlrs & Coolng Towers", None, "Zuckerberg San Francisco General Chillers & Cooling Towers"),
        ("LHH Emergency Power Add", "DPW", "Laguna Honda Hospital Emergency Power Add"),
        ("LH Capital Masonry FY25", "FAM", "Legion of Honor Capital Masonry FY25"),
        ("Sep PW Feed & Pswi Upgrdes", "PUC", "Southeast Plant PW Feed & Pswi Upgrades"),
        ("Folsom STRTSCP PRJ", None, "Folsom Streetscape Project"),
        ("Ingleside Police Stn Repl", None, "Ingleside Police Station Replacement"),
        ("India Basin Shrln Prk", None, "India Basin Shoreline Park"),
        ("96104C DBI Canon MFDs", None, "96104C DBI Canon multi-function devices"),
        # untouched: verified-unknown codes and correct acronyms
        ("CLP Gonzagwf PPA 4782 FY26", "PUC", None),
        ("Sewp CTRL HVAC & Mac Upgrd", None, "Sewp Control HVAC & Mac Upgrade"),
        ("TC96105 SFPL Staff Copiers", None, "TC96105 San Francisco Public Library Staff Copiers"),
        ("10071.76-DBT3West", "AIR", None),
        ("", None, None),
        (None, None, None),
    ]
    failures = 0
    for title, dept, expected in cases:
        got = expand_title(title, dept)
        ok = got == expected
        if not ok:
            failures += 1
        print(f"  {'ok  ' if ok else 'FAIL'} {title!r} ({dept}) -> {got!r}")
        if not ok:
            print(f"        wanted {expected!r}")
    print(f"\n{len(cases) - failures}/{len(cases)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--test" in sys.argv:
        sys.exit(_test())
    print(__doc__)
