# Block 1 design brief — `/us/city/sf/budget`

Research-only study, 2026-07-16. All numbers below measured live on BigQuery `open-data-france-484717` (`dbt_us_analytics.core_us_sf_budget` / `core_us_sf_actuals` / `core_us_sf_vouchers`, `dbt_us_marts.*`). Sanity anchors verified: FY2025 Spending = **$15,917,870,152** vs Revenue $15,917,870,147 ($5 apart — the acceptance criterion holds); FY2026 both sides exactly **$15,990,860,523**.

## 1. Hierarchy reality check

**Org groups (7) — FY2026 Spending, net:** Public Works, Transportation & Commerce **$5.765B / 36.1%** (8 depts) · Community Health **$3.320B / 20.8%** (1 dept: DPH) · Human Welfare & Neighborhood Dev **$2.703B / 16.9%** (11) · Public Protection **$2.141B / 13.4%** (11) · General Admin & Finance **$0.790B / 4.9%** (15) · General City Responsibilities **$0.719B / 4.5%** (1: GEN) · Culture & Recreation **$0.552B / 3.5%** (8). All 7 labels citizen-readable as-is. Org-group codes 01–07 and labels are **identical FY1999→FY2027 in actuals** (verified min/max FY per code) — the only dimension that survives the whole history untouched.

**Departments: 55** in FY2026. Top-heavy: DPH 20.8%, PUC 11.8%, AIR 10.8%, MTA 9.7%, HSA 7.8% — top 8 ≈ 75%; **33 of 55 depts are below 0.5% share**. Labels embed the code prefix and vowel-dropped abbreviations: "ECN Economic & Wrkfrce Dvlpmnt", "CHF Children;Youth & Families" (semicolon typo in source), "SDA Shrf Dept Ofc Inspctr Genl", "CII Commty Invest & Infrstrctr", and one code mismatch ("TIS" code / "DT GSA - Technology" label). Judged over the full 55: all decipherable, ~15 need plain-English rewrite, all need prefix-stripping.

**Programs are a dead level in the modern era — the single biggest structural finding.** Per-FY cardinality: FY2010–2017 has **291–324 department-specific programs** (real content: "In Home Supportive Services", "Investigations", "Citywide Planning"); from **FY2019 the program dimension collapses to 10 generic activity tags** — Operating $13.54B, Capital $1.12B, Administrative $0.87B, Capital-CPC $0.24B, Maintenance, Special Events, Technology, Disaster Recovery… (median 3/dept, max 9). Program is **not navigable content post-2018**; it's an operating/capital/admin split at best (good for one KPI strip, nothing more).

**Economic dimensions (FY2026 Spending):** character **26**, object **276**, sub_object **595**. Readability judgments from samples (top-20 by $ + random-20 per level): characters ≈ half readable ("Salaries", "Materials & Supplies", "Debt Service") and half accounting jargon needing a gloss ("Mandatory Fringe Benefits", "Intrafund Transfers Out", "Unappropriated Rev-Designated", "Overhead and Allocations"); objects ~25–50% readable — random sample is dominated by things like "Sciap (Specialized Care) Svcs", "Ef-PUC-Water Charges", "ITO To 5L-Lagna Hnda Hosptl Fd"; sub_objects ~90% cryptic ("CAAP-Calm Aid-Cash Aid Lnk Med", "OTO To 4D/ODS-Other Debt SvcFd") — **not citizen-facing, ever**, raw display only.

**Funds:** 11 fund types × 8 fund categories, 294 funds FY2026. The pair that matters is fund_category: Operating (GEN_FUND $5.05B + ENT_FUND $5.82B + SP_REV $0.63B + DEBT_SRVC $0.42B…) vs Continuing Projects ($2.64B across types) vs Grants/Annual Projects. This drives the budget-vs-actual perimeter, not navigation.

## 2. Which drill paths carry meaning

- **Organizational: org_group → department. This is the page's spine.** 7 → 55, clean labels after enrichment, dollar-meaningful at both altitudes. `org×dept` = only **52 nonzero cells FY2026**.
- **Economic: character (secondary tab).** 25 characters (after pulling ELU out), ~16 with material $. This is the Paris "poste" altitude. Object level (276) is drawer-detail only; sub_object never.
- **The drawer altitude matching Paris's chapitre/poste fiches is dept×character: 459 nonzero spending cells + 328 revenue cells FY2026.** A DeptFiche (≈ChapitreFiche) = one dept's character breakdown; a CharacterFiche (≈PosteFiche) = one character's dept breakdown. dept×object is **2,633 cells** — too many for a fiche, right for the payments drill later.
- **Treemap verdict:** a 7-node org-group treemap matches the Paris thématiques altitude; a 55-node dept treemap breaks (33 nodes under 0.5% become unreadable slivers) — use treemap at org-group level (or top-N depts + "others"), ranked BarRow/ExpandableList for the full 55. Negatives: after separating transfer adjustments, only **7 of 461** dept×character cells are negative (−$130.8M total, essentially "Overhead and Allocations" at PUC/MTA/AIR) — offsets-block them and every visualized value is positive. Revenue objects are treemap-poison: gross/deduction pairs like HB Inpatient Revenues +$3.16B vs Inpatient Contl Rev Deduct −$2.54B sit side by side; **revenue renders at character level only**.

