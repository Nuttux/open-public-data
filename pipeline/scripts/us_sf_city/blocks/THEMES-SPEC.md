<!--
RESCUED FROM scratchpad/. This file was written in scratchpad/sf-theme-filter/,
which .gitignore drops, so the eight themes survived a clone (they are in
pipeline/seeds/sf_decision_themes.json) but the reasoning behind them did not:
which candidates were scored and cut, why Bars & liquor was cut despite scoring
highest of all twenty, why `Your street` is the opening time-lapse and not a
filter, and the tested-and-rejected list — including the racial-equity pattern
that scored 1,043 and whose true count was 3, because `reparation` was matching
inside "p-reparation of plans".

The scoring tables it cites are beside it in themes-scoring/. The one input NOT
copied is mapped_full.json (94 MB, regenerable by join.py).

Paths inside this document still point at scratchpad/; they are the paths the
work was done at and are left as written.
-->

# SF Board of Supervisors — theme filter spec

**Read this section and the next two. Everything under `APPENDIX` is superseded
exploration, kept only for the reasoning and the rejected candidates — do not build
from any theme table found there.**

Target: `/us/city/sf/the-city-gl` (WebGPU renderer, `website/src/lib/citygl/`).
A theme filter over 123,682 Board decisions, 1906-2026.

# 1. THE BUILD LIST — these eight

Scored atomically (no merges) on **101,662 mapped decisions
joined to full source text** — 73% joined, median 774 chars vs 136 in the shards. Scripts:
`join.py`, `atomic.py`, `dist.py`. Full table: `atomic_scores.json`.

## The test that decides inclusion

**Is the concentration the city changing, or the record changing?** Percent of each
decade's decisions:

```
             00s 10s 20s 30s 40s 50s 60s 70s 80s 90s 00s 10s 20s
Bars/liquor    0   0   0   0   0   0   0   0   0   2   2   2   2
Landmarks      0   0   0   0   0   0   0   2   2   1   4   3   8
Schools       10   9  11   5   3   3   2   3   2   2   2   1   1
Fire           4   3   1   1   1   1   1   1   1   1   0   1   1
Redevelopment  0   0   0   0   0   1   3   3   1   2   3   3   2
```

**Bars & liquor scores highest of all twenty (121.1) and is CUT.** Zero for nine decades,
then flat 2% — that is the date the Board began making state ABC licence determinations,
not a fact about San Francisco. High concentration, no story, thin payoff per dot
("determining that issuance of a Type-21 licence to X LLC").

**Landmarks passes the same test** — Article 10 created the instrument in 1967, but the
trajectory afterwards is real and rising (0 → 8%), and a landmark dot pays off when
clicked. A new legal instrument is allowed; a flat line after one is not.

## Two kinds of filter — they need different UI

| kind | spatially | temporally | interaction |
|---|---|---|---|
| **Place filters** | sharp | any | click a dot on the map |
| **Era filters** | uniform | sharp | drive the time slider |

Place: Homelessness +0.500, Landmarks +0.476, Redevelopment +0.468, Libraries +0.466,
Housing +0.380.
Era: Schools +0.730, Fire +0.643, Water +0.641, What's being built +0.431.

## The eight

| # | theme | total | placed | peak | last 5 | why |
|---|---|---|---|---|---|---|
| 1 | Homelessness & shelter | 703 | 84% | 2020s | 3.85% | 0.00% in the 1960s–70s → 3.85% now |
| 2 | Landmarks & old buildings | 1,450 | 95% | 2020s | 8.98% | sharp in space *and* time; best all-rounder |
| 3 | Housing | 4,487 | 88% | 2020s | 12.26% | highest modern share of any theme |
| 4 | What's being built | 8,525 | 96% | 1980s | 10.05% | best-placed large theme |
| 5 | Schools | 6,625 | 93% | 1920s | 1.05% | 11% of the 1920s → 1% now |
| 6 | Fire | 1,697 | 93% | 1900s | 1.00% | 4% in the 1900s — rebuilding after 1906 |
| 7 | Redevelopment | 1,315 | 85% | 2000s | 1.52% | most spatially concentrated real theme — the Fillmore |
| 8 | Libraries | 947 | 89% | 1900s | 0.86% | small; the reason for the October stage |

