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

> **SUPERSEDED 2026-08-26 — see §21.** The citation shape this section was
> waiting on is designed, gated and built; sfbos.org is merged and the map
> reaches 2026. The reasoning below is kept because it is why the merge
> waited, and the block-count it quotes (2,907) is reconciled in §21.3.

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

> **DONE 2026-08-26 (§21).** The merged index reaches **2026**, and 1,060
> blocks carry a record ending 2017 or later. One correction to the line
> above: *current to this month* is wrong. The Clerk's last posted minutes
> are **2026-04-14** — minutes lag the meeting — so the map is current
> through April 2026, not August.

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

**CORRECTED 2026-08-26.** The first version of this table was measured on the
build that preceded the order-independence redesign of §19, and it shipped into
this file before that redesign moved 9,551 pre-1999 rows. The figures below are
re-measured against **what is actually published** —
`website/public/data/us/sf/city/blocks/`, commit `91de7fa0` — and verified
byte-identical to the final build across all 5,089 blocks.

```
decade    blocks with a record       decisions
          before      after       before     after
1900s      1,715      1,715        6,203      6,183
1910s      3,361      3,361       22,650     22,580
1920s      3,836      3,837       26,845     26,645
1930s      2,806      2,802        9,068      8,959
1940s      2,048      2,051        5,357      5,378
1950s      1,889      1,937        3,897      4,148
1960s      1,613      1,672        2,980      3,203
1970s      2,154      2,156        4,642      4,651
1980s      2,021      2,021        5,489      5,406
1990s      1,820      1,826        4,185      4,213
2000s         24      1,598           26      3,799
2010s         49        955           49      2,234
```

```
blocks gaining a 2000s decade                       1,574
blocks gaining a 2010s decade                         906
blocks gaining BOTH                                   538
blocks gaining at least one                         1,942   of 5,089 with any record
of those, blocks that ALSO have a pre-1999 record    1,890   (97.3%)
blocks carrying any record from 1999 onward         2,091
```

**What changed from the stale version, and what did not.** The headline is
unaffected: **1,890 of the 1,942 blocks that gain a modern decade already had a
pre-1999 record — 97.3%.** The rail extends lines that already exist rather than
sprouting a separate modern map, and that is still the fact the design should be
built around. The earlier draft of this table said 1,937 of 1,942, and 3,854 /
2,259 decisions for the 2000s and 2010s; the true published figures are 1,890,
3,799 and 2,234. The pre-1999 decade counts also moved — 1950s 3,897 to 4,148,
1960s 2,980 to 3,203 — which is the §19 one-time move, reviewed and accepted.

**The modern decades are lighter but not a cliff.** 3,799 and 2,234 against a
Journal-era median around 5,400 — the same order of magnitude. And the 2010s
figure is **2010–2016 only**, because the scanned series stops there; 2016–2026
is the sfbos half and is still unmerged (§13).

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

---

# 21. THE MAP REACHES 2026 — sfbos.org merged 2026-08-26

§13 held the Board's own PDFs back for one reason: `u` was an archive.org
coordinate and an sfbos meeting has no archive identifier and no leaf, so
merging the rows as they stood would have minted a citation that resolves to
nothing. That is now designed and built, and with it the last year on the map
goes **2016 → 2026**.

## 21.1 The citation shape

**`u` keeps the two parts it always had. What changes is what resolves them,
and a new one-character field says which.**

```
  archive.org scan   u = "journalofproceed22sanfrich/2161"   (c absent)
                     -> archive.org/details/<id>/page/n<leaf>/mode/1up
  Board PDF          u = "bag071216/3"          c = "b"
                     -> sfbos.org/sites/default/files/<stem>_minutes.pdf#page=<n>
```

**`c` is absent on every archive row, so nothing published before this changes
by a byte.** The control build below proves that rather than asserting it.

**Why a stem and a page rather than the whole URL.** Because the shape is an
invariant the build PROVES, not one it assumes. `sfbos_gate()` runs on every
build over the whole corpus and refuses to continue unless all 6,786 rows
satisfy both halves:

```
  url  == "https://sfbos.org/sites/default/files/" + <stem> + "_minutes.pdf"   6,786 / 6,786
  page == n + 1                                                                6,786 / 6,786
```

`n` is the file's 0-based page — the same convention the archive leaf uses — and
`n + 1` is the page a reader opens. If the sweep ever emits a row that breaks
either rule, the build stops and says so. A dead link under a real decision is
worse than no link, so this raises rather than warns.

**The links were checked against the live web, not assumed.** All 372 meetings
return **HTTP 200 `application/pdf`** (sfbos.org now 301-redirects to
`sfbos.archive.sf.gov`; the canonical form is kept because it is what the city
printed and the redirect is permanent). No `Content-Disposition` is set, so the
files render inline and `#page=` lands on the right page. Every cited page is
within its file's page count — **372 / 372 checked with a real PDF parser, 0 out
of range.**

**These rows need no `approx` flag.** The archive half carries one where a leaf
could not be mapped onto BookReader's list. The Board's page is read out of the
PDF's own text layer, so there is nothing to map and nothing to approximate:
all 3,206 Board rows in the block layer are exact.

## 21.2 The seam is real, and it does not overlap

**2016 is where the City stopped printing bound volumes and started posting
files, and the two corpora abut without touching.**

```
  archive.org bound volumes   last meeting   2016-06-07
  sfbos.org PDFs              first meeting  2016-07-12
  meeting dates in BOTH                               0
```

Seventeen meeting dates on each side of 2016, and **not one date in common.**
This is not a lucky cut — the harvest checked all 22 business dates in June 2016
and sfbos.org carries **no minutes PDF before 2016-07-12 at all**. The Board
recessed in the summer of 2016, and when it came back its record was a different
object.

**So there is no de-duplication to do across the seam**, and none was done. The
question §13 raised — how to de-duplicate where one side has archive leaves and
the other PDF pages — has no instance in the data.

**And the sfbos half has none of the duplication the middle era had either.**
372 PDFs, 372 distinct meetings, one file per meeting, `(volume, date)` unique
throughout. The volume-level de-duplication of §18 exists because the Archive
holds up to seven scans of one session; the city posts one file, once.

## 21.3 What lands, measured at the same gates as the Archive half

`measure_sfbos_placement.py` runs `build_index.locate()` — the placement the
published index actually uses — over both corpora, so the two eras are counted
at one set of gates.

```
                                    sfbos PDFs          archive scans
  items with a resolvable street         6,786                104,248
  placed at any tier              5,197  76.6%        86,524   83.0%
  at BLOCK precision (tier>=1)    3,717  54.8%        47,770   45.8%
  distinct blocks, block layer           1,127                  4,733
  distinct blocks incl. street-smear      2,907                  5,096

  tiers        stated    addr   segment   corner   street
  sfbos             1   3,330        88      298    1,480
  archive       3,358  13,455     7,029   23,928   38,754
```

**The modern half is worse at being placed and better at being precise, and both
have the same cause: the modern minute prints a street address and little
else.** It reaches a block 54.8% of the time against the Archive's 45.8%, and
**89.6% of what it places is address-or-better, against the Archive's 35.2%** —
the Journal's commonest construct is a corner or a segment, the Clerk's is
"1035 Folsom Street". The flip side is that 1,010 modern items name all their
streets after the roll call and are dropped, which is the largest single loss.

*(§13's "2,907 of 5,404 blocks" counted every block a row touches including the
street-tier smear. The block layer proper is 1,127. Both are above; the second
is the honest one.)*

**1,104 of those 1,127 blocks already had an Archive-era record.** The modern
era extends lines that exist; only 23 blocks are new to the map because of it.

*The 67.7% "address-or-better" figure quoted for the Archive half in the task
brief does not reproduce under any denominator tried here — the published block
layer is 24.1% addr-or-better by row and 71.5% of blocks have at least one such
row. The tables above give both denominators explicitly so the comparison is not
ambiguous.*

## 21.4 What it does to the pre-1999 layer: NOTHING, and that is proved twice

**`verify_block_regression.py`: PASS.**

```
  pre-1999 decisions   baseline 90,820 / current 90,820
  every pre-1999 decision on every block unchanged, element for element, in order
```

This is structural, not luck. `_dedup` already partitions on `ERA_CUT = 1999`
and runs separately on each half, and `_rowkey` is a total order on a row's own
content. Every sfbos row is 2016 or later, so it enters only the modern half,
and the pre-1999 subsequence cannot be perturbed by inserting rows after it.

**The decade rail, before and after — the first eight decades are identical:**

```
decade     blocks              decisions
         before   after     before    after
1900s     1,715   1,715      6,183    6,183
1910s     3,361   3,361     22,580   22,580
1920s     3,837   3,837     26,645   26,645
1930s     2,802   2,802      8,959    8,959
1940s     2,051   2,051      5,378    5,378
1950s     1,937   1,937      4,148    4,148
1960s     1,672   1,672      3,203    3,203
1970s     2,156   2,156      4,651    4,651
1980s     2,021   2,021      5,406    5,406
1990s     1,826   1,826      4,213    4,214     +1  (a 1999 row: modern era)
2000s     1,598   1,598      3,799    3,807     +8
2010s       955   1,274      2,234    3,630
2020s         0     745          0    1,797
                                    97,399  100,601   +3,202
```

**The modern era does move, it is counted, and it is enumerated.**
`moves_modern_sfbos.tsv` — 241 rows across 138 blocks, every one with its year,
date, page citation and text. Of those: **223 arrivals** (209 of them the new
2016 PDFs) and **18 archive rows displaced**, all 2013–2016.

**13 of the 18 are a swap inside a duplicate group** — the same decision, now
represented on that block by its other reading, because the Board legitimately
prints one item across several meetings and the cross-meeting collapse §19.5
insists on keeping now has a second reading to choose from. **5 have nothing
like them left on their block**: two are the same liquor-licence transfer on
blocks 0452 and 0452T, one is an address-table fragment on 3752, one a
reimbursement declaration on 3506, one a school-district acquisition on 4287.

**Five rows in 100,601 — 0.005% — and they are named above, not summarised.**
Pre-1999, the number is zero.

## 21.5 The control build, and why it is the load-bearing test

The code change was run against the **unchanged** corpus first, into a separate
directory, and hashed against production:

```
  2,181 files compared with website/public/data/us/sf/city/blocks/  —  0 differ
```

**So every byte of the difference is the new data, and none of it is the new
code.** This is what `BLOCKS_ITEMS` / `BLOCKS_OUT` / `BLOCKS_JOINED` were added
for: a build can now run beside the published one and be diffed, instead of
overwriting it to find out what a change did.

`verify_order_independence.py` was also rewritten to use them. It used to
shuffle `cache/items.jsonl` **in place** and restore it in a `finally`; it now
writes the shuffle to a temp file and points the build at it, so the canonical
corpus and `out/` are never written at all. It also takes `--items`, which is
how the merged corpus was tested:

