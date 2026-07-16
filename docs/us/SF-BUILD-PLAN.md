# SF pages — build plan (v2, research-grounded)

**Status: v2 PROPOSED 2026-07-16 — synthesized from five per-block data studies ([block-studies/](block-studies/)), every claim query-backed. Awaiting Daniel's go per block; one block per confer cycle.** v1 assumptions that the studies overturned are marked ~~struck~~.

## Cross-cutting rules (added by the studies — bind every block)

1. **The FY2018 break gets ONE shared méthode section** all pages link to: PeopleSoft migration → contract numbers, nonprofit flags, program detail, and vendor granularity all start/change FY2018. Every kinked series renders a note, or readers will invent policy stories.
2. **`execution_status` enum** ("closed" / "recently_closed_preliminary" / "in_progress" / "adopted_only") replaces the calendar-based `is_fiscal_year_complete` boolean in every export — the flag marks FY2026 "complete" 16 days after year-end while the accounting close runs for months.
3. **Contract money = voucher sums only.** `consumed_amt`/`remaining_amt` never enter a mart (measured: remaining sums to −$83.5B; one rec center shows $83B "consumed" on a $140M award). "Remaining" = `GREATEST(agreed − paid_vouchers, 0)` + reconciliation flag.
4. **Perimeters always labeled**: vouchers hero = "all payments through the City's financial system" (incl. $5.46B/33% related-govt-unit flows FY2025); budget totals are net-of-transfer-adjustments (−$3.9B FY2026, carried as labeled lines); classification coverage < ~60% renders a coverage badge.
5. **Negatives never in share/length visuals** (existing rule; the studies located every negative: ELU/ELS lines, 7 Overhead cells, voucher credits).
6. UI doctrine, verification-per-block, EN-only i18n, no barrels — unchanged from v1.

## Block 0 — Foundation sync (S) — unchanged

Merge `main` into `us-v0` (tree clean now); US chrome + registry-driven nav; suppress French chat/search on `/us`; promote `us-format` to `lib/us/`. Acceptance: build green, France pages pixel-unchanged, one dev server serves both countries.

## Block 1 — `/us/city/sf/budget` (L) — reshaped by [1-budget.md](block-studies/1-budget.md)

**Structural findings**: ~~6-level drill~~ → the page exposes **exactly two altitudes**: org group (7, citizen-readable, stable 1999→2027) → department (55, top-8 = 75%), plus **character** (26) as the economic tab. Programs are a dead level post-2018 (10 generic tags) → one operating/capital/admin strip only. Objects/sub-objects never render in Block 1. FY2018 is a corrupted-drill year (mixed code systems) — citywide series only.
**Exports**: `budget_breakdown_{fy}.json` per-year (org totals, org×dept 52 cells, dept×character 459+328 cells, character totals, program strip, fund block, transfer lines per dept; 60–120KB/FY; **no dept×object**) + `budget_vs_actual_departments.json` (FY2019–2025 × ~52 depts, operating perimeter, GEN/PUC `is_structural_outlier` seeded annotations).
**Page**: hero + YearPicker (3 states: closed / recently-closed-preliminary / adopted-only, Paris voted-notice pattern; FY2027 with measured year-2 coarseness note) · org-group treemap (7 nodes) + dept ranked list · character tab · revenue-by-character section ("Charges for Services" gloss mandatory — $5.38B is enterprise/hospital billing, not resident fees) · voted-vs-executed: citywide operating spine (Paris s05 layout; COVID −16.8% annotated) + dept table ($-primary sort, ≥$50M floor, GEN/PUC annotated) · offsets block (ELU + Overhead) · sources/méthode.
**Fiches (drawers, root-level)**: DeptFiche (character breakdown + offsets line + two-sided context) and CharacterFiche (dept breakdown) — the dept×character altitude (459 cells) is the Paris chapitre/poste equivalent.
**Enrichment in-block (in-session, ~100 items)**: 55 dept display names + 46 character glosses, provenance-flagged seed. ~~Local model~~ — volume too small.
**Acceptance**: FY2025 $15,917,870,152 renders; FY2024 operating residual −0.4%; caveats on FY2026/27; join-proven numbers untouched; 5 spot-checks; screenshots.

## Block 2 — `/us/city/sf/who-gets-paid` (M→L) — reshaped by [2-payees.md](block-studies/2-payees.md)

**Exports**: top_payees bumped to 100/FY + `objects_top3` + dept context; `payees_search.json` (4,068-vendor lazy index = per-FY top-1,000 union); per-FY `city` vs `related_govt_units` split; per-FY `bucket_coverage_pct`; nonprofit slice (FY2018+ floor) with healthcare/intergovernmental excluded from the community ranking; grant-funded lens (voucher×grant-contract join, $1.9–2.1B/yr).
**Bucket strategy is two-layer now**: exact-string seed + mart rule (same vendor → same bucket all years) + enrichment batch for pre-2018 top names. dbt test: no fiscal-agent vendor in the default top-10; latest-FY coverage ≥ 60%.
**Page**: Paris QuiRecoitExplorer skeleton; bucket toggle IN the section head (default excludes fiscal agents + payroll pass-throughs); "Single Payment Payees" special-cased (muted row + info chip, never a fiche); nonprofit tab first-class with grant chip; payee rows with dept context + inline expansion (no fiche routes yet); materiality strip ("what a payment buys": jail food, election interpreters, Port lumber); seed chips.
**Enrichment**: name canonicalization batch (1,675 names = 95% of $) — **the local-model pilot candidate**, pending Daniel's eval verdict; bucket expansion (~1,300 names); `person` bucket for individual landlords (rendered "individual payee", never featured — Paris personnes-physiques doctrine).
**Acceptance**: JPMorgan $1.86B only when toggled; perimeter split rendered; FY2025 total consistent; coverage badges pre-2018; screenshots.