Spans 1900s→2020s, mixes dense with sparse, covers recognition / stakes / curiosity, and
every one is ≥84% placed. Patterns: `atomic_scores.json`.

## Deferred, with reasons

- **Water & sewers** (8,455, 94%) — strong era theme, spatially uniform (+0.107). Round two.
- **Parks & playgrounds** (12,820) — the most diffuse thing measured (+0.146 / +0.167).
  Everywhere, always. Excellent in "All decisions", weak as a filter.
- **Evictions & tenants** — scores 86.7 but only **110** reach the map.
- **Transit, Health & hospitals, Police, The waterfront, Restaurants, Street names.**
- **Streets & paving** — the opening time-lapse, not a filter (spatial +0.045).
- **Shops & small business** — 277 total, 59 mapped. Too thin. Note its peak (2000s)
  differs from restaurants (1980s) and bars (2020s), so the earlier
  "Shops, bars & restaurants" merge violated the peak-decade rule and is abandoned.

## Constraints that still bind

1. Tag themes **in the pipeline against full source text**; a browser regex over shard
   snippets loses 83% of homelessness and 66% of landmarks.
2. **"All decisions" is the default view.** The themes cover ~60% of the mappable record
   and overlap each other; 10.2% of all decisions have no street reference at all.
3. Never merge families whose peaks fall in different decades.


---

# 2. Corpus, join and matching rules


## Corpus

| | path | years |
|---|---|---|
| historic | `scratchpad/sf-city-anim/blocks/cache/items.jsonl` | 1906–2016 |
| modern | `pipeline/scripts/us_sf_city/cache_sfbos/items.jsonl` | 2017–2026 |
| published shards | `website/public/data/us/sf/city/blocks/block-*.json` | to 2026 |

Row fields used: `y` (year, else first 4 chars of `dt`), `t` (title/text), `r` (truthy = has a
resolved street reference, i.e. mappable).

Matching rule, exactly as the counts below were produced:
- keep rows where `len(t) > 25`
- case-insensitive `re.search` of the theme pattern against `t`
- a row may match several themes; themes are NOT mutually exclusive
- decade share denominators only count decades with >400 total decisions

## Superseded theme tables

The original twelve-theme table and its patterns have moved to the APPENDIX. Build from
section 1. The corpus paths, matching rule, caveats and rendering notes in this section
all still apply.

## Rules the patterns must keep

- **Close every word boundary.** `bus` without a trailing `\b` matches *business* — this
  produced a fake transit signal once and had to be thrown out. Real transit is 3.4%.
- **Test each family against modern vocabulary before trusting a decline.** Several
  apparent collapses are renamings, not disappearances.
- A collapse can be a reorganisation: parking 14.8%→2.1% and traffic 11.0%→0.3% between
  the 2000s and 2010s is SFMTA absorbing the Department of Parking and Traffic.

## Known caveats — verify before anything public

- **`lawsuits` 14.4%→2.7%** may be an artefact of Clerk's-PDF phrasing, not a real change.
  Not in the 12 above; do not reintroduce without checking.
- **1950s–60s coverage is 64–66%** against 94% for the 2010s. Cross-decade comparisons in
  that window are weaker than they look.
- **11,766 decisions (10.2%) carry no street reference at all** and have nowhere to sit on
  the map. The unplaced set is not random — lawsuits are 1.0% of placed but 23.0% of
  unplaced; parks 10.6% vs 24.3%. The map shows ~87% of the record and should say so.

## Sanity check that already passed

COVID: 0.0% before 2020, 1.4% in 2020, 2.2% in 2021, gone by 2024. The corpus tracks
real events at the right times.

## Rendering note

Marks belong on the GPU as instanced geometry, not on the 2D overlay. `overlay.ts` states
the doctrine — "the GPU draws the world, a 2D canvas over it draws the writing" — and
already refuses 4,895 street features on the CPU path. The largest theme, parks at 14,731,
is 3× that. Parks is the stress case: verify frame cost there first.


