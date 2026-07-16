# Block 5 design brief — `/us/city/sf` landing hub + signature scenes

All numbers queried live from `open-data-france-484717.dbt_us_analytics.core_us_sf_*` / `dbt_us_marts.mart_us_sf_*` on 2026-07-16. Paris landing v3 pattern honored: hook only, HeroDeck of 4 concrete cards, marquee ticker, chip strip to sections — **no allocation charts on the landing**.

**Key discovery up front:** the Laguna Honda scene is only traceable via `program` through FY2017 — all 5 Laguna program labels die at the FY2018 chart-of-accounts break. It survives via its **enterprise funds** (`fund_code LIKE '%LHH%'` + legacy `5L*` funds), giving an unbroken FY1999→FY2026 series. The scene is buildable, but the export must be fund-based, not program-based.

## 1. Signature-scene candidates (ranked by wow-per-honesty)

**S1. Laguna Honda Hospital — the city runs its own nursing home** (rank 1)
- Actuals via LHH funds, Spending side, excl. RGU: FY1999 **$119.9M** → FY2025 **$402.5M** (FY2026: $380.4M, still accruing). 27-year unbroken series; mid-2000s rebuild visible (FY2006 $245.8M, FY2009 $292.8M).
- What it buys, FY2025: Salaries **$185.6M** + fringe **$72.4M** (≈64% staff), non-personnel services $62.4M, materials & supplies $26.1M.
- Real vendors FY2025 on LHH funds: McKesson pharmaceuticals **$6.91M**, Medline **$5.47M**, US Foods **$3.03M**, Allied Universal security **$2.45M**, S J Amoroso construction **$29.99M**.
- Deep-links: budget page (fund/program drill) + who-gets-paid (dept=DPH). **Do not hardcode the bed count** (769 is public knowledge but not in our data — sourced enrichment or omit). Copy note: post-2018 tracing is by fund — "Laguna Honda's own operating and capital funds."

**S2. New Muni trains — Siemens Mobility** (rank 2)
- Contract 1000012860: award **$1,013.2M**, paid $623.5M, term 2018→2029. Vouchers: **$138.2M in FY2025** under "Automotive & Other Vehicles"; all Siemens payments from MTA cumulate to **$930.9M** (FY2007–2026). Companion: New Flyer (Muni buses) $889.7M cumulative.

**S3. Meals on Wheels — 21 straight years** (rank 3)
- **$151.9M total, FY2007→FY2027 (every single year), $16.2M in FY2025.** The most recognizable, least attackable nonprofit line. Chosen over the bigger homelessness nonprofits (see Risks).

**S4. SFO Terminal 3 West — Turner Construction** (rank 4)
- Contract 1000008346: award **$1,749.8M**, paid $1,096.2M, remaining $639.7M, 2017→2029. Turner cumulative airport vouchers: **$1,561.7M since FY2008**. Mandatory honesty line: the airport is an enterprise fund — paid by airlines and passengers, not the general fund.

**S5. The biggest contract in the books is a sewage plant** (rank 5)
- Southeast Treatment Plant biosolids, MWH/Webcor JV: award **$2,194.3M** (largest active), vouchers **$1,937.8M since FY2020**, to 2028. Data trap: contract `pmt_amt` says $5,052M — **contract payment fields unreliable; scenes must use voucher sums**.

**S6. Overtime — the 24/7 city** (rank 6, payroll page not landing-hero)
- FY2025 OT **$471.0M** (9.0% of salary, vs 5.8%/$163.7M FY2013). Police $147.2M (2,230 earners, avg **$66,019**), MTA $77.1M, Fire $69.4M, DPH $65.3M (1,512 RNs earned $22.6M). Landing-safe version: total + "transit operators, nurses, firefighters" framing, never per-officer averages.

**S7. Library e-books** (rank 7) — FY2025 LIB: OverDrive **$4.75M**, Midwest Tape $4.62M, Baker & Taylor $3.16M. "Your Libby holds are a line item."

**S8. SF Zoo** (rank 8) — SF Zoological Society **$87.3M over 21 years**, $4.3M FY2025. Ticker yes; card borderline (mild newsiness).

**S9. Children's Council — childcare at scale** (rank 9) — $0.6M (FY2007) → **$173.7M (FY2026)**; active grant 1000036005 award **$436.4M** (2025–2028). Needs careful "childcare subsidies flow through this clearinghouse" framing (Baby-Prop-C politics).

**S10. Wind power through 2046** (rank 10) — CleanPowerSF PPAs FY2026: Gonzaga Ridge **$696.3M** (2026–2046), SunZia South **$342M**; Hetch Hetchy "Power for Resale" $357.9M FY2025. Contracts page, not landing (multi-decade totals read misleadingly next to annual figures).

Pedagogy example (who-gets-paid, not a scene): Kaiser **$523.3M FY2025** = employee/retiree health premiums — best example that "vouchers = all payments, not subsidies."

## 2. Headline KPI candidates → recommend 4

