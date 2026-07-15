# API recon — US sources (milestone 1)

**Date: 2026-07-15.** Live verification of the three source families for `/us/national` (Treasury Fiscal Data, USAspending) and `/us/city/sf` (DataSF). Every dataset id, endpoint, field name, coverage claim, and total below was fetched live on this date — nothing from memory. Run before writing any pipeline code, per milestone 1.

Companion docs: [RESEARCH-BRIEF.md](RESEARCH-BRIEF.md) (why these sources), [LEARNINGS.md](LEARNINGS.md) (patterns transferred from Paris).

Target data contract (inherited from the France national exports): every export carries `generated_at` + `source_pipeline`, per-value `source`/`source_url`, per-year files + index files, and an explicit perimeter/scope field.

---

## A. DataSF (data.sfgov.org — Socrata/SODA, `/us/city/sf` modern spine)

All core datasets published by the Controller's Office, mirroring openbook.sfgov.org. Discovery via `https://api.us.socrata.com/api/catalog/v1?domains=data.sfgov.org&q=<term>&only=datasets`.

### A.1 Budget — `xdgd-c79v`

- API: `https://data.sfgov.org/resource/xdgd-c79v.json` · 389,756 rows · **FY2010–FY2027** · new data lands annually (AAO cycle), published weekly.
- **Grain**: fiscal_year × revenue_or_spending × org group × department × program × character × object × sub_object × fund hierarchy → `budget` amount. All dimension fields are `text` (including `fiscal_year`); `budget` is `number`.
- **Adopted AAO only — there is NO budget-phase field** (no proposed-vs-adopted anywhere on the portal; proposed lives in Mayor's Budget Book PDFs). SF budgets two years at a time, hence FY2027 already present; year-2 enterprise-department figures are high-level estimates.
- Sanity (live): FY2025 Spending **$15.92B**, FY2026 **$15.99B**, FY2027 **$16.23B**; Revenue matches Spending per FY within $5 (balanced budget). Series verified FY2010 $6.68B → FY2027 $16.23B.
- **Net total depends on embedded negative "Transfer Adjustments (Citywide)" rows — keep them**; naive `sum(budget)` is correct precisely because of them.
- Broken field: `related_govt_unit` only mirrors `revenue_or_spending`.

### A.2 Spending and Revenue (actuals) — `bpnb-jwfb`

- 763,150 rows · **FY1999–FY2027** (in-progress years appear: FY2027 at $346M so far) · updated weekly.
- Same dimension hierarchy as Budget → joinable for budget-vs-actual, **but actuals are gross where budget is net**: FY2024 actual Spending $21.16B vs ~$15.9B budget, gap = related-govt-units rows ($3.67B, OCII etc.) + "Transfers Out" $1.76B + "Intrafund Transfers Out" $1.65B. Exclude `related_govt_units IN ('Yes','YES')` and decide transfer-character treatment or comparisons are off by billions.
- **Casing bug (verified)**: `related_govt_units` distinct values are `No`/`NO`/`Yes`/`YES` — normalize.
- **Chart-of-accounts break at FY2018** (legacy numeric codes → PeopleSoft mnemonic codes; e.g. character `513` → `MAND_FRING_BEN`). Names mostly align, codes don't — long series need a name-level map or crosswalk.

### A.3 Vendor Payments (Vouchers) — `n9pm-xkyq` (the "qui reçoit" dataset)

- **8.07M rows** · **FY2007–FY2027** · weekly. Grain = voucher × accounting distribution line (FY2025: 515,694 rows, 500,020 distinct vouchers, 6,654 vendors). Money fields: `vouchers_paid`, `vouchers_pending`, `vouchers_pending_retainage`.
- Carries dept/program/object/fund hierarchy + `purchase_order`, `contract_number`, `contract_title`, `vendor`, `non_profit_indicator` (`X` on 339,985 rows).
- Sanity (live): FY2025 `sum(vouchers_paid)` = **$16.75B**. Top payees FY2025: JPMorgan Chase $1.86B, DTC $1.07B, BNY Mellon ×2 spellings $1.35B, US Bank $637M — **top of a naive ranking is banks/fiscal agents (debt service, pass-throughs), not service providers**. A "who receives" view must bucket/annotate these.
- **Vendor names are unkeyed strings** (no supplier id; BNY Mellon under two spellings) → name-normalization step needed, as with Paris associations.
- `data_as_of` is text with mixed formats here. 8M rows → sync via bulk CSV or paged SODA.
- Lighter alternates: `p5r5-fd7g` (PO summary), `ebsh-uavg` (commodity lines), `qkex-vh98` (nonprofit spending only).

### A.4 Supplier Contracts — `cqi5-hm2d`

- 48,350 rows, 31,935 distinct contracts → **grain = contract × project-team member; summing `agreed_amt` double-counts** (dedupe on `contract_no` or filter `project_team_constituent='Prime Contractor'`).
- Money: `agreed_amt` (award), `consumed_amt`, `pmt_amt`, `remaining_amt`. Dims: `contract_type`, `sole_source_flg`, `non_profit`, LBE status, scope.
- Data quality: placeholder end dates (2200-12-31 — cap), missing `contract_no` on some rows, junk titles ("x", "Unspecified").

### A.5 Employee Compensation — `88g8-5mnd`

- 1.10M rows · **2013–2025** · bi-annual updates. Grain = pseudonymous `employee_identifier` × year × year_type × job × department (no real names).
- **#1 trap: `year_type` contains BOTH `Calendar` (548,140 rows) and `Fiscal` (547,962) — always filter one or everything double-counts.**
- Money: salaries/overtime/other → `total_salary`; retirement/health_and_dental/other → `total_benefits`; `total_compensation`. `employment_type` blank on 336,216 older rows.
- Sanity (live): FY2025 total comp **$6.92B**, 40,786 distinct employees — consistent with actuals (Salaries $4.95B + Fringe $1.88B) plus enterprise funds.

### A.6 SODA mechanics (verified)

- SODA 2.1: `$select` aggregations (`sum`, `count(distinct)`, `min`/`max`), `$group`, `$where` (incl. `IN`), `$order`, aliases — all work anonymously.
- **No $limit cap observed** (60,000 rows returned in one call); `$offset` paging works — always pass `$order`. Type-cast text years with `fiscal_year::number`.
- CSV per-query (`.csv` endpoint) and full bulk export (`/api/views/<id>/rows.csv?accessType=DOWNLOAD`) both verified.
- App token: anonymous works (pooled throttle); **invalid `X-App-Token` → 403** — send a real token or none. Useful headers: `X-SODA2-Fields`/`-Types`, `X-SODA2-Truth-Last-Modified` for cache invalidation.
- Replayable examples:
  - `https://data.sfgov.org/resource/xdgd-c79v.json?$select=fiscal_year,sum(budget) as b&$where=revenue_or_spending='Spending'&$group=fiscal_year&$order=fiscal_year`
  - `https://data.sfgov.org/resource/n9pm-xkyq.json?$select=vendor,sum(vouchers_paid) as paid&$where=fiscal_year='2025'&$group=vendor&$order=paid DESC&$limit=5`
  - `https://data.sfgov.org/resource/88g8-5mnd.json?$select=sum(total_compensation),count(distinct employee_identifier)&$where=year='2025' AND year_type='Fiscal'`

### A.7 DataSF risk summary

1. No proposed-vs-adopted distinction (adopted AAO only).
2. Modern-spine floor: budget FY2010+, actuals FY1999+, vendors FY2007+, comp 2013+ — everything earlier comes from the archive layer (as designed).
3. Net budget vs gross actuals (transfers + related govt units) — the reconciliation rule must be explicit in the pipeline.
4. FY2018 chart-of-accounts break.
5. Unkeyed vendor names; banks dominate naive payee rankings.
6. In-progress fiscal years present — label partial years.

---

## B. Treasury Fiscal Data (api.fiscaldata.treasury.gov — `/us/national`)

Base `https://api.fiscaldata.treasury.gov/services/api/fiscal_service`. No auth, CORS open (`Access-Control-Allow-Origin: *`). Machine-readable catalog of all 56 datasets at `https://api.fiscaldata.treasury.gov/services/dtg/metadata/` (per-API: exact path, row_definition, fields, earliest/latest date, row_count, update cadence — a free data dictionary; use it in the pipeline instead of hardcoding).

### B.1 MTS Table 9 — receipts by source + outlays by function (the daily-bread table)

- `v1/accounting/mts/mts_table_9` · 33 rows/month: section 1 = receipts by 8 sources, section 2 = outlays by 19 budget functions. Amounts in **dollars** (strings): `current_month_rcpt_outly_amt`, `current_fytd_rcpt_outly_amt`, `prior_fytd_rcpt_outly_amt`.
- **Line types**: `data_type_cd` `D`=detail / `S`=header (amounts literal `"null"`) / `T`=total (**double-counts if summed with D**). Clean function extraction verified: `filter=data_type_cd:eq:D,record_type_cd:eq:F`. FYTD total outlays cross-checks exactly against Tables 3 and 5 ($5,517,917,965,556.91 through 2026-06).
- Coverage: **2015-03-31 → 2026-06-30**.
- Table 9A (`mts_table_9_outlays_functions_subfunctions`) adds function × subfunction with explicit `function_desc`/`sub_function_desc` columns (e.g. Medicare FYTD $780.3B); has no `data_type_cd` — check for embedded totals before summing (unverified).

### B.2 MTS Table 5 — outlays by agency/bureau/account

- `v1/accounting/mts/mts_table_5` · **802 rows/month**, hierarchy up to 5 levels (`record_type_cd`: `C` agency, `B` bureau, `P` program/account, `SL` summary, `UOR(G)` undistributed offsetting receipts). Gross outlays / applicable receipts / net outlays × month / FYTD / prior-FYTD.
- **Agency-total recipe (verified)**: `data_type_cd:eq:T,record_type_cd:eq:C` → `Total--Department of X` rows. Caveats: "Independent Agencies" is a `D|C` header with `"null"` amount (data in children); `C` rows also appear below level 1 — check `sequence_level_nbr` when aggregating.
- Coverage: 2015-03-31 → 2026-06-30.

### B.3 MTS Tables 1/3/4 — summaries and receipts detail

- **Table 3** (57 rows/month): best single table for one-screen receipts-vs-outlays — receipts by 7 categories (`RSG` rows) + outlays by ~30 agencies (`C` rows) + `current_year_budget_est_amt` (budget estimate column!). Deficit is **negative** here.
- **Table 1**: each publication restates two FY blocks month-by-month; take latest `record_date`, `record_type_cd=MTH` for a revised monthly series. Deficit is **positive** here — sign conventions flip between tables; normalize per table.
- **Table 4** (receipts detail, 4-level hierarchy): **verified trap — the hierarchy is inconsistent about where numbers live**: "Corporation Income Taxes" carries its amount on the `D` row, but the whole "Individual Income Taxes" block has `"null"` on `D` rows with the value only on the `T` total ($2.20T). Do NOT extract category receipts from Table 4 — use Table 9 section 1 or Table 3 `RSG` rows (both verified clean).

### B.4 Long series & other verified endpoints

| Endpoint | Grain | Coverage (verified) | Units |
|---|---|---|---|
| `v1/.../mts_receipts_outlays_deficit_surplus` | month × {Receipts, Outlays, Deficit} | **1980-10-31 → 2026-06-30** | **millions** |
| `v2/accounting/od/debt_to_penny` | business day (public + intragov + total debt) | **1993-04-01 → 2026-07-13** | dollars (total $39.42T) |
| `v2/accounting/od/debt_outstanding` | fiscal-year end | **1790 → 2025** | dollars |
| `v2/accounting/od/statement_net_cost` (Financial Report, accrual) | FY × agency, `restmt_flag` | 2001 → 2025 | **billions** |
| `v2/accounting/od/interest_expense` | month × expense category | → 2026-06-30 | dollars (likely; not formally verified) |
| `v2/accounting/od/avg_interest_rates` | month × security type | → 2026-06-30 | percent |
| `v1/accounting/dts/operating_cash_balance` | day (TGA balance) | → 2026-07-13 | likely millions (unverified) |

The 1790→today annual debt series + 1980→today monthly totals + 2015→today monthly detail is a ready-made national "time-machine" ladder. MTS tables 2/6/6a-e/7/8 exist (budget estimates, means of financing, trust funds) — sampled, not needed for v0. 7 more Financial Report endpoints (balance sheets, long-term projections…) exist per catalog, unfetched.

### B.5 Mechanics (verified)

- Pagination `page[size]`/`page[number]` (`page[size]=900` accepted); `meta.total-count`, `meta.labels`/`dataTypes` per field.
- Filters `filter=field:op:value` (comma = AND; `eq`, `in`, `gte`, `lte`). Sorting: `sort=-field` desc, bare field asc — **`sort=+field` breaks** (the `+` decodes to a space).
- **`fields=` returns DISTINCT tuples** — silently collapses row counts (table 5: 802 rows → 1 with `fields=record_date`). Always include a unique column or skip `fields`.
- **Everything is a JSON string, missing values are the literal string `"null"`** (not JSON null) — parse accordingly.
- `format=csv` works. Unknown paths → HTML 404 (not JSON).
- Cadence: MTS lands ~8th business day of the following month; Debt to the Penny daily with 1–2 day lag. Rate limits: none observed; behavior at volume unverified.
- Surrogate `classification_id`/`parent_id` look publication-scoped — join across months on `line_code_nbr`/`sequence_number_cd`/`classification_desc` (verified stable: `line_code_nbr=140` = National Defense across months). `line_code_nbr` is a STRING — `gte/lte` compares lexicographically.

### B.6 Treasury risk summary

1. **D/S/T line-type double counting** — and Table 4 inverts the pattern in places. Per-table extraction recipes above; encode them as pipeline tests (the T-total = sum(D) identity is a free self-check).
2. **Sign conventions flip between tables** (deficit positive in Table 1 and the long series, negative in Table 3).
3. **Units flip between datasets** (dollars / millions / billions) — read `meta.labels`, never assume.
4. History floors: monthly detail 2015+, monthly totals 1980+, annual debt 1790+. Pre-2015 outlays-by-function needs OMB historical tables (non-API).
5. Each MTS publication restates prior months — build series from latest `record_date` per FY.
6. **No population dataset in the catalog** — per-resident scaling needs Census (external seed/sync, like INSEE for Paris).

---

## C. USAspending (api.usaspending.gov — `/us/national` awards / "qui reçoit")

Base `https://api.usaspending.gov`, no auth, no rate-limit headers observed. Mostly POST+JSON. Error messages are excellent (name the missing key, enumerate valid values — schemas are discoverable by deliberately erroring). Responses carry an in-band `messages` array with coverage caveats — surface it, don't drop it.

### C.1 Spending Explorer — `POST /api/v2/spending/`

- Body: `{"type": "budget_function", "filters": {"fy": "2025", "quarter": "4"}}` — `quarter` (1–4) or `period` (1–12), both strings. Valid types: `agency, award, award_category, budget_function, budget_subfunction, federal_account, object_class, program_activity, recipient`.
- Example record: `{"amount": 1836688276389.77, "id": "570", "type": "budget_function", "name": "Medicare", "code": "570"}`. No pagination — full breakdown per call. Envelope has `total` + `end_date`.
- **Amounts are obligations, cumulative FY-to-date** (verified: HHS agency row exactly equals `agency_total_obligated` from the budgetary_resources endpoint).
- **Totals reconcile perfectly across types** (live): budget_function (20 rows), agency (109 rows), object_class (7 major groups) all sum to the identical FY2025 total **$10,334,224,922,234.34**. Top functions: Medicare $1.84T, Social Security $1.67T, National Defense $1.42T.
- **Drill-down composes**: `{"type":"federal_account","filters":{...,"agency":806}}` → 176 HHS accounts summing exactly to the HHS total; further drill to `recipient` within a federal_account works (top: CA Dept of Health Care Services $107.8B under Medicaid grants).
- **Coverage**: floor FY2017 Q1 (Q1 partial — treat FY2017 Q2 as practical floor); latest closed FY2026 P8 (through 2026-05-31 as of 2026-07-15, ≈1.5-month lag). Discover the current period via `GET /api/v2/references/submission_periods/` (`submission_reveal_date`).
- **Timeout trap**: government-wide `{"type":"recipient"}` → 502 at ~60s. Scope recipient drills to an agency/account.

### C.2 Toptier agencies — `GET /api/v2/references/toptier_agencies/`

- 111 agencies, one call, no params. Per agency: `outlay_amount`, `obligated_amount`, `budget_authority_amount`, `percentage_of_total_budget_authority`, `agency_slug`, `toptier_code` (key into `/api/v2/agency/<code>/...`).
- **Current snapshot only** (active FY/quarter, now FY2026 Q3) — not a historical series. `current_total_budget_authority_amount` = government-wide denominator repeated on every row ($15.82T FY2026). Micro-agencies can be all zeros.

### C.3 Award search — `POST /api/v2/search/spending_by_award/`

- Required: `fields` + `filters.award_type_codes` (contracts = A–D). `page`/`limit` pagination with `last_record_unique_id` keys for deep paging.
- Top 3 FY2025 contracts (live): Humana $51.3B, Lockheed Martin $48.1B, NTESS/Sandia $42.6B.
- **Trap: "Award Amount" is lifetime obligated total, NOT in-period spend** — the time filter matches awards with *activity* in the window (a 1993–2017 Lockheed award ranks #2 "in FY2025"). For "who received money in FY X" use `spending_by_category/recipient` instead.
- `Total Outlays` at award level is unreliable ($0.0 on a $51B award; negatives observed) — never treat as spend.
- In-band coverage note: award search floor **2007-10-01**; 2000-10-01 onward available via bulk downloads only.
- Subawards: `spending_level: "subawards"` — separate records from primes; chains overlap (Northrop appears as both subawardee and prime). **Never sum across levels.**

### C.4 Top recipients — `POST /api/v2/search/spending_by_category/recipient`

- Example record: `{"amount": 34094675624.06, "recipient_id": "6cf5fb1b-...-C", "name": "LOCKHEED MARTIN CORPORATION", "code": "008016958", "uei": "G4KDGE4JFFK7"}`.
- `spending_level: "transactions"` → **in-window transaction obligations** (Lockheed $34.1B FY2025 vs $48.1B lifetime on its top award). Recipients carry **UEI + DUNS + recipient_id** — keyed identities, unlike DataSF's name strings.

### C.5 Federal accounts & budgetary resources

- `POST /api/v2/federal_accounts/` `{"filters":{"fy":"2025"}}` → 2,261 accounts; `budgetary_resources` **can be negative** (FCC Universal Service Fund −$13.9B) or zero.
- `GET /api/v2/agency/<toptier_code>/budgetary_resources/` → per-FY series **FY2017–FY2026**: `agency_budgetary_resources`, `agency_total_obligated`, `agency_total_outlayed`, + **monthly obligation series** (`agency_obligation_by_period`) — ideal for a daily-bread-over-time chart. HHS FY2025: BA $3.13T / obligated $2.79T / outlayed $2.72T.

### C.6 Bulk downloads

- Pre-built full-year archives via `POST /api/v2/bulk_download/list_monthly_files/` → e.g. `FY2025_All_Contracts_Full_20260706.zip` on files.usaspending.gov + delta files; refreshed ~monthly (2026-07-06 as of recon).
- Custom jobs: `POST /api/v2/bulk_download/awards/` (async: request → poll `GET /api/v2/bulk_download/status/?file_name=...` → fetch URL).
- **Naming trap**: account data lives at `/api/v2/download/accounts/` — `/api/v2/bulk_download/accounts/` 404s with an HTML page.

### C.7 USAspending risk summary

1. **Obligations ≠ outlays everywhere** — pick obligations as the canonical spend metric and label it (HHS: $2.79T obligated vs $2.72T outlayed FY2025; award-level outlays unreliable).
2. Award Amount = lifetime; per-FY recipient views must use the transactions-level category endpoint.
3. Subawards double-count vs primes.
4. Drill-down reconciles perfectly for budget_function/agency/object_class/federal_account but **breaks at recipient/award depth** (account 075-0512: $724.4B vs $672.5B in its recipient drill — unlinked gap).
5. Two government-wide denominators in play (toptier_agencies FY2026 $15.82T vs budgetary_resources FY2025 $13.26T) — never mix FYs in shares.
6. Coverage floors differ by surface: explorer FY2017+, award search FY2008+, bulk 2001+.
7. Negative rows exist (−$13.9B FCC) — treemaps need a negatives strategy.

---

## D. Cross-cutting synthesis

### D.1 Which source feeds which view

| App view | Source | Metric (label it!) |
|---|---|---|
| `/us/national` daily-bread (receipts → functions) | MTS Table 9 (+9A subfunctions) | **cash outlays/receipts** (official deficit math) |
| `/us/national` budget explorer drill-down (function → agency → account → recipient) | USAspending Spending Explorer | **obligations** (internally reconciles to the cent) |
| `/us/national` "qui reçoit" (recipients, keyed UEI/DUNS) | USAspending `spending_by_category/recipient` (transactions level) | in-window transaction obligations |
| `/us/national` debt time-machine | Debt to the Penny (daily 1993+) + Historical Debt (annual **1790+**) | debt outstanding |
| `/us/city/sf` budget | DataSF `xdgd-c79v` (adopted AAO, net) | budgeted amounts FY2010+ |
| `/us/city/sf` actuals + budget-vs-actual | DataSF `bpnb-jwfb` (gross — reconciliation rule required) | actual spending/revenue FY1999+ |
| `/us/city/sf` "qui reçoit" | DataSF vouchers `n9pm-xkyq` (+contracts `cqi5-hm2d`, nonprofit flag) | vouchers paid FY2007+ |
| `/us/city/sf` payroll | DataSF `88g8-5mnd` (year_type='Fiscal' only) | total compensation 2013+ |

**MTS and USAspending will NOT reconcile with each other** (cash outlays ≈ $7T/FY vs obligations $10.3T FY2025 — different accounting bases). One metric per view, never both on one chart; the méthode page must explain the difference.

### D.2 Coverage floors (drives the time-machine design)

- National: annual debt 1790+ · monthly totals 1980+ · monthly detail (function/agency) 2015+ · obligations detail FY2017+ · awards FY2008+ (bulk FY2001+) · accrual net cost 2001+.
- SF modern spine: actuals FY1999+ · vendors FY2007+ · budget FY2010+ · comp 2013+.
- SF archive layer (per RESEARCH-BRIEF): municipal reports 1864–1905 · budget books 1954–90s. **Gaps to label honestly: 1905–1954 and 1990s→1999.**

### D.3 Shared traps → pipeline invariants (candidate dbt tests)

1. **Subtotal/detail mixing** in every source: MTS `D/S/T` lines, DataSF employee-comp Calendar+Fiscal duplication, contracts × team-member grain, USAspending prime/sub levels. → stg models must select an explicit line-type/level predicate, with a test asserting `sum(detail) = published total`.
2. **Free self-checks verified live**: MTS T-rows = Σ D-rows; Table 9 total = Table 3 = Table 5; Spending Explorer types all sum to the same total; drill-downs sum to parent (except recipient depth); DataSF budget Revenue = Spending per FY (±$5). Encode all as tests — same spirit as Ventura's budget−actual=variance.
3. **Everything is strings**: Socrata numbers-as-strings, Treasury literal `"null"` strings, text fiscal years. Typing happens in stg, once.
4. **Units and signs are per-table facts** (dollars/millions/billions; deficit sign flips) → a `seed` mapping table per source, not code constants.
5. **Partial periods everywhere**: FY2027 in-progress at DataSF, FY2026 P8 at USAspending, MTS restatements. Every export needs an `as_of` / period-completeness field the UI can label.
6. **Entity keying asymmetry**: USAspending recipients are keyed (UEI/DUNS); DataSF vendors are raw name strings (BNY Mellon ×2 spellings) → SF needs the Paris-style name-normalization/enrichment step; national doesn't.
7. **Per-resident scaling** needs Census population (external) at both scales — same pattern as INSEE population for Paris.

### D.4 Verdict for milestone 2

All three sources are **green** — free, no-auth, machine-readable, with verified extraction recipes and self-check identities. No blocker requiring scope change. The two real design decisions recon surfaced: (a) obligations-vs-outlays labeling strategy at national scale; (b) SF budget-vs-actual reconciliation rule (net vs gross + transfer characters). Both are méthode-page material, not just code.
