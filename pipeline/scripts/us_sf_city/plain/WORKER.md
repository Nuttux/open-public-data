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
it names)}`, and modern records also carry:

* `ht` — **the Clerk's own title for the item, and usually the whole subject.**
* `disp` — what became of it: adopted, tabled, continued, and so on.

**Where `ht` is present, it is the best thing on the page.** The Clerk writes the
substance into the title and the body is often only the vote:

    ht: "Settlement of Lawsuit - Ken Meisle - $40,000"
     t: "Ordinance No. 131-16 FINALLY PASSED"

Read `ht` first, then `t` for anything the title leaves out. Never write "no
subject on this page" for a record that has an `ht` — it has a subject, and the
subject is right there. (Writers could not see `ht` until this was fixed, which
is why so many modern lines say exactly that.)

`disp` tells you the stage without guessing at it — but the rule that a proposal
stays a proposal still comes from the words, and `disp` only confirms them.

Slices are drawn from a single decade, so the register is consistent across your
whole file — learn it once from the first few records.

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
write. Never invent a subject, and never borrow one from a neighbouring record.

## The vote tally is ALWAYS a wall. There is no second layout.

This file used to describe two layouts and say that from the 1940s to the 1970s
a post-tally title belonged to THIS record — "94.6%". That was wrong, and it was
wrong in the direction that puts a neighbour's act on a record.

Measured directionally across the whole corpus: take every post-tally street
name and ask whether it appears in THIS record's pre-tally text or in the NEXT
record's.

    decade    next record    this record
    1900s          25              0
    1910s         105              1
    1920s         138              5
    1930s         225              9
    1940s         748             12
    1950s         242             16
    1960s         366             21
    1970s         117              5
    1980s         270              0
    1990s         409              2
    2000s       1,014              3
    2010s          66              0
    -----------------------------------
    total       3,725             74      98.1% next

Every decade, including the ones the old rule named. Three writers had already
found it independently by reading consecutive records — a record's trailing
title turning up as the next record's own parenthetical — and one measured its
volumes and got 60-to-2 and 42-to-1 before deciding to follow the spec anyway.
It should not have had to.

The old 94.6% asked a different question: whether a record's address appears
somewhere in the post-tally title. That can be true while the title still
belongs to the next item, so the figure never tested what it was used for.

**So: what is printed after the tally is the next item's. Do not read past it,
in any decade.** If the record carries nothing before the tally but its own
number, it has no subject of its own — write the honest line.

## The square brackets: where they sit decides whose they are

From the 1990s the Clerk prints a subject in square brackets beside a file
number. **It is the subject of the file number it follows, and that is not
always this record.**

    Ordinance No. 219-10 FINALLY PASSED 100467 [Zoning Map Amendment for One
    Capitol Avenue]

`219-10` is this record. `100467` is a NEW file number, and the bracket after
it heads the next item — the One Capitol Avenue body is the record that
follows. Writing "Zoning map amended for One Capitol Avenue" here attaches the
next item's subject to this one's verdict.

MEASURED over 3,185 modern chunks that end `<file number> [Title]`: the title's
words appear in the NEXT record 72.3% of the time and in this record's own body
3.2%. So:

* **A bracket at the START of the chunk, beside this record's own number** —
  that is this record's subject. Write from it.
* **A bracket at the END, after a different file number** — that belongs to the
  next item. Do not use it. If nothing else on the page states a subject, the
  page has no subject and the spec's honest line is the right answer.

This corrects an earlier instruction that said a bracketed phrase is always the
subject. It is not, and a writer who reads a trailing bracket as this record's
subject produces a fluent, checkable, wrong line — every word of it real, and
attached to the wrong act of the Board.

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

## If you are RESUMING, check what you inherited — the ids are not the test

A resumed file's earlier half was written by someone who was killed mid-run, and
being killed is not the only thing that can have gone wrong with it. One resumed
slice came back with its inherited 225 lines carrying 191 invented names: a
record whose entire text was "Resolution No. 287-16 ADOPTED" plus a roll call had
been written as "Grant application approved for the 480 Eddy Street housing
project", borrowed from a neighbouring record. Not one of those 225 lines said
"no subject on this page", which is not plausible for that material.

Verifying that the inherited ids align is necessary and not sufficient. Read a
sample of the inherited LINES against their own records. If they name things the
record does not, say so in your report and give the range — do not quietly
continue in the same style, and do not rewrite them either. The file gets
quarantined and recut; that is cheaper than a corpus that reads well and is
wrong.

`verify_slice.py out-NNN.jsonl` runs the same check mechanically and takes a
second. Run it before you report.
