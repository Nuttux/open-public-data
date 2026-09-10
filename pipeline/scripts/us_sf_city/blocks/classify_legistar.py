# -*- coding: utf-8 -*-
"""Classify the 2026 Legistar rows the way the corpus is classified.

WHAT PRODUCED THE 2026 ROWS OF THE FROZEN SEEDS. The 15 Legistar meetings of
2026 arrived after the corpus was classified and scored, so they needed the
same two passes the rest of the record already had. This file is that pass,
kept so the seed rows it wrote can be re-derived and argued with rather than
taken on trust.

    input   pipeline/scripts/us_sf_city/cache_sfbos/items_all_legistar.jsonl
    output  pipeline/seeds/sf_bos_classification.csv (the sfbos:leg rows)

The rule that governs it is CLASSIFY-SPEC.md's: no rule is trusted because it
fired. Every family below was checked against the distribution the corpus
already gives records whose written line reads the same way, and thirteen were
wrong on the first pass — the Police Code is not the police department, a
Planning Code amendment is zoning whatever it zones, a behested payment is not
the employees' fundraising drive.
"""

import re

# ── subject → (topic, subtopic).  Ordered: the first match wins. ──────────────
SUBJ = [
 (r"\bpolice department\b|\bpolice commission\b|\bpolice district\b|\bpolice staffing\b|\bsheriff\b|\bdistrict attorney\b|\blaw enforcement\b|\bmilitary equipment\b|\bpolice officer|\bpolicing\b", ("city-services","police")),
 (r"\bfire department\b|\bfire code\b|\bfire commission\b|\bfirefight", ("city-services","fire")),
 (r"\bpublic health\b|\bhealth department\b|\bhospital\b|\blaguna honda\b|\bzuckerberg\b|\bbehavioral health\b|\bmental health\b|\bhealth service system\b|\bhealth authority\b|\bhealth network\b|\bhealth code\b|\bmedical\b|\bnursing\b|\bhealth center\b|\bsubstance use\b|\bhiv\b|\bfentanyl\b|\bhealth\b", ("city-services","health")),
 (r"\bhomeless|\bsupportive housing\b|\bshelter\b|\baffordable housing\b|\bhousing authority\b|\bhousing code\b|\brent\b|\btenant\b|\bmayor'?s office of housing\b|\bhousing element\b|\bcontinuum of care\b|\bpermanent housing\b|\bhousing act\b|\bemergency solutions grant\b|\bhousing opportunities\b|\bhome investment partnerships\b", ("city-services","housing-shelter")),
 (r"\brecreation and park\b|\bpark department\b|\bgolden gate park\b|\bplayground\b|\bmclaren park\b|\bmarina yacht harbor\b|\bopen space\b|\bpark\b(?! ?ing)", ("city-services","parks")),
 (r"\blibrar", ("city-services","libraries")),
 (r"\bschool district\b|\bunified school\b|\bcity college\b|\bschool\b|\bchildcare\b|\bchild care\b|\bearly care\b", ("city-services","schools")),
 (r"\bport of san francisco\b|\bport commission\b|\bpier \d|\bpier\b|\bwaterfront\b|\bferry\b|\bharbor\b", ("city-services","port")),
 (r"\bpublic utilities commission\b|\bwater (?:supply|system|main|enterprise|department)\b|\bhetch hetchy\b|\bwastewater\b|\bsewer\b|\bcleanpowersf\b", ("city-services","water-supply")),
 (r"\bpower\b|\belectric\b|\butilit|\bpacific gas\b|\bhigh-voltage\b", ("city-services","power-utilities")),
 (r"\benvironment\b|\bclimate\b|\bgraffiti\b|\brefuse\b|\brecycl|\bstreet tree\b|\btree\b|\bair quality\b", ("city-services","environment")),
 (r"\bemergency\b|\bdisaster\b|\bwarning system\b|\bearthquake\b|\bseismic\b", ("city-services","emergencies")),
 (r"\bairport\b|\bsfo\b|\bairline", ("city-services","port")),
 (r"\bmuni\b|\btransit\b|\bmunicipal transportation\b|\bsfmta\b|\bcaltrain\b|\bpeninsula corridor\b|\bbart\b|\bshuttle\b|\bbus\b", ("getting-around","transit")),
 (r"\bparking\b|\bgarage\b|\bcurbside\b", ("getting-around","parking")),
 (r"\bspeed safety\b|\btraffic\b|\bvision zero\b", ("getting-around","traffic")),
 (r"\bbicycle|\bpedestrian\b|\bsidewalk\b", ("getting-around","bicycles-walking")),
 (r"\blandmark\b|\bhistoric\b|\bheritage center\b", ("land-and-building","landmarks")),
 (r"\bzoning\b|\bplanning code\b|\bspecial use district\b|\bconditional use\b|\badaptive reuse\b|\binterim zoning\b|\bdevelopment agreement\b|\bgeneral plan\b", ("land-and-building","zoning")),
 (r"\bfinal map\b|\bsubdivision\b|\btentative map\b", ("land-and-building","subdivisions")),
 (r"\bredevelopment\b|\bsuccessor agency\b|\btreasure island\b|\bmission bay\b|\bhunters point\b|\bpotrero power\b", ("land-and-building","redevelopment")),
 (r"\bbusiness district\b|\bbenefit district\b|\bcommunity benefit\b", ("running-the-city","business-districts")),
 (r"\bliquor licen[cs]e\b|\balcohol", ("doing-business","liquor")),
 (r"\bentertainment commission\b|\bnightlife\b|\bdance hall\b|\bconcert\b", ("doing-business","dance-halls-shows")),
 (r"\bcannabis\b|\btobacco\b|\bvending\b", ("doing-business","other-permits")),
]

