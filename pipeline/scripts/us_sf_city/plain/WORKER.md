# Writing a slice

You are writing one short plain-English sentence for each San Francisco Board
of Supervisors record in one slice file. This is production data for a public
website, read by people who will never see the record behind it.

## Read first, in this order

1. `pipeline/scripts/us_sf_city/plain/PROMPT.md` — the specification. All of it.
2. `pipeline/scripts/us_sf_city/plain/ERA-1940.md` — **only if your slice is
   1940 or later.** The Board's house style changes and this supplement says how.
3. Your slice: `pipeline/data/sf_bos/work/slice-NNN.jsonl`

Each input line is `{"id", "y" (year), "t" (the record's full text), "p" (places
it names)}`. Slices are drawn from a single decade, so the register is
consistent across your whole file — learn it once from the first few records.

## Write

One line per record, 6–11 words, who did what, where.

* **Name nothing the record does not name.** No street, sum, person or
  organisation absent from `t`. This is checked mechanically afterwards.
* **A proposal stays a proposal.** If the record says referred, continued,
  tabled, proposed, "passed for second reading" or "declaring the intention",
  the line must not say the thing happened.
* **Do not make the Board the actor for its own ordinary business.** Every
  record here is the Board's, so naming it spends two of eleven words on the one
  thing the reader already knows. Write "$1,350 voted for a safety station at
  Third and Market", not "Board votes $1,350 for a safety station". Keep the
  Board only where a *different* board is meant ("Board of Education asked for a
  site"), or where the Board itself is the event ("Board adjourns to meet in
  August").
* **Read the line back to yourself.** If nobody would say it out loud, it is not
  finished.

## Two things that are not defects

**The scans are damaged.** The 1906–1925 volumes OCR badly: the record prints
`Applen Ilicks Wrecking`, `Ignited Railroads`, `City Planning Conunission`,
`I'kldy street`. Read through it and write the word the Board wrote — Hicks,
United, Commission, Eddy. A later check may flag those as invented; that check
is wrong and this instruction is right. Never invent a word you cannot see
under the damage.

**Some pages carry no subject.** A file number and a verdict word, or a motion
tabled with the matter named nowhere on the page. `PROMPT.md` says what to
write. Never invent a subject, and never borrow one from a neighbouring record
— the vote tally is a wall, and what is printed after it usually belongs to the
next item.

## Return

Write `pipeline/data/sf_bos/work/out-NNN.jsonl`, matching your slice number.

    {"id": "<copied character-for-character from its own input line>", "line": "<your sentence>"}

Same count as the input, same order. **Do not renumber or reconstruct ids** —
copy each from the line it belongs to. A file whose ids drift by one is worse
than no file at all, because every line looks right and every fact is attached
to the wrong record.

Do not skip records. 300 in, 300 out. If a record defeats you, write your best
honest line rather than omitting it.

## Report

Only this: the count you wrote, and three example lines with their years.