```
  python3 verify_order_independence.py --items <merged corpus>   122,459 rows

  seed 101: built, 2,210 published files hashed
  seed 202: built, 2,210 published files hashed
  seed 202 == seed 101: all 2,210 files identical

  PASS — the index is a function of the corpus, not of its order.
```

**The order-independence guarantee of §19 survives the merge.** Two independent
shuffles of the full merged corpus produce the same bytes, so the modern era
does not reintroduce the arrival-order dependence that §19 removed.

## 21.6 Two things found on the way, neither caused by this change

**17 street files are published that the current build no longer produces**
(`APTOS_`, `PINE_`, `CORTLAND_`, `WARREN_` …), and 9 of them are still named by
26 block→street links. **This is not a broken link:** `loadStreet()` returns
`[]` on a non-OK response, and 328 of the 1,771 street keys blocks reference
have no file by design — a block fronts streets that carry no street-tier
decision. The 17 are orphaned leftovers in the published directory, not a fault.
Recorded so the next person who diffs the two directories does not chase them.

**`_rowkey`'s docstring overstates what it reads.** It says (score, year, date,
page, full text, volume, item number), but `r.get("d")` and `r.get("u")` do not
exist on an item record — items carry `dt` and no `u` — so both are constantly
`""`. The key is still a total order because `(text, volume, item)` is unique
per row, and order-independence passes, so behaviour is correct. The comment is
wrong, not the code.

## 21.7 State on disk

- `scratchpad/sf-city-anim/blocks/out/` — the **pre-merge** build, still
  byte-identical to production. Untouched.
- `scratchpad/sf-city-anim/blocks/out_2026/` — the **merged** build. 2,212 files.
  This is what publishes.
- `website/public/data/us/sf/city/blocks/` — **untouched by this work.**

**Publishing is a COPY, never a mirror-delete.** The published directory also
holds 279 files this build does not produce — `accuracy.json`,
`block-facts.json`, `block-landuse.json`, `block-leads.json`,
`block-money.json`, `hood-facts.json` and 256 `landuse/` shards — all written by
other scripts. A sync with `--delete` would remove every one of them.

## 21.8 The `w` summary — the reported bug is not in `build_index.py`

Raised alongside this merge: that a block's `w` sentence characterises only
pre-1999 rows while its denominator counts all of them. **Measured, and the
backend `w` does not have this problem.** It is built by `subjects_of()` over
each decision's own TEXT, not over a printed heading, and it classifies the
modern rows at very nearly the Journal rate:

```
                      rows     with a subject cue
  pre-1999          90,820      42,258   46.5%
  modern (pre-merge) 6,579       2,810   42.7%
  modern (merged)    9,781       4,071   41.6%
```

Numerator and denominator are the same population — both iterate `own[bn]` —
so `w` is a whole-record claim over a whole-record count. On block 3752 the
merged build says *"110 of the 331"*, and modern rows contribute to both halves.

**The blindness is real but it is in the front end.** `printedHeading()` opens
`if (d.g !== "h" && d.g !== "p") return null`, and `g === "s"` on every modern
row, so `blockSubjects` — which is heading-based — drops the modern half. That
is `block-records.ts` and is not this file's to fix.

**The bracketed-subject extractor was re-measured on the merged corpus and the
verdict is unchanged: do not build it.** With 2016–2026 in, 1,427 of 9,781
modern rows carry a bracket (14.6%, up from 13.5%), and at `SUBJECT_MIN = 2`
just **56 of 2,419 blocks — 2.3%** — would gain a single modern subject group.
Doubling the corpus barely moved it off 1.3%. An extractor with its own failure
modes for 2.3% of blocks is not worth it.

## 21.9 WHAT THE FRONT END MUST CHANGE — three things, none of them mine

`website/src/components/us/city/*` belongs to another agent. These are the exact
changes the published data requires, and **the second one is not cosmetic: the
caption becomes false the moment this data ships.**

**(1) The link. `block-records.ts`.** Add `readonly c?: string;` to
`BlockDecision`, and resolve the two shapes:

```ts
/** Two record systems, two shapes. `c === "b"` is a PDF the Board posted. */
export function sourceHref(d: Pick<BlockDecision, "u" | "c">): string {
  const [doc, page] = d.u.split("/");
  return d.c === "b"
    ? `https://sfbos.org/sites/default/files/${doc}_minutes.pdf#page=${page}`
    : `https://archive.org/details/${doc}/page/n${page}/mode/1up`;
}
```

`archiveHref` has three call sites, all in `CityBlockPanel.tsx` — **265, 574,
671** — and each must pass the decision rather than `d.u`. `seriesOf()` (line
229) also needs a `c === "b"` arm; a Board PDF is not "Internet Archive". And
the lead's link text at 675 reads *"Open the scanned page"*, which is wrong for
a born-digital PDF.

**(2) The caption under the rail, `CityBlockPanel.tsx` 1547.** It currently
prints, once `indexedLast >= SERIES_LAST_YEAR`:

> *"The scanned series ends in 2016 … **The Clerk has published every meeting
> since; no library has paginated them into this series**."*

**With this data published that sentence contradicts the rail beside it.** The
map now carries those meetings, cited to the Clerk's own files. It is the
descendant of the caption §21's own comment block calls "THE CAPTION THAT WAS
FALSE", and it would be false again in the same direction — a claim about the
record that is really a claim about our pipeline.

**This is also the right place to show the seam rather than hide it**, which is
what was asked. Suggested, and the numbers in it are all measured above:

> *"Two record systems meet here. The Board's bound volumes were scanned
> through June 2016; from July 2016 the City stopped printing books and posted
> PDFs instead, and those are cited to the Clerk's own files."*

`SERIES_LAST_YEAR = 2016` should **stay 2016** — it is a true fact about the
Archive's shelf. What changes is that the shelf is no longer the only source,
so the caption can no longer be written as though it were.

**(3) Nothing else needs touching.** `afterSeries` is `dec > lastDec` computed
from `indexedLastYear()`, which reads `y1` off the shipped index — so the *"not
scanned"* tag stops being drawn over the 2000s–2020s **automatically** when the
data lands, exactly as the comment on that function predicted. That design
holds up; no constant to chase.

---

# 22. THE FILTER AT THE DOOR — every item, placement as an attribute — 2026-08-26

§21 merged the Board's own PDFs and the map reached 2026. This is about what
never got as far as that merge.

Builder: `sweep_sfbos_all.py`. Same 390 PDFs, already on disk, no new fetch.
**Nothing is published and nothing the map reads has changed by a byte.**

## 22.1 The scoping decision that quietly became a decision about the database

`fetch_sfbos_minutes.py --extract` writes a row only when an item resolves to a
street. Two `continue`s do it:

```python
locs = ex.locations_from(body)
...
if not locs: continue        # the item names no street-shaped phrase
...
if not res:  continue        # it named one and the gazetteer refused it
```

That filter was built to serve the **map** — a decision the map cannot pin is a
decision the map cannot draw. Verified rather than assumed: **all 6,786 rows in
`cache_sfbos/items.jsonl` carry a non-empty `r`, and zero do not.** So everything
the Board did to the whole city was discarded at the door, and the file has no
way to say so: an item that is not there and an item that never happened read
exactly alike.

## 22.2 What the corpus actually holds

Re-derived on this disk, both readers agreeing on the page count:

```
  meeting PDFs                     390        (0 without a text layer)
  pages                         10,388        pdftotext -layout AND PyMuPDF agree
  characters                25,617,938        PyMuPDF
                            31,161,128        pdftotext -layout (its column padding)
```

**A trap fired on the way in, the `roof_st` kind.** A bare `\d{6}` sweep finds
**12,593** distinct six-digit tokens. **542 of them are not file numbers at
all** — they are Superior Court case numbers, `Case No. CGC-20-584260`, which is
why the prefixes 51–62 appear at all. The Clerk's own printed form is six digits
then a bracketed title, and by that form there are **12,051** distinct
legislative files. The task brief's 12,531 sits between the two and reproduces
neither; the number above is the one with a definition attached.

## 22.3 What the full sweep yields

```
  chunks between two Resolution|Ordinance|Motion marks, 60..3000 chars   42,405
  of them the map's sweep kept                                            6,786   16.0%
  discarded at the door                                                  35,619   84.0%
```

42,405 reproduces §13's own count exactly, from a separate walk.

## 22.4 THE PARITY GATE — the map keeps exactly what it has

`--verify` projects every re-swept row with a non-empty `r` onto the twelve
canonical fields in their original order and compares them **line for line, in
order, byte for byte** against the published stream. Not a count, not a checksum
of a sorted set.

```
  published placed stream : 6,786 rows
  re-swept, r non-empty   : 6,786 rows
  PARITY PASS: all 6,786 placed rows byte-identical, line for line, in order
```

This is structural rather than lucky: `seq` in the original extractor increments
**before** both `continue`s, so keeping the discarded items cannot renumber the
kept ones. `91de7fa0` / `1f56663a` are untouched.

`sfbos_gate()` is re-asserted over **every** row, placed or not, because an
unplaced item still needs a citation that opens:

```
  url  == PREFIX + stem + "_minutes.pdf"     42,405 / 42,405
  page == n + 1                              42,405 / 42,405
  every cited stem is a PDF on disk               390 / 390
  every cited page is inside its file        42,405 / 42,405   (PyMuPDF page counts)
```

## 22.5 THE HONEST TAXONOMY — four things, and they are never summed

Placement and form are recorded as **two orthogonal fields**, because a vote
record can name a street and a citywide ordinance can be perfectly clean prose.

```
  pl = placed       a street the DataSF gazetteer knows          6,786   16.0%
  pl = unresolved   named a street-shaped phrase, refused        2,436    5.7%
  pl = none         names no place at all                       33,183   78.3%

  pk = title        the item's own words, Clerk's title form    24,541   57.9%
  pk = stamp        "Resolution No. 293-21 ADOPTED by the ..."  10,535   24.8%
  pk = fragment     the splitter cut mid-sentence                6,410   15.1%
  pk = template     the PDF's own explanatory boilerplate           868    2.0%
  pk = rollcall                                                      51    0.1%
```

The 35,619 the map cannot draw, partitioned exactly — `assert`ed in the build,
no row counted twice and none left over:

```
  CITYWIDE BY NATURE                 17,590   49.4%   the item's own title, no place named
  PROCEDURAL                         10,239   28.7%   stamps, template text, roll calls
  SPLITTER FRAGMENT                   5,615   15.8%   the words belong to the chunk before
  NAMES A PLACE WE CANNOT RESOLVE     2,175    6.1%   a titled item, a phrase the gazetteer refused
