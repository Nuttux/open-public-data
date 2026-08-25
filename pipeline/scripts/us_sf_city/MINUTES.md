# The Board's record does not end in 1999. It was RENAMED.

Landed 2026-08-25 on `refactor/paris-parity`. Builder:
`pipeline/scripts/us_sf_city/build_minutes_manifest.py`.

## 1. The correction, in the words it deserves

```
1906–1999   "Journal of proceedings"                       143 catalogued volumes
1999–2016   "Meeting minutes" / "Minutes" /
            "Meeting minutes. Draft"                       the same series
```

Same Board, same deposit, same scanning programme, and **the volume numbering never
breaks**. This pipeline searched archive.org for the string *"Journal of proceedings"*,
found ninety-three years, and reported that the scanned series ends in 1999.

**"The scanned series ends in 1999" was never a fact about the record. It was a fact about
our search string.** The other seventeen years were sitting in the same collection, under
the same creator, the whole time.

It is written here in those words because it is exactly the class of error this project
spends its time finding in other people's data — a boundary in the *finding aid* read as a
boundary in the *world* — and we shipped it ourselves, on a public page, for months.

The series is now enumerated **by creator, never by title**. The title is used only to
exclude (committee minutes, agendas), never to include.

## 2. What the enumeration finds

```
270  creator:("San Francisco (Calif.). Board of Supervisors") AND title:(minutes)
143  creator:("San Francisco (Calif.). Board of Supervisors") AND title:("journal of proceedings")
---
378  distinct Board-level items after excluding 21 committee series
367  with coverage resolved            11 unresolved, listed by the build, never dropped silently
```

Coverage spans **1908 – 2016**, and every year from 1995 to 2016 is covered.
Seed: `pipeline/seeds/countries/us/seed_us_sf_bos_minutes.tsv` (367 rows,
`year_from · year_to · identifier · volume · title`).

## 3. Two traps, both real, both load-bearing

**a. The identifiers have no pattern.** In one series:

```
meetingminutes95sanfrich          0meetingminutes1999sanf
meetingjuneaug2003minutes9820sanfrich    meetingminutesbo2015sanf
meetingminutesb2016sanf_0
```

No template generates those. The collection is **enumerated** and whatever is there is
taken. A template would miss volumes silently, and a missing volume looks exactly like a
quiet city — which is the failure that hid 2000–2016 in the first place.

**b. `date` is the catalogue date and is provably not the coverage.**

```
1minutes2001sanf   volume "Jan-Feb 2001"   date 1997-01-01
1minutes1998sanf   volume "Jan-Feb 1998"   date 1997-01-01
```

Coverage is parsed from `volume`, then from the identifier, and **never** from `date`.
Same trap as the shipyard's 2014 buildings and the 2010 LiDAR: a date recording when a
record was *made*, read as when the thing *happened*.

**c. The volume numbering is a rule, and it is checked.** 137 items carry a bare volume
number ("95", "101", "92 pt. 2") and no year anywhere. The numbering is unbroken across
the rename and linear:

```
year = volume + 1905
```

Derived, then **asserted** in `verify_volume_rule()` against four volumes whose year this
pipeline had independently established in `scratchpad/sf-city-anim/vols.txt` long before
the modern half was found — vol 90→1995, 91→1996, 92→1997, 93→1998 — and against five
where volume and year both appear in the same record (98→2003 … 102→2007). That rule
recovers 126 of the 137.

## 4. THE PRESERVATION TABLE — the finding, not the plumbing

**Internet Archive** = the curated `sanfranciscopubliclibrary` book collection: stable
identifiers, page images, OCR, citable. **sfbos.org** = the Clerk's live website, minutes
published per meeting as `sites/default/files/bag<MMDDYY>_minutes.pdf`.

```
year        IA volumes    sfbos.org        verdict
1995–2003     9–20        not probed       Archive only
2004–2015     4–14        0 of 8 probed    Archive only
2016             2        3 of 8           BOTH — cite the Archive
2017–2026        0        4–7 of 8         *** sfbos ONLY ***
```

sfbos hit rates below 8/8 are the Board not sitting every week (recess, holidays);
**0 of 8 is a clean negative** and 4–7 of 8 is publishing normally.

**The seam is six weeks wide and it is nearly perfect.** The Archive's last volume covers
**April–May 2016**. sfbos.org's first published minutes are **2016-07-12**. Probed every
Tuesday from 1 May to 31 July 2016: nothing on sfbos before 12 July.

**The preservation finding, stated precisely — and it is narrower than "unarchived":**

- `collection:(sanfranciscopubliclibrary) AND date:[2017-01-01 TO 2026-12-31]` returns
  **zero**. The curated document collection genuinely stops at 2016.
- The Wayback Machine **has** crawled sfbos.org since at least 2009 and does capture the
  minutes PDFs — 373 distinct `_minutes.pdf` URLs captured in 2019, 280 in 2023.
