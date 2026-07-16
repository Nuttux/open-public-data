# SF pages — scope proposal

**Status: PROPOSAL (2026-07-16) — nothing gets built until Daniel validates. One build block per section, confer between blocks.** Data grounding: [API-RECON §A](API-RECON.md) (all verified live) + the Phase 2 data slice (in flight; budget-vs-actual reconciliation verdict pending).

Principle: same fusion design system and page rhythm as France, EN-only, `us-municipal` schema family. But the page inventory is NOT a Paris copy — where SF data is missing the section disappears (Marseille "option a" rule), and where SF data is *richer* than France it gets sections France never had.

## Page-by-page mapping (France → SF)

| France | SF | Verdict |
|---|---|---|
| `/budget` | `/us/city/sf/budget` | **RICH — build.** Adopted AAO FY2010→2027, dept/program/character/object/fund drill-down, actuals FY1999→now refreshed weekly (France: annual). Budget-vs-actual: **pending the reconciliation verdict** — honest perimeter or two separate labeled series. |
| `/qui-recoit` | `/us/city/sf/who-receives` | **RICH — build, with care.** Vouchers = ALL city payments (suppliers + grants + debt service), not just subsidies — wording must say so. Fiscal agents/banks must be bucketed or the top-10 is JPMorgan/BNY/DTC. Nonprofit money is a first-class sub-view (`non_profit_indicator` + the dedicated nonprofit-spending dataset). Payee *fiches* need name-normalization enrichment first (names are unkeyed strings — no SIREN equivalent). |
| `/marches-publics` | `/us/city/sf/contracts` | **RICH — build.** 31,935 contracts with award/consumed/paid/remaining, contract types, **sole-source flag** and local-business (LBE) status — two lenses France doesn't have. French procurement vocabulary (DECP, CPV, seuils) does not map; wording from SF's own fields. |
| `/investissements` | capital slice of budget page | **PARTIAL.** No capital-projects dataset audited; budget's Capital Projects fund type covers part. Dedicated page only after a source audit (SF 10-year capital plan exists as documents). |
| `/logement-social` | — | **NEEDS AUDIT.** "Affordable Housing Pipeline" dataset exists on DataSF but was not in the recon. Don't commit to the page yet. |
| `/dette-patrimoine` | — | **SKIP v0.** No bonded-debt dataset audited; it lives in ACFR PDFs (extraction = later milestone). |
| `/analyses` | same mechanism | **CHEAP.** MDX blog with SF tags, EN. |
| daily-bread calculator | does not transpose | **REPLACE.** No city income tax — the FR contribution model is meaningless here. Replacement: "what $100 of SF spending buys" + per-resident materiality view. |
| City landing | `/us/city/sf` | Signature-scene rule applies: a real project, a real nonprofit, a real contract, the payroll number. Scene choice = Daniel's call. |

## SF-only capabilities (France cannot do these — the "extra" you asked about)

1. **Employee compensation explorer** — $6.9B, ~41k employees, salary/overtime/benefits by department and job, 2013→now. No Paris equivalent exists at all.
2. **Next year's budget today** — SF adopts two years at once; FY2027 is already in the data.
3. **Weekly-fresh actuals** — France sees execution once a year in the CA; SF updates weekly.
4. **Sole-source lens** on contracts.
5. **The time-machine, 1864→2026** — archive layer (municipal reports 1864–1905, budget books 1954–90s) page-linked into Democracy's Library. The killer feature and the IA pitch; separate milestone after the modern spine.

## What we cannot display (the honesty list)

- **Proposed vs adopted budget** — no phase field exists anywhere on the portal; adopted only.
- **Pre-1999 machine-readable data** — archive scans only (that's the time-machine's job, clearly labeled).
- **Payee identity** — vendor names are unkeyed (BNY Mellon under 2 spellings); no fiches until normalization enrichment runs.
- **Money by district** — the finance datasets carry no supervisor-district column; there is no SF equivalent of the arrondissement choropleth for budget/vouchers. Maps only where a dataset actually has geography.
- **Cross-country comparisons** — excluded by design (ADR-0010): different accounting bases.

## Enrichment plan (existing doctrine: in-session batches; local model if the eval verdict allows)

Payee name normalization + classification (the Paris associations pattern), contract-title plain-English rewrites, fiscal-agent bucket review. All batched JSONL, provenance-flagged as enrichment, never overwriting source fields.

## Proposed build order — one block each, confer between

1. SF **budget page** (+ minimal landing) — data is already in the slice.
2. **Who-receives** with bucketing + nonprofit view (needs the payee-bucket seed + normalization pass).
3. **Contracts** with sole-source lens.
4. **Compensation explorer** — decide first how granular we publish (rows are pseudonymized individuals; page shows aggregates + distributions, never row-level "employee 33774 earns X" framing).
5. **Time-machine** (own milestone, ties to the IA pitch).

## Open questions for Daniel

1. Naming: "who-receives"? "where the money goes"? (EN voice of "qui reçoit".)
2. Compensation page: aggregates-only stance OK? (Recommended: yes — dept/job aggregates and distributions, no individual rows even though pseudonymized.)
3. Landing signature scene: a candidate is Laguna Honda Hospital (biggest single service story in the voucher data) — pick or propose.
4. Build order above OK, or reorder?
