# Research brief — Explorer on Democracy's Library

**Date: 2026-07-15.** Synthesis of a 4-agent research sweep (collection inventory, LoCALDig deep-dive, non-financial civic records, prior art) run against the archive.org public APIs and the open web. Every collection/item claim below was verified live against the API on this date.

## Context

At DWeb demo night (2026-07-15), Brewster Kahle saw franceopendata.org, said IA's 2026 focus is government data, and said he'd be ready to finance a beautiful explorer on top of **Democracy's Library** (raw records: "town votes, rivers"). Invitation to speak in SF in October (IA annual celebration, 300 Funston — exact event/date to confirm; note: "AI @ IA" was the *2023* theme, October 2026 is "The Web We've Built"). Contacts: Chris Freeland, Chief Librarian — chrisfreeland@archive.org (email only) · Merrilee Proffitt, Director, Democracy's Library US — merrilee@archive.org · intro via Daniel Erasmus.

The pitch's front door is IA's own June 2026 blog post: collections are "available to anyone wanting to build new services on them."

## What Democracy's Library actually is (structure matters for the pipeline)

- `collection:democracys-library` direct membership is small (~24k items + 821 sub-collections). The real mass is federated via the `search_collection` metadata field over top-level collections (`governmentpublications`, `USGovernmentDocuments`, `fedlink`, `nasa`, `us_census`, `instituteofgovernmentalstudieslibrary`, `aruba`, …). Umbrella `government-documents`: **17.75M items**.
- **Target sub-collections, not the umbrella.** Curated org nodes (`gpo_*` etc.) hold 0 direct items — check `metadata` first.
- Scale references: RECAP federal courts 9.07M · FEDLINK 393k · USDA NAL 268k · SCOTUS records & briefs 125k · End-of-Term crawls 145k (WARCs — different processing path) · Canadian portal 104k · **igscalocalgovdocs (LoCALDig) 8.3k**.

### API endpoints (all verified, no auth, no rate-limit issues at 0.4s spacing)

```
# count:            advancedsearch.php?q=collection:<ID>&rows=0&output=json
# list w/ fields:   advancedsearch.php?q=collection:<ID>&fl[]=identifier&fl[]=title&rows=1000&output=json
# bulk (cursor):    services/search/v1/scrape?q=collection:<ID>&count=100
# item metadata:    archive.org/metadata/<identifier>   (files list, search_collection)
# OCR text:         archive.org/download/<id>/<id>_djvu.txt   (+ hOCR/chOCR w/ coordinates, page_numbers.json)
# page-level cite:  https://{server}/fulltext/inside.php?item_id=<id>&doc=<id>&path=<dir>&q=<string>
#                   → matches with leaf numbers → deep link archive.org/details/<id>/page/n<N>  (verified working)
```

Caveats: advancedsearch `numFound` can exceed unique identifiers (unstable sort — dedup in harvester); Solr facets broken (use rows=0 counts); handwritten volumes have garbage OCR.

## City decision

