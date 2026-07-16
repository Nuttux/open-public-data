# Block 4 design brief — `/us/city/sf/payroll`

Research-only study, 2026-07-16. Every number measured live against `open-data-france-484717.dbt_us_analytics.core_us_sf_comp` (547,962 Fiscal rows) and `dbt_us_marts.mart_us_sf_comp_by_year`, `year_type='Fiscal'` throughout unless stated. Mart and core agree exactly (FY2025 $6.919B / 40,786 employees — matches Block 4 acceptance criteria).

## 1. Aggregate landscape

**Total comp FY2013→FY2025** (`SUM(total_compensation) GROUP BY year`):

| FY | Comp $B | Salaries | Overtime | Other sal. | Benefits | Employees |
|---|---|---|---|---|---|---|
| 2013 | 3.793 | 2.482 | 0.164 | 0.153 | 0.994 | 37,255 |
| 2019 | 5.186 | 3.357 | 0.310 | 0.153 | 1.367 | 41,848 |
| 2021 | 5.581 | 3.555 | 0.266 | 0.175 | 1.585 | 37,620 |
| 2025 | 6.919 | 4.528 | 0.471 | 0.259 | 1.661 | 40,786 |

- Total comp **+82% nominal in 12 years** (US CPI over the span ≈ +38%); median employee comp **$103,137 → $160,072 (+55%)**; headcount only **+9.5%**. The growth is price-of-labor, not workforce size.
- Component shares FY2013 → FY2025: benefits 26.2% → 24.0%; **overtime 4.3% → 6.8%** of total comp. Benefits stalled in absolute $ 2021–2023 (~$1.55B flat) then resumed.
- Headcount dipped in COVID (41,848 FY2019 → 37,620 FY2021), recovered to 40,786 — while SF's population went the *other* way: peak ~880k (2018–19), ~808–813k in 2023–26 est. **City comp per resident ≈ $8,500/yr FY2025, ~50 city employees per 1,000 residents** (population must come via pipeline per zero-hardcode rule; Census PEP is in the neutral-sources doctrine).
- **Org groups: exactly 7.** FY2025: Public Works/Transportation & Commerce $2.14B, Public Protection $1.78B, Community Health $1.58B (single dept = DPH), Gen Admin & Finance $631M, Human Welfare $480M, Culture & Recreation $306M.
- **Top departments FY2025**: Public Health $1,584M (8,904 emp), MTA $961M (6,381), Police $714M (3,007), Fire $477M (2,054), PUC $476M, Human Services $370M, Airport $305M, Public Works $262M, Sheriff $251M (1,027).

## 2. Overtime study — the quantified police/fire/Muni pattern

- **FY2025 OT = $471M.** Concentration: Police $147.2M (20.6% of dept comp), MTA $77.1M (8.0%), Fire $69.4M (14.5%), DPH $65.3M (4.1%), Sheriff $53.7M (**21.4%** — highest share), Emergency Mgmt $9.6M (13.4%). Top-5 depts = **$412.7M = 88% of all OT**.
- **Trend (dept series valid 2017+ due to the label break, §5):** Police OT **tripled**: $50.7M (FY2017) → $147.2M (FY2025), while Police headcount fell from a 3,605 peak (FY2016) to 3,022 — the understaffing→overtime story in two numbers. Sheriff nearly doubled ($28.2M→$53.7M). Fire spiked FY2022 ($86.1M) then eased. MTA peaked pre-COVID ($94.1M FY2019), collapsed FY2021 ($40.7M), rebuilt to $77.1M.
- **Top OT job titles FY2025**: Police Officer 3 $67.0M, Sergeant 3 $42.2M (avg **$101,774 OT per OT-earning sergeant**), Transit Operator $40.0M, Firefighter $28.7M, Registered Nurse $22.6M, Deputy Sheriff (2 codes) $36.2M.
- **OT > salary**: naive count FY2025 = 384 employees, but the FY2019 "spike" (1,893) is an artifact — 1,746 of them had salary ≤ $1,000 (job-change/other-salaries rows). With a salary>$1,000 floor: **38 (FY2013) → 373 (FY2025), a 10× rise**, clean monotone-ish trend. Extreme case FY2025: a Police Sergeant 3 with **$443,662 overtime on a $184,577 salary** ($722k total); a Sheriff's Sergeant at $785k total. Use the floored metric in the export; document the floor in méthode.

## 3. Job-title landscape

- Cardinality (all Fiscal years): **1,247 job codes, 1,396 title strings** (renames); **FY2025 active: 1,026 codes, code↔title 1:1 within a year**. Group by `job_code`, label with latest title.
- **Native job-family grouping EXISTS and is 100% populated**: `job_family_code`/`job_family`, 59 codes / 60 labels, zero blank rows. FY2025 top families: Nursing $741M, Police Services $593M, Street Transit $501M, Fire Services $454M, Journeyman Trade $438M, Management $405M. **No 1,396-title AI classification batch is needed.**
- Two junk families remain: **"Untitled" (92 titles, 1,675 employees, $753.7M all-years) and "Unassigned" (12 titles, $28.4M)** — mostly dept-head/exec codes. That is the real enrichment backlog: **~104 titles**, an afternoon in-session batch, not a local-model job.
- `union_name`: 70 codes but **129 name strings** (rename noise; 43 rows blank). Usable as a secondary dimension after code-level canonicalization (SEIU 1021 Misc 15,670 emp / $1.75B; Local 21 $1.27B; POA $593M FY2025). Recommend **v1: skip union view, keep in mart**.