```

**A committee referral is NOT procedural, and treating it as one would have
rebuilt the same filter at a different threshold.** 5,105 items carry
`RECEIVED AND ASSIGNED to <committee>` and 6,982 carry some referral wording;
the referral is a stamp on the *end*
of a fully-titled new ordinance — *"Ordinance ... requesting the Department of
Building Inspection ... to report. 06/13/17; RECEIVED AND ASSIGNED to Land
Use"*. Calling those procedural throws away the day's new legislation. What the
Board **did** with an item is therefore recorded separately, in `disp`, as
metadata and never as a verdict on whether the item has substance.

## 22.6 What the old filter threw away, by subject

Coverage of the PDF text, then of items, then of what the map holds today.

```
  topic                        meetings    items    on the map    kept
  \bbudget\b                        390    4,582           591     13%
  \bpolice\b                        352    1,382           117      8%
  homeless                          342    1,297           264     20%
  COVID                             139      690            23      3%
  eviction                          112      164             9      5%
  "Proclamation of Emergency"        52       61             1      2%
```

*meetings* counts the whole PDF, whitespace-normalised; *items* and *on the map*
count the same string over item text. One string per topic, printed beside every
number it produces, because a compound pattern makes a count nobody can check.

**The emergency proclamations are the case in one line.** 57 items name a
*Supplement to the Proclamation of Emergency*, naming **33 distinct
supplements** across the pandemic. **Exactly one is on the map** — and it is
there by accident, which is now provable rather than suspected:

> *"Motion concurring in actions taken by the Mayor in the Twenty-Sixth
> Supplement to the Proclamation of Emergency … 09/01/20; REFERRED FOR ADOPTION
> WITHOUT COMMITTEE REFERENCE … **201019 [Findings Reversing the Community Plan
> Evaluation - 2300 Harrison Street]**"*

It survived because the **next** legislative file's header bled into its chunk,
and it is drawn on **2300 Harrison Street**, an address with nothing to do with
it. See §22.8.

**One correction to the task brief, and it is the brief's own trap firing.**
"Proclamation of Emergency" appears in the raw PDF text of **25** meetings and in
**52** once whitespace is normalised: `pdftotext` wraps the phrase across a line
break half the time, so a regex over raw text cannot see it. *A search that
cannot see a thing reports its absence in the same words as its absence* — the
figure to quote is 52.

## 22.7 THE SECOND FILTER, upstream of this one — hearings

**A file number in the text is not an item, and the gap says something.**

```
  distinct legislative files printed        12,051
  carried by an ITEM                         9,868   81.9%
  on a PLACED item                           2,254   18.7%
  printed but on NO item                     2,183
```

Sorted by the first segment of the Clerk's own bracketed title, the largest
orphan class is not procedural noise:

```
  570  Hearing                    54  Accept and Expend Grant
  53  Formal Policy Discussions   43  Liquor License Transfer
  37  Settlement of Lawsuit       37  Closed Session
  35  Planning Code               34  Affirming the Categorical Exemption Determination
  28  Charter Amendment           28  Administrative Code
```

**The splitter's vocabulary is `Resolution|Ordinance|Motion`, so a legislative
file whose body uses none of those three words can never become an item however
plainly the Clerk printed it.** A hearing reads:

```
  161146 [Hearing - Appeal of Determination of Exemption From Environmental
          Review - Proposed Project at 2675 Folsom Street]
  Hearing of persons interested in or objecting to the determination of
  exemption from environmental review under the California Environmental
  Quality Act ...
