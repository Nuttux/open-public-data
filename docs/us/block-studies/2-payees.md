# Design brief — Block 2: `/us/city/sf/who-receives` ("Who gets paid")

Research-only study, 2026-07-16, all numbers from live BigQuery queries against `open-data-france-484717.dbt_us_analytics.core_us_sf_vouchers` (8.07M rows), `core_us_sf_contracts`, `dbt_us_marts.mart_us_sf_top_payees`, `dbt_us_seeds.seed_us_sf_payee_buckets`. No files modified.

## 1. Measurements

### 1.1 Payee landscape — FY2018 is a structural cliff, and it changes everything

Per-FY (`GROUP BY fiscal_year` over core vouchers):

| FY | vendors | $ total | top-10 share | top-10 ex-bucket | seed classifies | unclassified |
|---|---|---|---|---|---|---|
| 2007 | 13,829 | $2.88B | 33.5% | 23.3% | 27.8% | 72.2% |
| 2015 | 12,861 | $4.98B | 38.2% | 29.9% | 31.9% | 68.1% |
| 2017 | 12,633 | $6.04B | 33.6% | 25.2% | 30.2% | 69.8% |
| **2018** | **7,453** | **$9.18B** | **48.2%** | 42.3% | 46.2% | 53.8% |
| 2020 | 7,165 | $12.28B | 43.4% | 34.8% | 45.5% | 54.5% |
| 2022 | 6,465 | $13.11B | 46.2% | 36.9% | 52.0% | 48.0% |
| 2025 | 6,654 | $16.75B | 42.4% | 32.2% | **65.6%** | 34.4% |
| 2026 | 6,526 | $16.80B | 44.1% | 35.3% | 64.0% | 36.0% |

- **The 42-row seed does NOT hold across years.** Built on FY2025 (65.6% of $ classified), it drops to 45.5% in FY2020, and ~26–32% pre-2018. It classifies by exact raw string, and both spellings/aggregations and top-vendor composition shift over time.
- The **fiscal-agent bucket alone is ~30% of FY2024–2026 $** ($5.1B of $16.75B in FY2025) but only ~16% pre-2018. The toggle is not cosmetic — it swings the top-10 share by 10 points every year.
- **FY2018 = PeopleSoft migration**: vendor count halves because the Controller began collapsing one-off payees into a literal vendor `"Single Payment Payees"` — $130M (FY2018) growing to **$535M (FY2026)**, 46–61k rows/yr. It ranks #9 in FY2025 ($372M). It is *not an entity* and must never render as a payee bar without its label.
- FY2027 exists (in progress, $1.2B, `is_fiscal_year_complete=false`); FY2024–2026 flagged complete.
- **Perimeter trap found**: FY2025's $16.75B includes **$5.46B (33%) of `is_related_govt_unit=true` rows** — Retirement System pension flows ($1.43B), Health Service System premiums ($1.21B), GEN debt service ($1.74B), Community College District ($0.48B). The Block-2 acceptance criterion ("consistent with $16.75B") implicitly includes them. Fine, but the page must decide and label: "all payments through the City's financial system" is the honest hero framing, not "city spending."

### 1.2 Name quality — the enrichment batch is small and tractable

- All-time: **71,710 raw vendor names**. Normalization (upper, strip punctuation, drop INC/LLC/CORP/CO/LTD/LP/LLP/NA/THE tokens, collapse spaces) → 69,865 keys: **1,794 colliding clusters, 3,639 raw names, $10.13B of $169.45B (6.0%) affected**.
- **Batch size: 1,675 raw names cover 95% of all-time positive $** (304 names = 80%, 834 = 90%, 4,810 = 99%). Within the top-1,675 batch, cheap normalization alone dedupes only 20 pairs ($2.53B) — e.g. it merges `U S BANK`/`U.S. BANK` and case variants, but **cannot** merge `THE BANK OF NEW YORK MELLON` vs `...MELLON TRUST CO NA` ($1.35B combined) or `REGENTS OF THE UNIVERSITY OF CALIFORNIA` ×3 spellings ($3.7B). LLM pass required.
- Top messy clusters (verbatim): `REGENTS OF THE UNIVERSITY OF CALIFORNIA || Regents of the University of California || THE REGENTS OF UNIVERSITY OF CALIFORNIA` ($3.7B); `U S BANK || U.S. BANK` ($1.66B); `New Flyer of America Inc` ×case ($875M); `S J AMOROSO CONSTRUCTION CO LLC || ...CO INC` ($477M); `EN POINTE TECHNOLOGIES SALES INC || ...LLC` ($227M); `SELF-HELP FOR THE ELDERLY || SELF HELP FOR THE ELDERLY` ($179M); `JMB CONSTRUCTION INC || JMB CONSTRUCTION` ($171M); `BANK OF AMERICA NA || BANK OF AMERICA` ($154M); `Stryker Sales LLC || STRYKER SALES CORPORATION` ($61M); `ORYX DEVELOPMENT I LLC || ORYX DEVELOPMENT I, LLC` ($62M); plus mixed-case duplicates from the FY2018 system switch (a systematic pattern: legacy ALL-CAPS vs PeopleSoft Title Case).