---

# APPENDIX — superseded exploration

Kept for the reasoning trail and the tested-and-rejected list. The theme tables in here
are NOT the build list; section 1 is.

## The original twelve (superseded by section 1)

## The 12 themes

Counts verified 2026-08-29 — reproduced identically from the two caches above.
`placed` = share with a street reference, i.e. the share that can appear on the map.

| theme | decisions | placed | first decade | peak decade | peak share | IGS-SF | IGS-CA |
|---|---|---|---|---|---|---|---|
| parks & recreation | 14,731 | 80% | 1900s | 1990s | 17.2% | 18 | 357 |
| water & sewer | 8,455 | 94% | 1900s | 1910s | 16.1% | 43 | 254 |
| zoning & land use | 8,065 | 96% | 1920s | 1980s | 19.4% | 52 | 3,018 |
| transit | 6,895 | 92% | 1900s | 1940s | 10.3% | 22 | 138 |
| schools | 6,625 | 93% | 1900s | 1920s | 10.7% | 10 | 85 |
| health & hospitals | 5,851 | 88% | 1900s | 1900s | 9.5% | 78 | 534 |
| police & fire | 4,946 | 90% | 1900s | 1970s | 9.0% | 27 | 115 |
| housing | 4,919 | 88% | 1900s | 2020s | 13.1% | 41 | 806 |
| the waterfront & port | 4,346 | 82% | 1900s | 2000s | 18.2% | 23 | 77 |
| redevelopment | 1,315 | 85% | 1950s | 2000s | 3.4% | 12 | 112 |
| libraries | 947 | 89% | 1900s | 1900s | 1.4% | 2 | 14 |
| shelter & homelessness | 727 | 84% | 1980s | 2020s | 3.9% | 9 | 32 |

IGS columns = matching items in the UC Berkeley IGS library catalogue on Internet Archive
(SF-specific / all-California). They inform which theme to pick with Kris; the renderer
does not need them.

## Patterns (authoritative — copy verbatim)

```python
THEMES = [
("shelter & homelessness", r"\bhomeless|encampment|shelter\b|navigation center|supportive housing|\bsro\b|single room occupancy|transient"),
("housing",               r"\bhousing|dwelling unit|apartment|tenant|eviction|rent control|affordable hous"),
("schools",               r"\bschool\b|schools|board of education|unified school|kindergarten|classroom"),
("parks & recreation",    r"\bpark\b|playground|recreation|open space|square\b|\bzoo\b|beach"),
("libraries",             r"\blibrar"),
("police & fire",         r"\bpolice\b|fire department|firehouse|fire station|patrol|arrest"),
("health & hospitals",    r"\bhealth\b|hospital|clinic|sanitar|epidemic|disease|mental health"),
("water & sewer",         r"\bsewer|water main|hydrant|reservoir|wastewater|aqueduct|hetch"),
("transit",               r"\brailway|street ?car|trolley|cable car|\bmuni\b|\bbart\b|light rail|subway|transit"),
("redevelopment",         r"redevelop|urban renewal|blight"),
("zoning & land use",     r"\bzoning|reclassif|conditional use|variance|use district|set-?back"),
("the waterfront & port", r"\bport\b|pier\b|wharf|seawall|embarcadero|waterfront"),
]
```

Companion patterns for the IGS catalogue (matched against item `title`) are in
`themes_igs.json` — different vocabulary, because a catalogue record is a document title,
not a motion.

Per-decade shares for every theme: `themes.json` → `themes[].by_decade`.


# Modern themes (added 2026-08-29)

The twelve above are weighted toward a 1900s vocabulary. These were derived from the
corpus by over-representation (share in the window ÷ share in the rest of the record),
then hand-checked against sampled titles. Four qualified.

`skew` = share in the last 5 years ÷ share across all 120 years. Higher = more modern.

## Recommended additions

