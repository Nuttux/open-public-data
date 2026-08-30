# What every column means

One row is one thing the San Francisco Board of Supervisors dealt with, 1906–2026.
124,284 rows.

Written for someone opening this file for the first time. **If a value needs a
glossary entry to understand, it is the wrong value** — that rule is why
`stated`, `addr` and `segment` are not in here. They were the builder's
shorthand and meant nothing to a reader.

---

## The plain columns

| column | what it holds |
|---|---|
| `id` | stable key — the volume and the item number within it |
| `year` | 1906–2026 |
| `date` | month and day, where the volume printed one |
| `kind` | `resolution` · `ordinance` · `motion` · `hearing` · `departmental work` |
| `heading` | the title the volume printed above the item, where there is one |
| `text` | the line as printed — original spelling and the scan's errors kept |
| `source_url` | opens the scanned page it was read from |
| `block` | the assessor block, when there is one |
| `longitude` / `latitude` | where it happened, when that is known well enough |
| `streets` | the street names the record itself printed, `|` separated — 76% of rows |
| `refers_to_decision_number` | for a bare vote outcome, the decision number it points at: the thread back to the row that says what was voted on. Blank when a row cites several, because which one it *is* cannot be known from the text. 45% of rows |

`departmental work` is not a Board act at all — it is text lifted from
engineering annual reports (0.9% of rows). It carries no topic.

---

## Is this a record, and does it describe itself?

### `record_type`

| value | share | what it is |
|---|---|---|
| `decision` | ~82% | a real record that says what it was about |
| `vote-outcome-only` | ~6% | `Resolution No. 341-25 ADOPTED` — 29 characters, the whole row. The description is in **another** row, filed when the item was introduced |
| `page-furniture` | ~4% | a running footer, the Sunshine Ordinance contact block, an sfgov.org URL. Only when that is the *whole* row |
| `index-row` | <1% | a line from the volume's own index |
| `cut-in-half` | ~1% | the page break landed mid-sentence |
| `too-damaged` | <1% | the scan is too poor to make out a sentence |
| `departmental-work` | ~1% | an engineering report, not a Board act |

Only `decision` rows carry a subject topic. The rest are counted, never summed
into subject figures.

---

## What is it about?

### `topic` — eight, one per row

| | |
|---|---|
| `the-street` | paving, grades, sidewalk widths, set-backs, names, closures, sewers, lighting, wires |
| `getting-around` | parking, traffic, transit, railways, freeways |
| `land-and-building` | zoning, subdivisions, buying, selling, leasing, construction, redevelopment, landmarks |
| `doing-business` | the permit trade — tanks, boilers, stables, laundries, blasting, liquor, taxis, franchises |
| `city-services` | parks, schools, libraries, police, fire, health, housing, the port, water, environment, emergencies |
| `running-the-city` | votes, appointments, staff, code changes, elections, hearings, oversight, business districts |
| `public-money` | the budget, bonds, taxes, assessments, claims, lawsuits — where money itself is the subject |
| `civic-life` | commendations, proclamations, positions on state and national matters |

### `subtopic` — the finer level, may be blank

About sixty of them, listed in `pipeline/seeds/sf_bos_taxonomy.json`. Blank
means the topic is known and we have not gone deeper, never that the subtopic is
"other".

### `action` — what the Board actually *did*

`granted` · `refused` · `ordered` · `accepted` · `appropriated` · `paid` ·
`settled` · `amended` · `appointed` · `commended` · `voted-or-scheduled` ·
`other`

**Topic and action are separate on purpose.** *"Appropriating $232,530, Water
Department, reconstruction of Market Street water mains"* is an **appropriation**
about **water**. Squeezing both into one column made a single topic swallow every
row that mentioned a sum, and it was the largest single source of error when the
draft was checked against a hand-read sample.

`refused` matters more than it looks: the early Board denied permits constantly,
and a denial reads almost exactly like a grant.

**There is no `tags` column.** One was designed — `neighbours objected`, `went to
court`, `an emergency was declared` — and then never populated, so it would have
shipped blank on all 124,284 rows. A documented column that is always empty is
worse than a missing one: a reader cannot tell a promise from a bug. `refused`
survived as an `action` value, which is where it belonged.

---

## Where did it happen?

Not yes/no. The record locates things to six degrees, and the difference is the
reason the map does not put a dot on "somewhere on Mission Street".

### `how_we_know_where`

| value | what the record said | dot on a map? |
|---|---|---|
| `names its own block` | prints its own assessor block number | **yes** |
| `street address` | a house number matching a real address | **yes** |
| `between two streets` | "Madrid Street, from Francis to Persia" | **yes** |
| `street corner` | two streets that actually cross | **yes** |
| `street only` | a street name and nothing more | **no** — street known, spot not |
| `no place given` | nothing anywhere in it | no |

`street only` is about a third of all rows. They **are** located and they are
shown under "on this street" — they simply never get a dot.

### `why_no_place`

| value | what happened |
|---|---|
| `no place in the text` | the record never names a street. A lawsuit, an appointment, a proclamation |
| `named a street we could not use` | it named one and the placement refused it — the street ran too far, or the streets named belonged to the item printed below |

The second is our limit, the first is the record's nature. Merging them would
hide which is which.

**Some topics can never be mapped, and that is correct.** `public-money` /
`lawsuits` has a place 20% of the time, because a lawsuit is about a person.
`the-street` is 98%, because a paving order is an address by construction.

---

## Money

| column | |
|---|---|
| `amounts` | every printed figure, `|` separated |
| `amount_count` | how many |

**There is no single `amount` column, deliberately.** 81% of rows carry no
figure, 12.5% carry exactly one, and 6.2% carry several — a 1906 financial
statement carries six, up to $375M, and none of them is "the amount of the
decision". Take `amounts[0]` only when `amount_count` is 1.

---

## How much of this was actually read

### `classified_by`

| value | what it means |
|---|---|
| `record` | a human read this row |
| `form` | a human read the sentence-*shape* this row shares with others. The Board wrote the same sentence thousands of times with the address swapped; the shape was normalised — numbers, money, street names and roll calls removed — and read once |
| `near-duplicate` | the same sentence as a row a person read, with different scan errors. The Journal reprints an ordinance at every reading and the two printings scan differently, so normalisation files them apart; a 4-gram shingle overlap of 0.80 or better catches what normalisation cannot |
| `rule` | a pattern that agreed 90–100% with a hand read on a blind sample |
| *(empty)* | not yet classified. An honest gap, not a zero |

Filter to `classified_by = record` to get only what a human eye saw directly.

**Why `rule` is only three families.** Rules were tested against 156 hand-read
records. `street levels and lines` agreed 100%, `lawsuits` 100%, `street names
and closures` 90%. Everything else scored between 0% and 67% and was deleted. A
rule that is right two times in three is worse than a blank, because nothing
downstream can tell which third it got wrong.

---

## Counting rules, so two people get the same answer

1. **`topic` is single-valued**, so topic counts add up to the row count. That
   is what makes it a partition rather than a set of labels.
2. **Do not count non-`decision` rows into subject figures.** Page furniture and
   bare vote outcomes are kept so the discard is auditable, not so it can be
   summed.
3. **Say which denominator you used.** "Half the record is about the street" is
   a different sentence over all rows, over decisions only, and over classified
   rows only. All three are legitimate; only one can be meant.
4. **Never add `topic` counts to the separate subject tags** in `themes.json`
   and `threads.json`. Those overlap by design; this does not.
