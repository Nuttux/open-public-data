# SF pages — UX study & overhaul spec

**Status: adopted 2026-07-17 (Daniel's call: "less walls of text — an explorer with killer photos and infos, like Paris").** Compares the shipped SF pages (Blocks 1–4) to the Paris experience and binds the overhaul. Companion to [SF-BUILD-PLAN.md](SF-BUILD-PLAN.md); the block studies' *data* rules all still bind — this spec changes presentation, never numbers.

## The six Paris ingredients (measured on /fr/city/paris/budget, /marches, /subventions)

1. **One humanized editorial sentence after the hero** — big italic type in a bordered box, ONE idea ("En 2026, Paris dépense 5 546 € par habitant. Sur ces 100 €, 67 couvrent le quotidien…"). Never a paragraph.
2. **Photos of real things with © chips** — landing deck cards, and the marchés *scène signature*: three real contracts of the year, photo + superlative kicker + money number (`MarchesSignature.tsx`, shipped 2026-07-16).
3. **Visual-first section rhythm** — kicker → display heading with one italic/red word → ≤2 lines of prose → ONE visual/interactive → one-line takeaway. Caveats live in ⓘ tooltips, drawers, or /methode — not inline boxes.
4. **Everything drills** — ranked bars/rows open drawers; pages stay shallow, depth is behind clicks.
5. **Unavailable ≠ paragraph** — compact notice + buttons to what IS available (Paris "L'exécution 2026 sera publiée en juin 2027" + three year buttons).
6. **Editorial + explore layer at the bottom** — article cards with covers ("À lire") and 4 cross-link cards with mini data-visual thumbnails, then a compact source/export chip strip (CSV · JSON · API · méthode).

## Anti-patterns found on the SF pages (all four)

- Section intros of 3–5 sentences; glosses as full callout boxes (Charges-for-Services paragraph, bulleted FY2018 note inline, payroll's privacy/p10/$1k-floor boxes).
- Sources & method as a visible text wall at page bottom.
- Zero photos; no editorial sentence; no explore footer; no evolution line on budget (FY2010+ series shipped but unrendered).
- Tables where Paris uses clickable bars + drawers.

## Binding rules for the overhaul

- **Numbers, marts, exports unchanged.** Presentation only (Workstream A) or additive seed/assets (Workstream B). Every displayed figure keeps its export + source_url.
- **Caveat compression law**: every méthode-mandated caveat keeps ≤1 rendered line inline (ⓘ tooltip or `Fy2018Note variant="inline"` where it's the FY2018 break); the full text moves to the page's méthode block, which collapses to the Paris chip-strip pattern (source chips + "Read the method" link/disclosure). No caveat is DELETED — moved and compressed.
- **Photos**: only verifiably licensed images (Wikimedia Commons with author+license recorded, US-government/City-published public-domain). Attribution chip rendered on every photo (Paris © pattern). Seed carries source_url + license + author per image (zero-hardcode applies to provenance too). No photo found → no photo (or the Paris "Photo d'illustration" pattern with a REAL illustrative photo) — never a fabricated or AI-generated image.
- EN-only via us.* keys mirrored into fr.ts; neutral service framing; no dead links; France pages pixel-untouched.

## Per-page checklists

### /us/city/sf/budget
- [ ] Editorial sentence box after hero: the $53/day-per-resident line (per_resident_usd, FY2025 closed) — "San Francisco's budget works out to $53 per resident per day. Most of it runs a hospital system, a transit network, and an airport."
- [ ] Compress: Charges-for-Services gloss → one italic line + ⓘ (full gloss to méthode); FY2018 callout → inline variant near the picker (block form only in méthode); offsets block intro → one line.
- [ ] Add the missing **evolution line chart** (budget_by_year FY2010→2027, adopted; execution statuses annotated; COVID/FY2021 note) — Paris s04 analogue.
- [ ] Ranked dept/org rows: make the drill affordance explicit (Paris "select a line" hint; rows already open drawers).
- [ ] Explore footer (4 mini-visual cards → who-gets-paid, contracts, payroll, national) + chip strip (JSON exports · méthode).
- [ ] (Workstream B) Signature scene: three things this budget runs/builds, photo cards (e.g. Laguna Honda, a Muni line, the airport).

### /us/city/sf/who-gets-paid
- [ ] Promote the **materiality strip toward the top** (it is the killer-info pattern: jail food $1.7M, election interpreters $961,951…) — hero → editorial sentence → materiality → ranking.
- [ ] Editorial sentence: "One of every three dollars the City pays out flows through related government units — pensions, health plans, the school district." (perimeter split, FY2025).
- [ ] Compress: perimeter explainer to one line + ⓘ; Sources & method wall → chip strip + méthode disclosure; SPP note stays one muted row line.
- [ ] Explore footer + chip strip.
- [ ] (B) Signature scene: three real purchases with photos (Muni railcars Siemens, jail meals, election interpreters).

### /us/city/sf/contracts
- [ ] Keep the grants-sentence callout (already Paris-grade); cut section intros to ≤2 lines; authority-family section: bars stay, intro to one line.
- [ ] Compress: modification-accumulation méthode note → ⓘ on the progress-bar column header; LBE two-perimeter warning → one line + ⓘ.
- [ ] Explore footer + chip strip.
- [ ] (B) Signature scene — the template transplant of Paris MarchesSignature: three real contracts of the year (biggest documented build / a sole-source with its authority verbatim / most competitive), photos + © chips.

### /us/city/sf/payroll
- [ ] Editorial sentence: the median scene one-liner ("The typical city employee — a nurse, a transit operator — made $160,118 with benefits in FY2025.").
- [ ] Compress: privacy note → one line under hero ("No group smaller than 5 people is ever shown — method") linking méthode; p10/part-time note → annotation ON the histogram; $1k-floor note → ⓘ on the counter; >$400k block prose → 2 lines + the title chips.
- [ ] Explore footer + chip strip.
- [ ] (B) Signature card: the median-employee scene (photo card, e.g. Muni operator/nurse — generic role photos with real licensing, never a real identified employee).

## Workstreams

- **A — compression + editorial + explore + evolution line** (all four pages, one agent for voice consistency; no data changes; screenshots desktop+mobile per page before/after).
- **B — photo seed + scene primitives** (parallel-safe: new files only — `pipeline/seeds/countries/us/seed_us_sf_photos.csv` (entity_key, image path, caption, author, license, source_url, provenance), assets under `website/public/photos/us/sf/`, `components/us/SfSignature.tsx` on the MarchesSignature pattern; NO page edits).
- **Integration** (after A merges): mount `SfSignature` scenes on the four pages per the checklists; orchestrator reviews screenshots page by page.

Acceptance for the overhaul: every section ≤2 lines of prose before its visual; méthode renders as chip strip + disclosure; four explore footers; France pixel-untouched; build green; all block acceptance numbers still render exactly.