- The Archive also holds 2017+ Board meetings as **SFGTV video**, and 2025–26 as
  `openpublica-san_francisco-california-*`, which is **video only** (mp4), 64 Board items.

So the honest sentence is **not** "the record after 2016 is unarchived". It is:

> **From 2017 the written record survives only as incidentally-crawled PDFs and as video.
> The curated, paginated, OCR'd, citable document series — the thing that makes 1906–2016
> readable and quotable — stops in 2016.**

Those are two different kinds of preservation, and only one of them can be read by a
machine, cited by a page number, or shown as a photograph of a page. That is the gift to
hand the sponsor: not "you are missing this", but "you hold a century of this in a form
nothing else matches, and the form stops in 2016 while the city keeps publishing."

## 5. What is ingested, and what remains

`--fetch --after 1998` caches the two files the existing sweep already reads
(`<id>_hocr_searchtext.txt.gz`, `<id>_hocr_pageindex.json.gz`) into
`scratchpad/sf-city-anim/geo/cache/ia/`, for the **177 volumes covering a year after 1998**.
The OCR is unrestricted and the file layout is identical to the Journal volumes — verified
on `meetingminutesbo2016sanf`, `meetingminutesbo2015sanf`, `meetingminutes95sanfrich`,
`0meetingminutes1999sanf` and `meetingjuneaug2003minutes9820sanfrich`.

**The remaining step is not mine and is deliberately not done here.** The corpus is driven
by `scratchpad/sf-city-anim/vols.txt` (`year identifier`, one per line) and rebuilt by
`blocks/extract_texts.py` → `blocks/build_index.py`, which regenerate
`website/public/data/us/sf/city/blocks/block-*.json` — the shards the panel agent is
currently mid-change in. Appending the seed's post-1998 rows to `vols.txt` and re-running
those two passes is the whole of it. **Coordinate before running it; do not race the panel.**

## 6. WHAT NOW READS FALSE — write-out, not edits

These are wrong in the same direction and none of these files were touched.

| where | what it says | what is true |
|---|---|---|
| `block-records.ts` `SERIES_LAST_YEAR = 1999` | the series ends 1999 | the scanned series ends **2016**; the Board's own PDFs run to now |
| `block-records.ts` header, "142 of 142 … 1906–1999 — the complete series" | complete | it is complete for one *title*. The series continues under two more |
| `DecadeGroup.afterSeries` | decades after 1999 draw as *unrecorded* | 2000s and 2010s are **recorded and scanned**; only 2017+ is outside the collection |
| the rail caption, `us.sf.thecity.panel.sum_rail_end` | "The Board's Journal is scanned to 1999… the record stops there" | **this sentence is the error.** The record did not stop; the title changed |
| the page's span | ends 1999 | ends 2016 |
| `FILM.md` on the scanned series | ends 1999 | same correction |

Suggested caption once the ingest lands — it keeps the honesty and drops the false claim:

> *The Board's minutes are scanned through 2016 — under three different titles, which is
> why they were once thought to stop in 1999. From 2017 the Clerk publishes them as PDFs
> and no library has bound them.*

## 7. The plain answer Daniel asked for

**Last year a reader can see the Board's own decisions on this map: 2016.**
**First year they cannot: 2017.**

**And the reason is none of the four bad ones.** It is not "not published" — the Clerk
publishes every meeting. It is not "published but not scanned" — they are born digital.
It is not "behind an API that stops". It is the fourth, and the mildest:

> **It is published, and digital, and free — and no library has accessioned it into a
> collection anyone can cite. The gap is not in the record. It is in the shelf.**

For 1999–2016 the answer was the third one — *scanned, but under a name nobody searched* —
and that one was ours.

## 8. Legistar, closed out

Not the route, and the research is stopped. `pipeline/minutes/cache/legistar/` holds
30,428 matters for 2000–2018 with **no location field**. The Journal's extractor runs on
its titles unchanged and places **16.8%** (11.6% at block precision, n=500, seed 7) — a
day of work, not the six weeks once estimated. Reading the full **enacted body** instead of
the title does **not** improve it: sampled across 2017–2025 on `sfbos.org` ordinance PDFs,
51 with a text layer placed at **16%** (12% at block precision).

**That is the real finding and it retires the question.** The 16.8% was never a limit of
reading titles. It is the fraction of Board legislation that concerns a specific place at
all — the rest is budget, code, contracts, settlements and appointments, which have no
location to lose. *(n=51, so ±10 points at 95%; it is indistinguishable from the title
arm, not proven equal to it.)*

Also measured and worth keeping: `sfbos.org/sites/default/files/o<NNNN>-<YY>.pdf` serves
enacted ordinances by number for **2017–2025 only** (404 for every year 1995–2016), and
most carry a text layer, though some are scans. `/matters/{id}/indexes` is empty,
`/texts` rejects GET, every `MatterText*` field is null, and `/attachments` returns the
drafted `.DOC`.

