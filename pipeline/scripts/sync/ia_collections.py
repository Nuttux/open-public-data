#!/usr/bin/env python3
"""Which Internet Archive collections are evidence about San Francisco.

The full-text endpoint matches strings, not subjects, so a query for a civic
alias reaches whatever else lives in the index. Auditing the 2026-07-27 corpus
turned up 57 distinct collections behind 3,255 matches: San Francisco municipal
paper, other California jurisdictions' budgets, and — via aliases like
"Fisherman's Wharf", "Marina Green" and "Washington Square" — fisheries science,
oceanography, Swiss meteorology yearbooks and a New York University zoology
journal.

This registry is an ALLOW-list on purpose. A collection nobody has reviewed is
excluded until someone reviews it, so the failure mode of an upstream index
change is a missing document rather than a marine-biology paper appearing as
evidence on a public fiche.

Tiers:
  DIRECT — the collection is San Francisco municipal material by construction.
           Membership alone is evidence of relevance.
  GATED  — the collection is real government material but multi-jurisdiction, so
           an item must additionally prove San Francisco context in its own text
           (see ia_relevance() in link_sf_places.py). This is where the Reedley,
           Redding and Eureka general plans came from.
Everything else is denied, with the reason recorded so the judgement can be
re-argued rather than rediscovered.
"""

from __future__ import annotations

# ── DIRECT: San Francisco by construction ────────────────────────────────────
DIRECT = {
    "sanfranciscopubliclibrary":
        "SFPL partnership scans — Municipal Reports, Supervisors' Journals, "
        "commission minutes, budget volumes. The motherlode.",
    "igsl_san-francisco-real-prop-report":
        "Valuation of real property owned by the City and County of San Francisco.",
    "igsl_sf-bos-annual-salary-ord":
        "SF Board of Supervisors annual salary ordinance.",
    "igsl_annual-report-sf-public-utilities":
        "SFPUC annual reports.",
    "igsl_annual-report-sf-hetch-hetchy-wpd":
        "Hetch Hetchy Water & Power annual reports.",
    "sanfranciscoredevelopmentagencyrecords":
        "SF Redevelopment Agency records — Western Addition appraisals, "
        "comparable sales, property summaries. Admissible, but do not expect it "
        "to feed the place fiches: it is organised by redevelopment PROJECT AREA "
        "(Western Addition, Hunters Point, Yerba Buena), while the place seed is "
        "named facilities. Scanning all 63 places against it (2026-07-27) "
        "returned 12 hits, all of them boilerplate — 'Golden Gate Park contains "
        "1,917.40 acres' inside a Western Addition appraisal, 'OWNER'S ADDRESS: "
        "City Hall' on a parcel form. The collection is valuable; its subject is "
        "a neighborhood, and no such entity exists yet.",
}

# ── GATED: real government material, wrong-jurisdiction risk ─────────────────
GATED = {
    "igscalocalgovdocs":
        "IGS California local government documents — statewide. Contains genuine "
        "SF planning material alongside every other California city's general plan.",
    "instituteofgovernmentalstudies":
        "IGS general holdings — mixed jurisdiction.",
    "government-civil-society-reports":
        "Mixed-jurisdiction government and NGO reports.",
}

# ── DENIED, with the reason ──────────────────────────────────────────────────
# Other California jurisdictions: real government records, wrong city. Keeping
# them would put Solano County's budget on a San Francisco fiche.
_OTHER_JURISDICTION = (
    "igsl_budget-solano-cty", "igsl_budget-slo-cty", "igsl_budget-alameda-cty",
    "igsl_budget-cty-san-joaquin", "igsl_acfr-ventura", "igsl_acfr-san-diego-cty",
    "igsl_annual-report-santa-maria-pw", "igsl_annual-report-stockton",
    "igsl_la-your-government", "igsl_annual-report-la-personnel-dept",
    "igsl_sacramento-housing-redev-programs",
    "igsl_santa-clara-cty-ema-planning-directory",
    "igsl_newsletter-san-bernardino-cty-econ-dev-dept",
    "igsl_brentwood-pacific-palisades-plan",
)
# Regional agencies. Defensible to revisit — they do govern SF in part — but they
# are not the City and County, and a place fiche claiming AC Transit as evidence
# would be wrong about who spends the money.
_REGIONAL = (
    "igsl_ac-transit-times", "igsl_abag-bay-view",
    "igsl_minutes-board-of-directors-regular-meeting-baaqmd",
)
# Not government at all. These are what civic aliases collide with: "Fisherman's
# Wharf" reaches every fisheries journal ever scanned, "Washington Square" reaches
# NYU's zoology department, "Marina Green"/"Ocean Beach" reach oceanography.
_NOT_GOVERNMENT = (
    "noaa-hawaii", "noaatemp", "pub_zoologica-nyzs", "pub_pacific-fisherman",
    "pub_pan-american-fisherman", "pub_fishery-leaflet", "pub_administrative-report-lj",
    "pub_pelagic-fisheries-research-program", "pub_fao-fisheries-and-aquaculture-report",
    "pub_fao-fisheries-and-aquaculture-circular", "pub_noaa-technical-report-nmfs",
    "pub_california-fish-bulletin", "pub_annales-office-federale-meteorologie-climatologie",
    "pub_bolletino-informazioni-meteorologiche", "pub_meteorologisch-jaarboek",
    "pub_bulletin-observatoire-lyon", "pub_south-pacific-bulletin",
    "pub_proceedings-pacific-science-association", "pub_journal-of-marine-research",
    "pub_memoirs-faculty-fisheries-kagoshima-university", "pub_food-agriculture-organization-un",
    "pub_marine-and-freshwater-research", "pub_indian-fisheries-bulletin",
    "pub_oceanographical-magazine", "pub_bulletin-tokai-regional-fisheries-research-laboratory",
    "pub_fao-fisheries-and-aquaculture-technical-paper", "pub_report-voyage-hms-challenger",
    "pub_division-biological-research-collected-reprints",
    "pub_gulf-caribbean-fisheries-institute-proceedings",
    "pub_fao-technical-guidelines-for-responsible-fisheries",
)
# San Francisco, but journalism rather than a municipal record. Excluded from
# *evidence* shelves to keep the fiches sourced on the city's own paper; revisit
# deliberately if editorial ever wants press coverage as a distinct section.
_PRESS = ("eastwestnews",)

DENIED: dict[str, str] = {
    **{c: "other California jurisdiction" for c in _OTHER_JURISDICTION},
    **{c: "regional agency, not the City and County" for c in _REGIONAL},
    **{c: "not government material (science/trade periodical)" for c in _NOT_GOVERNMENT},
    **{c: "San Francisco press, not a municipal record" for c in _PRESS},
}


def tier(collection: str | None) -> str:
    """DIRECT | GATED | DENIED — unreviewed collections default to DENIED."""
    if collection in DIRECT:
        return "DIRECT"
    if collection in GATED:
        return "GATED"
    return "DENIED"


def is_admissible(collection: str | None) -> bool:
    return tier(collection) != "DENIED"
