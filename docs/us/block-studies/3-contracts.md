# Design brief — Block 3: `/us/city/sf/contracts`

All numbers queried 2026-07-16 against `open-data-france-484717.dbt_us_analytics.core_us_sf_contracts` (48,350 rows / 31,935 contracts) and `core_us_sf_vouchers` (8.07M rows), via `bq --use_legacy_sql=false`. "Prime-dedupe" = `GROUP BY contract_no` over `is_prime_contractor_row` rows, `SUM` amounts. Paris comparison read from `website/src/app/ville/paris/marches/` (MarchesPublicsClient.tsx, MarchesSearch.tsx, contrat/fournisseur fiches) and `pipeline/scripts/enrich/vulgarize_marches_llm.py`.

## 1. Contract landscape (measured)

**Grain roles**: Prime Contractor 31,901 rows / 31,860 contracts ($93.06B agreed), Subcontractor 16,159 rows / 2,171 contracts ($7.38B attached), Joint Venture Constituent 290 rows / 143 contracts ($0.74B). 75 contracts have **no prime row at all** (sub-only); 41 contracts have **2 prime rows** — and their amounts are additive amendments, including negative values (`1000035538`: agreed $1,230,342.68 and −$824,329.58; `1000015971`: $152,920 and −$51,620). The mart already propagates contract-level attributes onto sub rows (raw leaves them blank — only 41/16,449 sub rows lack title vs 100% blank in `raw.us_sf_supplier_contracts`).

**By type** (prime-dedupe, agreed / paid):

| Type | Contracts | Agreed | Paid |
|---|---|---|---|
| Grants (City as Grantor) | 14,475 | $18.48B | $12.77B |
| Prof. Services (Charter Authority) | 1,583 | $13.66B | $5.71B |
| Non-Purchasing (Rents, etc.) | 3,418 | $11.62B | $6.00B |
| Prof. Services & P-Form | 3,441 | $11.30B | $6.98B |
| Construction | 1,018 | $10.71B | $9.96B |
| Purchasing Contract | 4,068 | $7.78B | $1.86B |
| Construction – Unilateral | 706 | $7.15B | **$9.77B** |
| Term Commodities / OCA-exempt / Ch.6 / Term Gen. Svcs / MOU | ~4,600 | $16.3B | $7.1B |
| (null type) | 33 | $8.5M | $0 |

Nearly half of contracts are **grants the City gives out** — the page must say this: SF "contracts" ≠ Paris "marchés"; it's the whole supplier-agreement register including grants and rents.

**Purchasing authorities**: ~60 messy free-text values (top: CONSTRUCTION SERVICES $13.1B; TERM CONTRACT PROFSERV-BID $9.4B; MTA DOC BID $8.0B; AIRPORT $7.8B; COMPETITIVE SOLICITATION $6.1B) but legible enough to classify into families — several are self-describing sole-source/emergency authorities ("ADMIN CODE. SOLE SOURCE, REQUIRES SF HEALTH COMMISSION APPROVAL" — 245 contracts, $1.74B; "CHAPTER 21 EMERGENCY PROCUREMENT" $595M).

**Departments** (agreed): PUC $17.2B, DPH $14.5B, MTA $11.1B, Airport $9.7B, City Administrator $8.5B, HSA $6.0B, Homelessness $5.3B, Mayor $4.8B (5,498 contracts — grant mill).

**Terms**: median 696 days, IQR 364–1,460; earliest start 1991-12-03. The 2200-12-31 placeholder affects only **25 contracts** and the mart already nulls it (`term_end_date_is_placeholder`); 353 more have genuinely null end dates. 427 contracts end after 2040 and 320 after 2060 — mostly real (99-yr leases, PPAs: Potrero Yard agreement to 2060-08-31 $1.4B, Hitachi CBTC to 2053, Gonzaga Ridge wind PPA to 2046). **Do not cap beyond the mart's existing 2200 handling.** One junk term-start year (2099).

**Active today**: **5,126 contracts, $43.35B agreed, $23.78B paid** (incl. 390 sole-source $1.07B, 1,528 nonprofit). Expired: 26,369. That active-portfolio number is the hero.

