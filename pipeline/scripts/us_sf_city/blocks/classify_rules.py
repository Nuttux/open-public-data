"""The rule pass — the formula families, and nothing else.

    python3 classify_rules.py                 # per-decade hit rate on the 5k sample
    python3 classify_rules.py --show <topic>  # read what a rule claimed
    python3 classify_rules.py --miss          # read what nothing claimed

WHAT THIS IS FOR, AND WHAT IT IS NOT ALLOWED TO BE.

The Board wrote the same sentence thousands of times with the address swapped.
"permission, revocable at will of the Board of Supervisors, to erect and
maintain a storage tank of not more than 1500 gallons" is 27% of the 1900s and
0.0% of everything after 1940. Where the record is a FORMULA, a rule reads it
exactly, instantly, for nothing, and the same way every time — which is what
`raw -> stg -> …` reproducibility actually needs.

Where the record is PROSE, a rule guesses. So:

**No rule is trusted because it fired.** Every family here is checked against a
model reading the same records blind, and a family that does not agree is
deleted from this file and handed to the model. A rule earns its place with a
number or it does not keep it. `compare_rules_vs_model.py` is that check.

ORDER IS MEANING — first match wins. Not-a-record before everything; the Board
acting on its own calendar before any subject; the specific before the general.
"""
from __future__ import annotations

import re

# ── 1. not a record at all ──────────────────────────────────────────────────
NOT_A_RECORD = [
    ("page header or footer",
     r"printed at \d{1,2}:\d{2}\s*[ap]m|city and county of san francisco\s+page \d"
     r"|sunshine ordinance task force|ethics commission at \d|goodlett place,? room"
     r"|sfgov\.org|https?://|obtain a free copy|\bfax at\b\s*\(?\d"),
    ("index row",
     r"\(\s*[RO]\.?\s*\d{3,}\s*\)|^\s*\d{2,5}\s+[A-Z][a-z]+,\s+[A-Z][a-z]+\.?,\s"),
]

# ── 2. the Board acting on its own calendar ─────────────────────────────────
# A continuance is not a decision about the thing continued.
OUTCOME = (r"\b(?:adopted|finally passed|passed for second reading|passage for "
           r"second reading|motion carried|motion lost|be continued|be tabled|"
           r"be approved|be referred|be re-?referred|be divided|laid over|"
           r"indefinite postponement|read and ordered)\b")
# …but only when the row does not ALSO describe an act. A record that says what
# it did and then records the vote is a decision, not a procedural step. 83% of
# rows carrying a roll call are exactly that, so this gate matters more than the
# outcome pattern does.
SUBJECTY = (r"\b(?:ordering|granting|grants|authoriz\w+|appropriat\w+|establish\w+|"
            r"amend\w+|approv\w+|accept\w+|declar\w+|provid\w+|clos\w+|widen\w+|"
            r"improvement|construction|permission|settlement|urging|commend\w+|"
            r"conditional use|rezone|acquisition|lease|map of|set aside|creating|"
            r"adopting|changing|naming|prohibit\w+|regulat\w+|denying|denied|"
            r"dedicat\w+|vacat\w+|transferr\w+|reserving|designating)\b")