## 4. Small-cell identifiability study (decision-critical)

Cell = distinct employees per dept_code × job_code × year:

| Grain | n=1 cells | n=2–4 | n≥5 | $ in n<5 |
|---|---|---|---|---|
| dept × job × year, all years | 13,942 (35% of cells) | 11,026 | 14,831 | **9.4% of $67.4B** |
| dept × job, FY2025 | 1,039 | 851 | 1,181 | 9.0% ($623M) |
| **dept × job_family, FY2025** | **114** | **134** | **435** | **1.2% ($85M)** |

- Concrete n=1 cells FY2025 (all effectively named individuals): Retirement System / Chief Executive & Investment Officer **$856,814** (the city's top-paid employee), Port Director $594k, Sheriff $557k, Chief of Police $547k, Chief Medical Examiner $537k, Controller $495k, District Attorney $455k.
- **Recommendation: n≥5 publication threshold at dept × job_family grain** (standard statistical-agency small-cell practice). Sub-threshold cells pooled per dept into "Other roles (n=…)"; require the pool itself to be ≥5 or fold into the dept total (defeats subtraction-recovery). Edge case measured: **Law Library dept has n=2 total** — the rule must also apply at dept level (fold into org group "Other"). Cost of the whole scheme: ~1.2% of dollars moved into pools, nothing lost from totals.
- **Distribution percentiles** (employee-level, summed across an employee's rows first — 43,239 rows vs 40,786 employees FY2025, ~6% multi-row):

| FY | p10 | p50 | p90 | p99 | >$400k | >$500k | max |
|---|---|---|---|---|---|---|---|
| 2013 | 8,943 | 103,137 | 185,419 | 259,283 | 1 | 0 | 425,605 |
| 2019 | 6,291 | 122,401 | 227,800 | 359,810 | 251 | 92 | 1,254,246 |
| 2025 | 23,585 | 160,072 | 301,702 | 493,882 | **1,252** | **390** | 1,944,781 |

- The >$400k club grew from 1 to 1,252 in 12 years. FY2025 it is dominated by **public-safety supervisors and DPH physicians**: Sergeant 3 (149), Police Officer 3 (110), Lieutenant 3 (57), Deputy Sheriff (53), Sr Psychiatric Physician (34), Battalion Chief (26) — i.e., overtime + premium pay, not executives. p10 is polluted by part-timers (see §5) — publish p25/p50/p75/p90/p99, drop p10 or gate on FTE.

## 5. Data quality

- **FY2013–2016 has NO `employment_type` and NO `hours`** (100% blank those years; 167,509 Fiscal rows). Consequences: FTE normalization and perm/temp splits are **2017+ only**; totals/trends unaffected. FY2025 employment mix: Permanent Civil Service 30,934, Temporary Exempt 7,200, Permanent Exempt 3,582.
- `hours` 2017+ fully populated (avg ~1,700/yr, 388–2,143 zero-hour rows/yr) — **FTE-filtered views viable from 2017**.
- **Department label break at FY2017**: 2013–16 labels are code-prefixed ("POL Police"), 2017+ clean ("Police"); 61 dept codes ↔ 125 label pairs. **`department_code` is stable across all 13 years** — the export must key on codes with canonical (latest) labels, else every pre-2017 dept series silently zeroes (bug hit live in the OT-trend query).
- **Calendar/Fiscal**: both complete 2013–2025 (Fiscal $67.44B / Calendar $69.47B; per-year deltas 1–7%, Calendar consistently higher). Pick Fiscal (aligns with budget page), assert `year_type='Fiscal'` in the export test.
- Distribution shape FY2025: bimodal — 4,212 employees (10.3%) at $0–25k (part-time/partial-year), main mode $125–175k. Annotate the low bump; don't let it read as "poverty wages".

## 6. Benchmark — are we adding value?

- **SF Controller's own OpenBook** presents this same dataset as a legacy report site (the report host actively refused connections during this study — fragile infrastructure, no linkable states, no distribution views).
- **Transparent California publishes actual employee NAMES for SF, 2011–2024**, as does the State Controller's GCC portal. Name-level disclosure already exists publicly from third parties; DataSF's own feed is pseudonymized; **our aggregates-only page would be the most conservative publisher in the landscape** — a feature (contrast with salary-shaming sites); the privacy dial is low-stakes legally, purely editorial-positioning.
- Genuine value-add: 13-year interactive trend, the quantified overtime lens, distribution/percentile visualization (nobody shows this), provenance-to-BigQuery modal, cross-linking comp (~$6.9B) against the budget page (consistent with actuals salaries $4.95B + fringe $1.88B + enterprise funds — méthode-note material).

## Architecture implications (export shapes)

Suppression applied **at export time in the pipeline** — raw employee-level rows never leave BigQuery; the website only ever receives aggregates:

1. `sf_payroll_by_year.json` — 13 rows: components, n_employees, median/avg (mostly exists in `mart_us_sf_comp_by_year`; add per-resident once a population series lands).
2. `sf_payroll_by_dept_year.json` — ~52 dept_codes × 13 yrs ≈ 680 rows: comp components, OT $ and %, n_emp, median. Key on `department_code`, canonical labels; fold n<5 depts (Law Library) into org-group "Other".
3. `sf_payroll_by_family_year.json` — dept × job_family × year, **n≥5 rule + per-dept "Other roles" pooling**; ~5–6k rows over 13 years after pooling. The drill-down grain.
4. `sf_payroll_distribution.json` — per year: p25/p50/p75/p90/p99, counts >$200k/$300k/$400k/$500k, $25k-bucket histogram 0–500k (20 buckets × 13 years = 260 rows). City-wide only in v1.
5. `sf_payroll_overtime.json` — top-N depts OT series 2017+ (label-clean window) + city total 2013+; OT-exceeds-salary count series **with the salary>$1k floor documented**; top job titles by OT (title-level fine: every listed title n≥100).

Employee-level pre-aggregation (`SUM` per employee before percentiles/OT flags) must live in an intermediate model, not the export script — per the no-bypass layering rule.

## AI-enrichment opportunities

- **The anticipated 1,396-title classification batch is dead — DataSF ships a 60-family taxonomy with 100% coverage.** What remains: (a) map 60 native families → ~12–15 display families (60-row seed, by hand in-session, 30 min); (b) reclassify the 104 "Untitled"/"Unassigned" titles ($782M) — a single in-session few-shot batch. **Too small to justify the local-model pilot**; the real local-model candidate remains payee name-normalization.
- Optional later: plain-English one-liners for the top ~100 job titles ("Sergeant 3 = patrol supervisor") for tooltips.

## UI recommendations (no Paris equivalent — new page pattern)

1. **Hero** — HeroNumber: $6.92B FY2025 comp, 40,786 people, per-resident figure; year selector 2013→2025. Signature scene per matérialité: the *typical* employee (median $160k), not the outliers.
2. **Where the people are** — org-group → dept ranked BarRow/treemap, toggle $ ↔ headcount.
3. **The overtime lens** — signature section. Dept OT ranking with % badges (Sheriff 21.4%, Police 20.6%, Fire 14.5%); Police-OT-tripled-since-2017 line chart; OT-exceeds-salary counter (38→373). Neutral framing: staffing shortfall coverage, not "abuse".
4. **What city work pays** — distribution: histogram + percentile band per year. **Needs one new primitive** — nothing in fusion renders a histogram or a p25–p99 band evolving over years. Recommend `DistributionStrip` (histogram bars + median marker + band overlay, year-scrubbed), LEARNINGS row per the fork rule. Annotate the part-time bump.
5. **Salary vs benefits split** — StackedBarTheme as-is (3 components per year).
6. **Sources & méthode** — Fiscal-only note, dept-label break, suppression rule stated plainly ("groups under 5 people are pooled"), link to 88g8-5mnd + provenance.

## Killer features ranked by data-readiness

1. **Overtime lens** — ready now, fully quantified, best story on the page.
2. **13-year comp trend + median vs headcount vs population** — ready (population series needs a small pipeline add).
3. **Distribution/percentile explorer** — ready; needs the one new primitive; nobody else shows this.
4. **Dept → job-family drill-down** — ready after the 60→15 seed + 104-title batch (one session).
5. **FTE/employment-type views** — 2017+ only; defer to v1.1 with coverage caveat.
6. **Union lens** — needs code canonicalization; editorially secondary; park.

## Risks & the privacy dial (Daniel's call, measured stakes)

| Dial | What ships | Measured cost/risk |
|---|---|---|
| A. Row-level pseudonymized (what DataSF publishes) | 43k rows/yr | Re-identification trivial for 1,039 n=1 dept×job cells (Chief of Police = a person); contradicts stated stance; heavy exports. **Reject.** |
| B. **Dept × family × year, n≥5 + pooling (recommended)** | ~5–6k rows total | Loses **1.2% of $** into visible "Other" pools; zero silent suppression; conservative vs every existing publisher. |
| C. Dept × job (fine titles), n≥5 | ~14.8k cells | Loses 9.0–9.4% of $ to pooling; page altitude doesn't need 1,026 titles. v2 "explore" table at most. |
| D. Dept × year only | 680 rows | Kills the job-family and distribution wow — under-delivers. |

Other risks: (1) dept-label break silently zeroes pre-2017 series if any export groups by label — key on `department_code` (bug reproduced live); (2) p10/part-time bump invites "poverty wages" misreads — publish p25+, annotate; (3) FY2019 OT>salary artifact — floor documented or the trend is wrong 5×; (4) high-earner section stays service-framed (public-safety premium pay + physicians), never "fat-cat" framing.