**Amount consistency — the big finding**: summed prime rows give agreed $93.06B, consumed **$118.37B**, paid $58.19B, remaining **−$83.5B**. `consumed_amt` is garbage: Construction alone shows consumed $112.03B vs agreed $10.71B (Gene Friend Rec Center `1000026872`: agreed $140.3M, consumed **$83.35B**). The naive identity agreed=consumed+remaining fails on 28,759/31,901 prime rows. The *true* identity is **agreed ≈ paid + remaining** (grants: 12,264/14,475 pass at 0.1% tolerance; purchasing 3,857/4,068; construction only 733/1,018). Other anomalies: paid>agreed on 1,069 rows (construction-heavy — payments span modifications; Biosolids Digester JV: agreed $2.19B, paid $5.05B), negative remaining 1,671 rows, zero agreed 66 contracts, negative agreed 26.

## 2. Sole-source study — **verdict: rich, build it**

Flag values are `X`/null (not Yes/No). **1,316 contracts (4.1%), $4.18B agreed (4.5%), $1.59B paid.** Per-department variation is a real story: DPH 400 contracts (20.3% of dept count, $2.15B, 14.8% of dept $); **Police 28.8% of contracts / 29.0% of $**; Controller 23.0% of $; MTA 18.2% of count; Technology 15.1%. Per term-start year: stable 2.7–6.5% of contracts, $75M–$367M/yr, no trend cliff — a lens, not a scandal curve. Top contracts are human-readable: IHSS Public Authority $255.9M, Alstom AirTrain $128.7M, Progress Foundation mental health $113.5M, HealthRight 360 $100.9M + $91.5M, CuraScript pharmacy $98.5M, Cerner clinical data $87.5M, MTC Clipper MOU $76.1M. Dominated by health/human-services continuity-of-care nonprofits — the neutral framing writes itself (sole-source is a lawful procurement path requiring waiver/commission approval; cite the authority strings, no insinuation — per the editorial charter).

## 3. LBE — verdict: a section, not a page

Source is binary (`LBE`/`Non-LBE` confirmed in raw). LBE **primes**: 2,112 contracts, $3.58B (6.6% of contracts, 3.8% of $). But LBE participation lives in **subcontracting**: 7,801 LBE sub rows on 1,921 contracts, $3.15B attached. A combined "LBE as prime + LBE as sub" stat (~$6.7B visibility) is the honest, interesting view — LBE program compliance happens through primes hiring LBE subs (Ronan Construction: 78/84 sub rows LBE; AGS Inc 64/70).

## 4. Subcontracting — viable, but v2

2,171 contracts (6.8%) have named subs; median 5, max 197. Sub rows DO carry dollars (15,396/16,159 rows, $7.38B). The graph is real: **Hensel Phelps → 241 distinct subs, $1.23B** across 3 contracts; Austin Webcor JV → 266 subs $583M; Turner → 234 subs. Top subs: Gensler $300.2M, Rosendin Electric $179.1M, Kuth Ranieri (LBE) $119.7M. Caveat: on 486/2,171 contracts sub-$ exceeds prime agreed — never sum prime+sub in one figure. Recommendation: ship a **"project team" tab on the contract fiche** in Block 3 (cheap, per-contract, self-contained); defer the cross-contract "who subcontracts to whom" explorer to v2 with the reconciliation caveat rendered.

## 5. Data quality quantified