**A trap, recorded.** `pipeline/minutes/legistar.py::year()` caches per year and skips any
cached file over 40 bytes. Probing 2019–2026 wrote eight authoritative-looking empty
caches; they were deleted. A later run would have read them as fact and capped the corpus
at 2018 silently.

---

# THE INGEST — 2026-08-25

Everything below is imported, gated and measured. **Nothing is published.** The
website's block shards are byte-for-byte what they were this morning, and the
one blocker is in §14.

## 9. What went in

```
                        volumes   rows      years        where
Journal (already in)        186   97,688    1906-1999    unchanged
Meeting minutes / Minutes   143   32,002    1999-2016    NEW, merged
sfbos.org PDFs              390    6,786    2016-2026    NEW, extracted, NOT merged (§13)
```

The block index rebuilt from the first two now holds **98,074 decisions on 5,089
blocks**, and **4,732 blocks carry at least one block-precision decision** (was
4,679). The two decades that were empty are no longer empty:

```
decade    decisions            blocks with anything
          before    after      before    after
1990s      4,185    4,238       1,820    1,828
2000s         26    4,260          24    1,668
2010s         49    2,456          49      980
```

## 10. Four gates, and what each one caught

**Gate 1 — the sweeper reproduces what it already swept.** `sweep/verify_parity.py`
on four volumes: IDENTICAL, 5,623 rows. Run before anything was written.

**Gate 2 — no previously-swept volume changes.** Rebuilding the stream compares
every prior volume element for element. It fired once, correctly, when the
committee volumes of an earlier pass would have vanished; a volume may now leave
only when gate 3 has declared it, with its evidence on disk.

**Gate 3 — a committee is not the Board, and a catalogue year can be wrong.**
Read from each scan's own cover, because the catalogue cannot see either:

- **28 volumes / 869 items are committee minutes** — Finance, Rules, Budget,
  Audit, Public Health. The catalogue titles them "Minutes" like the rest. The
  Journal half of this corpus contains no committee minutes, so merging them
  would quietly change what *"the Board decided here"* means.
- **`meetingminutesd2015sanf_0` is catalogued 2015 and is the Mental Health
  Advisory Board of 16 December 1992** — twenty-three years out, caught by
  comparing each volume's assigned year against the meeting dates its own items
  carry. 172 of 173 volumes agree with themselves; that one does not.

**Gate 4 — the Journal keeps its own years.** Several "Minutes" volumes are bound
1998-99 and carry 1998 meetings the Journal already has. **245 rows refused.**
Before this rule the near-duplicate pass preferred the new reading and dropped
the Journal's on 45 blocks in 1998 alone — the old map paying for the new one.

## 11. THE COMPLETENESS AUDIT — meeting by meeting

Every **weekday** from 2016-06-01 to today probed for both files, because an
agenda is published when a meeting is CALLED and minutes when it has been HELD.
2,670 weekdays. Not a sample.

```
year   meetings   minutes   agenda but NO minutes
2016         18        18       0
2017         37        37       0
2018         39        39       0
2019         40        40       0
2020         48        47       1   <<<
2021         41        41       0
2022         38        38       0
2023         39        39       0
2024         40        40       0
2025         39        39       0
2026         13        12       1   <<<
TOTAL       392       390       2
```

**390 of 392. Two meetings were called and have no published minutes:**

- **2020-03-19** — a *Special Meeting*, Thursday 11:00, two days after San
  Francisco's shelter-in-place order took effect.
- **2026-04-21** — a *Regular Meeting*, Tuesday 2:00 PM.

Both agendas were downloaded and read; both name a real meeting with a full
roster. Five filename variants were probed for each (`_min`, `_minutes_0`,
`_draftminutes`, …) and the meetings either side of both dates do have minutes,
so this is not a naming change. **These two are the hunt list**, and the answer
is with the Clerk, not in any file we can fetch.

## 12. The 64 volumes NOT ingested, on purpose

The enumeration also finds 64 volumes titled "Minutes" covering **1974-1998** —
years the bound Journal volumes already carry and which are already in the index.
They are almost certainly the same meetings in a different binding. They are not
swept, because a second copy of a decision is not a second decision, and the
duplicate would land on pre-1999 blocks. **Whether they are genuinely the same
meetings is an open question worth answering** — if they are not, there is more
record here.

## 13. sfbos.org is extracted but NOT merged, and why

390 PDFs, all with a text layer, 42,405 items split, **6,786 carry a resolvable
street, 5,197 place (76.6%), 3,717 at block precision, touching 2,907 of 5,404
blocks** — evenly spread, 347 in 2016 through 274 in 2026 so far. 3,330 are
`addr` tier, a real house number inside a real parcel range. It is good data.