## 3. Transfer adjustments

- Magnitude per FY (always identical on both sides): −$1.76B (FY2010) → −$2.58B (FY2018) → **−$4.16B (FY2021 peak)** → −$3.94B (FY2026) → −$3.78B (FY2027). That's 20–25% of the net total — silently netting is not an option; the export must carry them as labeled lines (it already does at the year level: `transfer_adjustment_usd` in `budget_by_year.json`).
- Where they attach: **department level, across ~44 depts** (215–278 rows/FY-side), character `ELU`/"Transfer Adjustment - Uses" (spending) and `ELS` (revenue), two objects: 999986 "ELIMUC…CITY" (citywide, −$2.594B FY2026) and 999987 "ELIMUD" (dept-level, −$1.344B). Biggest FY2026 dept attachments: GEN −$970.6M, AIR −$436.7M, PUC −$649M combined, ADM −$338.1M, MTA −$208.9M, DPH −$189.8M.
- **UI carry:** dept totals shown net (naive sum is correct by construction, and all 55 net dept totals are ≥ $0 FY2026 — verified). Inside a dept fiche, one offsets line "transfer adjustments −$X" + the 7 Overhead cells, national-page offsets-block pattern (`UsNationalClient.tsx` s03). The section-level méthode note explains why the citywide total is "net".

## 4. Dept-level operating budget-vs-actual (FY2024)

Perimeter replicated from `mart_us_sf_budget_vs_actual` (fund_category='Operating', excl. transfer characters, excl. RGU): citywide spine FY2010–2025 spending residuals run **−0.4% (FY2024) to −8.8% (FY2015)** with the lone **−16.8% FY2021** COVID outlier; revenue side runs −7.8% (FY2020) to +6.9% (FY2022) — the "±8%" framing in the build plan is confirmed by the mart.

FY2024 by department: **53 depts with operating budget, 52 comparable** (RET has $49.5M budget, zero operating actuals — handle). Two rows are **perimeter artifacts, not stories**: PUC −42.4% (−$530M) and GEN +73.2% (+$430M) — the citywide unallocated bucket and PUC's fund structure. Real signal: **DPH +7.0% (+$174M over)**, MTA −3.5%, AIR −3.2%, HSA +2.7%, DPW +14.1%, POL +1.3%; small depts are %-noisy (CRT +51.2% on $16.8M, MYR −27.8% on $3.4M).

**Verdict: page-worthy**, as a table with (a) a materiality floor (budget ≥ $50M keeps ~30 depts) or $-primary/%-secondary sorting, (b) GEN and PUC annotated or excluded with a visible note. **Long dept series: FY2019+ only** (7 closed years) — dept codes survive FY2015→FY2024 at 49/55 = **81.3% of dollars**, so pre-break dept series need a crosswalk enrichment; org-group series are safe over the full range.

## 5. Revenue side

20 characters (incl. ELS adjustment) — the most citizen-readable label set in the dataset: Charges for Services **$5.38B**, Property Taxes **$3.11B**, Business Taxes **$1.66B**, Intergovernmental: State $1.31B / Federal $0.80B / Other $0.38B, Rents & Concessions $0.79B, Interest & Investment Income $0.28B, Fines $0.19B… **A Paris-style "where the money comes from" section is fully viable at character altitude.** Two glosses required: "Charges for Services" is the #1 category because enterprise billing (hospital, airport, water) lives inside it — without a one-liner citizens will misread it as fees-on-residents; and Intrafund Transfers In / Expenditure Recovery ($3.2B combined) are internal mechanics → offsets/internal block, not the ranked bars.

## 6. THE JOIN TEST — verdict: GO

Measured on FY2024 + FY2025 (excluding related-govt-unit rows, which are structurally unbudgeted — their character-level match is only ~28%):

| Join key (voucher → budget Spending, same FY) | FY2024 ($10.350B non-RGU paid) | FY2025 ($11.294B) |
|---|---|---|
| department | $10.230B = **98.8%** | 98.7% |
| dept × character | $9.353B = **90.4%** | 91.3% |
| dept × object | $9.349B = **90.3%** | 91.3% |
| dept × object × sub_object | $9.329B = 90.1% | 91.1% |
| dept × object, budget line ≠ $0 | $8.691B = **84.0%** | 85.7% |
| dept × character, budget ≠ $0 | $9.347B = **90.3%** | — |