- Missing `contract_no`: **1 row, $1M** — non-issue in core (recon's "some rows" resolved upstream).
- Junk titles: literal junk ≤ 1 contract, but 848 titles ≤5 chars ("PG&E", "H", "86"), 5,180 ≤15 chars (16%), and **18,915 (59%) start with dept-code prefixes** ("PW ", "AIR-", "PUC_", "DPH -"). Titles are admin shorthand, not public-readable.
- **`scope_of_work` is NOT prose — it's capped at 50 chars** (median 24, max 50). Top values: "Unspecified" (2,652), "Prime" (788+154), FY-batch labels ("ADMGA FY22 GOS Arts" ×377), or a truncated copy of the title. Random-15 sample confirms: scope ≈ title. **There is no descriptive text anywhere in this dataset** — vulgarization must be *generated* from title+type+dept+authority+prime+amounts, not extracted.

## 6. JOIN TEST — contracts → vouchers: **passes**

Vouchers carry `contract_number` on $55.27B of $169.45B lifetime paid (33%); 29,842 distinct numbers of which **29,048 match the contracts table (97.3% of numbers, 99.1% of dollars = $54.75B)**; 91% of contracts have voucher activity. Coverage starts **FY2018** (PeopleSoft break): FY2018 $2.96B/4,720 contracts → FY2025 $7.97B/7,900 → FY2026 $7.77B. Spot-check: Alstom `1000006337` voucher sum $28.57M ≈ `pmt_amt` $28.6M — **`pmt_amt` is lifetime voucher payments; per-contract spend curves are trustworthy FY2018+**.

## 7. Paris pattern transfer map

**Transfers directly**: page skeleton (PageTOC ~9 sections, header + PageHook + hero); S01 HeroNumber + KPIGrid 4-up; ExpandableList of top primes with inline contract tables linking to fiches; client-side MarchesSearch with three-tier seed suggestions (brand seeds → McKesson/Turner/Siemens/HealthRight 360; theme seeds → "housing", "mental health", "pharmacy"); the top-1/3/5/10 concentration note; ChartSource + ExportRow + méthode anchors; the **contrat fiche pattern with vulgarization JSON** (`objet_clair` → `title_plain`) — SF is *better placed* than Paris here because `contract_no` is a real key (no SIREN problem).

**Does not transfer**: CPV categories → nearest analog is `contract_type` (12 values) + department; StackedBarTheme works on those. The S06 procedure/concurrence section (mono-offer %, offers received) has no SF data — **replace with the sole-source twin-stat** (same visual: big % + histogram by department), sourced from `sole_source_flg` + purchasing-authority families. "Notified in year Y" framing → SF is a **living register with term windows**, not an annual notification flow; the year selector must mean "active during FY" or be dropped for an active/all toggle. Fournisseur fiches by SIREN → blocked on name normalization (same blocker as payees). FournisseursBumpChart → possible later via the voucher join per FY, after normalization.

---

## Architecture implications

**Marts (3):**
1. `mart_us_sf_contracts_summary` — contract grain. Dedupe = `SUM(amounts) GROUP BY contract_no WHERE is_prime_contractor_row` (correctly nets the 41 multi-prime amendment pairs, incl. negative rows); `ANY_VALUE`/`MAX` for dims; exclude the 75 sub-only contracts from money views. **Drop `consumed_amt` entirely** (−$83.5B remaining proves it). Ship `agreed`, `paid`, and derived `remaining_calc = GREATEST(agreed − paid, 0)` + boolean `amounts_reconcile` (|agreed−paid−remaining_src| ≤ 0.1%) — display source `remaining_amt` never. Carry `is_active` (term_end ≥ today, null-end = unknown bucket), sole-source, LBE, non_profit, purchasing-authority family (seed).
2. `mart_us_sf_contract_spend_by_fy` — contract × FY from the voucher join, FY2018+ (fiche spend curves; ~29k contracts).
3. `mart_us_sf_contract_team` — contract × team member (role, LBE, sub-$) for fiche team tabs + LBE aggregates. Never unioned into money totals.

**Exports**: `contracts_overview.json` (hero actives 5,126/$43.35B, by-type, by-dept, sole-source aggregates per dept/year, LBE prime+sub, top actives, top sole-source); `contracts_active.json` (~5.1k rows for the search/table: no, title, title_plain, prime, dept, type, flags, agreed, paid, start, end); per-contract fiche JSONs for actives + top-$ + sole-source (~6k files, Paris pattern). Every export row carries source_url to `cqi5-hm2d` (zero-hardcoded-numbers rule).

**CI grain test** (Block 3 acceptance): assert `SUM(agreed)` over prime-dedupe = $93.06B ± export totals; assert no export sums all 48,350 rows (that inflates agreed by ~$8.1B of sub/JV rows).

## AI-enrichment opportunities

1. **Title vulgarization** — highest value. 59% of titles are dept-code shorthand; no scope text exists to fall back on. Volume: ~6k priority items (5,126 active ∪ 1,316 sole-source ∪ top-500 by $), full corpus 31.9k. Reuse `vulgarize_marches_llm.py` shape (`objet_clair`/`quoi_concretement` → `title_plain`/`what_concretely`), EN-only so simpler than Paris. Input context is short and structured (title, type, dept, authority, prime, $) → **good local-model candidate** per the in-session doctrine; also add a deterministic prefix-stripper (à la `normalizeObjet`) as the no-enrichment fallback.
2. **Supplier-name normalization** — 6,630 distinct primes; **5,821 (88%) exact-match voucher vendor names** → one canonical-name table serves both the payees workstream and contracts, and unlocks contract↔who-gets-paid cross-linking + supplier fiches. Do it once, in the payees block.
3. **Purchasing-authority taxonomy** — ~60 values → ~8 families (competitive bid / sole-source waiver / emergency / grant / government agreement / rent / legacy / other). One-shot seed file, human-reviewable, powers the procedure section.

## UI recommendations

- **Hero**: "5,126 contracts active today — $43.4B agreed, $23.8B paid so far." KPIGrid: contracts on the books (31,935), sole-source share (4.1% / $4.2B), LBE participation ($3.6B prime + $3.2B sub), nonprofit contracts (12,615 / $24.7B → cross-link who-gets-paid).
- **Landscape**: StackedBarTheme by contract_type with plain-English relabels ("Grants the City gives out", "Rents & leases"…), department ranked bars secondary.
- **Sole-source lens** (signature section): Paris-S06 twin-stat layout — big "4.1% of contracts / $4.2B" + per-department histogram (DPH 20%, Police 29% of $) + top-10 sole-source ExpandableList with authority string rendered verbatim as the neutral "why" ("Admin Code sole-source waiver, Health Commission approval").
- **Active-contracts table**: default filter = active; columns title_plain / prime / dept / agreed / paid-progress bar (paid/agreed, capped at 100% with an "exceeds agreed" marker for the construction cases) / ends-on. Term-window mini-gantt on the fiche. Null end dates shown as "no end date recorded", never sorted as active.
- **Contract fiche** (drawer, root-level per drawer doctrine): title_plain h1, raw title as kicker, spend curve FY2018+ from vouchers (with "payment detail begins FY2018" note), project-team tab with LBE badges, sole-source badge + authority.
- **Search**: MarchesSearch port with brand seeds (McKesson, Turner, Siemens) + theme seeds (housing, mental health, pharmacy, shelter).

## Killer features ranked by data-readiness

1. **Sole-source lens** — 100% ready, query-proven, SF-only (France can't do this). Build in Block 3.
2. **Largest active contracts with paid-progress** — ready; the actives list is star material (Biosolids $2.2B, Turner T3-West $1.75B, McKesson pharma, Siemens LRVs, Hitachi CBTC to 2053, Gonzaga wind PPA to 2046).
3. **Contract fiches with real spend curves** — ready now (keyed on contract_no; 99.1% $ join) — SF gets fiches *before* payees do; ship a top-N in Block 3.
4. **LBE participation section** — ready, medium wow.
5. **Subcontracting explorer ("who builds SF": Hensel Phelps → 241 subs)** — data present, reconciliation caveats; v2.
6. **Supplier fiches / multi-year bump chart** — blocked on name normalization; after payees enrichment.

## Risks

1. **`consumed_amt`/`remaining_amt` are unpublishable** (remaining sums to −$83.5B) — if either leaks into an export the page loses credibility; enforce by never selecting them into marts.
2. **paid > agreed on construction** (1,069 contracts; Biosolids paid 2.3× agreed) — needs a méthode note ("payments accumulate across modifications; 'Unilateral' contracts are change-order vehicles"), else it reads as an error or a scandal. No invented methodology claims.
3. **Sole-source framing** — dominated by mental-health/social-service nonprofits; neutral service-framing mandatory (lawful waiver path, authority cited), no "no-bid deals" vocabulary.
4. **Grain double-count** — summing all rows inflates agreed ~$8.1B; the acceptance grain-test must be in CI, not a one-off.
5. **Year-semantics confusion** vs Paris (register vs annual flow) — copy must define "active"; in-progress FY2026/27 vouchers on spend curves need the partial-year label.
6. **Titles without vulgarization** — shipping raw "PUC_CPSF_SYSTEMENERGY3201-FY24" fails the wow-bar; the deterministic cleaner must ship in Block 3 even if the LLM batch lands later.
7. **Grants-inside-contracts overlap with who-gets-paid** — $18.5B of "contracts" are grants; without an explicit sentence the two pages look contradictory.
