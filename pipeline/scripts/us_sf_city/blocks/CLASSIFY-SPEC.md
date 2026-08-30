# Classifying the record — the reasoning trail

> **The schema in §2 and the topic list in §4 are SUPERSEDED.** They were the
> draft that the measurements below argued against, and they are kept because
> the argument is the useful part. What shipped is
> `pipeline/seeds/sf_bos_taxonomy.json` (8 topics, 66 subtopics, 12 actions, a
> separate `action` column) and `RECORD-COLUMNS.md`. The two things that changed
> after this was written: `record_type` absorbed three draft columns, and
> **topic and action were split apart**, because one column holding both made a
> money topic swallow every row that mentioned a sum.
>
> §1, §7 and §8 — the era finding, the trap list and the reproducibility rule —
> are still current and are what the classifier prompt is built from.

Read before implementing. Everything here comes from reading 382 records: 200
random, then 182 stratified across all thirteen decades. Where a rule exists it
is because a real record made it necessary, and the record is quoted.

---

## 1. The finding that shapes everything else

**The Board's language changes completely across the century, and a classifier
tuned on one end fails at the other.**

```
1906-1935   "Resolution No. 14248 (New Series), as follows: Resolved, That the
             following revocable permits are hereby granted…"
             — a file number first, the subject in a subordinate clause

1970-2026   "Resolution approving map showing widening of Jackson Street,
             from Front to Drumm Streets."
             — the subject is the first six words
```

Two consequences:

- The classifier must be shown the **year**, and its rules must say what changes.
- Any accuracy figure has to be reported **per decade**. A single number will be
  carried by the modern half and hide a failure in the 1910s, which is a third
  of the corpus.

**The subject is often not in the body at all.** Pre-1960 the Board printed a
heading above the item and the body opens mid-thought:

> `Resolution No. 13375 (Series of 1939). (Lot 1, Block 6130, southeast corner
> of Dwight and Colby Streets. Size: 1…`

The pipeline already recovers that heading separately. **The classifier must be
given heading + body**, never the body alone.

---

## 2. Columns

| column | what it holds |
|---|---|
| `id` | stable key |
| `year` · `date` | when the Board acted |
| `kind` | `resolution` · `ordinance` · `motion` · `departmental work` |
| `text` | the line as printed, original spelling and scan errors kept |
| `heading` | the title the volume printed above it, where there is one |
| `source_url` | opens the scanned page |
| `record_type` | see §3 — one value, always filled |
| `topic` | see §4 — one value, always filled |
| `subtopic` | finer, may be blank until we go deeper |
| `tags` | short list of cross-cutting notes, usually empty |
| `how_we_know_where` | see §6 |
| `why_no_place` | filled only when there is no place |
| `block` · `longitude` · `latitude` · `street` | where, when known |
| `amounts` | every figure found, as a list |
| `amount_count` | how many — take `amounts[0]` when this is 1 |
| `refers_to_decision_number` | the number an outcome-only row points at |

---

## 3. `record_type` — is this a record, and does it describe itself?

| value | share | what it is |
|---|---|---|
| `decision` | ~82% | a real record that says what it was about |
| `vote outcome only` | ~6% | `Resolution No. 341-25 ADOPTED` — the description is in another row |
| `page header or footer` | ~4% | the Sunshine Ordinance contact block, "Printed at 11:10 am on 3/8/24" |
| `index row` | <1% | from the volume's index |
| `cut in half` | ~1% | the page break landed mid-sentence |
| `too damaged to read` | <1% | scan too poor to make out a sentence |

Only `decision` rows get a subject topic. The rest are counted, never summed
into subject figures.

---

## 4. The topics

Derived from the reading, not invented. Roughly ordered by how much of the
corpus they carry.

### the street outside
| topic | subtopics |
|---|---|
| `street works` | ordering an improvement · accepting finished work · more time for the contractor · sidewalks · repairs |
| `street levels and lines` | official grades · set-back lines · sidewalk widths |
| `street names and closures` | renaming · closed for good (vacation) · **closed for a day** (street fairs, parades) |
| `sewers and drains` | |
| `street lighting and wires` | lighting · putting wires underground |

