# Notes — the US local-government universe (from Daniel's research session, 2026-07-16)

**Provenance: endpoints and figures below were probed live in a separate research session of Daniel's on 2026-07-16 and pasted into the build session. They looked verified there (HTTP 200s, arithmetic checks) but were NOT re-verified by the build pipeline — re-verify before building on any of them.** Punchline of that session: *"a map of what's up around you is buildable for every address in America, from one sync, today."*

## What was found (and worked)

1. **Municode has a usable JSON API** (unofficial, no auth observed):
   - `api.municode.com/Jobs/latest/{productId}` → latest code supplement metadata (verified for Sheridan CO, productId 13923).
   - `api.municode.com/CodesContent?jobId={id}&nodeId={node}&productId={pid}` → full structured article text (verified: Sheridan occupation-privilege-tax article, 85 KB JSON, clean text).
   - ProductId discoverable from city sites' gateway links (`municode.com/resources/gateway.aspx?productid=…`).
2. **Census of Governments** (2025 organization file): **91,438 local government units** — 38,704 general-purpose (3,031 counties, 19,489 municipalities, 16,184 townships) + 52,734 special-purpose (40,199 special districts, 12,535 independent school districts). Arithmetic verified in-session. This is the *universe* for any nationwide place registry.
3. **Census "First Look" state & local finances** (2024, xlsx): total revenue/expenditure per state × level of government, with CVs — the fastest national fiscal denominator per state.
4. **BEA NIPA Section 3** (`S3full.xlsx`, 63 sheets): government current receipts/expenditures **annual 1929→2025** (T30100), **expenditures by function 1959→2024** (T31600), quarterly variants. Machine-readable, published quarterly.
5. **Local income/payroll taxes**: ~10 states have county/city income taxes (Tax Foundation FF2026 footnote, effective rates by state: MD 2.4%, NY 1.6%, OH 1.2%, KY 0.93%, PA 0.99%…); plus payroll/wage-tax oddities in CA/CO/DE/KS/NJ/OR/WV (e.g. Sheridan CO $3/month occupation privilege tax — extracted from Municode; Jersey City 1% employer payroll tax; Philly wage tax; Seattle payroll expense tax; NYC resident income tax). Per-state Census place-population CSVs (`sub-est2024_{fips}.csv`) confirmed working per-state.
6. Blocked source noted: legislature.mi.gov refuses connections (ECONNREFUSED) — Michigan statute texts need another route (e.g. law.justia.com).

## How this plugs into our roadmap (no new workstream until Daniel picks)

- **`/us/national` time-machine upgrade (nearest-term candidate)**: BEA T31600 gives a function-level spending series back to **1959** — our MTS floor is 2015 (detail) / 1980 (totals). Different accounting basis (NIPA accrual vs MTS cash) → would ship as a separate labeled series, never mixed on one chart (same discipline as MTS-vs-USAspending). One sync script + one dbt family addition.
- **"Rules around you" / ordinance layer (later)**: the Municode API is the machine-readable route to municipal codes for thousands of cities — feeds the RESEARCH-BRIEF's ordinance-diff idea and a possible "local taxes & rules for your address" feature. Unofficial API: cache aggressively, expect breakage, verify ToS before anything public.
- **Registry universe (later)**: Census of Governments = the authoritative list behind a nationwide place registry (91k units vs our current 5 hand-entries in places.json). Scope decision for after SF.
- **Local-tax layer (later, big)**: the per-address civic-context idea ("what's up around you") = CoG units + place populations + local tax facts + Municode rules. A genuine differentiator, but a separate product conversation — parked here until deliberately scoped.