# ── 3. the subject families ─────────────────────────────────────────────────
# (topic, subtopic, pattern). First match wins, so the specific comes first.
FAMILIES: list[tuple[str, str, str]] = [

    # ---- the permit trade, which is the biggest thing in the early record ---
    ("permits and licences", "storage tanks",
     r"storage tank|\btank of not more than\b|\boil (?:tank|intake)\b"),
    ("permits and licences", "engines and boilers",
     r"\bengine and boiler|\bboilers? of\b|\bhorsepower\b|cupola furnace"),
    ("permits and licences", "keeping horses and cows",
     r"\bmaintain a stable|\bstables? (?:at|for|on)\b|for the accommodation of \w+ horses"
     r"|\bveterinary\b|\bfor (?:one|two|three|four|five|six|\d+) horses?\b"),
    ("permits and licences", "laundries",
     r"\blaundr(?:y|ies)\b"),
    ("permits and licences", "blasting",
     r"\bexplode blasts?\b|\bto blast\b|\bblasting\b"),
    ("permits and licences", "dance halls and shows",
     r"masquerade ball|\bdance hall|\bboxing exhibition|\bsparring\b|\bcircus\b"
     r"|\bentertainment permit\b|\btheatre\b"),
    ("permits and licences", "liquor",
     r"\bliquor licen|\btype[- ]\d{1,2}\b.{0,30}licen|on-?sale (?:general|beer)"),
    ("permits and licences", "taxis and garages",
     r"\btaxicab\b|\bpublic garage\b|\bautomobile stand\b"),
    ("permits and licences", "using the street or sidewalk",
     r"occupy (?:and maintain )?(?:a portion of|the )?(?:the )?(?:side)?walk"
     r"|\bawning\b|\bsidewalk permit|\bencroach"),
    ("permits and licences", "other permission",
     r"permission[,.]? (?:revocable at will|during the pleasure)"
     r"|\bgranted permission\b|permission (?:be and (?:the same )?is hereby|is hereby) "
     r"(?:granted|denied)|\brevocable permit"),

    # ---- franchises: a company given the right to run cars or lay track -----
    ("franchises", "",
     r"\bspur track|\bfranchise\b|right of way, and the right to construct"
     r"|to construct, (?:lay down, )?maintain and operate"),

    # ---- the street itself --------------------------------------------------
    ("street levels and lines", "official grades",
     r"official grades?\b|changing and re-?establish\w*|establishing grades"
     r"|change and (?:re-?)?establish grades|\bgrades? (?:on|at certain points)"),
    ("street levels and lines", "sidewalk widths",
     r"regulating the width of sidewalks|width of sidewalks"),
    ("street levels and lines", "set-back lines",
     r"set-?back lines?"),
    ("street works", "accepting finished work",
     r"(?:full|conditional) acceptance of the roadway|providing for .{0,20}acceptance"
     r"|\baccepting the work\b"),
    ("street works", "more time for the contractor",
     r"extensions? of .{0,15}(?:time|days)|within which to complete"),
    ("street works", "ordering an improvement",
     r"ordering the (?:improvement|performance|construction|paving|repaving|grading)"
     r"|improvement of .{0,50}(?:street|avenue|boulevard)|\bbasalt blocks?\b"
     r"|\bmacadam|\bbitumin|repaving|\brepairs to\b.{0,30}street"),
    ("street works", "sidewalks and curbs",
     r"artificial stone sidewalk|\bgranite curb|\bcurbs?\b|\bcrosswalk\b|\bbulkhead\b"),
    ("street names and closures", "closed for a day",
     r"temporar\w* clos\w+|street fair|closed to vehicular traffic|for a street"),
    ("street names and closures", "closed for good",
     r"clos(?:e|ed|ing) and abandon|\bvacat(?:e|ing|ion) of\b|closing certain streets"
     r"|permanent closure|declaring certain streets boulevards"),
    ("street names and closures", "naming and renaming",
     r"changing the name of|\bname of\b.{0,30}(?:street|avenue)|official street names"
     r"|\breserving\b.{0,40}\bstreet names\b"),
    ("sewers and drains", "",
     r"\bsewer|\bdrainage\b|\bstorm drain|\bcatch basin\b|\bculvert\b|\bcesspool\b"),
    ("street lighting and wires", "",
     r"\bstreet light|\barc lamp\b|\belectrolier\b|\blamp post\b|underground district"
     r"|\bpoles and overhead wires\b|\bwires\b.{0,20}underground"),

    # ---- getting around -----------------------------------------------------
    ("parking and traffic", "",
     r"\bparking\b|\bloading zone|\bwhite zone\b|\btraffic\b|\bstop sign|stop intersection"
     r"|\bspeed limit\b|\bone-?way\b|\btow-?away\b|\btruck lane\b|\bpedestrian crosswalk\b"),
    ("transit and railways", "",
     r"\brailway|\bstreet ?car|\btrolley|\bcable car|\bmuni\b|\bbart\b|\blight rail\b"
     r"|\bsubway\b|\btransit\b|\brailroad\b|\bfreeway\b|\bbicycle lane\b"),

    # ---- land and building --------------------------------------------------
    ("zoning and land use", "rezoning refused",
     r"\bdenying (?:the )?application to rezone|disapproving application to rezone"
     r"|denying application to change the use classification"),
    ("zoning and land use", "",
     r"\bzoning\b|\breclassif|\bconditional use\b|\bvariance\b|use (?:property )?"
     r"classification|\bresidential district\b|height (?:and bulk|of buildings)"
     r"|special use district|\bplanning code\b|\bdiscretionary review\b"),
    ("subdivisions and maps", "",
     r"\bfinal map\b|\btentative (?:final |parcel )?map\b|\bsubdivision\b"
     r"|\bcondominium\b|\bparcel map\b|approving map (?:of|showing)"),
    ("land and property", "city buys land",
     r"offer (?:has been )?received from|offer to convey|\bconvey to the city\b"
     r"|\bacquir\w+|\bcondemn\w+|purchase (?:of|from)|accepting (?:a |two )?deeds?"
     r"|eminent domain|purchase price"),
    ("land and property", "city sells land",
     r"authorizing sale|\bsale of (?:certain |real |portion)|\bsell\b|\bquitclaim\b"
     r"|sold and awarded|\bsurplus (?:land|property)\b|public auction"),
    ("land and property", "city leases",
     r"\blease\b|\bsublease\b|\brental of\b"),
    ("building and construction", "",
     r"ordering the construction of (?:the )?[A-Z]|building permit|\bdemolition\b"
     r"|\bdedicat\w+ to (?:park|public)|\bseismic\b|erect and maintain a (?:building|hospital)"),
    ("redevelopment", "",
     r"\bredevelop|\burban renewal\b|\bblight"),
    ("landmarks", "",
     r"\blandmark\b|historic (?:district|preservation|resource|building)|\bmills act\b"
     r"|certificate of appropriateness"),

    # ---- money --------------------------------------------------------------
    ("assessments", "",
     r"assessment to be imposed|\bten installments\b|district benefited"
     r"|\bassessment roll\b|paid in .{0,12}installments"),
    ("claims and payments", "",
     r"named claimants|\bclaim dated\b|in payment to|refunds? of erroneous"
     r"|duplicate tax fund|\binstallment payment\b|being refunds?"),
    ("lawsuits and settlements", "",
     r"settlement of (?:the |a |two )?(?:portion of the )?lawsuit|authorizing settlement"
     r"|superior court, case no|united states district court|\bv\.\s*city and county"
     r"|\bunlitigated claim\b|\bbankruptcy claim\b"),
    ("money set aside", "",
     r"\bappropriat\w+|set aside(?:,| and)? appropriated|\bsum of \$|authorizing an? "
     r"expenditure|authorizing the following expenditures|the following (?:amounts|sums) "
     r"be and (?:the same |they )?are hereby|out of the (?:general fund|surplus fund"
     r"|urgent necessit|budget)"),
    ("borrowing and bonds", "",
     r"\bbond (?:issue|fund|redemption)\b|\bbonds\b|\bindebtedness\b"
     r"|certificates? of participation|revenue note"),
    ("grants and gifts received", "",
     r"accept(?:ing)? and expend|\bgift-?in-?place\b|\bgift\b.{0,40}\bvalued at"
     r"|accept .{0,30}\bgrant\b|federal funds"),
    ("contracts and agreements", "",
     r"\bexecute an? (?:amendment|agreement|contract|lease)|award(?:ing)? .{0,20}contract"
     r"|memorandum of understanding|professional services|\bagreement (?:with|between)\b"),
    ("taxes and revenue", "",
     r"\btax rate\b|franchise percentage|\blicense fee\b|fee schedule|increase the fees"
     r"|\bbusiness tax\b|\btransfer tax\b|providing revenue for municipal purposes"),

    # ---- what the city runs -------------------------------------------------
    ("schools", "",
     r"\bschool\b|board of education|\bkindergarten\b|\bclassroom\b"),
    ("libraries", "",
     r"\blibrar"),
    ("police and fire", "",
     r"\bpolice (?:station|department|committee)\b|\bfire (?:department|house|station|"
     r"alarm|cistern|protection)\b|engine (?:house|company)\b|\bfirehouse\b|\bpatrol\b"),
    ("health and hospitals", "",
     r"\bhospital\b|\bclinic\b|\bsanitorium\b|\bsanitar|\bepidemic\b|\bhealth\b"
     r"|\bambulance\b|\bundertaking and embalming\b"),
    ("housing and shelter", "",
     r"\bhousing\b|\bdwelling unit\b|\bapartment\b|\btenant\b|\beviction\b|\bhomeless"
     r"|\bshelter\b|single room occupancy|\brooming house\b"),
    ("parks and recreation", "",
     r"\bpark\b|\bplayground\b|\brecreation\b|\bopen space\b|\bzoo\b|\bbeach\b"
     r"|\bgolf course\b|\bsquare\b"),
    ("the port and waterfront", "",
     r"\bport of san francisco\b|\bpier\b|\bwharf\b|\bseawall\b|\bembarcadero\b"
     r"|\bwaterfront\b|\bharbor\b"),
    ("water and power", "",
     r"\bwater main|\bhydrant\b|\breservoir\b|\baqueduct\b|\bhetch\b|water department"
     r"|pacific gas and electric|\bgas and electric\b|\btelephone\b|water supply"),
    ("the environment", "",
     r"environmental (?:findings|impact|review|quality)|\bceqa\b|negative declaration"
     r"|\bpollution\b|\bhazardous\b|\btoxic\b|odor control|public emergency"),

    # ---- how the city was run -----------------------------------------------
    ("appointing people", "",
     r"\bappoint\w+|\breappoint\w+|\bnominat\w+|president pro tempore|\bvacanc\w+\b"),
    ("city staff and jobs", "",
     r"creating the position|position of one|\bper month in the office\b|\bsalar\w+"
     r"|\bcivil service\b|fixing compensation|\bovertime\b"),
    ("changing the city's own rules", "",
     r"amending the (?:san francisco )?(?:administrative|planning|park|police|health|"
     r"building|public works|municipal|traffic|business and tax) code|\bcharter amendment\b"
     r"|amending .{0,20}\bcode\b"),
    ("elections and the ballot", "",
     r"\bballot\b|special election|\bproposition [a-z0-9]\b|submitted to the electors"),
    ("positions on state and national matters", "",
     r"\burging\b|\bendorsing\b|\bsupporting\b.{0,30}\b(?:bill|proposition|act)\b"
     r"|\bopposing\b.{0,40}\b(?:bill|proposition|act)\b"),
    ("commendations and proclamations", "",
     r"\bcommend\w+|\bproclaim\w+|\bin memoriam\b|\bcongratulat\w+|certificates? of honor"
     r"|declaring .{0,40}\bday\b|\bhonoring\b"),
    ("hearings and appeals", "",
     r"\bhearing of persons interested\b|\bappeal of\b|prepare findings|reversing the "
     r"(?:approval|determination|certification)|affirming the determination"),
]