```

That is a contested land-use appeal, it names a placeable address, and no stage
of this pipeline has ever seen it. Removing this second filter is a different
job from removing the first and is **not** done here.

**And six meetings contain no `Resolution|Ordinance|Motion` word at all** —
`bag010917`, `bag010819`, `bag010923` (Inaugural Meetings: the swearing-in and
the election of the President) and `bag110218`, `bag112023`, `bag121818`
(Special Meetings). They yield zero items by construction, not by failure. A
further **12 meetings** yield items but none that place, so **18 of 390 meetings
are invisible on the map today**; the full stream carries all 384 that have any
item at all.

## 22.8 A REAL BUG IN THE PUBLISHED PLACEMENT, found here and NOT fixed here

The Clerk prints a file's header **above** the item it introduces. The splitter
cuts at the `Resolution|Ordinance|Motion` word, so an item's own header sits at
the tail of the **previous** chunk — and any `NNNNNN [` a **title-form** chunk
contains is therefore the **next** file's header. Every street inside it belongs
to that next file.

```
  Resolution urging the San Francisco Legislative Delegation to work to amend
  the "By Right Housing Approvals" ...   160248 [Liquor License - 141 Gough Street]
                                                                  ^ placed on GOUGH
```

Measured conservatively — title-form rows only, and only where **every** street
the row placed on lies after such a header:

```
  title-form placed rows                            4,776
  ...placed entirely on the NEXT file's address       468    9.8%
  as a share of all 6,786 published placed rows              6.9%
```

Stamp- and fragment-form rows are deliberately excluded: a stamp's own header
legitimately follows its disposition line (*"Ordinance No. 132-16 FINALLY PASSED
160576 [Settlement of Lawsuits …]"*), so the same test cannot separate the two
cases there without more work. **468 is a floor, not an estimate.**
`sweep_sfbos_all.py --bleed` reproduces it and prints eight worked examples.

**It is not fixed here.** The published block index is built from exactly these
rows, and correcting them would move the map — the one outcome this change
exists not to produce. It is a decision, not an ingest's call.

## 22.9 The four consumers, and where each one lands

1. **The map** — unchanged, proved byte for byte in §22.4.
2. **The database** — `cache_sfbos/items_all.jsonl`, 42,405 rows, 33 MB. Every
   item, each carrying `pl` (did it place), `pk` (what the chunk is), `disp`
   (what the Board did with it), `sp` (is it a public-comment re-print), `un`
   (the exact street phrases the gazetteer refused) and `fn` (its legislative
   file numbers) — plus the twelve canonical fields byte-identical to today's.
3. **The film** — `cache_sfbos/film_pool.jsonl`, **6,228 legislative files, one
   row each**, deduplicated on the file number by the fullest printing of its own
   title, 2016–2026, 372 meetings, 2,771 carrying a dollar figure, each with its
   `#page=` citation. **It is a POOL and not a selection. Nothing in it is
   ranked, scored or recommended.** *"i dont even know who adachi is, and why
   does this matter to anyone"* was the right objection to a street renaming
   offered because it was easy to draw. The choosing is Daniel's, not a
   pipeline's.
4. **Search over the minutes** — the item stream covers **78.8%** of the cleaned
   characters in the corpus. The missing fifth is the text before each page's
   first `Resolution|Ordinance|Motion` mark: agenda headers, the file headers of
   §22.7, roll-call blocks and page furniture. Granular search over items is
   possible today; search over *everything the minutes say* needs a page-text
   sidecar, which is not built.

## 22.10 State on disk, and what is versioned

```
  pipeline/scripts/us_sf_city/sweep_sfbos_all.py     NEW, committed
  cache_sfbos/items_all.jsonl        42,405 rows, 33 MB   gitignored, derived
  cache_sfbos/items_all.meta.json    per-meeting counters  gitignored, derived
  cache_sfbos/film_pool.jsonl         6,228 rows,  6 MB   gitignored, derived
  cache_sfbos/items.jsonl            UNTOUCHED, and proved untouched
  website/public/data/**             NOT TOUCHED
```

All three derived files rebuild in ~20 seconds from the PDFs already on disk:
`sweep_sfbos_all.py --sweep --pool`. Nothing was published.

---

# 23. THE HEADER, AND WHO IT BELONGS TO — 2026-08-26

§22 measured two things and fixed neither, on the grounds that both would move
the map. Both are fixed here, and **the map does move.** Every row that moves is
enumerated in `moves_header_bleed.tsv` with a link that opens.

Builder: `_sfbos_sweep.py` — a new module holding the page walk that
`fetch_sfbos_minutes.py --extract` and `sweep_sfbos_all.py --sweep` used to
carry two hand-kept copies of. Same 390 PDFs, no new fetch.

## 23.1 The rule, and it is the Clerk's, not ours

The Clerk prints a legislative file as a number, a bracketed title, and the item
indented underneath. `ex.ITEM` cuts a page at every `Resolution|Ordinance|Motion`
word, so a chunk runs from one such word to the next — **through the header
printed in between.** The item's own header therefore sits in the *previous*
chunk, and every street named in it is read as the previous item's.

**`NNNNNN [` is a header and never anything else, measured rather than assumed:**

```
  occurrences in the 390 PDFs                          24,624
  alone at the start of their line                     24,624   100%
  with any text before them on the line                     0
  at the hard left margin                              24,622
  indented (7 and 12 columns)                               2
```

**The two indented ones are the trap in this measurement.** A line-anchored
regex over the raw text misses them and then reports the set as complete. The
match is made on `ex.clean()`ed text instead, and cleaning is checked not to move
the set: over all 10,778 pages the cleaned text yields exactly the same header
list. *A search that cannot see a thing reports its absence in the same words as
its absence* — §22's own lesson, fired again on §22's own successor.

So: **an item ends where the next file's header begins.**

## 23.2 THE CONTROL — every byte below is the fix, not the refactor

The walk moved into a module before it changed. With both new rules switched
off, the module reproduces both published streams exactly:

```
  python3 sweep_sfbos_all.py --control <published items_all.jsonl>
    CONTROL PASS: all 42,405 rows byte-identical, line for line, in order
  python3 sweep_sfbos_all.py --control <published items.jsonl>
    CONTROL PASS: all  6,786 rows byte-identical, line for line, in order
```

And the block index was rebuilt from the **unchanged** corpus into a separate
directory first:

```
  2,212 files compared with blocks/out_2026/ (== production, verified)  —  0 differ
```

## 23.3 THE REAL BLEED — 468 was a floor, and it was a third of the number

§22.8 measured title-form rows only, and excluded stamp- and fragment-form rows
on the grounds that *"a stamp's own header legitimately follows its disposition
line"*. **It does not.** The page proves it:

```
  160501 [Settlement of Lawsuit - Martha Abbene - $81,000]
         Ordinance authorizing settlement of the lawsuit ...
         Ordinance No. 132-16
         FINALLY PASSED
  160576 [Settlement of Lawsuits - Justice Operating Co. LLC, and Justice
          Investors LP, Kearny Street Employers LLC - $1,450,000]
```

The stamp chunk opens at `Ordinance No. 132-16` and runs to the next mark, which
is inside 160576's body — so it swallows 160576's header and is drawn on
**Kearny Street**. The header above an item is the header above an item whatever
the chunk under it looks like. Applied to every form:

```
  published placed rows                                        6,786
  place on at least one street belonging to another file       2,025   29.8%
    ...of which place on NOTHING ELSE                          1,829   27.0%
  by form, rows placed ENTIRELY on the next file's address
    title      468        stamp      794
    fragment   494        template    73
  street mentions removed 2,309 / kept 8,179
```

**468 was a conservative floor and the real number is 2,025 rows touched, 1,829
of them wholly.** `sweep_sfbos_all.py --bleed <baseline>` reproduces it against
any earlier stream and prints eight worked examples.

**An independent instrument agrees.** `build_index.before_rollcall()` — written
for the Journal, and until now the only defence against this — counts items it
had to drop because every street they named came after the roll call. Over the
sfbos half:

```
  "all streets named after the roll call (next item bleed)"   1,010  ->  12
```

It was catching part of the same bug from the other side, and it is nearly out
of work.

## 23.4 THE SECOND FILTER — hearings, and what the other 1,613 orphans were

§22.7 counted 2,183 legislative files printed but carried by no item and
attributed 570 to Hearings. **Both halves of that need correcting, and the first
correction is that most of those orphans were the bleed again.**

```
  distinct file numbers printed                                12,051
  orphans under the old reading                                 2,183
    MIS-ATTRIBUTED — an item exists for the body; the number sat
    in the PREVIOUS chunk, which is §23.3                       1,678
    INVISIBLE — no Resolution|Ordinance|Motion word anywhere in
    any printing of the span, so no item can exist                505
      Hearing                    418      Charter Amendment    28
      Formal Policy Discussions   47      12 others            12
```

**So hearings are not one gap among many: they are 83% of the only real gap.**

**They are recovered without adding a word to any vocabulary.** Adding `Hearing`
to `ex.ITEM` would change chunk boundaries for the Journal too, and "hearing" is
a common word in prose — that is a fabricated boundary waiting to happen. The
span used instead is **header to next header, both of them printed by the
Clerk**, emitted only where the span contains no splitter mark at all, so
nothing is counted twice:

```
  header-delimited items emitted                                1,102
    k = "H"  the Clerk's title begins "Hearing"                   896
    k = "F"  every other form (Charter Amendment 129, Formal
             Policy Discussions 35, Closed Session, Committee
             of the Whole, appointments …)                        206
  header spans skipped because an item already exists there    23,493
  header spans failing the same 60..3000 gate as every chunk       29
  new rows whose opening text also appears in an ordinary chunk      0
  ordinary chunks still containing a later file header               0
```

Their `i` continues after the meeting's last ordinary item, so **every published
`i` keeps the value it had.** Three meetings that §22.7 recorded as yielding
zero items by construction now yield some — `bag110218`, `bag112023`,
`bag121818`, all Special Meetings.

**`--report`'s taxonomy gains its fifth class rather than folding these in.** A
hearing that names no place is not "citywide by nature"; it is a file the
splitter could not see. The partition is still asserted exact.

## 23.5 THE FILE-NUMBER JOIN WAS THE BLEED TOO, and it is now `hf`

Trimming the header collapses `fn` — file numbers in an item's own words — from
**9,868 files to 932**. That is not a regression; it is the measurement telling
the truth for the first time. `fn` counted the file printed *after* the item.

So the question is asked the way the Clerk writes it: **which file's header is
this item printed under?** That is the new `hf`, carried as metadata, with the
header's words and streets still kept out of the item.

```
  distinct files printed                                       12,051
  files an item is printed UNDER (hf)                          12,028   99.8%
  ...on a PLACED item                                           2,541   21.1%
  files with no item under them at all                             23
```

`film_pool.jsonl` joins on `hf` now and goes **6,228 → 11,523 legislative
files**, each keyed to the file it *is* rather than the one above it. It is
still a POOL and still not a selection.

## 23.6 WHAT MOVES ON THE MAP, counted three ways

**Item level**, through `build_index.locate()` — the placement the published
index runs — at block precision (tier ≥ 1):

```
  block-precision placements        3,717  ->  3,297
    unchanged block set                         3,109
    CHANGE BLOCK                                   55
    LOSE their placement entirely                 553
    NEW placement                                 133   (130 hearings, 3 other files)
```

**Published block layer**, which is what a reader sees:

```
  blocks whose row list changed                     613
  block<->record links removed                    1,050
  block<->record links added                        366   (126 header-delimited)
  blocks that lost their entry entirely                1
  blocks that gained an entry                          0
  blocks that lost their LAST 2016+ record            11
  blocks that gained a FIRST 2016+ record              3
  blocks carrying at least one hearing record        111
```

**Every one of the 1,416 changed rows is in
`pipeline/scripts/us_sf_city/moves_header_bleed.tsv`**, with block, year, date,
kind, tier, and a reconstructed source URL that opens on the right page — the
same discipline as `moves_pre1999.tsv` and `moves_modern_sfbos.tsv`, plus the
link.

**The 11 blocks that lose their last modern record were holding a header, not a
decision.** Read them:

```
  block 3568  APPROVED 161338 [Final Map 8380 - 178-188 Albion Street]…
  block 1159  APPROVED 221236 [Final Map No. 10851 - 709 Lyon Street]…
  block 0053  Howard Thurman Way" - 2020 Stockton Street] Sponsor: Peskin…
  block 5900A 181083 [Salina Lam Commemorative Plaque - 810 Silver Avenue …]…
```

Not one of them is a sentence the Board wrote about that block. They are the
next file's title, pasted onto the previous item, and a reader clicking through
found a decision that had nothing to do with the address.

**And the single COVID motion §22.6 called "on the map by accident" is now off
it.** `"Proclamation of Emergency"` goes 1 → 0 placed. It names no place, and a
citywide emergency proclamation drawn on 2300 Harrison Street was worse than an
emergency proclamation the block map does not carry.

## 23.7 The gates, all of them

```
  --control  vs published items_all.jsonl        42,405 / 42,405  byte-identical
  --control  vs published items.jsonl             6,786 /  6,786  byte-identical
  control block build vs production               2,212 /  2,212  byte-identical
  sfbos_gate url  == PREFIX + stem + suffix      43,507 / 43,507
  sfbos_gate page == n + 1                       43,507 / 43,507
  every cited stem is a PDF on disk                  390 /    390
  every cited page is inside its file            43,507 / 43,507   (PyMuPDF)
  --verify   the two streams agree                5,127 /  5,127  byte-identical
  verify_order_independence.py --items <merged>  seeds 101/202, 2,205 files
                                                 hashed, all identical
  verify_block_regression.py vs production       PASS, 90,820 = 90,820
```

**The pre-1999 layer is proved untouched, not assumed untouched.** The gate does
not merely check a count: it splits every block's decision list on the year and
compares the old half **element for element and in order**, which is what
catches the mechanism that actually threatens it — a modern row entering the
near-duplicate comparison ahead of a 1912 one and suppressing it. **Removing**
modern rows could equally *un*-suppress a pre-1999 row, and that would appear as
an arrival in the old half. It does not: baseline 90,820, current 90,820, zero
blocks changed before 1999.

## 23.8 FOUND HERE AND NOT FIXED — the record states its own block 1,207 times

`STATED` reads `Assessor's Block 336`, the Journal's wording, and outranks
everything the index can infer because it is the city answering for itself. The
Clerk's modern wording is **`Assessor's Parcel Block No. 3568`**.

```
  modern items stating their own parcel block          1,207
  modern items STATED currently matches                    1
```

The `stated` tier carries exactly **1** modern row. Block 3568's real record —
*"Motion approving Final Map 8380 … located at 178-188 Albion Street, being a
subdivision of Assessor's Parcel Block No. 3568"* — is in the corpus, resolves
Albion Street, names its own block, and reaches neither the baseline build nor
this one.

**It is not fixed here.** A stated block outranks every inferred tier, so
switching 1,206 rows on would move the map considerably more than either change
above, and `stated` is also the ground truth `measure_accuracy.py` scores
against. It is a third decision, and it is Daniel's.

Two smaller ones, also recorded rather than acted on:

- **The header's words are now attributed to nobody.** They used to be attributed
  to the item above, which was wrong. Giving them to the item *below* — the
  sfbos equivalent of `blocks/prefaces.py`, and needing no connectedness gate
  because the Board's headers are unambiguous — would recover most of the 553
  lost placements *correctly*. That is a third change and is not made here.
- **`KIND_WORDING` has no entry for `H` or `F`**, so the front end renders both
  as "Item" via its `?? "Item"` fallback. Nothing breaks and nothing lies; a
  hearing simply is not called one yet. `website/src/components/us/city/
  block-records.ts` is not this file's to edit.

## 23.9 State on disk

```
  pipeline/scripts/us_sf_city/_sfbos_sweep.py           NEW, the single walk
  pipeline/scripts/us_sf_city/enumerate_block_moves.py  NEW, the move list
  pipeline/scripts/us_sf_city/moves_header_bleed.tsv    NEW, 1,416 rows, versioned
  pipeline/scripts/us_sf_city/fetch_sfbos_minutes.py    do_extract delegates
  pipeline/scripts/us_sf_city/sweep_sfbos_all.py        delegates, gains --control
  cache_sfbos/items.jsonl        5,127 rows   gitignored, derived
  cache_sfbos/items_all.jsonl   43,507 rows   gitignored, derived
  cache_sfbos/film_pool.jsonl   11,523 rows   gitignored, derived
  website/public/data/**         NOT TOUCHED
```

**What publishes is a directory, and it is not published here.** The merged
build lives outside the repo while it is reviewed; `blocks/out_2026/` is still
byte-identical to production and is the baseline every number above is measured
against. Publishing is a COPY and never a mirror-delete — the published
directory also holds 279 files this build does not produce.

---

# 24. THE RECORD ANSWERING FOR ITSELF, AND THE TITLE OVER THE ITEM — 2026-08-26

§23 recorded two things and fixed neither. Both are fixed here. They are
**independent changes and they are measured one at a time**, so neither can
borrow the other's credit:

```
  A  the map as published today                        block-precision items  3,297
  B  A + the Clerk's own "Assessor's Parcel Block No."                        3,522
  C  B + the header, given to the item it introduces                          6,159
```

(the Board's corpus alone, through `build_index.locate()`, the placement the
published index runs. `measure_header_gift.py --ladder` reproduces it.)

Builders: `measure_stated_blocks.py` and `measure_header_gift.py` are new and
measure only. The code that changes is five places: `build_index.stated_blocks()`
(read the Clerk's form), `build_index.load_items()` (the header as a preface),
`build_index.gloss_of()` (a row with no sentence shows the title over it),
`_sfbos_sweep._row()` (`hp`/`hr`) and the new `_sfbos_sweep.map_stream()` (one
definition of what the map reads).

## 24.1 THE CONTROL — four of them, and every byte below is the fix

`--control` takes the rules to leave ON, so the walk can be replayed at any
point in its own history and compared with what was published then:

```
  --control <pre-§23 items_all.jsonl>                    42,405 / 42,405  byte-identical
  --control <pre-§23 items.jsonl>                         6,786 /  6,786  byte-identical
  --control <today's items_all.jsonl> --rules trim,orphans
                                                         43,507 / 43,507  byte-identical
  --control <today's items.jsonl>     --rules trim,orphans
                                                          5,127 /  5,127  byte-identical
```

**The projection is applied to the baseline too, not only to the new side.** The
header metadata `hf`/`ht`/`hp`/`hr` is additive and no consumer reads it, so a
baseline written before those fields existed and one written after must compare
equal — otherwise the test measures which pass wrote the file rather than what
the walk does.

And the block build was rebuilt from the **unchanged** corpus into a separate
directory before anything changed:

```
  2,209 files compared with blocks/out_header_fix/ (== production)  —  0 differ
```

## 24.2 THE CLERK'S FORM — enumerated before it was matched

`STATED` reads `Assessor's Block 2622`, which is the Journal's wording. The
Clerk writes `Assessor’s Parcel Block No. 3568, Lot No. 003`, and **three
separate things** break the old regex at once: a curly apostrophe, the word
*Parcel* between *Assessor's* and *Block*, and a lot number after it.

**The forms were counted before a matcher was written.** 1,683 qualifiers are
printed in 43,507 items:

```
  1,456  Assessor’s Parcel Block No.        6  Assessor’s Parcel Block No. (AB)
    147  Assessor's Parcel Block No.        3  Assessor’s Parcel Block (Block) No.
     39  Assessor’s Parcel Block Nos.       2  Assessor’s Parcel Block Number
     17  Assessor’s Block No.               2  Assessor Parcel Block Nos.
      4  Assessor’s Parcel Block No         2  Assessor’s Parcel Block No:
      2  Assessor’s Block,                  2  Assessor's Block No.
      2  Assessor's Parcel Block            1  Assessor's Block

  the number:  4 digits 1,582 · 4 digits + a letter 71 · 3 digits 22 · 2 digits 6
  what follows: ", Lot No." 1,233 · ", Lot Nos." 308 · a list · a compass bearing
```

**AND THE REFUSALS, each of which a one-line regex would have taken:**

```
  1,553  claims kept
    115  a block named as the BOUNDARY of the site, not the site
     11  an APN from ANOTHER COUNTY (Sunol, the Alameda watershed)
      2  a RANGE of blocks
      2  no number after the word Block at all
```

and then a gate the index has always had rather than a refusal of this matcher:
**15 items name more than four blocks** — one sentence names 29 — and
`locate()`'s existing `len(sb) <= 4` drops them, as it always has for the
Journal. A list is not a place.

* **The boundary form.** *"the summary street vacation of a portion of 25th
  Street, which is generally bounded by Assessor’s Parcel Block No. 4241 … to
  the north, Seawall Lot 355 (portions of … No. 4298 …, No. 4299 …, and
  No. 4300 …) to the south"* names four blocks and the decision is on none of
  them: it is on the strip of street between them. Taking the three whose own
  tail does not read *"to the north"* and leaving the one that does would be
  worse than taking none — it would move the item off the street it is on and
  onto a block beside it. **A sentence that says "bounded by" disqualifies every
  block in it.**
* **Another county.** *"Assessor’s Parcel Block No. 096-0155-004-01, known as
  11601 Main Street, Sunol"* is an Alameda County APN on the watershed lands. An
  SF assessor block is four digits, so a number followed by `-<digits>` is kept
  only where the number itself is four digits and what follows it is a lot —
  `4285B-001`, `3180-202`.
* **The range, and it is the corpus's own trap.** *"Assessor Parcel Block
  Nos. 41 through 43, Lot No. 7, at the intersection of Owens and A Streets"* is
  Mission Bay South's **redevelopment** blocks, printed under the word Assessor.
  0041 and 0043 are real assessor blocks in the Financial District, 4 km from
  the corner the same sentence names. A range is recorded and never expanded,
  and that single rule is what keeps the only demonstrated plan-block-labelled-
  as-assessor case out.

**The three things that print "Block <number>" and are not assessor blocks are
excluded by construction, not by a stop-list** — the match has to begin at the
word *Assessor*, and a number has to follow the word *Block*:

```
    35  "Community Development Block Grant"        1  "Redevelopment Plan Block 13"
    62  "the 900 block of Mason Street"            3  "(Parkmerced Planning Block Nos. 20, 21S)"
```

**And one from the Journal that would have fabricated a placement.**
`Assessor's BlocK 3S13` is OCR damage; a lazy number match reads it as block
0003, which exists. A block number therefore has to end at a character that is
neither a digit nor a letter.

`measure_stated_blocks.py` carries a **second implementation** of the matcher,
because it has to count what it refuses and `build_index` has no reason to. Two
hand-kept copies of a walk is the exact failure §23 removed, so the two are
**compared over all 43,507 rows on every run** and the script refuses rather
than reports if they differ.

## 24.3 WHAT THE STATED BLOCKS RESOLVE TO — and six that do not exist

```
  items stating their own block                        1,362
  distinct block numbers stated                          516
  ...that exist in the published block layer             510
  ...that the layer has never heard of                     6      13 mentions
```

**§23.8 said 1,207 and the number here is 1,362; both are right and the
definition is the difference.** 1,207 counted a pattern; 1,362 counts items with
at least one claim the matcher **keeps**, after 115 boundary blocks, 11 foreign
APNs and 2 ranges are refused and after the plural, `(AB)`, `No:` and no-space
forms are read. The figure to quote is the one with the
refusals attached, and `--inventory` prints both halves.

**A stated block that does not exist is a finding, not a row to force in.** All
six were read:

```
  1399   Seawall Lot 356 — a Port seawall lot, not an assessor block
  4046   a Mission Bay / Pier 70 block created after the layer's vintage
  5732   the Alemany Farmers' Market — "(Assessor’s Parcel Block Nos. 5731,
  5733   5732, 5733, 5733A, and 5734), bounded by Alemany Boulevard"
  5270   1800 Jerrold Avenue, an SFPUC industrial parcel
  7366   Parkmerced, in a sixteen-lot vertical subdivision
```

Every one is a real block the Clerk names and the **DataSF block layer does not
carry** — port lots, newly created blocks, and market/roadway parcels. 6 in 516
is 1.2% of the vocabulary and none is forced onto a neighbour.

**176 of the 1,362 never reach the map at all**, and not because of the block:

```
  1,181  the item's own words resolve a street          -> in the map corpus
      5  its words do not, but its own HEADER does      -> in it since 24.7
    176  neither its words nor its header name a place  -> filtered at the door
```

The corpus filter asks *did a STREET resolve* — so an item that prints its
block and no street is discarded before the block is ever read, and a stated
block is the strongest location claim the record can make. **Admitting them is a
third change, it is not made here, and it is worth 176 rows.**

## 24.4 THE DISAGREEMENT RATE — how good the inference has been all along

Where the record answers, the inference can be marked — and the join is run
**blind to the stated block**, the way `measure_accuracy.py`'s second pass is,
or it would be comparing the answer with itself. Over the 1,144 rows of the
corpus **as published** that state a block and place:

```
  the stated block is among the ones inferred      964   84.3%
  the two do not overlap at all                    180   15.7%

  by the tier the item placed on
    addr      30 of  890    3.4% disagree
    segment    4 of    6
    corner    34 of   49
    street   112 of  198
  distance from the inferred block to the stated one:
    median 170 m · p90 671 m · max 6,247 m
```

**The address tier is right 96.6% of the time and the street tier is a coin
toss, which is what the street tier has always claimed about itself.** Read by
hand, worst first:

> *"the City’s real property located at 772 Pacific (Assessor’s Parcel Block
> No. 0161, Lot No. 015)"* — drawn on block **2849**, 6.2 km away, because
> "Pacific" smeared down the whole avenue.
>
> *"a landmark designation … for Lincoln Park, formerly known as City Cemetery,
> at Assessor’s Parcel Block No. 1313, Lot No. 029"* — drawn on six Clement
> Street blocks, 2.3 km from Lincoln Park.

And the address-tier disagreements are one block face, not a smear: *"645 Texas
Street … Assessor’s Parcel Block No. 4102"* was on 4101, 95 m; *"150 Van Ness
Avenue … No. 0814"* was on 0814A, 40 m. The parcel table put the house number
on the block across the street.

**Reading the stated block changes 554 placements and 474 of them are a
NARROWING, not a correction:**

```
  474  narrowed to a subset of what was inferred
   68  DISJOINT — the record and the index disagree
    8  overlap, neither contains the other
    4  widened to include what was inferred
```

## 24.5 WHY THE JOURNAL IS NOT READ THE SAME WAY, and what it would cost

**The Journal prints these forms too, and the old regex misses them there as
well.** Applied to the archive corpus, the Clerk's reading changes the stated
set on **578 rows, 162 of them before 1999**:

```
  1920s   2    1960s   1    1990s   71
  1930s  14    1970s   3    2000s   99
  1940s  44    1980s  33    2010s  311
```

They are not modern wording leaking backwards. They are two gaps the old regex
has always had: a **plural** — *"being portion of Assessor's Block Nos. 351 and
351a"*, where it reads 351 and stops — and a **two-digit block**, because
`(\d{3,4})` cannot match *"Assessor's Block 79, San Francisco, California"* at
all.

**And that is exactly why it is not switched on here.** The pre-1999 layer is
proved unmoved on every build, and 162 of those rows are pre-1999. So
`stated_blocks(wide=)` is switched **per row, by where the row came from**, and
it is off by default. Extending it to the Journal is a change with its own move
list, and it is the next one to make.

**`blocks/measure_accuracy.py` needs the same one-line switch when it is** — it
calls `stated_blocks(r["t"], bmeta)` and so still reads the Journal's wording on
both halves. It is not this file's to edit.

## 24.6 WHAT THIS DOES TO THE ACCURACY FIGURE — the test changed, not the score

`measure_accuracy.py` scores the index against the decisions that print their
own block: it joins them a **second time with the stated sentence hidden** and
asks how far the blind join landed. **The stated block is the answer key and
never an input to the thing being scored, so reading the Clerk's form cannot
make the index score better. It enlarges the answer key.**

Run over the merged corpus through `build_index.load_items()` and
`build_index.locate(use_stated=False)` — the same two calls `measure_accuracy.py`
makes — one variable at a time:

```
                                                key items   scored   exact   <=1 face
  the Journal's wording only, today's corpus         3,529    2,094   86.5%    89.3%
  the answer key gains the Clerk's wording           4,699    3,039   88.5%    91.3%
  ...and the header given to the item below (24.7)   4,704    3,043   88.5%    91.3%
```

**The score moves 86.5% -> 88.5% because 1,170 modern decisions joined the answer
key — 945 of them blind-placed at block precision and therefore scored — and
they are decisions for which the Clerk prints a street address.** Not one scored
placement improved: step two changes nothing the blind join reads. Step three —
the header — moves the figure by 0.0 points on 4 more rows, which is what a
change that adds corpus rather than accuracy looks like.

**AND THE PUBLISHED FIGURE IS OLDER THAN BOTH.** `out/accuracy.json` and the
copy on the site say `n: 906, exact: 84.8` and were written on 2026-08-23,
before the corpus went 49,952 -> 115,673 items. `measure_accuracy.py`'s own
staleness assert compares `locate()`'s tier counts against
`out/block-index.json`, and **that file is stale in the same direction**
(`stated 3358, addr 13455` against production's `3359 / 16378`), so the assert
does not fire. The honest figure for the index as published today is the
**86.5% on the first line**, not the 84.8% on the page. Re-running it is
`measure_accuracy.py`'s job, and that file is not this one's to edit.

## 24.7 THE HEADER IS THE TITLE OF THE ITEM BELOW IT

§23 trimmed the next file's header off the item above — right, the words were
never that item's — and left them attributed to nobody. They are the title of
the item **below**, and this hands them to it:

```
  201018 [Concurring in Actions to Meet Local Emergency - Twenty-Sixth Supplement]
          Motion concurring in actions taken by the Mayor ...
  201019 [Findings Reversing the Community Plan Evaluation - 2300 Harrison Street]
          Motion adopting findings to reverse the determination ...
```

**It needs none of `blocks/prefaces.py`'s connectedness gate.** The Journal's
title has to be *reconstructed* — prefaces.py walks the pages and decides, on a
test of whether the two run together, which trailing text belongs to the item
below. The Clerk's title needs no such test: `NNNNNN [` occurs 24,624 times and
**every one of them is alone at the start of its line** (§23.1), so the header
above an item is that item's and nothing else's.

```
  map corpus                                     5,127  ->  8,611 rows
    on a street the item's OWN WORDS name                    5,127
    on a street only its own HEADER names                    3,484
  rows carrying a header preface                            8,362
```

An orphan row (`H`/`F`) **is** its own header span, so it gets no preface:
giving it one would print the title twice and count its streets twice.

**AND WHAT THE ITEM SAYS UNDER THAT TITLE IS OFTEN NOTHING.** The first build of
this change put a line like *"11 - Cohen, Brown, Fewer, Kim, Mandelman, Peskin,
Ronen, Safai, Stefani, Tang, Yee"* on a block, because that is the whole of what
the chunk says: the Clerk puts the substance in the bracketed title and what is
left under it is a disposition stamp, the vote it carried, or the printer's
footer. Counted over the 2,729 rows that build added to the block layer:

```
    255  nothing at all — a stamp with its boilerplate stripped
    761  a bare vote list      "11 - Cohen, Brown, Fewer, Kim, Mandelman, …"
    132  a vote count then prose  "1 - Walton Supervisor Walton was noted
                                   present at 5:55 p.m. Severed from …"
     60  the printer's own footer "City and County of San Francisco Page 946
                                   Printed at 1:42 pm on 1/17/18"
    127  a procedural motion   "Supervisor Safai, seconded by Supervisor Cohen,
                               moved that this…"
  1,335  of 2,729 — 48.9%
```

**Each shape above is one that OCCURS and was counted, not one anticipated.**
Where the body is one of them the line falls back to the title the Clerk printed
over the item — and **only** there: where the body is a sentence the body wins,
because the body is what the reader clicked through to. The fallback carries the
same guard `heading_verdict` puts on a Journal heading: **if the title names
streets and none of them fronts this block it is about a different address in
the same file and it is not printed here.**

It is marked `g = "h"` rather than `"s"` because that is what it is — the
heading the record printed. `"h"` is also the one value `block-records.ts` reads
a category label off, so *"Final Map 8380 - 178-188 Albion Street"* renders as
the label **Final Map 8380** with the address beside it, and `headline()` may
prefer such a row for a decade that has one. **No front-end file is touched and
no new value is introduced** — `h` was already in that vocabulary and is what
the Journal's own printed headings carry.

```
  rows on the block layer carrying no line at all
    out_header_fix (production)      827      of them 2016+   5
    this build                       824      of them 2016+   2
  rows whose line is a bare vote list
    out_header_fix                    52
    this build                        47
  rows whose line is a printed heading (g = "h")
    out_header_fix                 7,164
    this build                     8,281
```

1,117 of this build's 2,511 arrivals show the Clerk's title rather than the
words under it, and the blank line is gone from the modern half. (The arrival
count falls 2,729 -> 2,511 for the same reason: sibling chunks of one file now
carry the same printed line, so the near-duplicate collapse can see they are one
decision, which it could not do when the line was empty.)

## 24.8 DOES THE HEADER EVER CONTRADICT THE ITEM — measured, and the answer is 4

```
  rows where BOTH the header and the body resolve a street   3,357
    they name the same street and number                     3,292   98.1%
    they do not overlap                                         65    1.9%
      ...of which both sides reach a BLOCK                       8
         and it is the same block anyway                        4
         and they are DIFFERENT blocks                          4
```

**Neither wins. Both are kept, and it makes a block-level difference on four
rows in 3,357.** That is the same rule the Journal half has run since §19: an
item is located from *[ its title + its body ]*, because the title is text the
record printed for that item. The four were read:

> **`Final Map 9286 - 616 Divisadero Street`** over *"…located at 1238
> Divisadero Street, being a subdivision of Assessor’s Parcel Block No. 1202"*.
> The header reaches blocks 1201/1202, the body's house number reaches 1126 —
> and **the item's own stated block is 1202**, so two independent readings agree
> and the third is the one to distrust.
>
> **`Planning Code - Conversion of Residential Hotel Rooms … at 447 Bush
> Street`** over a chunk reading *"…to 27 Group Housing rooms at 412-422 Hayes
> Street and seven Group Housing Rooms at 319-321 Ivy Street, Assessor’s Parcel
> Block No. 0808"*. Both are true: the ordinance converts rooms at Bush **in
> exchange for** rooms at Hayes and Ivy. Three rows, one decision, and it
> belongs on all three addresses.

The 57 that do not overlap and never reach a block between them are the same
shape — a header naming one of the streets a body lists, or a body naming a
cross street the title omits.

## 24.9 WHAT MOVES ON THE MAP

**Item level**, `build_index.locate()`, block precision, one change at a time:

```
                              unchanged   changes block   loses   new
  A -> B  the stated block        2,743             554       0    225
  B -> C  the header              3,514               8       0  2,637
```

**Not one item loses its placement at either step.**

**Published block layer**, `out_header_fix/` -> this build:

```
  rows on the block layer                    99,917  ->  101,662
  blocks whose row list changed                   889
  block<->record links removed                    766
  block<->record links added                    2,511
  blocks that lost their entry entirely             0
  blocks that gained an entry                      11
  blocks that lost their LAST 1999+ record          4
  blocks that gained a FIRST 1999+ record          54
  blocks holding at least one 1999+ record      2,412  ->  2,462
  blocks with a block-precision record          4,751  ->  4,771
  blocks with no decision at all                  309  ->    298
  precision      stated  3,359 -> 4,534    addr  16,378 -> 18,066
                 corner 24,217 -> 24,210  street 40,027 -> 40,498
```

**Every one of the 3,276 changed rows is in
`pipeline/scripts/us_sf_city/moves_stated_headers.tsv`** with block, year, date,
kind, tier and a link that opens on the right page.

**The four blocks that lose their last modern record were holding a decision
that names a different block, and the record says so in its own words:**

```
  0842  "…Assessor’s Parcel Block No. 0828, Lot Nos. 12…"   -> 0828
  3915  "…on Assessor’s Parcel Block No. 3911, Lot No. 001" -> 3911
  3916  same decision, same sentence                        -> 3911
  2924  "…rezone the City property identified as Assessor’s Parcel Block
         No. 2042 … and … Assessor’s Parcel Block No. 2923" -> 2042 + 2923
```

**Ten of the eleven blocks that lost their last 2016+ record to the header-bleed
fix get one back** — 0053, 0054, 0557, 0558, 1159, 2724, 3751, 5268, 5900A,
5911. They lost a header that was never theirs and they have gained the
decisions that really are.

**The eleventh is 3568, which is §23.8's own example, and it is worth the
paragraph.** Its placement IS fixed: the corpus holds two Motions that state that
block — *"Final Map 8380 … 178-188 Albion Street … Assessor's Parcel Block
No. 3568"* (2016) and *"Final Map No. 9989 … 31-37 Camp Street … Block No. 3568"*
(2020) — and `locate()` now puts **both on 3568 at the stated tier**. They are
then dropped by `build_index`'s near-duplicate collapse, against a 2014
*"Approving Final Map 7721, a six residential unit condominium project, located
at 25 Camp Street"* already on that block: the fuzzy test reads about ninety
characters of the printed line, and two Final Map motions differ only in the map
number and the address. **That is a bug in the collapse, not in the placement,
and it is 24.12.**

**26 rows in 101,662 leave the block layer and do not come back anywhere**, and
all 26 were read. 482 distinct rows leave a block; **465 of them carry a citation
that is still in the layer** — they moved onto the block the record names, or
narrowed onto it. Of the remaining 26 rows, eleven have a near-duplicate reading
of the same words still on the block, and the rest leave the block still carrying
the distinctive words of what it lost: block 0104 loses
`171053 [Hearing … 20 Nobles Alley]` and keeps *"Affirming the determination …
that a proposed project at 20 Nobles Alley"*; 1020 and 1032 keep the 3333
California Street Special Use District; 4022 keeps 2000-2070 Bryant.

**Two are a real loss and are named rather than summarised.** Blocks 0339 and
0340 lose `250792 [Hearing - Conditions of 111 Taylor Street Facility Operated by
GEO Group, Inc.]`. Both still carry *111 Taylor street* — from a 1910 hotel
permit and a 1925 sidewalk order — but the 2025 hearing itself is off the block
map. Both blocks gain modern records overall; that is the trade, and it is worth
naming.

**Hearings on the block layer go 126 rows -> 101, on 111 blocks -> 89.** 27 of
the 30 dropped rows have another row **from the same meeting** still on their
block: the near-duplicate collapse now has a better-placed reading of the same
file to keep. The other three are named:
`231187 [Hearing - Appeal of Tentative Parcel Map Approval …]` off block 4274,
and `251138 [Hearing - Appeal of Tentative Parcel Map Approval …]` off 5616 and
6635. Hearings did not get worse; they stopped being the only reading available.

## 24.10 The gates

```
  --control  vs pre-§23 items_all.jsonl                42,405 / 42,405  byte-identical
  --control  vs pre-§23 items.jsonl                     6,786 /  6,786  byte-identical
  --control  vs today's items_all.jsonl  (trim,orphans) 43,507 / 43,507 byte-identical
  --control  vs today's items.jsonl      (trim,orphans)  5,127 /  5,127 byte-identical
  control block build vs out_header_fix                 2,209 /  2,209  byte-identical
  sfbos_gate url  == PREFIX + stem + suffix            43,507 / 43,507
  sfbos_gate page == n + 1                             43,507 / 43,507
  every cited stem is a PDF on disk                        390 /    390
  every cited page is inside its file                  43,507 / 43,507   (PyMuPDF)
  --verify   the two streams agree                      8,611 /  8,611  byte-identical
  the two copies of the stated matcher agree           43,507 / 43,507
  verify_order_independence.py --items <merged>  seeds 101/202, 2,205 files
                                                 hashed, all identical
  verify_block_regression.py vs out_header_fix   PASS, 90,820 = 90,820
```

**The pre-1999 layer is proved untouched, not assumed untouched**, and the gate
that proves it is the one that matters here: reading the Clerk's stated block
promotes 1,175 modern rows to a tier that outranks everything, and a promoted
modern row entering the near-duplicate comparison ahead of a 1912 one could
suppress it. It does not: baseline 90,820, current 90,820, element for element
and in order, zero blocks changed before 1999.

## 24.11 State on disk

```
  pipeline/scripts/us_sf_city/measure_stated_blocks.py  NEW, inventory + score
  pipeline/scripts/us_sf_city/measure_header_gift.py    NEW, the ladder + the clash
  pipeline/scripts/us_sf_city/moves_stated_headers.tsv  NEW, versioned
  pipeline/scripts/us_sf_city/_sfbos_sweep.py           `hp`/`hr`, map_stream()
  pipeline/scripts/us_sf_city/sweep_sfbos_all.py        --rules, symmetric control
  pipeline/scripts/us_sf_city/fetch_sfbos_minutes.py    writes the map stream
  scratchpad/sf-city-anim/blocks/build_index.py         the Clerk's stated form,
                                                        the header as a preface
  cache_sfbos/items.jsonl        8,611 rows,  8 MB   gitignored, derived
  cache_sfbos/items_all.jsonl   43,507 rows, 43 MB   gitignored, derived
  cache_sfbos/film_pool.jsonl   11,523 rows,  9 MB   gitignored, derived — unchanged
  website/public/data/**         NOT TOUCHED
```

**Nothing is published here, and the build to publish from is a directory
outside the repo**, named in the report that goes with this section.
`blocks/out_header_fix/` is still byte-identical to production and is the
baseline every number above is measured against. Publishing is a COPY and never
a mirror-delete: the published directory also holds files this build does not
produce.

---

## 24.12 FOUND HERE AND NOT FIXED — the collapse throws away two placements in five

Block 3568 above is one instance of a general thing, and the general thing is
measurable. `build_index` drops near-duplicate readings inside a block by
comparing about ninety characters of the **printed line**, which for the modern
half is often *"Approving Final Map <n>, a six residential unit condominium
project, located at <address>"* — two different subdivisions, two different
addresses, one signature.

Counted as distinct **(block, meeting-page)** links, comparing what
`locate()` produces with what the block layer publishes:

```
                                    locate() makes   absent from the layer
  the map as published today                 5,136     2,761      53.8%
  this build                                 5,303     2,170      40.9%
                                                       of which stated-tier 479
```

**This change improves it — 53.8% -> 40.9% — and it does not cause it.** But
479 of the links thrown away are `stated`: the record answering for itself, the
one tier that outranks every inference, deleted by a similarity test on the
sentence beside it. The collapse is doing exactly what §19 built it to do for
the Journal, where the same ordinance really is reprinted verbatim at every
reading; the Clerk's Final Map motions are a different shape and it cannot tell
them apart.

**It is not fixed here.** It is a third change to the same file in one pass, it
moves rows on every era rather than the modern one, and the obvious repair —
letting the file number or the address into the signature — needs its own
control and its own move list. It is the next thing to do.

---

# 25. THE SEAM MADE REAL — THE CITY-FREE HALF OF THE BUILD GETS A DIRECTORY AND A TEST — 2026-08-26

ADR-0012 measured the split and `docs/city-map-contract.md` wrote it down as
slots. Neither moved a line of code, and a boundary that exists only in prose is
not a boundary: today a reader opening `pipeline/scripts/us_sf_city/` sees
fifty-one files and no way to tell which of them know which city they are in.

**The goal, in Daniel's words: refactor so the generic part and the San Francisco
part are separate, so future development is ten times faster and as much as
possible is reused.** And the test for "ten times faster" is not how abstract the
result looks — it is **how much of the pipeline a newcomer can ignore.**

**THE HARD GATE, unchanged: San Francisco's published output must not change by
one byte.** Every block below is control-replayed against the published tree at
`a97d813c`, using the seam `cb4b71e6` built.

**THE ANTI-GOAL, and it is the reason this is a small change:** no plugin system,
no registry, no driver interface, no base class with one implementation. The test
of every extraction is *"does this remove a San Francisco assumption from the
core?"*, never *"does this move code somewhere more abstract?"* Where the honest
answer is that a thing is cheaper forked, it is left forked and the reason is
written down — §25.4 is one of those and it is deliberate.

## 25.0 THE BASELINE, established before anything moved

`website/public/data/us/sf/city/` is tracked and was verified identical to
`a97d813c` before the first edit. The encoder was replayed into a control
directory beside it:

```
  CITY_CHUNKS_OUT=<ctl0> python3 encode_city_chunks.py
  580 files compared with website/public/data/us/sf/city/  —  575 identical, 5 differ
```

The five are `base/heroes.qc`, `base/heroes.json`, `base/bridge.qc`,
`base/marks.json` and `manifest.json`, and they are `cb4b71e6`'s known sidecar
delta, reproduced exactly. **`ctl0` — not the published tree — is the baseline
every block below is hashed against**, because it is the strictly harder
comparison: it makes all 580 files answer, not 575.

## 25.1 WHAT MOVED, AND THE ONE QUESTION THAT DECIDED EACH LINE

`pipeline/scripts/citymap/` now exists. It holds the modules whose behaviour is a
function of their arguments and of nothing else.

| moved | from | why it is true of a city |
|---|---|---|
| `chunk.py` — the `QCT1` container | `us_sf_city/_chunk.py` | a length-prefixed header, a CRC and typed-array fields. Zero city tokens, no dataset id, no path |
| `deltachain.py` — `rechain`, `replay`, the int8 range | the codec half of `_bldgsrc.py` | handed numpy arrays, returns numpy arrays. It never knew what the rings were |
| `grid.py` — `Grid`, `for_extent()` | the arithmetic half of `_grid.py` | a square tiling over projected metres, and the four numbers are now **arguments** |

and what deliberately did **not** move, from the same three files:

| stayed | why it is true of San Francisco |
|---|---|
| `_bldgsrc.read_bldg()` | it knows the payload is `window.BLDG` in `gen/bldg-data.js`, that `q` is 1.0, that `h` is a u16 because 255 m is below the top of *this* city |
| `_grid.py`'s `EXTENT_M = 8192` and `CELL = 1024` | the box is one city's diameter; the cell size is derived, in prose, from one city's camera at one canvas size |

**The grid is the one that removes a real assumption.** `ORIGIN = -8192,
NX = NY = 16` used to be module constants in the shared file, with `cells_of()`
RAISING outside them — so a city more than 16.4 km across failed at encode time
with a message about "the grid" rather than about itself, and **no grep for a
city's name would ever have found it.** The four numbers are a `Grid` argument
now, `citymap.grid.for_extent()` derives them from a bounding box, and the shared
module **has no default box left to inherit**. San Francisco's box is declared in
San Francisco's file.

## 25.2 THE TEST, WHICH IS THE HALF THAT WILL STILL BE TRUE IN SIX MONTHS

ADR-0012 §2.2, on why the frontend half of the subsystem stays clean and this
half did not:

> `lib/citygl`'s city-free test finds them by forbidding names; the pipeline has
> no such test, so they are enumerated here by hand.

`citymap/check_city_free.py` is that test, and it is a deliberate port of
`engine-is-city-free.test.ts` rather than a new idea — including the lesson that
test learned on its first run, that **comments are not code**: it failed on the
file whose doc comment states the rule. Docstrings and `#` comments are stripped
before the search.

```
  python3 pipeline/scripts/citymap/check_city_free.py
  ok __init__.py · ok chunk.py · ok deltachain.py · ok grid.py
  PASS — 4 modules, none of them knows which city it is in.
```

**And the test says out loud what it cannot see**, because a passing grep that
is quoted as a result is worse than no grep. It cannot see a number that is
really a name — a snap radius that is half one city's street standard, a tiling
box that is one city's diameter, a base year that is one city's founding. Every
one of those degrades silently rather than failing, and the defence against them
is not a test: it is `derive/`, the instrument beside the number.

## 25.3 THE PROOF

The encoder was replayed again, after the move, into a second control directory:

```
  ctl0 580 files / ctl1 580 files
  identical=580  differ=0
```

**Byte-identical on every file it writes, including the five the sidecars own.**
`verify_city_chunks.py` reports the same nine failures it reported before the
change and no others — the known false alarm `cb4b71e6` documented, where the
verifier compares published chunks against the mock's pre-sidecar payload.
`us_sf_places/verify_places.py` reports `33 ok · 12 FAILURES` both before and
after; the pre-change file was run from `a97d813c` against the same tree to
establish that, and its twelve are a stale expectation, not this change.
`us_sf_reach/prove_qc.py` still prints `PROVED`.

## 25.4 A FORK THAT IS KEPT ON PURPOSE, AND ONE OF ITS TWO REASONS HAS EXPIRED

`us_sf_reach/_qc.py` is a **second implementation of the same container**, and
its existence is the concrete cost of a shared module filed under one city's
name: the reach layer did not want to depend on a directory called `us_sf_city`,
so it wrote the format out again, and `prove_qc.py` stands between the two to
prove they agree.

**That reason is gone** — the container belongs to neither layer now. **The other
reason survives and it is the load-bearing one:** the round-trip proof reads what
the reach layer wrote back with *both* readers, so "compatible" is demonstrated by
two independent implementations rather than asserted by one. A single shared
writer proving itself against itself proves nothing. Collapsing the fork would
delete the witness, so **the fork stays and the docstring now says which of its
two reasons is real.**

## 25.5 FOUND HERE AND NOT FIXED

- **`build_hood_facts.py` still imports `_chunk`**, and that path is now a
  five-line redirect with its deletion condition written at the top. The file is
  owned by another change in flight and was not edited from here. Deleting the
  shim is a one-line import change in one file.
- **`us_sf_places/verify_places.py` has been failing 12 of 45 checks** for long
  enough that nobody notices, exactly as `verify_city_chunks.py` has been failing
  9. Both are gates that cry wolf, which is worse than a gate that does not run:
  it trains the reader to skim a FAILURES block.

---

# 26. THE NEAR-DUPLICATE COLLAPSE BECOMES A MECHANISM WITH THE MEASUREMENTS BESIDE IT — 2026-08-26

The collapse is the most portable idea in the record half of the pipeline and it
was written as forty lines of closures inside `build_index.main()`, where nothing
could reach it and nothing could test it except a seven-minute rebuild.

**It is `citymap/nearcollapse.py` now, and the split is the point.** The
mechanism moved; **every threshold stayed, and each is now written down with the
observation that set it.**

## 26.1 WHAT IS TRUE OF A CITY, AND WHAT IS TRUE OF THIS CORPUS

| moved to `citymap/nearcollapse.py` | why it is generic |
|---|---|
| `letters_signature` | any series that reprints an instrument at each reading differs between printings in a sequence NUMBER, so a signature that keeps digits collapses nothing |
| `word_shingles` | compares what two texts SAY, which is what is needed when a segmenter cuts two copies at different points |
| `char_grams` | for text that has been through OCR, where two printings differ by a letter |
| `overlap` | the pairwise measure |
| `collapse_by_key` | group on an exact key, elect by a total content order, drop the rest |
| `collapse_by_leader` | walk a content order, drop a row that resembles an already-elected leader |

and what stayed in `build_index.py`, each with its evidence:

```
  SIG_LETTERS = 110      a Sunset block showed four near-identical 1928 sewer
                         orders that are two orders read twice
  LINE_KEY_CHARS = 90    the printed line, exactly
  SENT_SHINGLE_WORDS 4 / SENT_THRESHOLD 0.55
  LINE_GRAM_CHARS  4 / LINE_THRESHOLD 0.86 / LINE_MIN_GRAMS 8
                         two different house numbers on one street sit at ~0.72
  LEADER_WINDOW = 40     unbounded, it deleted 1,240 pre-1999 decisions that had
                         no near-duplicate left anywhere on their block
```

**None of those numbers may be copied to another record series.** They are facts
about how one Board prints, how one set of scans OCR'd, and where one item
splitter cuts.

## 26.2 THREE THINGS THE SHARED MODULE SAYS THAT THE CLOSURES COULD NOT

- **Order independence is stated as the module's own property**, with the reason
  it matters — a collapse that can see arrival order moves old rows when new
  material is merged, nobody chooses it, and nothing about it shows in a row
  count. `collapse_by_leader` refuses to sort, deliberately: the order is the
  caller's invariant and hiding it inside would make it easy to lose.
- **`overlap` is named honestly.** Four comments in `build_index.py` called it a
  Jaccard index. It is not one — Jaccard divides by the UNION, this divides by
  the smaller side, so a truncated reprint scores 1.0. That is the behaviour
  wanted, but it is a different measure and **thresholds do not carry between
  the two**. Anyone porting 0.86 to a Jaccard implementation would get a
  different collapse and no error.
- **It has a self-test**, `python3 citymap/nearcollapse.py`, eleven assertions
  including that `collapse_by_key` gives the same answer on a reversed input and
  that leader election does not chain. The behaviour used to be checkable only by
  a seven-minute rebuild of the whole index.

## 26.3 THE PROOF

```
  BLOCKS_OUT=<idxA> python3 build_index.py     before   2,181 files   6:47
  BLOCKS_OUT=<idxB> python3 build_index.py     after    2,181 files   6:41

  identical = 2,181   differ = 0
  duplicate readings dropped inside blocks: 611,206   (both runs)
  the two stdout logs are identical line for line
```

**Note what the baseline is and is not.** `blocks/out/` on disk is NOT the
published tree — 446 of its files differ from `website/public/data/.../blocks/`
— and neither is `blocks/out_header_fix/`, which §24.11 recorded as
byte-identical to production and is no longer. That is §24's work sitting
unpublished, and it predates this change. **So the gate here is same-code
same-corpus replay, run twice, and it is stated as that rather than dressed up as
a replay against `a97d813c`.** The chunk half of the pipeline (§25.3) *is*
replayed against `a97d813c` and is byte-identical there.

## 26.4 A STALE COMMENT DELETED, AND IT DESCRIBED CODE THAT NEVER EXISTED

The pass-2 comment stated that the comparison was *"against every leader"* with
*"no sliding window"*, and that candidates were found *"through an inverted index
on the six lexicographically smallest 4-grams of the line, so this stays
near-linear."* **Neither has ever been true of the code underneath it**, which
compares against `lead_gr[-40:]` and has no index in it. It is a design that was
tried, reverted — for the reason the paragraph immediately below it gives — and
left described. It is deleted, and the deletion is recorded here rather than made
quietly, because a comment that describes a reverted design is worse than none:
the next reader trusts it and reasons from it.

## 26.5 WHAT WAS DELIBERATELY NOT EXTRACTED, AND WHY

**The precision-tier ladder stays where it is.** The contract calls it the most
portable idea in the system and it is, but what is portable is the *discipline* —
best-available wins, the tier travels with every row, an item that resolves to
nothing is written out with its reason and never guessed onto a unit — and that
is already written down in `docs/city-map-contract.md` §4. What is in the code is
five DETECTORS: a clerk's printed block form, a parcel address range, an English
`between`/`from…to` grammar, a corner rule and a bare street name. Every one of
them is one city's forms and one legislature's English.

Lifting the ladder would produce a name table and a weight dictionary in a shared
file — an abstraction with exactly one implementation, and the anti-goal stated at
the top of §25. **It is left forked on purpose.**

`near_dup_line()` was found to be dead — defined, never called — and went with
the rest.

---

# 27. THE HARNESSES BECOME REUSABLE, AND EVERY MEASURED CONSTANT GETS WIRED TO ITS INSTRUMENT — 2026-08-26

Two things in this pass, and they are the same idea at two scales: **a number is
only honest while the thing that produced it is still findable from it.**

## 27.1 THE TWO GATES, AND THE ELEVEN LINES THAT ARE ACTUALLY SAN FRANCISCO

| moved to `citymap/` | what stayed here |
|---|---|
| `orderindep.py` — shuffle a corpus, build, hash the tree, compare | **how this city's builder is invoked**: a subprocess, three environment variables, run from its own directory. Eleven lines |
| `blocklayer.py` — read a published build back, `row_key`, `compare_before` | `CUT = 1999` — where the bound *Journal* ends and the Clerk's born-digital minutes begin |

**The builder arrives as a callable**, `build(corpus, out_dir)`. There is no
registry, nothing to configure, and a second city's index is a different eleven
lines in its own directory. The shared half literally cannot name a builder.

**`cut` has no default in `citymap`, deliberately.** An era boundary is a fact
about one record series, and a shared default would be this number quietly
inherited by whoever comes next.

## 27.2 A DUPLICATE THAT WAS HELD TOGETHER BY A COMMENT

`enumerate_block_moves.py` carried its own copy of the shard reader and of the
row-identity function, with this in the docstring:

> Same shape as `verify_block_regression.key()`, so the two agree on what 'the
> same row' is.

Two copies of an identity function that must agree, and nothing checking that
they do. That is how a field gets added to one and not the other, and the tool
then reports that nothing moved. There is one of each now.

## 27.3 THE CONSTANTS: `Measured`, `Declared`, AND A TABLE THAT CHECKS ITSELF

`citymap/measured.py` is two `float`/`int` subclasses and an audit.

```python
Z_BUILDINGS = Measured(1.55, name="Z_BUILDINGS (LOD_Z0)",
                       harness="derive/lod_probe.py",
                       method="the zoom at which the MEDIAN footprint reaches 1.6 px")
MAXZ        = Declared(12, name="MAXZ",
                       why="prose only — 'past ~8x no new detail arrives' is ASSERTED")
```

**`Measured(1.55)` IS 1.55 everywhere**, and — the property the whole design
turns on — it serialises through `json` byte for byte as the bare number, because
`json` formats with `float.__repr__` / `int.__repr__` and both ignore the
subclass. **Annotating a constant cannot change a published byte.** That was
verified before anything was annotated and then again on the real build.

**`Declared` is the more useful of the two.** The repository has a list of
numbers with no derivation anywhere, and their absence is currently INVISIBLE:
they look exactly like the measured ones. `Declared` makes the absence a fact the
audit prints. Six of them are now labelled in `encode_city_chunks.py` alone.

And two findings fell out of labelling them:

- **`Z_CANOPY = 1.55` is exactly `Z_BUILDINGS`**, and nothing anywhere says
  whether that is intent ("canopy arrives when footprints do") or the same
  coincidence ADR-0012 §4.5 found between the street layer and the tree
  threshold. **Re-measuring `LOD_Z0` for another city would move one of these two
  and not the other, silently.**
- **`Z_TREES = 2.90` is `ZSTEPS[1]`**, the ladder with no derivation, and it is
  the exact number §4.5's hazard was about.

## 27.4 `derive/wiring.py` — THE TABLE, AND IT IS CHECKED

Four of the five constants Daniel named live in `website/src/lib/city/`, which
this pass does not edit. **That is the right shape, not a workaround: the
pipeline is a reasonable place to keep the derivation TABLE and a terrible place
to keep the VALUES.** So `wiring.py` reads those files and asserts. It never
writes them.

```
  8 wired constants, 7 with no derivation

  LOD_Z0 1.55 · LOD_Z1 2.35 · DETAIL_PXM 2.0 · SA_DEFAULT 0.42
  SA_FRAMING_FLOOR 0.4099 · ROT_DEG 315 · roof band quartiles · RSHADE ±14 %

  PASS — every instrument is on disk and every consumer still holds the value
         it was measured at.
```

Change `ROT_DEG` without re-running the bearing sheet and it prints **DRIFT** and
names the seven harnesses you owe. Delete a harness and it prints the constants
that just lost their justification.

**Three things it refuses to overclaim**, and each is a correction to something
already written down:

- **`HEIGHT_BANDS = [9, 15, 25]`** is listed under NO DERIVATION, not under
  measured. `roof_bands.py` is real and produces the quartiles INSIDE the bands;
  the band CUT POINTS are asserted. It is the clearest case in the repository of
  a harness sitting next to a number it does not produce.
- **`RSHADE`'s ±14 %** is recorded as a taste decision with a rendered basis. Its
  own write-up says it was *"chosen by looking."*
- **`LOD_Z1`** is marked PARTIAL: the sweep gives the table, but *"the first
  width at which a house is separable from its party wall"* is a judgement over
  that table.

And the header says what passing does not mean: `derive/README.md` states that
**none of these harnesses runs today** — every one drives a prototype page that
no longer exists. What is recovered is the METHOD. The table's job is to keep the
method findable from the number.

## 27.5 THE PROOF

```
  encoder, with every constant annotated:
    ctl0 580 files / ctl2 580 files   identical = 580   differ = 0

  verify_order_independence.py, through citymap/orderindep.py,
  against the refactored build_index.py:
    115,673 rows · seed 101 and seed 202 · 2,179 published files
    seed 202 == seed 101: all 2179 files identical
    PASS — the index is a function of the corpus, not of its order.

  verify_block_regression.py, through citymap/blocklayer.py:
    5,089 blocks · pre-1999 decisions 90,820 = 90,820
    PASS — every pre-1999 decision on every block is unchanged, element for
    element and in the same order.

  derive/wiring.py: PASS
  citymap/check_city_free.py: PASS — 8 modules
  citymap/nearcollapse.py self-test: PASS — 11 assertions
```

The 90,820 matches the figure §24.10 recorded, which is the corroboration worth
having: the refactored reader agrees with the number the old one produced.

## 27.6 FOUND HERE AND NOT FIXED

- **`bldg.yr`'s base year 1849 is still a bare literal in three places**, none of
  them in this repository's pipeline — it lives in the mock's generator and in
  `citygl/bldg.ts`. It is the worst of the declared constants because it is a
  FORMAT constant: one byte offset by one city's founding, so the container
  cannot represent a building older than a number nobody wrote down. The manifest
  already publishes `year0` per chunk and the client ignores it. **The fix is a
  frontend change and it is one line on each side.**
- **The four frontend constants cannot be annotated from here.** `wiring.py`
  asserts them read-only, which catches drift but does not put the derivation
  where a reader of `projection.ts` will see it. Wiring them properly means a
  `Measured` equivalent in TypeScript, in `website/**`.
