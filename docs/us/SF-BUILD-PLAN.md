# SF pages — build plan

**Status: PROPOSED 2026-07-16, awaiting Daniel's go per block.** Companion to [SF-PAGE-SCOPE.md](SF-PAGE-SCOPE.md) (what & why) — this is the *how*, one block at a time per the working agreement. Data layer is merged and tested (163/163); each page block below = (small export extension) + (page) + (verification), sized to be one confer-able unit.

## UI doctrine (applies to every block — "similar but adapted")

- **Same design system**: fusion primitives imported directly (SectionHead, HeroNumber, KPIGrid, BarRow, StackedBarTheme, BudgetTreemap, BalanceStack, ExpandableList, AnimatedNumber). Fork only when a primitive can't express it (the `UsDebtChart` precedent) — every fork gets a LEARNINGS row.
- **US formatting is a family concern**: promote `app/us/national/us-format.ts` → `src/lib/us/format.ts`, shared by all `/us` pages (en-US grouping, `$`, magnitude suffixes, UTC dates).
- **US chrome**: minimal EN header/nav shared by `/us/*` (working-title wordmark, national ↔ SF switcher from `places.json`); French ChatPanel/SearchModal suppressed on `/us` routes. No invented brand.
- **Copy rules**: EN-only (`us.sf.*` keys mirrored into fr.ts), neutral service-framing (never "taxpayer money"), no invented methodology, every number from exports, every section with a visible `Source:` link.
- **Verification per block** (auto-eval): build green; rendered numbers spot-checked against export JSONs (5 minimum, listed); Playwright desktop+mobile screenshots reviewed by me before "done"; negatives never inside share/length visualizations.

## Block 0 — Foundation sync (S)

Merge `main` (now = routes-v2) into `us-v0` — tree is clean since Daniel's WIP commits landed. Then: US chrome component + registry-driven US nav; suppress French chat/search on `/us` routes; single dev server serves `/fr/*` + `/us/*`; promote `us-format`.
**Acceptance**: build green; France pages pixel-unchanged (screenshot pass on Paris budget + national daily-bread); `/us/national` unchanged but with US chrome; ChatPanel absent on US routes.

## Block 1 — `/us/city/sf/budget` (L) — the Paris-pattern page

**Export extension**: `budget_breakdown.json` (per FY: org group → department, and character/object economic view; both sides; transfer-adjustment lines carried separately, never netted silently) + department-level operating budget-vs-actual series.
**Page sections**:
1. Hero: adopted FY2026 net AAO ($15.99B), per-resident, year selector FY2010→2027. **Paris pattern**: closed years show *executed*; FY2026/27 show *adopted* with the exact caveat treatment Paris uses ("adopted — execution publishes through …"; year-2 enterprise-estimate note from recon).
2. Where it goes: org-group → department ranked bars/treemap (7 org groups ≈ thématiques altitude), economic view (character/object) as secondary tab. Negative transfer-adjustment lines in a labeled offsets block (national-page precedent).
3. Voted vs executed: **Operating-perimeter spine** FY2010→2025 (budget line + actual line + residual bars; COVID −16.8% FY2021 annotated neutrally; systematic under-execution visible). All-funds totals per side shown separately with the méthode note. Département-level under/over-execution table (top deviations).
4. Revenue side: same treatment, forecast-vs-actual ±8%.
5. Sources + méthode note: the comparable-perimeter explanation (LEARNINGS row), links to xdgd-c79v / bpnb-jwfb.
**Acceptance**: FY2025 total renders $15,917,870,152-consistent; operating FY2024 residual −0.4% visible; caveat renders on FY2026/27; 5 spot-checks listed; screenshots reviewed.

## Block 2 — `/us/city/sf/who-receives` (M) — name pending Daniel (default: "Who gets paid")

**Export extension**: payee → top departments/programs aggregation (from vouchers mart), nonprofit-only slice.
**Page**: FY selector 2007→2026; default ranking **excludes** the fiscal-agent/pass-through bucket behind a visible toggle ("include debt service & pass-throughs") with the caveat rendered; nonprofit view as first-class tab (Paris qui-recoit spirit); payee rows show dept/program context. No payee fiches yet (blocked on name-normalization enrichment — separate later block, candidate for local model per eval).
**Acceptance**: JPMorgan $1.86B appears only when toggle on; bucket labels visible; FY2025 sum consistent with $16.75B; screenshots.

## Block 3 — `/us/city/sf/contracts` (M)

**Export extension**: contracts mart + export (dedupe grain: prime-contractor rows or distinct contract_no — per recon trap; term-date capping).
**Page**: contract types ranked, award vs spent vs remaining, **sole-source lens** (count + $ share, neutral framing), LBE status view, largest active contracts list.
**Acceptance**: no double-counted award sums (grain test referenced); screenshots.

## Block 4 — `/us/city/sf/payroll` (M) — pending Daniel's aggregates-only confirmation

**Export extension**: from `mart_us_sf_comp_by_year`: totals by year/dept/job-family, overtime share, distribution percentiles. **Aggregates and distributions only — no individual rows** (even pseudonymized).
**Page**: total comp trend 2013→2025 ($6.92B FY2025, ~40.8k employees), dept ranking, overtime lens, salary-vs-benefits split.
**Acceptance**: FY2025 = $6.919B / 40,786; year_type='Fiscal' only; screenshots.

## Block 5 — `/us/city/sf` landing hub (S–M)

After ≥2 pages exist. Signature scenes (candidate: Laguna Honda from voucher data — Daniel to confirm), headline stats, cards into the four sections + national. Wow-bar applies (matérialité first, % second).

## Later (separately scoped, not in this plan)

Payee name-normalization enrichment (→ fiches), functional-taxonomy crosswalk (Paris-style themes for SF, enrichment), ACFR/archive time-machine layers (own milestone, IA pitch), BEA 1959+ national series, chat place-pack.

## Defaults adopted pending Daniel's scope answers

1. Page name "who gets paid" (change anytime before Block 2).
2. Payroll = aggregates-only (Block 4 gated on explicit OK).
3. Landing scene = Laguna Honda (Block 5 gated).