NOT_RX = [(lab, re.compile(p, re.I)) for lab, p in NOT_A_RECORD]
OUT_RX = re.compile(OUTCOME, re.I)
SUB_RX = re.compile(SUBJECTY, re.I)
FAM_RX = [(t, s, re.compile(p, re.I)) for t, s, p in FAMILIES]

MIN_TEXT = 25

# ── FIX 2: the two false-positive sources the blind test exposed ─────────────
# A word is not the subject when it is part of a proper name. Both of these
# were measured: "Armstrong Avenue, Anza Street, Cabrillo Street" was called
# `parks` because Park sits inside a street name, and "$60,000 out of the 1931
# Boulevards and Sewer bond fund" was called `sewers` because a FUND is named
# after what it pays for. Fund names describe where money sits; street names
# describe a road. Neither describes the record.
STREET_TYPE = (r"(?:st(?:reet)?|ave(?:nue)?|blvd|boulevard|road|rd|way|drive|dr"
               r"|place|pl|court|ct|alley|lane|terrace|plaza|highway|hwy)s?\b")
IS_STREET_NAME = re.compile(r"\b(park|church|army|ocean|market|post|bush|mission|"
                            r"presidio|grant|water|school|hyde|castro|geary)\s+"
                            + STREET_TYPE, re.I)