**It is not merged because every row in the block index carries `u` as
`"<archive.org identifier>/<leaf>"`, and the renderer turns that into an
archive.org page link.** An sfbos meeting has no archive.org identifier and no
leaf. Merging these rows as they stand would mint a citation that resolves to
nothing — a dead link under a real decision, which is worse than no link. The
rows carry their own honest citation instead (`src`, `url`, `page`), and how a
PDF-backed decision should be cited on the page is a decision to take with
Daniel, not inside an ingest.

## 14. THE BLOCKER — 13 pre-1999 decisions still move

`verify_block_regression.py` splits every block's list on the year and compares
the pre-1999 half element for element, in order. It is negative-controlled:
deleting one decision out of 90,805 makes it fail and name the decision.

```
                                          blocks changed   genuinely lost
naive merge                                    324              95
+ Journal keeps its own years (gate 4)         287              52
+ near-duplicate pass scoped to one era         23              13
```

**Pre-1999 totals now match exactly: 90,805 = 90,805.** But 13 decisions from
1909-1987 are gone from blocks they were on, and 13 others surfaced.

**The cause, and why it is not a bug in the ingest.** The near-duplicate pass
collapses two readings of one decision, and it is order-sensitive by
construction — a sliding window over the rows already kept, in rank order. Add
rows to a block and a different member of a near-identical set survives. I scoped
that pass so a 2015 minute can no longer suppress a 1926 ordinance, which is
correct on the merits and removed 92% of the movement. The residual is
structural: **the baseline's own pre-1999 layer is already partly a product of
its 586 post-1999 rows**, so any partition changes it. A control build — the
scoped code on the UNCHANGED corpus — moves 76 blocks by itself.

**There is no merge that adds the modern era and leaves pre-1999 bit-identical**,
because the pre-1999 output is a function of the whole corpus. The options are:

1. **Accept 13 in 90,805 (0.014%), two-directional**, and record it.
2. **Redesign the pass to be order-independent** — cluster near-duplicates and
   pick a representative by a deterministic key. Stable forever after, but it
   moves *more* pre-1999 rows once, and it is a real change to a tuned pass.
3. **Keep the modern era as a parallel layer** beside the index, the way
   `block-landuse.json` already sits beside it. Zero regression, at the cost of
   the map carrying two record systems.

**This is the decision to bring back, and nothing ships until it is made.**

## 15. State on disk

- `scratchpad/sf-city-anim/blocks/cache/items.jsonl` — **merged**, 129,690 rows
- `scratchpad/sf-city-anim/blocks/out/` — **rebuilt** from it
- `website/public/data/us/sf/city/blocks/` — **untouched**, verified with git
- **`scratchpad/sf-city-anim/blocks/build_index.py` is MODIFIED** (§14's era
  scoping) and `scratchpad/` is not under version control, so that change exists
  only on this disk. Original at
  `scratchpad/.../build_index.py.bak` in the session scratchpad.
- Full pre-ingest baseline (items, leafmap, prefaces, `out/`, 155 MB) is backed
  up and `merge/RESTORE.sh` still restores the known-good pre-merge index.

## 16. What the map's last year becomes

**With what is merged today: 2016.** With sfbos merged once §13 is settled:
**2026, current to this month.**

---

# 17. ARE THE THREE ERAS THE SAME RECORD? — measured 2026-08-25

Daniel asked, in plain English, whether the pre-1999 collection, the 1999–2016
one and the post-2016 one are the same kind of document. The honest answer is
**yes, and the one number that suggested otherwise was ours, not the city's.**

Measured by `compare_minute_eras.py` over 10 Journal volumes, 10 Minutes volumes
and 40 sfbos meetings, with **one counter at the same four gates for all three**.

## 17.1 The density collapse was not real

The signal was ~1,050 rows/year before 1999, ~1,880 in the middle, ~680 after.
Two things caused it, and neither is the Board recording less.

**(a) The denominators were different — my error.** `sweep/extract_items.py`
drops an item BEFORE counting it when it names no place (`if not locs: continue`,
then `item_id += 1`). Its "rows" are items that already mention a street. My
sfbos counter counted every split item. Counted the same way:

```
                      split   mentions  resolved   men%    res%   median chars
1906-1999 Journal    25,382     6,165     5,668   24.3%   91.9%       320
1999-2016 Minutes     9,767     2,289     1,745   23.4%   76.2%       363
2016-2026 sfbos       4,144       871       648   21.0%   74.4%       376
```

**The share of items that name a place is the same in all three eras** — 24.3%,
23.4%, 21.0%. And per meeting, the modern record is *denser*, not thinner:

```
                   meetings   items/meeting   place-naming items/meeting
1906-1999               439           57.6                12.9
1999-2016               143           68.3                12.2
2016-2026                42           98.7                15.4
```

**(b) The middle era is 48% redundant, and that is a fact about the ARCHIVE.**
Collapsing near-duplicates *within a single meeting*, using the index's own
shingle test:

```
                     dated rows   distinct   redundant   distinct decisions/meeting
Journal 1906-1999        96,096     85,759      10.8%            14.9
Minutes 1999-2016        31,944     16,530      48.3%            13.5
```

**Once the duplication is removed the two eras agree: 14.9 and 13.5 decisions per
meeting.** The record is continuous. The middle era only looked denser because
the Internet Archive holds the same meetings several times over:

- **54.6% of 1999–2016 meeting dates are covered by more than one volume**, and
  **83.4% of that era's rows sit on such a date**. Against **2.3% / 2.5%** for the
  Journal.
- One meeting, 2005-11-08, appears in **seven** volumes.
- `meetingminutesb2005sanf_0` and `meetingaprmay2005minutes100sanfrich` have the
  **same 235 rows and the same month profile (2005-04:129, 2005-05:96,
  2005-11:10)** — the same physical volume scanned twice under two identifiers.
  Not byte-identical, because two scans are two OCR passes; **17 volumes share an
  identical row-count and month profile** with another.
- 6,945 rows come from volumes titled "Meeting minutes. **Draft**", alongside the
  finals of the same meetings.

## 17.2 Same kind of document? Yes, strikingly

The Board has written a decision the same way for 120 years.

```
                   Resolution   Ordinance   Motion    median item
1906-1999               50.0%       35.8%    14.2%       320 chars
1999-2016               46.9%       35.5%    17.6%       363 chars
2016-2026               51.5%       33.8%    14.6%       376 chars
```

And about half of every era is procedure rather than substance — vote records and
roll calls: **51.6% / 46.2% / 38.5%**. That is not a modern degradation; it is
what minutes have always been.

## 17.3 Is a "row" the same thing? Broadly yes, with two modern quirks

```
                    repeated opening    same file-no    public comment   template
                    within a meeting     repeated        per speaker     boilerplate
1906-1999                  9.4%            8.1%             0.6%           0.0%
1999-2016                  9.6%            2.7%             0.5%           0.3%
2016-2026                 13.3%           10.7%             5.4%           1.2%
```