### 1.3 Nonprofit flag — rich, but FY2018+ only

- **`non_profit_indicator` is empty before FY2018** (0 rows 2007–2017). FY2018+: ~1,100–1,250 distinct nonprofit vendors/yr, 17–21% of $, **$3.27B in FY2025**, rising every year ($1.54B FY2018 → $3.41B FY2026).
- Name-based backfill potential: vendors flagged in FY2018+ account for only $6.4B of the $46.6B pre-2018 (13.8%) — backfill helps but pre-2018 nonprofit view stays honest-incomplete. Recommend: nonprofit tab starts at FY2018 with a visible floor note.
- Top 15 nonprofits all-time (flagged rows): Kaiser Foundation Health Plan $4.35B (employee premiums — belongs in the `healthcare` bucket, not the "community nonprofits" story), UC Regents $2.23B, City College $2.13B, **Children's Council of SF $1.02B**, Delta Dental $572M, **HealthRight 360 $489M**, **Tenderloin Housing Clinic $448M**, **Episcopal Community Services $436M**, SF Tourism Improvement District $306M, **Wu Yee Children's Services $293M**, **Five Keys Schools $273M**, Homebridge $262M, Richmond Area Multi-Services $234M, Catholic Charities $222M, YMCA of SF $202M (21 departments!).
- Dept diversity FY2025: DPH $727M/201 nonprofits, Homelessness $495M/86, HSA $222M/149, Mayor $219M/194, Children/Youth/Families $124M/179. **Verdict: a nonprofit tab is genuinely data-rich** — but only after excluding health-plan/university flows via the bucket seed, or the tab's top-3 is Kaiser/UC/City College and the community-services story drowns.

### 1.4 Payee context — detail views have real material

Top-50 all-time payees: **avg 11.4 departments, 18.3 programs, 16.7 years each**; 34/50 span ≥3 departments, 41/50 span ≥3 programs (max: 63 depts, 258 programs). A payee row expanding to "top departments + program mix + year sparkline" has substance for essentially every payee users will click.

### 1.5 Join test — contract drill works, FY2018+ only

$-share of vouchers whose `contract_number` exists in `core_us_sf_contracts.contract_no`:
- FY2007–2017: **0%** (field entirely empty pre-PeopleSoft).
- FY2018: 32.2% → FY2021–2026: **43–48% of all voucher $** carries a contract number, and **98.2–99.9% of carried $ matches** the contracts table. "Payment under contract X — awarded $Y, spent $Z" drill is viable for roughly half the money, FY2018+ only.

### 1.6 Grants vs purchases — a credible "subventions-spirit" slice exists

- `contract_type LIKE 'Grant Contract%'` = **14,489 of 31,935 contracts (45%)** — the largest contract type.
- Voucher $ through grant contracts: $0.51B FY2018 → **$2.10B FY2024, $1.86B FY2025, $1.90B FY2026** (11–14% of totals). `purchasing_authority_title LIKE '%GRANT%'` adds almost nothing ($1.88B either-way FY2025) — the contract join is the workhorse.
- ~75–80% of grant $ goes to flagged nonprofits ($1.48B of $1.86B FY2025). Nonprofit total ($3.27B) > grant total — nonprofits also sell services under professional-services contracts. **SF can get close to Paris "subventions"**: a "grant-funded" lens (FY2018+) distinct from the broader nonprofit lens, with an explicit definition note ("payments under contracts SF classifies as 'City as Grantor'").

### 1.7 Materiality — sampled voucher lines (verbatim object/sub_object)