IS_FUND_NAME = re.compile(r"\b(?:out of|from|credit of|charged to)\b[^.;]{0,80}?"
                          r"\b(?:fund|account|budget item|appropriation)\b", re.I)


def _strip_proper_names(t: str) -> str:
    """Blank the spans where a subject word is only part of a name."""
    t = IS_STREET_NAME.sub(" ", t)
    t = IS_FUND_NAME.sub(" ", t)
    return t


def classify(text: str, kind: str = "") -> dict:
    """-> {record_type, topic, subtopic, rule}. Never raises, always answers."""
    t = (text or "").strip()
    if kind == "W":
        # engineering-report prose, not a Board act. It is a different corpus
        # and must not be given a decision topic.
        return {"record_type": "departmental work", "topic": "", "subtopic": "",
                "rule": "kind"}
    if len(t) <= MIN_TEXT:
        return {"record_type": "too damaged to read", "topic": "", "subtopic": "",
                "rule": "length"}
    # FURNITURE ONLY WHEN IT IS THE WHOLE RECORD. A running footer trails a
    # real decision constantly — "…City and County of San Francisco Page 442
    # Printed at 11:10 am" — and matching anywhere threw away four real
    # records in the blind test. So: strip the furniture, and if what is left
    # still reads like a record, it is a record.
    for lab, rx in NOT_RX:
        if not rx.search(t):
            continue
        rest = rx.sub(" ", t).strip()
        if len(rest) < 60 or not SUB_RX.search(rest):
            return {"record_type": lab, "topic": "", "subtopic": "", "rule": lab}
    if OUT_RX.search(t) and not SUB_RX.search(t):
        return {"record_type": "vote outcome only", "topic": "a vote or a scheduling step",
                "subtopic": "", "rule": "outcome without an act"}
    # the families read the text with proper names blanked out
    tn = _strip_proper_names(t)
    for topic, sub, rx in FAM_RX:
        if rx.search(tn):
            return {"record_type": "decision", "topic": topic, "subtopic": sub,
                    "rule": f"{topic}|{sub}"}
    if OUT_RX.search(t):
        return {"record_type": "decision", "topic": "a vote or a scheduling step",
                "subtopic": "", "rule": "outcome, no family"}
    return {"record_type": "decision", "topic": "not yet sorted", "subtopic": "",
            "rule": ""}