The **10% unmatched is honest non-budget flow**: balance-sheet characters (Current Liabilities/Assets — retainage, deposits), tax refunds paid through GEN ($131M Business Taxes), PUC federal pass-through ($350M), CTA (a separate entity). One trap found and sized: budget often sits on "- Budget" placeholder objects (538000 "CBO Services - Budget") while payments post to sibling detail codes (538010 "Community Based Org Srvcs") — DPH FY2024 budgets $10.9M at 538000 and $0 at 538010 where the vouchers land. **Therefore: dollar-vs-dollar comparison joins at dept×character (90.3% matched on nonzero budget); object level is for payment detail lists, not comparisons.** Reverse coverage confirms the feature's honest scope: 97% of Non-Personnel Services budget $, 95% of City Grant Program, 93% of Debt Service, 85% of Aid Payments, 82% of Materials & Supplies have voucher activity — Salaries/Fringe/transfers/Services-of-Other-Depts have **0%** (no vendor payments exist there). The killer feature covers the "purchased" ~$5.5–6.5B of the budget, and the UI must say so. Worked example that will demo well: DPH × Community Based Org Srvcs FY2024 → SF AIDS Foundation $5.1M, Catholic Charities $3.1M, YMCA $1.9M, Rafiki Coalition $1.8M…

## 7. FY coverage consistency

- **The FY2018 chart-of-accounts break lives inside the budget dataset too**, not just actuals: FY2010–2017 legacy numeric codes (~300 programs / ~70 objects / ~21 characters); **FY2019+ modern mnemonics (10 / ~280 / ~26)**; **FY2018 is a mixed year** — $12.87B on legacy codes + 21,235 modern-code rows that are almost all $0 skeleton (SALARIES 2,373 rows summing $0, etc.) + ELU −$2.577B, and dept lists contain **both** naming systems ("Public Health" and "DPH Public Health" simultaneously). Citywide totals are fine; FY2018 drill-downs are not.
- Actuals: org-group level bridges the break perfectly (codes/labels stable 1999–2027, verified); dept level needs the crosswalk pre-FY2019; the operating spine mart already bridges it at the citywide level.
- FY2027 year-2 estimates are visibly coarser: AIR has **197 budget lines FY2027 vs 439 FY2026** (objects 90 vs 98), citywide 52 depts vs 55 — the recon's enterprise-estimate caveat is measurable and must render.
- **Flag risk found:** `is_fiscal_year_complete` is computed as `CURRENT_DATE > June 30 of FY` (see `core_us_sf_actuals.sql` line 32) — FY2026 actuals flag "complete" 16 days after year-end at $21.84B all-funds while the accounting close runs for months. The UI needs a "recently closed — preliminary" treatment for the newest closed FY that the boolean alone can't drive.

---

## Architecture implications (export shapes)

Already shipped and hero-ready: `budget_by_year.json` (net totals + `transfer_adjustment_usd` + per-resident + provenance, 12KB) and `budget_vs_actual.json` (citywide operating spine + measured perimeters, 42KB). Block 1 needs two additions:

1. **`budget_breakdown_{fy}.json`, per-year files + index (Paris pattern, year selector swaps fetch).** Contents per FY: org_group totals (7×2 sides), org×dept rows (52), dept×character cells (459 spending + 328 revenue nonzero at >$1k), character totals (25+19), the operating/capital/admin program strip (10 rows), fund_type×category block (~35 rows), and transfer-adjustment lines carried separately per dept (never netted silently). ≈900 rows → **60–120KB raw per FY**, 18 files. **Do not include dept×object (2,633 rows) in Block 1** — it triples the file for a level the page won't render; it belongs to the Block 2 payments drill.
2. **`budget_vs_actual_departments.json`, single file.** FY2019–2025 × ~52 depts × 2 sides ≈ 700 rows with the mart's operating-perimeter columns + an `is_structural_outlier` annotation for GEN/PUC (seeded, documented). ~100KB. Do not extend dept series pre-FY2019 without the crosswalk.

Both must carry the existing data contract (generated_at, per-block source/source_url from the Socrata catalog, as_of, completeness) — and given the flag finding, add an `execution_status` field ("closed" / "recently_closed_preliminary" / "in_progress" / "adopted_only") rather than reusing the calendar boolean.

## AI-enrichment opportunities