| Candidate | Number (queried) | Verdict |
|---|---|---|
| Adopted budget FY2027 | **$16,234,417,626** (FY2026 $15,990,860,523; FY2025 $15,917,870,152) | **KEEP** — hero FY2027 with year-2 caveat visible ("next year's budget today" is an SF-only flex); we are in FY2027 since 2026-07-01. |
| Per-resident | FY2025 executed **$19,269/resident/yr = $53/day** (pop 826,079, matched year) | **KEEP** as $/day. Don't compute for FY2026/27 (no matched pop). |
| Freshness | vouchers `data_as_of` **2026-07-11**; FY2026 closed June 30, already **$16.8B / 496,685 payments / 6,526 payees** | **KEEP** — the credibility KPI France can't match. |
| Payroll | FY2025 **$6.919B**, **40,786 people**, median $160,083 | **KEEP** (headcount + total; median on payroll page). |
| Nonprofit share | FY2026 **$3.41B to 1,188 nonprofits = 20.3%** | Card-level on who-gets-paid card (FY2018+ footnote), not hub KPI. |
| Active contracts | **5,128 active, $43.36B awarded** | Card-level on contracts card. Never show summed remaining (−$96B junk). |

Recommended 4: **FY2027 adopted budget (caveated) · $53/day per resident (FY2025 executed) · payroll $6.9B/40,786 · updated-weekly freshness.**

## 3. Trend stories (flagged, not editorialized)

- **Budget 2010→2027: $6.68B → $16.23B (2.4×).** Neutral-safe as a series; charged juxtaposed with population. Budget page, not landing.
- **Population × per-resident:** pop 875,139 (2020) → 816,169 (2021) → 826,079 (2025); per-resident $14,071 (FY2020) → $19,269 (FY2025), **+37% in five years**. POLITICALLY CHARGED — budget page with matched-year sourcing, never a hub hook.
- **COVID execution dip:** FY2021 operating −16.8%; back to −0.4% by FY2024. Neutral-safe annotated. Caution: FY2026 currently reads −8.7% only because accruals are still posting — do not render FY2026 residual as final.
- **Overtime 2013→2025:** $163.7M → $471.0M. CHARGED — payroll page with headcount context.

## 4. Ticker material (voucher/contract-real, bucket-clean)

Meals on Wheels $16.2M FY2025 · Siemens (new Muni trains) $138.2M · OverDrive (library e-books) $4.75M · SF Zoological Society $4.3M · Rosenbauer (fire engines) $1.83M · Braun Northwest (ambulances) $2.09M · US Foods (Laguna Honda kitchens) $3.03M · Turner (SFO T3 West) $306.5M · Children's Council $149.2M · Recology Sunset Scavenger $10.0M · spares: SF Symphony $4.84M, McKesson $82.8M.
**Blocker: Paris ticker items link to entity drawers; SF payee fiches are blocked on name normalization. v0 ticker links to filtered section views (or non-clickable), never fake fiches.**

## 5. Hub structure options

**Option A — Paris mirror (recommended).** H1 hook + scope switcher → HeroDeck 4 cards: Laguna Honda (S1), Muni trains (S2), Meals on Wheels (S3), payroll KPI-card → marquee ticker → scale section ("$53 a day for every resident" as the ACTE-2 number) → chip strip: Budget / Who gets paid / Contracts / Payroll / US federal budget → method strip (3 sources, GitHub).
**Option B — freshness-led.** Same skeleton, hero sub-line: "FY2026 closed on June 30. 496,685 payments, $16.8 billion — already public, updated weekly." Risk: numbers-first hero is colder.
**Option C — single-scene hero** (full-bleed Laguna Honda photo). Highest emotional wow, needs a licensed photo, hangs the landing on one story. Not v0.

Recommendation: **A, with B's freshness sentence as the hero sub-line.**

EN copy tone samples (service-framing, never "taxpayer money"):
- H1: "See where San Francisco's money goes." — sub: "Budget, payments, contracts and payroll — from the city's own books, updated weekly."
- Laguna Honda card: "The city runs its own hospital for long-term care. $402M a year — nurses' salaries, medicine, three meals a day."
- Muni card: "New trains, bought in public. $1.0B contract with Siemens; $138M paid in FY2025."
- Meals on Wheels card: "21 years, every year. $152M to Meals on Wheels since 2007."
- Payroll card: "40,786 people run the city. $6.9B in pay and benefits in FY2025."

## 6. Risks (gotcha audit)

- **Homelessness nonprofits** (Tenderloin Housing Clinic $641.9M/20yrs, Episcopal Community Services $610.6M, Five Keys $57.3M FY2026) are the biggest nonprofit lines but sit inside SF's most toxic discourse — who-gets-paid as data, never landing scenes. Meals on Wheels carries the "long relationship" story without the blast radius.
- **Police OT average** ($66k/OT-earning officer) is a ready-made exposé stat — landing never shows per-person OT.
- **Per-resident +37% / shrinking population** — budget page with sources, never a hub hook.
- **Laguna Honda 2022 Medicare decertification** — scene is "what running it takes", zero crisis retrospective; history goes to a sourced /analyses post if ever.
- **Children's Council growth** reads as Prop C politics — copy stays at "childcare subsidies flow through."
- **Bank payees** must never surface on hub/ticker — bucket exclusion default.
- **Data traps**: contract pmt/remaining unreliable (voucher sums only); nonprofit flag FY2018+; Laguna tracing fund-based post-2018; FY2027 = year-2 estimates; FY2026 actuals still accruing despite the completeness flag.
