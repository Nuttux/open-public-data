# Block 6 — SF *lieux* (place fiches): can they be a real money join surface?

**Status:** scoping. **Date:** 2026-07-21.
**Verdict up front:** **Yes — and my earlier "SF has no place-level money" claim was
wrong.** It was measured badly (active-only contracts vs. 63 hand-picked aliases).
SF publishes *billions* in place-attributable capital spend; the work is matching,
not existence. This doc scopes how to reconstruct the Paris lieu ("X spent to
renovate park Y") for SF, with the datasets, join strategies, precision, and a
phased plan.

---

## 0. The correction

The Paris lieu fiche is a join surface: délibérations + BMO + marchés + subventions
converge on a place. My first pass concluded SF couldn't do this because contracts
only name a place ~17% of the time. **That number came from testing only the ~5,100
*active* contracts against the 63 famous seed places with a ≥6-char literal match.**
It measured the weakest possible join, not the data.

The real corpus: **31,901 contracts**, **8M voucher lines**, **$4.37B of GO-bond
capital actually expended**, **8,356 geolocated DPW projects**, and a **gazetteer of
~1,734 city facilities (+2,687 Rec/Park features) each with address + APN + geometry.**
The user was right: "there must be a contract for construction of building XXX,
renovation of park XYZ." There is. See §3 for per-place proof.

---

## 1. What the Paris lieu shows vs. the SF source that carries it

| Paris lieu element | SF equivalent | Dataset(s) | Grain of the money |
|---|---|---|---|
| Marchés / chantiers (construction, renovation) | **GO Bond projects + DPW projects + construction contracts** | `m793-kis4`, `d3dc-v5yr`, `btxj-k9uh`, `core_us_sf_contracts` | Project / contract — **place-level** |
| Montants from délib text ("X inscrit au budget") | **GO Bond *expended* $** | `m793-kis4` (`expended`, `revisedbudget`, `bondauthamount`) | Bond program item — **place-level for named facilities**, program-level for categories |
| Investissement (invest[]) | **Facility Conditions Assessment** (renewal need, condition) | `dza3-i9eu` | Site — place-level but *need*, not spend; 2016; REC-only |
| The place's physical identity (address, arrondissement) | **City Facilities registry** | `nc68-ngbr` | Facility — address, APN (`block_lot`), owned/leased, sq ft, geometry |
| Subventions to on-site associations | — | — | **Does not exist** (no place↔association graph; `city_tenants` = the city dept, not third-party orgs) |
| Résidents / exploitant | Owning department + `owned_leased` + `city_tenants` | `nc68-ngbr` + budget/payroll | Department-level (honest as "operated by") |
| BMO récit (archive narrative) | Internet Archive scans | existing `sf places` pipeline | Already built — the strong part |
| Payroll | Department payroll | existing | **Department-level only** (unchanged; never place-level) |

---

## 2. The datasets (audited 2026-07-21, live on DataSF)

### Money — place-level (the new capability)

- **GO Bonds Program Spending & Status** — `m793-kis4` — *updated 2026-04-25.*
  151 program items. Fields: `expended` (**actual $ spent**), `revisedbudget`,
  `bondauthamount`, `issuedtodate`, `remaining_balance`, `voter_approved_date`,
  end dates. **$4.37B expended / $8.14B budget all-time.** ~29 items are single named
  facilities (exact place $ — *ZSFG Building 5 $323M, Southeast Health Center $72M,
  Ambulance Deployment Facility $89M*); the rest are program categories
  (*Neighborhood Parks $200M, Neighborhood Fire Stations $126M*) — program context +
  a project list per place, not an exact per-place figure.
- **GO Bond Projects** — `d3dc-v5yr` — *updated 2026-04-25.* 305 rows.
  `planned_project_name` (granular: *RP Buena Vista Park Master Pln, Kezar Pavilion —
  Disaster Response Facility, ZSFG Building 3 Seismic Retrofit, Maxine Hall Health
  Center EEI, GGP Panhandle*), `bond`, `component_or_program`, `completiondate`,
  planned/completed counts. No `$` field itself — pairs with `m793-kis4` for money.
- **DPW Internal & External Projects** — `btxj-k9uh` — *updated 2026-07-20 (daily).*
  8,356 projects. **`co_ordinatepoint` geometry (2,896 populated)**, `on_street`/
  `from_street`/`to_street`, `facility_type` (all rows), `project_status`/`phase`,
  `client_contract_id` on every row (bridge to contract $ — though many are `_NA`),
  start/end dates, PM + PIO contacts. The geolocated *chantiers* list.
- **Supplier Contracts** — `core_us_sf_contracts` (already in BQ). 31,901 contracts;
  **≥$6.2B in construction/place-named prime contracts** on a conservative keyword
  filter (*SFGH Rebuild $703M, ZSFG Bldg 5 Seis Reno $108M, Portsmouth Square Imp
  $21M, India Basin Shoreline Park $32M, Ingleside Police Stn Repl $67M*). Heavy
  abbreviation (`PW` prefix, `SFGH`, `Seis Upg`, `CMGC`).
- **Vouchers** — `core_us_sf_vouchers` (already in BQ). Operating/maintenance spend;
  place-level only where `contract_title` names the place (the original ~17% ceiling
  applies to *routine ops*, now a minor complement to the capital sources above).

### Condition / need — place-level but not spend

- **Rec/Park Facility Conditions Assessment** — `dza3-i9eu` — *2016 (stale).*
  205 sites, **$1.94B renewal need**, `site_fci`, per building-component
  (`renewal_amt`, `replacement_amt`, `unit_price`, `category`, `distress`). REC-only.
  **Use as condition context, clearly dated "2016 assessment," NEVER as spend.**

### Structured-location backbone (the gazetteer)

- **City Facilities** — `nc68-ngbr` — *fresh.* 1,734 facilities; 1,732 addresses,
  1,477 `block_lot` (APN), 30 depts; `common_name`, `owned_leased`, `gross_sq_ft`,
  `geom`. Resolves the neighborhood-name collision structurally (Chinatown Branch
  Library → facility 465 / APN 0191004 / Public Library, cleanly separated from the
  health center and child-dev center). Reveals campuses (Kezar = 5 buildings,
  ZSFG = 8+ at 1001 Potrero).
- **Rec/Park Facilities** — `ib5c-xgwu` — 2,687 features (park geometries + names).

### Money — the payee chain (who got paid for work here)

**place → matched contract → vouchers (join on `contract_number`) → `vendor` + actual
`vouchers_paid`.** Reconstructs the vendors paid for a place's projects, with FY curves.
Verified on ZSFG: Charles Pankow Builders **$93M**, Clark Construction **$24M**, Build
Group $14M, Arup Labs $11M, Emerald Textile $7.7M — the real builders/operators. This
is the direct answer to "voucher/payee projects based in a location." Precision =
the contract-match precision (evidence-gated). Note: recent capital contracts show
**agreed-but-not-yet-paid** (e.g. the $21M PW Portsmouth Square Improvement has $0
vouchers so far) — show `agreed` for active work, `paid` where vouchers flow. Both
`core_us_sf_contracts` and `core_us_sf_vouchers` are already in BQ; no new sync.

### Money — Building Permits (construction value by parcel, 100% structured)

- **Building Permits** — `i98e-djp9` — has `block` + `lot` (**APN**, joins directly to
  City Facilities `block_lot`), `estimated_cost`, `revised_cost`, `description`,
  `status`, `issued_date`, `location` (point). **Structured APN join → ~100% precision,
  no text matching.** Rescues even the places bonds/DPW miss: *Coit Tower* → $856K
  rehabilitation + $150K reroofing + interior work; *Chinatown Branch Library* → a
  **$19M** "renovation to listed historic building" permit (2022) + $100K solar.
  Honest label: "construction permits filed on this parcel (applicant-declared value)"
  — permit cost is declared construction value, and for a city-owned parcel that's the
  work done to the facility. Large table (city-wide) — sync filtered to the gazetteer's
  parcels, or query on demand by APN.

### Rejected / optional

- **Public Art 1%** — `cf6e-9e4j` — located artworks, **no $**. Optional enrichment
  (Coit Tower murals), not money.
- **`city_tenants`** in City Facilities — names the occupying *city department*, not
  associations. Not a subventions substitute.

---

## 3. Per-place proof (the 5-diverse-places test, extended to thin places)

| Place | GO-bond project(s) | DPW project | FCA | Contracts | Verdict |
|---|---|---|---|---|---|
| **ZSFG** (hospital) | Bldg 3 Seismic Retrofit; **Bldg 5 PES $323M expended**; Fire Alarm upgrade | Bldg 2 Chiller Replace (active) | — (not REC) | SFGH Rebuild $703M, ZSFG reno $108M, +23 more | **Rich** |
| **Kezar** (stadium) | Kezar Pavilion — Disaster Response (ESER bond) | — | — | Kezar Fence, restroom, +1 | **Good** |
| **Chinatown Branch Library** | (health center nearby, disambiguated by APN) | Chinatown PHC (active ×4) | — | citywide only | **Facility + nearby capital** |
| **Buena Vista Park** (thin) | Master Plan (Parks bond); Buena Vista Park (H&R bond) | — | FCI 20.18, $12.8M need | — | **Now has capital** |
| **McLaren Park** (thin) | community garden, bike skills, picnic area (Parks bond) | — | FCI 52.5, $29.6M need | — | **Now has capital** |
| **Portsmouth Square** (thin) | Portsmouth Square (H&R bond) | — | FCI 5.55, $3.7M need | Portsmouth Sq Imp $21M (contract) | **Rich** |
| **Coit Tower** (icon) | none | none | — | Roof replacement, +1 | **Facility + small contract only** |

Only Coit Tower stays thin on capital (small historic monument) — and it still gets
City Facilities identity + its roof/repair contracts.

---

## 4. Join strategies, in precision order

- **A — APN key (structured, ~100%).** `block_lot` from City Facilities → **Building
  Permits** (`block`+`lot`) directly. Construction value + description + status per
  parcel, zero text matching. Also the reusable key for any future address/APN feed
  (assessor, etc.). The single highest-precision money join and it covers every
  facility with an APN (1,477 of 1,734).
- **B — Spatial join (structured, ~100%).** DPW/SFMTA project `co_ordinatepoint` →
  City Facilities `geom` (point-in-polygon / nearest). Covers the 2,896 geolocated DPW
  projects — "the chantier physically at this place."
- **C — `contract_number` payee chain (structured).** place-matched contract →
  vouchers → `vendor` + `vouchers_paid`. Who got paid + FY curve. Precision inherits
  from the contract match feeding it.
- **D — DPW `client_contract_id` bridge (structured).** DPW project (named/geolocated)
  → `contract_no` → contract agreed/paid $. Location → dollars without name-matching.
  (Coverage limited by `_NA` contract ids — measure before relying.)
- **E — Curated crosswalk (gated, high precision).** 151 bond items + 305 bond
  projects → place slug, hand-verified. Small enough to map in an afternoon; the
  "no dead suggestions / stronger adjudication" doctrine. Exact $ for single-facility
  bond items; program-context for categories.
- **F — Name/abbreviation match (medium, must gate).** Contracts/vouchers → gazetteer
  with an abbreviation-expansion table (`PW`→Public Works, `SFGH`/`ZSFG`, `Seis`,
  `Reno`, `Impr`, `Plgd`, `RP`, `COF`). Ship only with the evidence quote shown, same
  discipline as the current contract chip. Never a bare neighborhood alias.

**Design principle:** prefer structured keys (A–D) over text (E–F). A place fiche
should lead with APN/spatial/contract-number joins (provable) and treat name-matching
as the gated supplement, exactly the current contract-chip discipline.

---

## 5. Coverage & precision estimate

- **Capital-heavy places** (hospitals, parks with bond work, fire/police stations,
  transit): **strong** — exact or program-level bond $, named projects, often
  geolocated DPW work. This is most of the currently-thin set.
- **Small historic monuments** (Coit Tower): facility identity + incidental repair
  contracts only. Honestly thin, but not empty.
- **Precision:** strategies A/B/D are structured (~100%). C is human-gated (~100% on
  what's mapped, with explicit coverage gaps logged). E is the only fuzzy one and
  carries the evidence quote + gate, as today.
- **The honest labels that must ship with it:**
  - Bond category items → "part of the $200M Neighborhood Parks bond program; projects
    here: […]", never a fabricated per-park total.
  - FCA → "2016 condition assessment (estimated repair need, not spending)."
  - Payroll → department-level, "operated by", never the place's own staff.
  - DPW `_NA` contract links → drop silently-null bridges, log the coverage.

---

## 6. What's still honestly out of reach

- **Associations/subventions based at a place** — no SF dataset links a nonprofit to a
  civic place. Do not fake it.
- **Per-place operating/maintenance spend** beyond what a voucher title names (routine
  ops largely stay department/program-level).
- **Per-employee or per-place payroll** — department-level only (unchanged).
- **Freshness of FCA** — 2016; treat as condition context, not a live figure.

---

## 7. Phased build plan (small blocks, confer between)

- **6A — Gazetteer + facility identity (no money-precision risk). ✅ DONE 2026-07-21.**
  Synced `nc68-ngbr` (1,734) + `ib5c-xgwu` (2,687) → raw; `stg_us_sf_city_facilities`
  (APN split into apn_block/apn_lot, lat/lon typed); `seed_us_sf_place_facilities`
  crosswalk generated by `build_sf_place_facilities.py` (phrase match +
  department-affinity guard + School-District exclusion — precision-checked 40
  rows, one false-join class caught & fixed) → 164 rows, 53/63 places;
  `mart_us_sf_place_facilities` (primary building + campus aggregates + APN list),
  5 dbt tests green. `export_sf_place_facilities.py` → `_facilities.json`, merged
  into the fiche as the `facility` block; "Facility record" section renders on
  the fiche (address / tenure / building-count / district / parcel), verified by
  screenshot. 10 places unmatched (SF Zoo = nonprofit-run, Hetch Hetchy in
  Yosemite, Fisherman's Wharf = a district, etc.) — genuine gaps, not errors.
- **6B — GO Bond capital money. ✅ DONE 2026-07-21.** Synced `m793-kis4` (151) +
  `d3dc-v5yr` (305); stg models (expended = latest cumulative snapshot, NOT SUM —
  ZSFG Bldg 5 = $199M not the $322M a naive sum gives); `build_sf_place_bonds.py`
  crosswalk (phrase match, category-item guard) → `seed_us_sf_place_bonds` (55 rows,
  15 places, hand-checked 55/55 clean); `mart_us_sf_place_capital` (the unified
  NO-SUM model). Fiche "Capital & construction" section: exact $ for single-facility
  bond items, program-context for the rest, named projects listed. Screenshot-verified.
- **6C — Payee chain (who got paid). ✅ DONE 2026-07-21.** `build_sf_place_contracts.py`
  → `seed_us_sf_place_contracts` (170 rows, 23 places; phrase match + weak-alias/
  builder-dept guard — dropped 15 neighborhood-collision false joins; hand-checked
  20/20 clean); `stg_us_sf_place_contracts`; `mart_us_sf_place_payees` (place →
  contracts → vouchers on contract_number → vendor + paid $ + FY span). Contract
  rows also added to `mart_us_sf_place_capital`. Fiche "Paid for work here" list —
  ZSFG Pankow $93M, Union Square Foundation $2.4M etc. Screenshot-verified.
  *(DPW spatial join — BUILT then REJECTED for the fiche, 2026-07-21. Synced
  `btxj-k9uh`; `stg_us_sf_dpw_projects` (geometry parsed) + `mart_us_sf_place_projects`
  (ST_DWITHIN facility↔project, 120 m). Error analysis killed it: at 120 m the join
  returns mostly citywide street works passing near the parcel — "Various Locations
  Pavement Renovation No 80" on the Asian Art Museum, Folsom/Howard streetscape on
  Moscone. The strict building-only filter (facility_type='Land', no Roadway/Sewer)
  leaves just ~2 genuinely place-specific projects (ZSFG Bldg 2 Chiller, Chinatown
  PHC) — and BOTH are already captured by the contract/bond crosswalks. So DPW adds
  street-works noise + redundant coverage; surfacing it would be false attribution.
  Models kept as valid data (not exported); reject is by design, not effort.)*
- **6D — Building Permits (APN, structured). ✅ DONE 2026-07-21.** Synced `i98e-djp9`
  (1.29M); `stg_us_sf_building_permits` (view, block||lot = APN); `mart_us_sf_place_permits`
  (facility APN → permit block+lot, ~100% precision, ≥$1k declared). Fiche
  "Construction permits on this parcel" — rescues Coit Tower ($1.1M: $856K rehab +
  $150K reroof) and surfaces the Chinatown Library $19M renovation. Screenshot-verified.
- **6E — extra contract name-match slice** — folded into 6C (the contract crosswalk
  IS the name-match; the existing "The money" section already shows the matched
  contracts with evidence quotes).
- **6F (optional) — FCA condition context; Public Art enrichment.** Not built.

**Shipped state (2026-07-21):** 6A–6D built end-to-end (raw→stg→mart→export→fiche),
prod-materialized, 16 dbt tests green, tsc+eslint clean, screenshots verified. 49/63
places now carry capital/permit/payee data. All working-tree (uncommitted). The unified
`mart_us_sf_place_capital` + `_capital.json` enforce the no-sum doctrine: bond expended /
contract paid / permit declared are shown as distinct labeled measures, never summed.

Recommended start: **6A** — it de-risks every later block (shared gazetteer + crosswalk
mechanics, and the APN key 6D needs) and adds honest substance on day one with zero
false-money risk.

## 8. The complete join matrix (what the finished fiche contains)

| Section | Source | Join | Precision | New? |
|---|---|---|---|---|
| Facility identity (address, APN, owned/leased, sq ft, N buildings) | City Facilities | crosswalk (name/addr) | curated ~100% | 6A |
| Construction on this parcel ($ declared, status) | Building Permits | **APN** `block_lot` | ~100% | 6D |
| Voter-bond capital ($ expended, projects) | GO Bonds | crosswalk (151+305) | curated ~100% | 6B |
| Chantiers here (geolocated, recent) | DPW Projects | **spatial** | ~100% | 6C |
| Who got paid for work here ($ + FY curve) | contracts→vouchers | `contract_number` | inherits | 6C |
| Contracts naming this place | contracts | name-match (gated) | ~95% gated | 6E (exists) |
| Condition / renewal need (2016) | FCA | crosswalk | curated | 6F |
| Operated by (dept budget + payroll) | budget/comp | dept_code | dept-level | exists |
| Archive narrative | Internet Archive | name-match | curated | exists |