- **Tier 1, in Block 1 (in-session batch, ~100 items):** 55 dept display names (strip code prefix, expand "Wrkfrce/Commsn/Shrf", fix the "Children;Youth" semicolon) + 26 spending + 20 revenue character glosses (one-line tooltips: what "Mandatory Fringe Benefits" or "Charges for Services" actually is). Provenance-flagged seed, never overwriting source labels. **Local model is pointless at this volume** — the eval doc's decision rules target high-volume tiers; 100 items is one in-session frontier batch.
- **Tier 2, Block 2 timeframe (~457 items):** 276 spending + 181 revenue object labels → plain-English rewrites for the payments drill. This is Task-2-shaped (vulgarization, pairwise-judged, hallucination-disqualified), not Task-1-shaped (no enum to exact-score) — local only if the Task 2 eval verdict clears 70% wins+ties.
- **Tier 3, only if legacy years get drill-downs:** legacy→modern dept crosswalk (49/55 codes already identical; ~10–15 genuine mappings like DSS→HSA, ECD→DEM) + name-level character/object map for long economic series. Small, mostly deterministic, human-checked.
- **Never:** sub_objects (595 + 1,132 revenue) — raw display in expandable detail only.

## UI recommendations

- **Direct fusion reuse (props-only, per the 6-of-7 national precedent):** HeroNumber/KPIGrid/AnimatedNumber (hero + per-resident), **YearPicker** — its `votedYears` prop maps exactly to SF's adopted-only years (FY2026/27), **BudgetTimeline** (FY2010–2027 adopted series; reuse the vote/execute point types as adopted/closed), **DualFlowBars** (revenue characters ← → spending characters, the Paris s02 scene), **BudgetTreemap** at org-group altitude (7 nodes; its `group` field takes org group), ExpandableList/BarRow for the 55-dept ranking, the Paris s05 voted-vs-executed section (HeroNumber % + KPIGrid + CompareBar) which maps 1:1 onto the operating spine, **EmptyState** for adopted-only years, SectionHead/PageTOC/Tip/ChartSource/ExportRow. Import directly, no barrel (node:fs leak precedent).
- **Where SF demands what Paris doesn't have:** (a) **dept fiches with two-sided context** — DeptFiche ≈ ChapitreFiche (character breakdown + offsets line), CharacterFiche ≈ PosteFiche (dept breakdown), as root-level drawers per the drawer-architecture doctrine; (b) **the offsets block** (ELU/ELS + Overhead and Allocations) — already invented on /us/national, copy the treatment; (c) **FY2027 "next year's budget today"** — no Paris analogue; render as a second adopted year with the enterprise-estimate caveat (measurably coarser: AIR 197 vs 439 lines); (d) resist the 6-level depth — the page exposes exactly two drill altitudes (org→dept, character), programs appear only as an operating/capital strip, objects only inside drawers later.
- **Year-selector UX:** three states, not two — closed (FY2010–2025: adopted + executed-operating), recently-closed-preliminary (FY2026: execution shown with "year-end close in progress" caveat), adopted-only (FY2026 hero/FY2027: Paris `voted_notice` pattern verbatim, plus the year-2 note).

## Killer features ranked by data-readiness

1. **Voted vs executed, citywide + dept table** — 100% ready, marts built, FY2024 −0.4% renders the acceptance criterion. Ship in Block 1.
2. **Budget line → actual payments to vendors** — join proven this session (90.3% of $ at dept×character on nonzero budget, honest remainder explained). Needs one voucher-aggregation export; natural Block 2 bridge, and the single best demo in the dataset.
3. **Next year's budget today (FY2027)** — data present, caveat quantified. Nearly free in Block 1.
4. **Where the money comes from** — revenue characters are the cleanest labels in the source; forecast-vs-actual ±8% works. Block 1 section 4 as planned.
5. **Org-group long series 1999→2027** — the only dimension stable across the break; cheap wow ("28 years of city spending").
6. Not ready: anything program-level (10 generic tags), payee fiches (unkeyed names), district maps (no geography in the finance datasets).

## Risks

1. **FY2018 is a corrupted-drill year** (mixed code systems, duplicate dept identities, 21k zero-skeleton rows) — exclude FY2018 from dept/character breakdown exports or render legacy-codes-only; keep it in citywide series.
2. **Calendar-based completeness flag** will mislabel FY2026 actuals as final — fix at export level (`execution_status`), not in page copy.
3. **GEN/PUC deviations look like scandals but are perimeter artifacts** (+73%/−42%) — annotate or the table's top rows discredit the page.
4. **"Charges for Services" without a gloss reads as resident fees** — it's $5.38B of mostly enterprise/hospital billing.
5. **Label enrichment must be a provenance-flagged seed layer** — dept labels have source typos; never overwrite, never hardcode (zero-hardcode rule).
6. Program collapse means **SF has no functional taxonomy** — Paris-style thematic storytelling tops out at 7 org groups until a crosswalk enrichment exists (already flagged in SF-PAGE-SCOPE "Later").
7. Per-resident scaling only exists for FY2020–2025 (Census vintage) — hero for FY2026/27 needs the latest-estimate note the export already carries.