**FINAL 2026-07-15 (Daniel's call): v0 = San Francisco + US national scale, one app. Ventura = replicability proof later.**

Rationale: SF adds a second pitch target (SF city government itself) on top of IA; the app mirrors franceopendata's proven two-scale architecture (`/national` + `/city/sf`). Coherence solved by inverting the architecture: the **modern explorer is the product** — DataSF machine-readable budget/spending + Controller ACFRs 2008→today (sfcontroller.org, openbook.sfgov.org) — easier than Paris (real open data, not scans). The **archive docs are the time-machine layer**: municipal reports 1864–1905 + budget books 1954–90s as clearly-labeled historical eras, era-comparable aggregates only (totals, per-capita, inflation-adjusted), every number page-linked into Democracy's Library. History = the wow layer, not the spine.

**National scale (the "better than USAspending" play):** US federal daily-bread + budget explorer like france/daily-bread. Sources to verify in build session: Treasury Fiscal Data APIs (fiscaldata.treasury.gov — MTS, receipts, debt; free, machine-readable), USAspending API/full download (awards), OMB budget docs (structure). Open lane: USAspending is an awards database, not "what does government produce for me"; nobody does the materiality/daily-bread view with provenance + citizen design (USAFacts = design bar, no provenance/no personalization).

**Scope discipline (solo dev, October deadline):** ONE app, two scales, one demo. Grant pitches sequenced, builds not parallelized: IA (provenance/archive hat) and SF (city hat) are the same build; France side = maintenance + its own grant track; LEARNINGS.md is the connective tissue pitched to all funders.

Previously considered v0 (kept for the record — now the replicability proof): Ventura has the cleanest single-family series — 48 ACFRs 1932–2007 on IA (`igsl_acfr-ventura_<year>`) + current ACFRs on cityofventura.ca.gov/158 (~93 years, one report type, budget−actual=variance self-check). Ideal second city to prove the harvester generalizes.

**The IA-ingestion play (key pitch element):** modern ACFRs are born-digital PDFs. Prototype pulls 1932–2007 from Democracy's Library + 2008–2025 from the city site, then we propose IA/IGS ingest the missing years into LoCALDig → app reads 100% from Democracy's Library. The app becomes an *acquisition driver* for the archive (finds gaps, fills them) — the argument a preservation institution funds. Pipeline: raw layer keys docs by (source, identifier); provenance links point to archive.org identifier when it exists, city URL until then.

**GUI bootstrap:** copy the Paris website's design system/components wholesale (tokens, fiches, drawer, provenance modal, chat panel) — Brewster praised the interface; it's the asset. No shared package between repos (copy-then-diverge); each transplant gets a line in LEARNINGS.md.

SF source detail (v0 city), via the `sanfranciscopubliclibrary` collection (5,368 gov items) — NOT via LoCALDig, which is finance-thin for big cities:

- **Municipal reports FY1864–65 → 1904–05** (71 items): complete annual city finances + departmental narratives.
- **308 budget items** 1954→1990s (`mayorstransmitt1954sanf_0`, `departmentbudge1993sanf_1`, …).
- **Board of Supervisors journals 1916–1997** (218 items) — motions, votes, hearings; excellent OCR.
- **Planning-code editions 1948→2006** — diffable regulatory history.
- Modern bridge: **DataSF open data + published ACFRs** brings the arc to 2026.
- Symbolism: IA's hometown; the demo would happen at 300 Funston; a SF supervisor gets this year's IA Hero Award.

**Runner-up / replicability proof: Ventura** — the cleanest single series in LoCALDig: `igsl_acfr-ventura_<year>`, **48 city ACFRs 1932–2007** (75-year span; gaps listed in agent output). ACFRs contain budget-vs-actual variance tables → **arithmetic self-check: budget − actual = variance** validates every extracted row. Use Ventura as city #2 to prove the harvester generalizes (LoCALDig's deep runs are mostly counties: Contra Costa ACFR 53× 1954–2022, Alameda budgets 50× 1955–2010, San Joaquin 45× 1929–2004).

## Prototype scope (v0, target ~4 weeks, before October)

1. **Budget time-machine** — SF finances 1864 → 2026: modern explorer (DataSF + ACFRs) as the spine, archive eras (municipal reports 1864–1905, budget books 1954–90s) as labeled historical layers; every number deep-links to the scanned page (fulltext/inside.php → /page/nN). The Archive's superpower is time; no SaaS competitor (ClearGov/OpenGov) can ever have this.
2. **AI chat with page-cited answers** — port the Paris chat architecture (stat-card accroche, compact tables, per-resident scaling, refusal rules); citations link to archive.org page scans.
3. **"Dark archive unlocked" showcase** — vision-LLM transcription of handwritten town records (`southboroughtownclerk`, 892 items, 1732–1910 town votes/minutes — verified OCR-dark). Searchable for the first time; capability IA lacks in-house; literally Brewster's "town votes" example.
4. **Provenance modal everywhere** — the Paris pattern, pointed at IA identifiers. Every citation = a backlink into Democracy's Library (this is the argument that makes IA want to fund it).

Later (post-funding, from verified corpora): council votes index ("what did my council vote on", Asheville 1916–2021 / SF journals), ordinance diff viewer (1948 vs 1949 vs 1984 planning codes — cheap, pure text diff), zoning history of my street (2,350 general-plan/zoning items across CA cities), a river's paper trail (Shasta River USGS reports; Canadian basin surveys), election time-series (CA Statement of Vote 1940–2006), stakeholder alerts, EOT "your government's website then vs now".

## Differentiation (prior-art scan)

- **Open lane: page-level provenance for derived figures.** Nobody anchors extracted numbers to permanent archived page scans. Closest: CivicSearch (video timestamps), GovScape (PDF links, search-only).
- **Know GovScape** (govscape.net, UW, June 2026): semantic search over ~10M End-of-Term federal PDFs held by IA. Brewster likely knows it. Position: "GovScape finds documents; we explain them" — federal-only, search-not-explorer, no entities/joins/enrichment.
- **Watch Big Local News "Agenda Watch"** (Stanford+DataMade): same document ambition, genAI plans; differentiate on money data, citizen (vs journalist) audience, archive-anchored provenance.
- IA built **no explorer** on Democracy's Library (verified: blog tag scan; no product site — democracyslibrary.org is unrelated).
- Cautionary tale for the pitch: Council Data Project died of unmaintained instances — our answer is a replayable pipeline over a permanent archive + a proven live instance (Paris).
- ClearGov/OpenGov sell to the governments being explained; the free/provenance/local combination is structurally closed to them.

## Licensing

US federal docs: public domain. CA public records: generally reusable (per-state check later, not in pitch). IA terms: non-commercial building encouraged, per-item rights, attribution + stable identifiers on every link (we want that anyway). Grant-funded free explorer = squarely permitted. Direct partnership with IA solves bulk-use questions.

## Navigation plan

1. Email Chris Freeland (short, concrete, 15-min ask) — drafted, see conversation 2026-07-15.
2. Confirm October slot via Daniel Erasmus (which event, what format).
3. Build v0 → send to the same thread ("here's what an explorer on Democracy's Library looks like").
4. Loop in Merrilee Proffitt once Chris responds (working-level, Democracy's Library US director).

## Raw agent outputs

Full agent reports (collection tables, all 48 Ventura identifiers, OCR samples, endpoint tests) archived in the session transcript of 2026-07-15; working files (JSON dumps, counter script) were in the session scratchpad — regenerate via the endpoints above if needed.