MONTHY = r"\b(day|week|month|anniversary|commemorat|celebrat|honou?ring|honor|commend|recogni[sz]ing|proclaim|in memoriam|declaring .* (?:day|week|month))\b"

def classify(ht, t, line):
    """Return (record_type, topic, subtopic, action)."""
    h = (ht or "").strip()
    hl = h.lower()
    tl = (t or "").lower()
    both = hl + " " + tl

    # ── record type ──────────────────────────────────────────────────────────
    if not h:
        if re.search(r"spoke (?:on|in|regarding)|public comment|speaker;", tl):
            return ("public-comment", "running-the-city", "vote-or-scheduling", "voted-or-scheduled")
        return ("cut-in-half", "running-the-city", "vote-or-scheduling", "voted-or-scheduled")

    ZONING_HEAD = re.compile(r"^(planning code|interim zoning controls|zoning map|"
                             r"planning code[;,]|planning, administrative, building codes)")

    def subj(default):
        if ZONING_HEAD.match(hl) and not re.search(r"landmark|historic district", hl):
            return ("land-and-building", "zoning")
        for rx, ts in SUBJ:
            if re.search(rx, hl):
                return ts
        return default

    # ── settlements ──────────────────────────────────────────────────────────
    if hl.startswith("settlement of lawsuit") or hl.startswith("settlement of litigated"):
        return ("decision", "public-money", "lawsuits", "settled")
    if hl.startswith("settlement of unlitigated") or hl.startswith("settlement agreement") \
       or hl.startswith("settlement of claims"):
        return ("decision", "public-money", "claims-refunds", "settled")
    if hl.startswith("closed session"):
        return ("decision", "public-money", "lawsuits", "voted-or-scheduled")

    # ── appointments ─────────────────────────────────────────────────────────
    if re.match(r"(mayoral |presidential |board )?(re)?appointments?\b", hl):
        return ("decision", "running-the-city", "appointments", "appointed")

    # ── hearings and scheduling ──────────────────────────────────────────────
    if hl.startswith(("hearing", "committee of the whole", "calling from committee",
                      "board response", "continuance", "rules of order")):
        return ("decision", "running-the-city", "hearings-appeals", "voted-or-scheduled")
    if hl.startswith(("approval of a 90-day extension", "authorizing preparation",
                      "preparation of proponent")):
        return ("decision", "running-the-city", "hearings-appeals", "voted-or-scheduled")

    # ── commendations, proclaimed days ───────────────────────────────────────
    if re.match(r"(commending|celebrating|honoring|honouring|recognizing|in memoriam|"
                r"commemorating|declaring|affirming|condemning)\b", hl) or \
       re.search(r"\b(day|week|month)\b\s*[-–]\s*\w", hl) or \
       re.search(r"\b(heritage month|awareness (?:day|month|week)|appreciation month|"
                 r"pride month|commemoration day|anniversary)\b", hl):
        return ("decision", "civic-life", "commendations", "commended")

    # ── state and national ───────────────────────────────────────────────────
    if re.match(r"(supporting|urging|opposing)\b", hl):
        if re.search(r"\b(assembly bill|senate bill|concurrent resolution|congress|"
                     r"h\.?r\.? ?\d|federal|state of california|fcc|national archives|"
                     r"united states)\b", hl):
            return ("decision", "civic-life", "state-and-national", "other")
        return ("decision", "running-the-city", "oversight", "other")

    # ── elections ────────────────────────────────────────────────────────────
    if re.search(r"\belection\b|\bballot argument\b|\binitiative ordinance\b|"
                 r"\bcharter amendment\b|\bballot simplification\b|\bconsolidation of elections\b", hl):
        t2 = ("running-the-city", "elections")
        if hl.startswith("appointments"): t2 = ("running-the-city", "appointments")
        return ("decision", t2[0], t2[1], "voted-or-scheduled")

    # ── money families ───────────────────────────────────────────────────────
    if re.match(r"(accept and expend|apply for|authorizing grant agreements|"
                r"accept and expend grants?)\b", hl):
        tp = subj(("public-money", "budget"))
        act = "other" if hl.startswith("apply for") else "accepted"
        return ("decision", tp[0], tp[1], act)
    if re.search(r"\bgeneral obligation bonds?\b|\brevenue bonds?\b|\bissue bonds\b|"
                 r"\bissuance of bonds\b|\bmultifamily housing revenue notes\b|"
                 r"\bsale of .{0,30}bonds\b|\bcertificates of participation\b", hl):
        return ("decision", "public-money", "bonds", "ordered")
    if re.search(r"\bappropriation\b|\bde-appropriation\b|\bappropriations limit\b|"
                 r"\bbudget\b|\bfunding reallocation\b|\bsupplemental\b", hl):
        return ("decision", "public-money", "budget", "appropriated")
    hx = re.sub(r"business and tax regulations codes?", " ", hl)
    if re.search(r"\btax\b|\btaxes\b|\bfee\b|\bfees\b|\bexcise\b", hx):
        return ("decision", "public-money", "taxes-revenue", "amended")
    if re.search(r"\bassessment\b", hl):
        return ("decision", "public-money", "assessments", "ordered")
    if re.search(r"\bfundraising drive\b|\bcombined charities\b", hl):
        return ("decision", "public-money", "employee-fundraising", "other")
    if re.search(r"\bbehested payment\b", hl):
        return ("decision", "running-the-city", "oversight", "other")

    # ── leases and property ──────────────────────────────────────────────────
    if re.search(r"\blease\b|\bconcession\b|\brent forgiveness\b|\beasement\b", hl):
        act = "amended" if re.search(r"amendment|modification|termination|extension", hl) else "granted"
        return ("decision", "land-and-building", "city-leases", act)
    if re.search(r"\bacquisition of real property\b|\bpurchase of real property\b|"
                 r"\breal property acquisition\b|\badding territory\b|\baddition of territory\b|"
                 r"\bannexation\b|\btransfer of the\b", hl):
        return ("decision", "land-and-building", "city-buys-land", "ordered")

    # ── staff, salaries, labour ──────────────────────────────────────────────
    if re.search(r"\bsalary ordinance\b|\bmemorandum of understanding\b|\bcompensation for unrepresented\b|\bemployee compensation\b|"
                 r"\bunrepresented employees\b|\bpaid parental leave\b|\bcivil service\b|"
                 r"\bhealth service system plans\b|\bcost of living adjustment\b", hl):
        return ("decision", "running-the-city", "staff-and-jobs", "amended")

    # ── contracts and agreements ─────────────────────────────────────────────
    if re.search(r"\bcontract\b|\bagreement\b|\bloan\b|\bpermit amendment\b|"
                 r"\bproposition j\b|\bparticipation agreement\b|\bperformance contract\b", hl):
        tp = subj(("public-money", "budget"))
        act = "amended" if re.search(r"amendment|modification|amending|amended", hl) else "ordered"
        return ("decision", tp[0], tp[1], act)

    # ── codes ────────────────────────────────────────────────────────────────
    if re.search(r"\bcodes?\b", hl):
        tp = subj(("running-the-city", "code-changes"))
        return ("decision", tp[0], tp[1], "amended")

    if hl.startswith("initiating landmark") or re.search(r"\blandmark designation\b", hl):
        return ("decision", "land-and-building", "landmarks",
                "amended" if hl.startswith("planning code") else "ordered")
    if re.search(r"\bfinal map\b|\btentative map\b|\bsubdivision\b", hl):
        return ("decision", "land-and-building", "subdivisions", "accepted")
    if re.search(r"\bliquor licen[cs]e\b", hl):
        return ("decision", "doing-business", "liquor", "granted")

    # ── policies, oversight, everything else ─────────────────────────────────
    if re.search(r"\bpolicy\b|\bsurveillance\b|\bequipment use\b|\baudit\b|"
                 r"\bcivil grand jury\b|\breport\b|\bdesignating\b|\bdesignation of agents\b|"
                 r"\bofficial advertising\b|\boutreach\b|\bemergency declaration\b|"
                 r"\bresolution to establish\b|\bapprove project list\b", hl):
        tp = subj(("running-the-city", "oversight"))
        return ("decision", tp[0], tp[1], "other")

    tp = subj(("running-the-city", "oversight"))
    return ("decision", tp[0], tp[1], "other")