`closed for good` and `closed for a day` must not merge — one is permanent and
one is a street fair. Both appear throughout.

### getting around
| topic | subtopics |
|---|---|
| `parking and traffic` | parking rules · stop signs · crosswalks · truck and transit lanes · loading zones |
| `transit and railways` | streetcars · railway franchises · spur tracks · Muni · BART · freeways |

### land and building
| topic | subtopics |
|---|---|
| `zoning and land use` | use classification · rezoning granted · **rezoning refused** · height and bulk · special use districts · conditional use · appeals of a planning decision |
| `land and property` | city buys land · city sells land · city leases · condemnation for a street widening |
| `subdivisions and maps` | final maps · condominium conversions · lot splits |
| `building and construction` | building permits · demolition · dedications |
| `redevelopment` | |
| `landmarks and preservation` | |

`rezoning refused` is its own subtopic because refusals are numerous and reading
only the approvals would misdescribe the record.

### money
| topic | subtopics |
|---|---|
| `money set aside` | appropriations · transfers · overtime and payroll items |
| `claims and payments` | claims against the city · refunds · progress payments to contractors |
| `assessments` | the cost of street work charged to frontagers · instalment terms |
| `contracts and agreements` | awards · amendments · leases of services |
| `lawsuits and settlements` | |
| `borrowing and bonds` | |
| `grants and gifts received` | |
| `taxes, fees and revenue` | rates · franchise payments to the city |

`assessments` is separate from `money set aside`: it is the Board charging
property owners for work outside their door, and it is a large slice of
1910–1935 that would otherwise vanish into appropriations.

### everyday permission
| topic | subtopics |
|---|---|
| `permits and licences` | keeping horses and cows · blasting · oil tanks and boilers · laundries · dance halls · taxis and garages · liquor · sidewalk and awning permits · occupying the street |
| `franchises` | a company granted the right to run cars, lay pipe or string wire |

### what the city runs
| topic | subtopics |
|---|---|
| `parks and recreation` | |
| `schools` | |
| `libraries` | |
| `police and fire` | firehouses · engine companies · police stations |
| `health and hospitals` | clinics · public health emergencies |
| `housing and shelter` | housing bonds · shelters · hotels and rooming houses |
| `the port and waterfront` | |
| `water and power` | reservoirs · Hetch Hetchy · utility companies |
| `the environment` | environmental review (CEQA) · pollution · emergencies from landslide or storm |

### how the city was run
| topic | subtopics |
|---|---|
| `a vote or a scheduling step` | adopted · continued · referred · second reading · tabled |
| `appointing people` | |
| `city staff and jobs` | positions created · salaries · union agreements |
| `changing the city's own rules` | code and charter amendments |
| `elections and the ballot` | special elections · ballot measures |

### civic life
| topic | subtopics |
|---|---|
| `commendations and proclamations` | certificates of honour · days named · in memoriam |
| `positions on state and national matters` | urging · supporting · opposing a bill or proposition |

### left over
`not yet sorted` — kept visible and expected to shrink in public. Nothing is
forced into a topic to flatter a number.

---

## 5. Tags — the short list that survives

Everything else folded into subtopics. What stays is only what can land on
**any** topic:

- `neighbours objected` — a protest, remonstrance or appeal was recorded
- `went to court` — litigation is part of the story
- `an emergency was declared`
- `refused` — the Board said no. Distinguishes a denial from an approval and
  cuts across zoning, permits and land alike.

---

## 6. `how_we_know_where`

| value | what the record said | dot on the map? |
|---|---|---|
| `names its own block` | prints its assessor block number | yes |
| `street address` | a house number matching a real address | yes |
| `between two streets` | "Madrid Street, from Francis to Persia" | yes |
| `street corner` | two streets that actually cross | yes |
| `street only` | a street name and nothing more | **no** — street known, spot not |
| `no place given` | nothing anywhere in it | no |