| theme | total | last 5 yrs | last 20 yrs | all time | skew | placed |
|---|---|---|---|---|---|---|
| historic preservation | 1,455 | 8.98% | 4.63% | 1.18% | ×7.6 | 95% |
| affordable housing finance | 740 | 4.47% | 3.71% | 0.60% | ×7.5 | 93% |
| bars, restaurants & small business | 923 | 2.97% | 2.67% | 0.75% | ×4.0 | 91% |
| commemoration & naming | 519 | 2.40% | 1.35% | 0.42% | ×5.7 | 82% |

```python
("historic preservation",               r"\blandmark\b|\blandmarks\b|historic (?:district|preservation|resource|building)|\bmills act\b|certificate of appropriateness|architectural (?:heritage|significance)"),
("affordable housing finance",          r"\bmohcd\b|\bcdlac\b|multifamily housing revenue|below market rate|\binclusionary\b|housing bond|low.income housing tax credit|affordable housing fund"),
("bars, restaurants & small business",  r"\bliquor licen|\btype-\d|premise-to-premise|formula retail|\bsmall business\b|legacy business|entertainment permit|\bnightlife\b|sidewalk cafe|outdoor dining|shared spaces"),
("commemoration & naming",              r"\bcommemorat|\bin memoriam\b|honorary street|street naming|\brenaming\b|\bproclaiming\b|\bplaque\b|memorial (?:to|for|honoring)"),
```

Why these four, on map terms specifically:

- **historic preservation** is the strongest modern theme in the record, and 95% placed —
  higher than all twelve originals except zoning. Landmark designations are addresses by
  construction ("2055 Union Street, Lot 018 in Assessor's Block 0541"). Only 4% overlaps
  zoning, so it is genuinely its own thing.
- **bars, restaurants & small business** is 674 liquor-licence determinations at named
  premises, plus formula-retail and legacy-business items. Every one is a storefront. This
  is the most *recognisable* theme on the list — people know these addresses.