Aramark Correctional Services → Sheriff, "Food" ($278k); INTERETHNICA → Elections, "Translation"/"Interpreters" ($81k/$656k); D L D LUMBER → Port, "Lumber" ($199k); A D BRAKES → City Administrator, "Vehicle Parts-Supplies" ($2.8M); DEPARTMENT OF SOCIAL SERVICES → HSA, "IHSS Ip Payments" ($148M — home-care worker wages); CHICAGO TITLE → Fire, "Land-Direct Purchase" ($5.9M); MES Service Co → Fire, "Uniforms" ($2.1M); SFO HOTEL SHUTTLE → Airport, "Transportation Services" ($2.0M); Siemens light-rail vehicles; VISION SERVICE PLAN → "Med Multi Plans-Vision Care". The object/sub_object dimension is vivid enough to power a "what a payment actually buys" strip and per-payee "what they're paid for" labels.

## 2. Architecture implications (export shapes)

1. **`top_payees.json` stays** (mart has top-100/FY; export currently emits 40 — bump to 100, it's cheap) but add per-payee `n_departments`, `top_department` (already in mart) and an `objects_top3` label array (new mart column) for row context.
2. **New `payees_search.json`** (Paris `beneficiaires_search.json` pattern, lazy-loaded): one row per vendor with `byYear`, `bucket`, `is_non_profit`, `top_department`, `n_depts`. Sizing measured: union of per-FY top-1,000 = **4,068 vendors** (top-1,000 ≈ 95–97% of every FY's $); all FY2018+ vendors = 15,110; all-time = 71,710. Ship the 4,068-vendor index (~encodes to a few hundred KB) — same lazy-fetch-on-first-query mechanic as Paris.
3. **New `payee_detail` aggregation** (per top-N payee: dept split, program split, object top-5, FY series, contract list via the join) — export only when fiches ship; the mart can be built now since §1.4 proves material.
4. **Bucket strategy for non-seed years — the seed must become two-layer**: (a) keep the exact-string seed for the known 42; (b) add a **rule layer in the mart** (already-classified vendor → same bucket in all years, catching FY2018–2024 where the same string appears; measured: this alone is why FY2021–2024 reach 45–63%); (c) an **enrichment batch for pre-2018 top names** (the FY2007–2017 top-100s contain legacy spellings the seed misses — coverage ~28%). Do not silently apply the fiscal-agent toggle pre-2018 as if coverage were equal: **export per-FY `bucket_coverage_pct` and render it** ("in 2012, 26% of payments classified") — the Paris "données brutes" honesty pattern.
5. **Perimeter block in the export**: per-FY totals split `city` vs `related_govt_units` ($5.46B FY2025) so the hero can say "$16.7B paid through the City's system, incl. $5.5B via related entities (pensions, health system, college district)". Never nett silently (existing doctrine).
6. Nonprofit slice: per-FY nonprofit totals + top-N nonprofits **with bucket join applied** (exclude `healthcare`/`other` buckets from the community ranking, show them in a labeled "also flagged nonprofit" note). Floor: FY2018.

## 3. AI-enrichment opportunities

1. **Name canonicalization — highest ROI, small, local-model-suitable.** 1,675 names = 95% of all-time $ (4,810 for 99%). Task shape: cluster proposal via normalization + trigram similarity, LLM confirms merge + emits canonical display name. Only ~1,800 collision clusters all-time; within the priority batch just 20 trivially-mergeable pairs plus the hard ones (BNY, UC Regents) that specifically need entity knowledge. In-session batch (existing doctrine) is realistic: this is a **one-afternoon batch**, not a pipeline.
2. **Bucket expansion**: classify the per-FY top-100 union (mart already ranks it; 21 FYs × 100 = ~1,300 distinct names after dedupe) into the existing 6 buckets. Same JSONL/provenance pattern as the 42-row seed. This fixes the pre-2018 coverage hole measured in §1.1.
3. **Grounded payee descriptions (fiches)** — needs web search to say who "HOMEBRIDGE INC" is; **flag: separate block, not local-model, needs the grounded-LLM pattern** (`enrich_beneficiaire_grounded_llm.py` precedent exists). Not required for Block 2.
4. Not recommended: LLM-classifying the 70k long tail — 99% of $ needs only 4,810 names; the tail is $1.7B spread over 67k names, and it contains most of the person-like names (privacy: see Risks).

## 4. UI recommendations (Paris `QuiRecoitExplorer` transposed)

- **Keep the Paris skeleton**: Top-10 ranked bars (SectionHead 03) → search section (04) with lazy index, seed chips, min/max $ filters, result cards. It transposes cleanly; color dimension = **bucket** instead of theme (6 buckets → stable palette), second filter = department instead of theme.
- **Bucket toggle**: default OFF = "service providers view" (excludes `fiscal_agent_debt_service`; FY2025 top-10 becomes Kaiser $523M, Blue Shield $493M, MWH/Webcor JV $467M, Single Payment Payees, City College…). Toggle ON re-inserts JPMorgan $1.86B/DTC $1.07B/BNY ×2 $1.35B/US Bank $637M with bucket chips rendered on-row. Put the toggle *in the section head* with the exact caveat sentence, not buried in filters — the acceptance criterion (JPMorgan only when toggled) implies it must be visually obvious which mode you're in. Also exclude `payroll_passthrough` (Voya, IHSS Authority) from the default view — same logic, employee money passing through.
- **`Single Payment Payees` special-case**: render as a hatched/muted row with an info chip ("~58,700 one-off payments the Controller publishes as a single line"), never a link to a fiche.
- **Nonprofit tab as first-class** (Paris qui-recoit spirit): tab shows FY2018+ only with floor note; ranking excludes healthcare-premium and intergovernmental buckets by default; KPI row: $3.27B FY2025, ~1,243 organizations, share of city total 19.5%, top dept DPH. This tab is where the "grant-funded" chip lives (§1.6): filter "grant contracts only" ($1.86B FY2025).
- **Payee rows**: name + amount bar + bucket/nonprofit chip + `top_department` + "N departments" — §1.4 proves the dept context is non-trivial for the whole top-50. No fiche links yet (names unkeyed) — but rows can expand inline to top-3 departments without a route.
- **Seed chips for search** (Paris SEEDS pattern): "Tenderloin Housing Clinic", "Five Keys", "Catholic Charities", "PG&E", "Siemens", "Kaiser" — span homelessness/education/utilities/health, verified present.
- Year selector FY2007→2026 (FY2027 partial, label it); show `bucket_coverage_pct` when < ~50% (pre-2018).

## 5. Killer features ranked by data-readiness

1. **Bucket-toggle top payees + concentration stat** — mart + seed exist today; only the coverage-per-FY export is new. (Ready now.)
2. **Nonprofit money tab** — flag + bucket join, FY2018+; genuinely differentiated vs Paris (Paris has no per-payee flags this clean). (Ready now.)
3. **Search-the-long-tail explorer** — needs `payees_search.json` (4,068 vendors) — pure export work, Paris component transposes. (Days.)
4. **Grant-funded lens** ($1.9–2.1B/yr via contract join, 98%+ match) — one mart column. (Ready with small model change.)
5. **"What a payment buys" materiality strip** (jail food, election interpreters, Port lumber, IHSS wages) — object/sub_object sampling, curated in-session. (Cheap, high wow.)
6. **Payee fiches with contract drill** — blocked on name canonicalization (§3.1) — correctly deferred to a later block.

## 6. Risks

- **Natural persons appear as payees — real and material.** Individual landlords receive rent directly: `BARAK D JOLISH` $10.7M, `WILLIAM J PIEDEMONTE` $7.6M, `LAN FONG HUEY` $4.4M, `RUTH MELLINGER` $2.6M, `CELESTINA JIMENEZ` $1.5M, `Lolita Lodhia` $1.4M (all "Rent/Lease-Building/Structure", i.e. SRO/shelter master-leases or leased premises). Heuristic scan: ~31k person-like names (overcount — includes sole-proprietor businesses), $2.68B all-time, but **only ~60 land in the top-1,675 enrichment batch and ~13 in any top-500**. This is published open data (DataSF), so no legal exposure, but Paris doctrine (personnes-physiques aggregate + méthode link) should transpose: consider a `person` bucket in the enrichment pass that renders rows as "individual landlord/payee" without a fiche, and never seed-chip or feature them. `LASTNAME, FIRSTNAME` format is negligible (52 names, $0.6M).
- **Perimeter honesty**: the $16.75B includes $5.46B related-govt-unit flows incl. pension benefit payments — without the label the page overstates "city spending on suppliers" by a third.
- **Seed fragility**: exact-string matching + weekly refresh = a renamed top vendor silently falls out of its bucket. Add a dbt test: top-10 ex-bucket must contain no `fiscal_agent` seed vendor, and bucket coverage FY-latest ≥ 60%.
- **FY2018 cliff**: any all-years series (vendor counts, nonprofit $, grant $, contract match) kinks at FY2018 for system-migration reasons, not policy — needs the same méthode treatment as the Paris comparable-perimeter note, or readers will read a story into it.
- **Negative/credit lines** exist (refunds); per-payee sums can dip negative in a year — Paris rule applies (negatives never inside share/length visualizations).