`why_no_place`: `street runs too far` · `place belongs to the next item` ·
`too many streets listed` · `no place in the text`

Some topics are *inherently* unplaceable and that is correct, not a failure:
`lawsuits and settlements` 20%, `appointing people` and `commendations` are
about people. `street works` is 98%.

---

## 7. The traps — rules the prompt must carry

Every one of these is a real failure, found in this corpus.

**1. A street named after a thing is not the thing.**
Church Street is not a church. Army Street is not the army. Ocean Avenue is not
the ocean. Market, Post, Bush, Mission, Presidio and Grant are the same hazard.
Guarding this moved "Churches" from 467 records to 269 — **43% of the hits were
a road**.

**2. A company named after a street is not a street matter.**
"Market Street Railway Company" is transit. "Parkside Transit Company" is a
franchise grant.

**3. `(New Series)` and `(Series of 1939)` are numbering schemes.**
Not dates, not a series of anything. They appear in tens of thousands of rows.

**4. A record that quotes another ordinance's title is about its own act.**
`Ordinance No. 1061 entitled "Regulating the Width of Sidewalks"` appears from
1914 to 2025. The record is an amendment to sidewalk widths — the quoted title
is context, not the subject.

**5. Supervisor names are not subjects.**
Roll calls carry dozens of surnames. Some are ordinary words.

**6. The word appears but the record is not about it.**
`equity` returns 70 rows which are the federal *Transportation Equity Act*, a
*Cultural Equity Endowment Fund* and a court case. `arts` returns 983 rows which
are roll-call votes and a list of elevator loading zones. **Judge what the record
is FOR, not what words it contains.**

**7. Mention is not aboutness over a long document.**
A Municipal Report mentions schools; it is not about schools. Tagging long text
by keyword took "Schools" from 3 documents to 78.

**8. Custody is not subject.**
Scanned pages carry the holding library's bookplate — "SAN FRANCISCO PUBLIC
LIBRARY · Not to be taken from the Library". OCR mangles it ("BAN FRANCISCO",
"SfN FRANCISCO"), so it cannot be stripped reliably. It made 47 places that are
not libraries come out as libraries.

**9. Word boundaries.**
`reparation` matches *p-reparation of plans* — that scored a theme at 1,043
records when the truth was 3. `bus` matches *business*.

**10. An empty answer is usually the right answer.**
Most records are paving, permits, sewers and payments. For a cross-cutting tag,
returning nothing is expected and correct.

---

## 8. Reproducibility — the part that matters for Qipu

A model's judgement is not reproducible the way SQL is. So:

1. The classifier runs **once**, and its output is written to a **versioned
   file**, one row per record.
2. dbt reads that file as `raw`. Everything downstream is deterministic SQL.
3. Re-running the model is a **deliberate, diffable act** — the file changes,
   the diff is reviewable, and a build never silently reclassifies.
4. The prompt, the topic tree and this trap list are versioned beside it, so a
   given output can be traced to the exact rules that produced it.

### the layers

```
raw    raw_sf_bos__items          swept items, uncleaned
       raw_sf_bos__classified     the frozen classifier output
       raw_sf_blocks              DataSF geometry
       raw_sf_addresses           parcel address ranges

stg    stg_sf_bos__items          typed, trimmed, kind in plain words

int    int_sf_bos__record_type
       int_sf_bos__location       the six-degree ladder + why_no_place
       int_sf_bos__topic          joined from the frozen classification
       int_sf_bos__tags           LONG — one row per record x tag

core   core_sf_bos_decision       row-level, one row per record.
                                  THIS is the downloadable dataset.

mart   mart_sf_bos_by_block       what a click fetches
       mart_sf_bos_marks          what the map draws
       mart_sf_bos_by_topic_decade
```

The block shards stop being a thing that exists and become an export of `mart`.

### gates, as dbt tests

- `topic` and `record_type` are never null
- `record_type` and `topic` are in their allowed value lists
- topic counts sum to the row count — it is a partition, so this must hold
- `tags` is long-format and must never be summed against `topic`
- every `decision` row with `how_we_know_where` in the four precise values has a
  block; every other row has none