- **commemoration & naming** is honorary street names, plaques and memorials. Smallest of
  the four but the most human, and it points at specific blocks ("MTT Way, 200 block of
  Grove Street").
- **affordable housing finance** — see the caveat below.

## Overlap with the original twelve

Themes are not exclusive, and one of these is nearly nested:

| new theme | biggest overlaps |
|---|---|
| historic preservation | parks 11%, waterfront 9%, zoning 4% |
| bars & small business | zoning 12%, parks 11%, waterfront 10% |
| commemoration & naming | parks 25%, health 9%, transit 8% |
| **affordable housing finance** | **housing 97%** |

**Affordable housing finance is a subset of housing, not a peer.** 97% of it is already
inside the housing theme. Offer it as a sharper modern slice — bonds, CDLAC allocations,
MOHCD agreements, inclusionary units — but do not present the two as parallel categories,
and never add their counts together.

## Tested and rejected — do not add these

Recorded so nobody re-derives them:

| candidate | real matches | why rejected |
|---|---|---|
| racial equity & reparations | **3** | see below |
| climate & clean energy | 50 | too thin to render |
| surplus land & public sites | 123 | too thin |
| cannabis | 81 | too thin |
| public health emergency (incl. COVID) | 39 | too thin — real, but tiny in absolute terms |
| drugs & overdose | 33 | too thin |
| surveillance & technology | 29 | too thin |
| homelessness services (HSH, Homekey) | 141 | ×18.8 skew, the sharpest modern signal in the corpus, but too small alone — fold into shelter & homelessness |
| litigation & settlements | 3,479 | only **23% placed**, and the decline is likely a Clerk's-PDF phrasing artefact |
| budget & appropriation | 12,169 | skew 0.9 (not modern) and diffuse — money is not at a place |
| street safety & bicycles | 815 | skew 1.6, barely modern |
| seniors & disability access | 429 | 32% of it is already inside parks & recreation |

**The racial-equity trap.** A first pass scored this at 1,043 decisions. 1,039 of them
matched the bare token `reparation` inside the word **"p-reparation of plans"**. The true
count is 3. This is the same missing-word-boundary failure as `bus` matching *business*,
and it appeared in a pattern written immediately after documenting that exact rule. Any
new family gets a sampled-title check before it is believed, without exception.

Note what this means editorially: **San Francisco's Board does not legislate climate or
racial equity at volume in the titles of its decisions.** That is a finding about what a
minutes corpus can and cannot show — the policy exists, but it lives in departmental
plans and commission records, not in the Board's motions. Say that plainly rather than
stretching a pattern to manufacture the theme.

## Ranking within each window

Full numbers for all 24 measured families: `all_families.json`.

Top of the last five years, existing and new together: housing 13.2%, parks 12.4%, zoning
9.2%, **historic preservation 9.0%**, **affordable housing finance 4.5%**, shelter &
homelessness 4.0%, health 3.3%, **bars & small business 3.0%**.

The themes that *fall* in the modern window are schools (5.4% → 1.1%), transit
(5.6% → 2.4%) and police & fire (4.0% → 1.9%) — jurisdiction moving to the school
district and to SFMTA, not the subjects disappearing.

---

# The citizen-facing list (final recommendation, 2026-08-29)

Everything above ranks themes by **supply** — what the Board legislates most. Clicks come
from **demand** — what a resident already has an opinion about. This section is the list
built for demand, and it is the one to implement.

Three different things make someone click a dot, and they are not the same theme:

1. **recognition** — "that's my street / my bar / my park"
2. **stakes** — "I have an opinion about that"
3. **curiosity** — "what *was* that building?"

Recognition wins the first click. Stakes and curiosity win the fifth.

## The list, in the order it should appear

`ON MAP` = decisions with a street reference, i.e. dots the filter can actually draw.

| # | theme | on map | total | placed | last 5 yrs | skew | why it earns the slot |
|---|---|---|---|---|---|---|---|
| 1 | Your street | 17,911 | 18,524 | 97% | 2.64% | ×0.2 | everyone has one; biggest and most-placed theme in the record |
| 2 | Parks & playgrounds | 11,806 | 14,731 | 80% | 12.38% | ×1.0 | beloved, universal, busy in every decade |
| 3 | Housing & rent | 4,313 | 4,938 | 87% | 13.49% | ×3.4 | the #1 issue in the modern record |
| 4 | What's being built | 8,211 | 8,584 | 96% | 10.05% | ×1.4 | the fight everyone already has an opinion on |
| 5 | Parking & traffic | 10,766 | 11,817 | 91% | 2.33% | ×0.2 | universally opinionated, huge volume |
| 6 | Getting around | 6,577 | 7,183 | 92% | 3.04% | ×0.5 | transit + bikes; daily use |
| 7 | Homelessness & shelter | 593 | 703 | 84% | 3.85% | ×6.8 | SF's defining modern issue |
| 8 | Landmarks & old buildings | 1,382 | 1,455 | 95% | 8.98% | ×7.6 | highest curiosity per dot in the corpus |
| 9 | Police & fire | 4,856 | 5,454 | 89% | 4.70% | ×1.1 | high salience, well placed |
| 10 | Schools | 6,180 | 6,625 | 93% | 1.05% | ×0.2 | intense for one large segment |
| 11 | Shops, bars & restaurants | 1,453 | 1,582 | 92% | 3.66% | ×2.9 | pure recognition — but a small theme |
| 12 | Health & hospitals | 5,142 | 5,851 | 88% | 3.28% | ×0.7 | civic backbone |
| 13 | Water & sewers | 7,938 | 8,455 | 94% | 0.88% | ×0.1 | big; Hetch Hetchy is the hook |
| 14 | The waterfront | 3,585 | 4,346 | 82% | 2.42% | ×0.7 | strong identity, strong geography |
| 15 | Street names & memorials | 426 | 519 | 82% | 2.40% | ×5.7 | "who is my street named after?" |
| 16 | Redevelopment | 1,115 | 1,315 | 85% | 1.52% | ×1.4 | the Fillmore; the heaviest story here |
| 17 | Libraries | 841 | 947 | 89% | 0.86% | ×1.1 | small, but the reason we are on this stage |

Patterns for all seventeen: `final_themes.json`.

## Volume and legibility pull in opposite directions

A theme with 17,911 dots carpets the city; a theme with 1,382 has dots you can actually
aim at. Both are wanted, for different moments:

- **Open on a dense universal theme** — *Your street* or *Parks*. The city fills with the
  record and the effect is the whole point: 120 years of decisions, everywhere, at once.
- **Explore in the sparse ones** — *Landmarks*, *Homelessness*, *Street names*. Few enough
  dots that a single one is a target, high enough curiosity that clicking it pays off.

Do not judge a theme by its row count alone.

## Merges applied, and why

- `streets & paving` + `sidewalks & street trees` + `streetlights` → **Your street**. All
  of it is the strip outside a front door, and residents do not file them separately.
- `zoning & land use` + development terms → **What's being built**. Same decisions, a
  label a person would actually click. "Zoning" is the Clerk's word, not a resident's.
- `transit` + `bicycles` → **Getting around**.
- `police & fire` + crime terms → **Police & fire**.
- `liquor licences` + `small business` + `restaurants` → **Shops, bars & restaurants**.
- `affordable housing finance` and `evictions & tenants` folded into **Housing & rent**
  (97% and mostly nested respectively). Both are good *sub*-filters, not peers.
- `homelessness services` (HSH, Homekey) folded into **Homelessness & shelter**.

## The number that governs the UI

**Union coverage is 60%** — 65,553 of 108,686 placed decisions match at least one of the
seventeen. Two consequences, both non-negotiable:

1. **"All decisions" is the default view, not a theme.** The map opens showing everything
   and themes filter down. If a theme were the entry point, 40% of the mappable record
   would be unreachable by clicking.
2. Say the coverage out loud somewhere. The alternative is implying the seventeen
   partition the record, which they do not — and they overlap each other besides.

And the older number still holds: **10.2% of all decisions have no street reference at
all** and can never appear. The map is ~87% of the record before any theme is applied.

---

# What actually earns a filter slot (supersedes the list above)

The site already has address search. Search answers **"this place"**; a filter answers
**"this kind of thing"**. So a theme earns a slot only when **the citywide shape, or the
change over time, is itself the finding** — something you cannot get by searching an
address. Anything uniform in both space and time is redundant with search.

Measured on the real map data: 101,662 block-attached decisions, 4,771 blocks.
`spatial+` = Gini above the 0.469 baseline. `time+` = decade-entropy below the 2.234
baseline. Both computed in `conc.py`; results in `concentration.json`.

| theme | mapped | spatial+ | time+ | top 10% blocks | peak 3 decades | story |
|---|---|---|---|---|---|---|
| Landmarks & old buildings | 488 | +0.490 | +0.609 | 100% | 78% | 110 |
| Schools | 1,616 | +0.430 | +0.651 | 82% | 81% | 108 |
| Housing & rent | 1,158 | +0.472 | +0.418 | 99% | 72% | 89 |
| Redevelopment | 250 | +0.509 | +0.341 | 100% | 62% | 85 |
| Shops, bars & restaurants | 835 | +0.473 | +0.312 | 100% | 64% | 79 |
| Water & sewers | 3,198 | +0.303 | +0.452 | 55% | 74% | 76 |
| What's being built | 3,543 | +0.312 | +0.412 | 56% | 69% | 72 |
| Getting around | 1,902 | +0.405 | +0.123 | 75% | 62% | 53 |
| The waterfront | 614 | +0.476 | −0.015 | 100% | 50% | 46 |
| Health & hospitals | 935 | +0.436 | −0.117 | 84% | 44% | 32 |
| Parks & playgrounds | 1,974 | +0.398 | −0.083 | 72% | 51% | 32 |
| Police & fire | 710 | +0.454 | −0.217 | 99% | 40% | 24 |

Keep also, below the 200-row measurement threshold but high-value:
**Homelessness & shelter**, **Street names & memorials**, **Libraries**.

## Two cuts

**`Your street` is not a filter.** Spatial excess of **+0.095** against a 0.469 baseline —
it touches 3,590 of 4,771 blocks and its top-decile share is 36% against a 32% baseline.
Uniform. Address search answers "my street" better than a citywide paving filter ever
could. But its *temporal* concentration is the third highest measured (+0.584, 80% inside
three decades), so it becomes **the opening time-lapse** — the city being paved,
1900–1935 — not a checkbox.

**`Parking & traffic` is cut outright.** +0.240 spatial and −0.041 temporal: diffuse in
both dimensions, the weakest score on the board. 11,817 white-zone hour changes is the
mush that makes a civic map feel like paperwork.

## The two strongest stories, on the measurements

- **Redevelopment** is the most spatially concentrated theme in the corpus (+0.509, 100%
  of it inside the top decile of blocks, 62% inside three decades). That is the Fillmore.
  It is also the heaviest thing here, and should be handled as such.
- **Schools** scores second overall (108) on the highest temporal concentration measured
  (+0.651, 81% in three decades) — where children were, and then were not.

## BUILD BLOCKER — do not filter client-side

The published shards carry a **136-character snippet**; the source text has a median of
**520 characters**. Regexing a theme in the browser against shard text silently loses most
of the record:

| term | in shards | in source | survives |
|---|---|---|---|
| landmark | 394 | 1,154 | 34% |
| homeless | 90 | 532 | **17%** |
| liquor licence | 509 | 666 | 76% |

Themes must be **tagged in the pipeline against full source text and shipped as a field on
each decision**. A client-side regex over shard text is not a shortcut here — it is a
different, much smaller dataset.

---

# Merge corrections (2026-08-29, later)

Two merges in the list above were suppressing the signal they were meant to carry.
Measured with the same concentration method (`split2.py`):

| grouping | mapped | spatial+ | time+ | peak 3 | story |
|---|---|---|---|---|---|
| Police & fire (merged) | 710 | +0.454 | −0.217 | 40% | 23.7 |
| Police alone | 436 | +0.474 | −0.148 | 45% | 32.7 |
| Fire alone | 340 | +0.496 | +0.019 | 57% | **51.4** |
| Getting around (merged) | 1,902 | +0.405 | +0.123 | 62% | 52.8 |
| Transit, bikes removed | 1,756 | +0.413 | +0.231 | 67% | **64.4** |

## `Getting around` → **Transit**

A coined euphemism, replaced with the real word. The theme is public transport —
streetcars, cable cars, Muni, BART, railways: 6,798 decisions, peaking in the **1940s**.
Use `Transit`, or `Buses, trains & streetcars` if a concrete label is preferred for
non-US readers.

**Bicycles are removed from it.** 430 decisions, only 20% of which sit inside transport at
all — the rest are omnibus traffic regulations, Park Code amendments, a Port grant.
Dropping them moves the score from 52.8 to 64.4. Bicycles do not earn a filter of their
own either (430 total, no meaningful concentration).

```python
("Transit", r"\brailway|street ?car|trolley|cable car|\bmuni\b|\bbart\b|light rail|\bsubway\b|\btransit\b|\bmunicipal railway\b"),
```

## `Police & fire` → **Police** and **Fire**, separately

They overlap by **5.7%** and run on opposite clocks: fire peaks in the **1900s**
(firehouses rebuilt after the earthquake), police peaks in the **1970s**. Merging averaged
two opposite time-curves into a flat line — which is the whole reason "Police & fire"
scored worst on the board. **The bad score was the merge, not the theme.** Split, Fire
reaches 51.4, ahead of the waterfront, health and parks, and it is 93% placed because a
firehouse is a building at an address.

```python
("Police", r"\bpolice\b|\bpatrol\b|\barrest\b|\bcrime\b|\bcriminal\b"),
("Fire",   r"fire department|firehouse|fire station|\bfire house\b|\bfire alarm\b|\bfire hydrant\b|\bfire chief\b|\bfire engine\b|\bfireboat\b"),
```

## Rule this establishes

**Do not merge two families whose peaks fall in different decades.** The filter's value is
concentration; averaging opposite curves destroys exactly what makes a theme worth a slot.
Check the peak decade of each component before combining, and re-score after.

`Shops, bars & restaurants` fuses three families and has not been re-tested this way —
do that before trusting its 79.

**Total: 16 filters**, plus "All decisions" as the default view.

---