The modern minutes record public comment **per speaker underneath the item**, so
one resolution can appear several times with a different name attached
("*Leilani; expressed the need to…*", "*Blanca Castro; expressed support*"). And
the PDF template carries explanatory text that reads like an item ("*Resolution
may be introduced before the Board…*"). Together about 6.6% of modern rows, and
both are exactly what the index's near-duplicate pass already exists to collapse.
**No structural mismatch — a row means the same thing in all three.**

## 17.4 The subject mix shifts, and that shift is real

`build_index.SUBJECT_CUES`, % of items matching:

```
subject                  1906-1999   1999-2016   2016-2026
street paving                 5.7%        2.0%        1.8%
sewers                        2.0%        0.2%        0.1%
streetcar lines               2.9%        0.4%        0.1%
oil tanks and boilers         2.4%        0.1%        0.1%
water mains                   1.8%        0.3%        0.7%
payments and claims          15.3%        7.1%        6.0%
zoning                        2.6%        6.2%        4.7%   <- up
subdivision maps              1.2%        2.5%        1.6%   <- up
(matches no cue)             59.7%       71.1%       77.3%
```

**In plain English: the early Board was building the physical city — paving,
sewers, streetcar lines, water mains, boiler permits — and the modern Board
mostly governs land use.** Zoning more than doubles as a share; sewers and
streetcars all but vanish. That is a real finding about San Francisco.

**The caveat that must travel with it:** these cues were written from the Journal
corpus, so they describe it best. "Matches no cue" rises from 59.7% to 77.3%,
which is partly the modern Board doing things the Journal's vocabulary has no
word for. The direction is trustworthy; the exact percentages are not a census.

## 17.5 Why modern street names resolve less often (91.9% → ~75%)

Not thinner text. The extractor is picking up **institution names shaped like
streets**, and the gazetteer is correctly refusing them. The top unresolved
phrases post-1999 are `San Francisco Superior [Court]`, `United States District
[Court]`, `Goodlett [Place]` — City Hall's own address, printed in every modern
meeting header — plus `Slow Street` (a COVID-era programme), `Noe Valley Town
[Square]`, `Heron's Head [Park]`. Settlements of lawsuits are a large share of
modern items and they name courts. **Nothing is being placed wrongly; the refusal
is the system working.**

One genuine gain: the 1999–2016 minutes name an **Assessor's Block outright** in
2.9% of items, against 0.4% in the Journal — seven times more often the record
answers for its own location.

## 17.6 What this changes about the de-duplication decision

§14 offered three options for the 13 pre-1999 decisions that move. **This
measurement points at a fourth, and it is better than all of them.**

The churn happens because the near-duplicate pass is being asked to absorb an
enormous amount of duplication — **48% of the middle era** — inside the block
index, at ranking time, one block at a time. That is the wrong place to do it.

**Deduplicate at the volume level, before the index: one scan per physical
volume, finals preferred over drafts.** It attacks the cause rather than the
symptom, it shrinks the merged corpus by roughly half its modern half, and it
should remove most of the pressure that is destabilising the pre-1999 rows —
because the pass would no longer be choosing between seven readings of the same
meeting.

**This is measured but not yet built, and it should be built before the
order-independent redesign is chosen**, because it may make that redesign
unnecessary. It is also the honest thing to do regardless: shipping seven scans
of one meeting as seven decisions would be wrong even if nothing else broke.

---

# 18. VOLUME-LEVEL DE-DUPLICATION — built 2026-08-25

Greenlit after §17. **One scan per meeting, finals over drafts**, fixed at the
source rather than left to the index to absorb one block at a time.

## 18.1 The rule, and it reports what it chose

`sweep_modern_minutes.py --scans` prints the decision for every meeting.

**The unit is the meeting and only the meeting.** Two decisions taken on two
different dates are two decisions however alike they read; every comparison below
is keyed on one exact meeting date. This collapses re-scans of one session. It
never collapses a subject.

**Scope is the modern era only.** The Journal has the same problem at 2.3% of
dates, and fixing it there would change pre-1999 blocks — the one outcome this
exercise exists to prevent. That overlap is left alone and recorded here as a
later question.

In order, and every choice is counted:

```
  525  only one volume carries this meeting
  245  final chosen over draft
  203  fuller reading of the meeting          (more items dated to it)
  171  equivalent re-scans, resolved by identifier
   26  better OCR on the meeting
   24  UNDECIDED — reported, not silently resolved
```

**Equivalence had to be calibrated, not assumed.** An exact text test is the
wrong one: two scans of one session agree on only **0.74–0.89** of their items by
exact text, because they are two OCR passes over the same ink. Compared as word
shingles — the test `build_index` already uses — the same three pairs match at
**1.00, 1.00, 1.00**. Calibrated on 2000-01-31, 2000-05-15, 2001-01-02.

**It fails loudly.** The first run reported **74** undecided meetings and
refused to merge (`UNDECIDED_MAX = 25`). That was the equivalence test being too
strict, not the data. With the calibrated test, 24 remain, each printed with its
match rate (0.67–0.93) so a human can judge; they are resolved by a declared
deterministic fallback, and if the count ever exceeds 25 the merge stops.

**The test case you named passes.** `meetingminutesb2005sanf_0` and
`meetingaprmay2005minutes100sanfrich` — the same 235 rows, the same month profile
(2005-04:129, 2005-05:96, 2005-11:10). After the rule: one wins **8** meetings,
the other **0**, and **0** dates are claimed by both.

**What it removed:** 14,017 duplicate-scan rows. The modern era falls from
32,002 to **17,985** — a 43.8% cut, against the 48.3% redundancy measured in
§17.1 by a completely different method.

## 18.2 The regression proof — it does NOT reach zero

You asked for the count, not "it got better". Four variants, same verifier:

```
                                              blocks   dropped   appeared
gate 4 only, index unchanged                     287        78        330
+ volume de-duplication, index unchanged         261        67        297
+ volume de-duplication, era-scoped index         23        13         13
+ volume de-duplication, same-MEETING index    3,177     5,099      9,067
```

**13 pre-1999 decisions still move.** Pre-1999 totals match exactly
(90,805 = 90,805), and 13 decisions from 1909–1987 leave blocks they were on
while 13 others surface.

**Two things this measurement settles.**

**(a) The volume de-duplication is right on the merits but is not what fixes the
regression.** It removes 14,017 rows that should never have been there, and it
moves the regression only 287 → 261. The era scoping is what takes it to 23, and
the residual is identical with or without the de-duplication — so the residual is
not caused by the volume of modern data at all.

**(b) A tighter scope is worse, and this is why the redesign needs care.**
Restricting suppression to the same MEETING — which sounds like the true
invariant — moves 3,177 blocks and *grows* the pre-1999 layer by 3,966
decisions. The Journal legitimately prints one item across several meetings
(introduced at one, finally passed at another), and collapsing those is work this
pass is supposed to do. **Any order-independent redesign has to keep
cross-meeting collapse while dropping cross-era collapse**, or it will undo a
decade of correct suppression.

**So: take the order-independent redesign as well.** The residual 13 come from
the pre-ingest index's own pre-1999 output already being partly a product of its
586 post-1999 rows — a control build (era-scoped code, unchanged corpus) moves 76
blocks by itself. No partition of a corpus whose old half depends on its new half
can leave the old half bit-identical.

## 18.3 What the rail looks like, for the design conversation

```
decade    blocks with a record       decisions
          before      after       before     after
1900s      1,715      1,715        6,203      6,202
1910s      3,361      3,361       22,650     22,646
1920s      3,836      3,836       26,845     26,844
1930s      2,806      2,806        9,068      9,067
1940s      2,048      2,048        5,357      5,357
1950s      1,889      1,889        3,897      3,897
1960s      1,613      1,613        2,980      2,980
1970s      2,154      2,153        4,642      4,641
1980s      2,021      2,021        5,489      5,486
1990s      1,820      1,829        4,185      4,241
2000s         24      1,598           26      3,854
2010s         49        956           49      2,259
```

```
blocks gaining a 2000s decade                       1,574
blocks gaining a 2010s decade                         907
blocks gaining BOTH                                   539
blocks gaining at least one                         1,942   of 5,089 with any record
of those, blocks that ALSO have a pre-1999 record    1,937
```

**The two things worth knowing before designing anything.**

**It is a continuation, not a new population.** 1,937 of the 1,942 blocks that
gain a modern decade already had a pre-1999 record. The rail does not sprout a
separate modern map; it extends lines that already exist.

**The modern decades are lighter but not a cliff.** 3,854 and 2,259 against a
Journal-era median of 5,486 and a 1990s of 4,241 — the same order of magnitude.
And the 2010s figure is **2010–2016 only**, because the scanned series stops
there; 2016–2026 is the sfbos half and is still unmerged (§13).

Nothing here is a design proposal. It is the picture to decide from.

---

# 19. THE ORDER-INDEPENDENT REDESIGN — built 2026-08-25

Greenlit after §18 showed the volume de-duplication and the regression were
unrelated problems. This fixes the second one.

## 19.1 What was wrong

The near-duplicate pass walked a block's rows in rank order and compared each
against a **sliding window of the rows it had already kept** (`shs[-40:]`,
`plines[-40:]`). Which member of a near-identical set survived therefore depended
on what had arrived before it — so merging new volumes moved decisions on and off
blocks that had nothing to do with the new data.

## 19.2 What it is now

**Same tests, deterministic traversal.** Rows are walked in a total order derived
from their own content — `_rowkey` = (score, year, date, page, full text,
volume, item number) — and a row is dropped when it resembles a row already
elected. The windows stay; only their order changes.

**Three designs were tried and two were wrong. Both failures are recorded because
each looked like an improvement.**

```
                                     pre-1999   dropped   genuine   duplicate
                                       total              losses    rate after
greedy, arrival order (shipped)        90,805        —         —        12.4%
transitive clustering (union-find)     85,756    8,570    ~3,500         8.0%
leader election, unbounded             88,979    5,630    ~1,240         8.3%
leader election, content-ordered
  windows                              90,820    4,768    ~1,064        10.5%
```

- **Union-find chains.** A resembles B, B resembles C, so A, B and C become one
  group and two are dropped even when A and C are plainly different decisions.
  It deleted about 3,500 real pre-1999 decisions. **Its duplicate rate was the
  best of the three (8.0%) — it looked like the winner.**
- **Unbounded leader comparison over-collapses.** This test reads the printed
  LINE, about ninety characters of heading, and two genuinely different decisions
  share one routinely ("Changing and re-establishing the official grades on
  Capitol avenue, between …"). Removing the forty-row bound deleted ~1,240
  decisions with nothing like them left on their block. **The bound was doing
  real work.**

## 19.3 The proof — a test that can fail, and did, twice

`verify_order_independence.py` shuffles `items.jsonl`, rebuilds, hashes every
published file, and does it again with a different shuffle.

```
run 1   FAIL   1,352 of 2,197 files differ      block shards
run 2   FAIL   1,095 of 2,197 files differ      street files
run 3   PASS   all 2,197 files identical
```

Both failures were real bugs the test found, not test noise:

1. **`_rowkey` was not a total order.** Rows agreeing on score, year, date, page
   and their opening 200 characters tied, and Python's stable sort fell back to
   arrival order. Fixed by appending the volume identifier and the item's own
   sequence number, both assigned by the sweep from the document itself.
2. **The T2 street files sorted on score alone.** Streets carry many rows at one
   score, so the top-120 cut depended on collection order. Same total key.

## 19.4 The one-time move, counted

**`moves_pre1999.tsv` — 9,551 rows across 2,757 blocks, every moved pre-1999
decision with its year, date, page citation and text.** That file is the point:
a deliberate one-time move is fine; an uncounted one is how this began.

```
pre-1999 decisions   90,805 -> 90,820   (+15)
                     4,768 left, 4,783 arrived — near-perfectly symmetric

of what left    77% is a swap inside a duplicate group, 23% (~1,064) different
of what arrived 80% is a swap inside a duplicate group, 20% (~926)   different
duplicate rate  12.4% -> 10.5% of pre-1999 rows still have a near-duplicate sibling
```

**In plain English: about 3,700 of the moves are the same decision now
represented by a different one of its readings — the arbitrary tie-break
replaced by a deterministic one. Beneath that, roughly a thousand rows out and a
thousand in are genuinely different content, and the result carries measurably
fewer duplicates than what ships today.**

It does not reach zero and was never going to: the shipped index's pre-1999 layer
is itself a product of arrival order, so any deterministic rule must disagree
with it somewhere. **What matters is that it will not move again** — the same
corpus now produces the same bytes however it is shuffled.

## 19.5 Still standing

The cross-era scope from §18 is unchanged and its warning is in the code beside
the rule: **keep cross-meeting collapse, drop cross-era collapse.** A
same-meeting scope moves 3,177 blocks and grows the pre-1999 layer by 3,966
decisions, because the Journal legitimately prints one item across several
meetings. It looks like a win because the numbers go up.

The 24 undecided meetings from §18.1 stay undecided and printed.

**Nothing is published.** `website/public/data/us/sf/city/blocks/` is still
byte-for-byte what it was, pending review of `moves_pre1999.tsv`.

---

# 20. BLOCK LAYER vs STREET LAYER — the hypothesis does not survive measurement

Asked to find N such that a decision naming more than N distinct streets belongs
in the street layer rather than on any block. **There is no such N, because there
is no problem to fix.** Nothing was built. `measure_block_vs_street.py`.

## 20.1 The 18.2% is not real

Re-derived with the parser the placement code actually uses — `joined.json`
carries `r`, the gazetteer-resolved mentions the placement itself joined on — and
against the UNCAPPED fronting-street set:

```
block rows                                          97,399
  names a street that FRONTS this block             97,080   99.7%
  names streets, NONE of which front this block        319    0.3%
  names no street at all                                 0    0.0%
```

against the survey's 61.8% / 18.2% / 20.0%.

**"Names no street at all" cannot be 20%; it is 0 by construction.** `load_items()`
admits an item only when `LR(r)` is non-empty — an item with no gazetteer-resolved
street never enters the corpus, so it can never reach a block. Any measurement
returning a fifth of the layer in that bucket is measuring its own regex.

**And my own first guess was wrong too, which is worth recording.** I expected the
published `s` list being capped at six (`build_index.py`: `sorted(...)[:6]`) to
explain the gap. Measured, it explains almost none of it: only **43 of 5,159
blocks** front more than six streets, and scoring against the capped list instead
of the uncapped one moves the figure from 99.7% to **99.5%** — 191 rows. The cap
is real and it is nearly irrelevant here.

## 20.2 What the 0.3% actually is, and it is correct

All **319** are the `stated` tier, and every one carries an explicit
*"Assessor's Block N"* naming the block it sits on:

```
tier        rows    fronts   no front
stated     2,164     85.3%      14.7%
addr      21,348    100.0%       0.0%
segment   17,573    100.0%       0.0%
corner    56,314    100.0%       0.0%
```

> block 0355 · *"Authorizing sale of City land in Assessor's Block 355"* ·
> streets named: PARK, YERBA BUENA — neither fronts 355.

The record is answering for its own location, which is why `stated` outranks
everything the index can infer. **Demanding that a stated block also front a named
street would break the highest-precision tier in the system.** The other three
tiers are 100.0% by construction: they are derived from a street that fronts the
block, so they cannot be otherwise.

## 20.3 The curve, and it runs the wrong way

```
   N   rows leave  % of layer  blocks losing last  match rate
   —            0        0.0%                   0       99.7%   (baseline)
   2       68,514       70.3%                 719       99.0%
   3       49,726       51.1%                 299       99.3%
   4       39,745       40.8%                 217       99.4%
   6       28,643       29.4%                 138       99.5%
  10       17,567       18.0%                  58       99.6%
  20        7,020        7.2%                  17       99.6%
  30        2,605        2.7%                   5       99.7%
```

**Every N makes the match rate worse or equal, never better.** The rule is
backwards: a decision naming many streets is MORE likely to name one that fronts
the block, not less, so removing multi-street decisions removes disproportionately
many correct rows. At N = 2 it would delete 70% of the block layer, strip 719
blocks of their last record, and lower the match rate.

The multi-street rule does not explain the over-smearing because **there is no
over-smearing to explain.** Stopping here rather than building it.

## 20.4 What the survey was probably seeing

The street layer holds **990,073** block-attributed street-tier rows against the
block layer's 97,399. Those are the smeared ones — a street-tier decision fronts
every block on its street, capped at `MAX_STREET_BLOCKS = 60` — and they are
already partitioned out: `own` is tier ≥ 1, `street_of` is tier 0, and the shard's
`d` array carries only `own`. **The two-layer split is already doing the job the
hypothesis proposed to do.** If there is a question left it is whether the street
layer's 60-block cap is right, which is a different measurement on a different
population.

## 20.5 Order-independence

**No placement code was changed** — this task added one read-only measurement
script and edited nothing under `blocks/`. `build_index.py` is unmodified since
22:48, before both the passing proof and the final index build at 23:15, so
`verify_order_independence.py` was not re-run: on byte-identical code it would be
a tautology, not a test. It should be re-run the moment placement is touched.

**Nothing published.** `website/public/data/` untouched.