## Block 3 — `/us/city/sf/contracts` (M→L) — reshaped by [3-contracts.md](block-studies/3-contracts.md)

**Marts**: `contracts_summary` (prime-dedupe grain — nets multi-prime amendments; excludes 75 sub-only contracts; drops consumed/remaining per cross-cutting rule 3), `contract_spend_by_fy` (voucher join, 99.1% of $, FY2018+), `contract_team` (never unioned into money).
**Exports**: `contracts_overview.json`, `contracts_active.json` (~5.1k rows), per-contract fiche JSONs (~6k: actives ∪ sole-source ∪ top-500).
**Page**: hero "5,126 contracts active today — $43.4B agreed, $23.8B paid" · landscape by type with plain-English relabels + the **grants sentence** ($18.5B of the register is grants the City gives out — cross-link who-gets-paid) · **sole-source lens** (signature: 4.1%/$4.2B, dept histogram — Police 29% of $, DPH 20% of count; authority strings rendered verbatim as the neutral "why") · LBE section (prime $3.6B + sub $3.2B) · active-contracts table (paid-progress bars capped at 100% + "exceeds agreed" marker + méthode note on modification accumulation) · **contract fiches with real spend curves** (SF gets fiches before payees — `contract_no` is a true key) incl. project-team tab · MarchesSearch port.
**Enrichment**: deterministic title prefix-cleaner ships in-block (59% of titles are dept shorthand; no scope text exists in the source — 50-char cap); ~6k title vulgarization batch (**second local-model candidate**); purchasing-authority taxonomy seed (~60→8 families).
**Acceptance**: CI grain test (prime-dedupe = $93.06B; no export sums all 48,350 rows); no consumed/remaining anywhere; spend-curve spot-check vs pmt_amt; screenshots.

## Block 4 — `/us/city/sf/payroll` (M) — reshaped by [4-payroll.md](block-studies/4-payroll.md)

**Privacy dial (recommended: B)**: dept × job-family × year with n≥5 threshold + per-dept pooling = **1.2% of $ pooled, zero silent suppression** (vs 1,039 identifiable n=1 cells at job grain). Suppression applied at export — row-level never leaves BQ. Law Library edge case (n=2 dept) folds into org-group "Other". **Gated on Daniel's explicit OK.**
**Exports (5)**: by_year, by_dept_year (**keyed on `department_code`** — labels break FY2017, bug reproduced live), by_family_year (n≥5+pooling), distribution (p25–p99 + histogram; p10 dropped — part-timer pollution), overtime (dept series 2017+, OT>salary counter with documented $1k floor).
**Page**: hero (median $160k as the *typical* employee scene) · org→dept ranking ($ ↔ headcount toggle) · **overtime lens** (signature: Police OT ×3 since 2017 vs headcount down; Sheriff 21.4%; counter 38→373; staffing-shortfall framing) · **DistributionStrip** (one new primitive — histogram + percentile band, LEARNINGS row) with part-time bump annotated · salary/OT/benefits split (StackedBarTheme) · méthode (suppression rule stated plainly, Fiscal-only, label break).
**Enrichment**: ~~1,396-title classification~~ dead — native 60-family taxonomy is 100% populated. Remaining: 60→~15 display-family seed (by hand) + 104 junk-title batch (in-session). Union lens parked.
**Acceptance**: FY2025 $6.919B/40,786; no cell < 5 in any export; >$400k count (1,252) renders with public-safety/physician framing; screenshots.

## Block 5 — `/us/city/sf` landing hub (S–M) — reshaped by [5-landing.md](block-studies/5-landing.md)

**Structure**: Option A (Paris mirror) + freshness sub-line ("FY2026 closed June 30 — 496,685 payments, $16.8B, already public"). HeroDeck: Laguna Honda ($402M/yr, **fund-based export** — program labels die at FY2018) · Siemens Muni trains ($1.01B/$138M FY2025) · Meals on Wheels (21 straight years, $152M — chosen over homelessness nonprofits per gotcha audit) · payroll card. KPIs: FY2027 adopted (caveated) · **$53/day per resident** · payroll $6.9B/40,786 · updated-weekly. Ticker: 10 verified lines, linking to filtered section views only (no fake fiches). Gotcha exclusions binding: no bank payees, no per-officer OT, no per-resident-vs-population juxtaposition on the hub.
**Gated on**: ≥2 section pages live; Daniel's scene sign-off.

## Enrichment strategy (consolidated across studies)

| Batch | Size | Path |
|---|---|---|
| Dept names + character glosses (Block 1) | ~100 | in-session |
| Payroll family map + junk titles (Block 4) | ~164 | in-session |
| Purchasing-authority taxonomy (Block 3) | ~60 | in-session, human-reviewed seed |
| Payee bucket expansion (Block 2) | ~1,300 | in-session or local |
| **Payee name canonicalization** (Block 2) | **1,675** | **local-model pilot #1** (pending eval) |
| **Contract title vulgarization** (Block 3) | **~6,000** | **local-model pilot #2** (pending eval; Task-2-shaped) |
| Object-label rewrites (Block 2 drill) | ~457 | frontier or local per eval Task 2 |
| Grounded payee descriptions (fiches, later) | top-N | frontier + web search only |

## Decisions needed from Daniel

1. **Go on Block 0 + Block 1?**
2. **Payroll dial B** (n≥5 dept×family, 1.2% pooled) — OK?
3. Page name: "who-gets-paid" (default) or other?
4. Landing scenes: Laguna Honda + Siemens + Meals on Wheels + payroll card — sign off or swap?
5. Standing: push `main` to origin (France URL migration deploy)? BEA 1959+ national block — queue after which SF block?
