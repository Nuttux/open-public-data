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