- per-decade classified share never falls below a floor, so a language shift in
  one era cannot hide behind the modern half

---

## 9. Open, and I would not guess

Two of the three questions this section opened have since been answered by
doing the work. They are kept with their answers rather than deleted, because
what the answer turned out to be is the useful part.

- ~~**`not yet sorted` is 11% today**~~ — **ANSWERED. It is 0%.** The tail was
  read to exhaustion, form by form, and `make_tail.py` now reports `tail 0`:
  124,284 of 124,284 rows carry a `record_type` and an `action`.

  The question was the wrong shape, though. "Not sorted" and "no topic" are not
  the same thing, and separating them is the finding:

  | | rows | why |
  |---|---:|---|
  | a decision, with a topic | 106,858 | the line says what it was about |
  | a decision, no topic | 708 | read; the line names an act and no subject |
  | not a decision | 16,718 | footers, index rows, half-lines, bare vote outcomes, damaged scans — no act to have a subject |

  The purpose-clause pass this entry called for **has now been run** and is
  pass D in `freeze_classification.py`. It keys on `subject_form()` — the text
  from *"for the purpose of"* / *"in payment to"* / *"for the construction of"*
  onward, normalised the same way `form_b` is and cut at 12 words — and it may
  only ever fill an empty `topic` on a row that is already a decision with an
  action. A gate asserts that. Across 4,970 answered units it recovered
  **5,420 subjects**; **695 units were read and named no single subject**,
  which is recorded as an answer rather than skipped.

  Decisions carrying a topic now stand at **106,858 of 107,566 = 99.3%**. The
  708 left are not backlog: `make_subjects.py` returns 0 units against the current
  freeze, so every one of them has been read and found to name nothing single —
  a multi-item appropriation, a modern agenda line whose project is defined in
  a file it points at, a fragment of debate that never names the measure.

- **The 41 fiche subjects and the 8 map themes must be reconciled** into this
  one tree before either is published as a dataset column. Today only 2 of 49
  labels overlap, which is indefensible in a downloadable file. **STILL OPEN.**

- ~~**Which model, and what it costs.**~~ — **ANSWERED, and the answer was
  neither.** No API pass was run and nothing was spent. The corpus was read in
  session, grouped by normalised form so that ~35,500 form reads covered
  124,284 records, with the residual read one record at a time. The cost
  question dissolved because the unit of work was never the record.

### The defects this section did not anticipate

**1. The seed was not reproducible.**

`freeze_classification.py` was **not reproducible**, which is the one thing the
seed exists to guarantee. Its near-duplicate pass indexed `list(sh)[:6]` — six
arbitrary members of a `set` of strings — and CPython randomises string hashes
per process, so a different six were chosen on every run. Measured: two runs
over identical inputs produced 124,267 and then 124,237 rows. Fixed by sorting
(`sorted(sh)[:6]`) in both the index build and the lookup; two runs are now
byte-identical. Nothing about the 0.80 threshold or the rule set changed.

**2. The published topic chart was counting non-decisions.**

A bare vote outcome carries `record_type = vote-outcome-only` and the topic
`running-the-city / vote-or-scheduling` — true of the row, and not a subject:
it says the Board voted, not what about. `stats.json` tallied `topic` over
*every* row that had one, so those 12,530 rows more than doubled
`running-the-city` (10,573 → 23,103) and lifted it from fifth place to third
on `/us/city/sf/records`. The page was breaking the counting rule printed at
the bottom of the same page — *"do not count rows whose `record_type` is not
`decision` into subject figures"* — in the one chart most likely to be quoted.

Fixed in `build_core_table.py`: the topic and per-decade tallies are taken over
decisions, and the fields are named `topic_decisions`,
`decisions_by_decade`, `decisions_with_topic_by_decade` so the denominator
travels with the number. The old `classified` field (every row with a topic)
was removed rather than left in the file for someone to quote. No gate caught
this — the gates check that values are legal, not that a denominator is the
one the sentence beside it claims.