if __name__ == "__main__":
    import argparse, collections, json, os, random
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", default="")
    ap.add_argument("--miss", action="store_true")
    ap.add_argument("-n", type=int, default=25)
    a = ap.parse_args()
    HERE = os.path.dirname(os.path.abspath(__file__))
    REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
    rows = [json.loads(l) for l in
            open(os.path.join(REPO, "scratchpad/sf-classify/sample5k.jsonl"))]
    for r in rows:
        r["_c"] = classify((r["hp"] + " " + r["t"]).strip(), r.get("kind") or "")

    if a.show or a.miss:
        want = "not yet sorted" if a.miss else a.show
        pool = [r for r in rows if r["_c"]["topic"] == want]
        random.seed(9)
        print(f"{len(pool):,} rows in '{want}'\n")
        for r in random.sample(pool, min(a.n, len(pool))):
            print(f"[{r['y']}] {r['t'][:165]}")
        raise SystemExit

    n = len(rows)
    rt = collections.Counter(r["_c"]["record_type"] for r in rows)
    print(f"{n:,} sampled records\n")
    print("record_type")
    for k, v in rt.most_common():
        print(f"  {k:<26}{v:>6,}{100*v/n:>7.1f}%")

    dec = [r for r in rows if r["_c"]["record_type"] == "decision"]
    sorted_ = [r for r in dec if r["_c"]["topic"] != "not yet sorted"]
    print(f"\ndecisions {len(dec):,} · given a topic {len(sorted_):,} "
          f"= {100*len(sorted_)/max(1,len(dec)):.1f}%")

    print("\nPER DECADE — the number that must not hide behind the modern half")
    print(f"  {'decade':<9}{'rows':>7}{'decisions':>11}{'topic found':>13}")
    by = collections.defaultdict(lambda: [0, 0, 0])
    for r in rows:
        d = (r["y"] or 0)//10*10
        by[d][0] += 1
        if r["_c"]["record_type"] == "decision":
            by[d][1] += 1
            if r["_c"]["topic"] != "not yet sorted":
                by[d][2] += 1
    for d in sorted(by):
        tot, dd, ss = by[d]
        print(f"  {d}s{'':<4}{tot:>7,}{dd:>11,}{ss:>9,} {100*ss/max(1,dd):>5.1f}%")

    print("\nTOPICS")
    tc = collections.Counter(r["_c"]["topic"] for r in dec if r["_c"]["topic"])
    for k, v in tc.most_common():
        print(f"  {k:<42}{v:>6,}{100*v/len(dec):>7.1f}%")
