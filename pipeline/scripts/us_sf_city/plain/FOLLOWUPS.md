# Plain-line follow-ups

## Stock procedural phrasing (~1% of lines, measured over 4,200)
`put to the Board` (1.2%) and a `Motion to …` opening (1.5%) are honest but
vague where a better line exists:

    REC : Motion affirming the determination by the Planning Department that the
          proposed project at 1846 Grove Street is categorically exempt …
    NOW : Environmental exemption for 1846 Grove Street put to the Board
    BETTER: Board asked to confirm 1846 Grove Street needs no review

`sent to committee` (2.5%) is NOT in this bucket — it is the correct plain
reading of REFERRED and should stay.

Worth a targeted rewrite once the corpus is written; not worth interrupting
throughput for, since the lines are accurate as they stand.

## Held lines and scan damage
~3% of lines are held back by the `invented` check. Measured, most are the scan
being destroyed rather than the line being wrong ("Vallejo" scanned as \'all'\j()).
The corroboration rule recovers those with a cleaner reprint; the rest stay held.
Open question for a human: show them with the damaged scan visible, or keep them
hidden.

## Glossary substitution can read awkwardly
"set-back lines" -> "how far back buildings must sit" is right as a definition
but wrong as a clause: "How far back buildings must sit set on Bright Street".
The translation needs to fit the sentence, not just replace the term. Seen on
the 1925 rail; worth a pass over the glossary's longer phrases.

## "Board <verb>" is tautological — 793 lines (3.5%)
Every record in this corpus is the Board's own business, so naming it as the
actor spends two of eleven words on the one fact the reader already has:

    Board votes $1,350 for a safety station at Third and Market
    -> $1,350 voted for a safety station at Third and Market

Rule F originally said "where the Board itself is the actor, name the Board",
which actively produced these. Corrected in ERA-1940.md and PROMPT.md; every
pass from 7 on is written the right way.

KEEP the 42 that earn it:
  · a DIFFERENT board  — "Board of Education asked for a site for a courthouse"
  · the Board IS the event — "Board adjourns to meet in August"

The rewrite is NOT purely mechanical — "Board takes up buying Potrero land"
does not passivise cleanly, and some of those lines want rethinking rather than
reordering ("takes up" is vague either way). Do it as one batch with the gate
re-run over it, not as a regex during a writing pass.

## The `invented` check does not know the scans are broken
Found again on the second pass, and worth fixing at the source rather than
re-diagnosing every time. On the 1906–1925 volumes the check fires on words the
writer restored CORRECTLY, because it compares against the OCR's spelling:

    line says   record prints
    Hicks       Applen Ilicks Wrecking Company
    Co.         Hulse, Bradford & V o.
    United      the Ignited Railroads of San Francisco
    Eddy        premises situate No. 1770 I'kldy street
    Depot       Pacific Coast Wool Dei)i)t
    Commission  the City Planning Conunission

Measured on one 1900s slice: 20 of 300 lines flagged, and every one I read was
the writer being right. `verify_slice.py` already solves the same problem for
the pairing test with `_near1` — one edit, or a subsequence match, counts as a
hit. Giving `gate.check` the same tolerance would make the flag mean something
again.

It was NOT changed mid-run on purpose: the flags on the first 90,443 rows were
recorded under the current rule, and changing it halfway would leave the store
holding two incompatible verdicts. Do it once, over the whole store, and
re-record.

## RESOLVED, and the stated risk was wrong about the mechanism

The corpus now lives at `pipeline/data/sf_bos/items_merged.jsonl` with its sha256
and line count committed beside it and verified on load. /tmp is off sys.path
everywhere; all four modules imported from there were byte-identical to the repo
copies, and the stale `/tmp/harness.py` that once made prep report "queued 0 of
90,443" can no longer be reached.

The risk below said ids are positions INTO that file, so a rebuild in a different
order would silently repoint 90,000 lines. That is not the mechanism. An id is
built as `f"{o['v']}|{o['i']}"` from fields the record CARRIES. Measured:
shuffling the whole file and re-deriving the id set returns the identical 124,284
ids, and all 99,278 store ids resolve. Order is not load-bearing.

What IS load-bearing is that `v` and `i` keep meaning the same thing. A rebuild
that renumbered `i` within an existing volume would repoint that volume's lines
while every id still looked valid — silent in exactly the way the original note
feared, but by a different route. The committed checksum is the guard.

## (superseded) The corpus's own input file lives in /tmp
`harness.ITEMS` is `/tmp/items_merged.jsonl` — 134 MB, and the store's ids are
`{volume}|{index}` INTO that file. If it is cleared, the ids in
`plain_lines.jsonl` cannot be resolved back to records, and rebuilding it with
different indexing would silently repoint 90,000+ written lines at the wrong
records.

Two things are needed: the script that builds it, committed, and a checksum
recorded beside the store so a rebuilt file can be proven identical before it
is trusted. Until then the store is one `/tmp` sweep away from being
unattributable.

## THE MODERN CORPUS IS MISSING 80% OF ITSELF — 34,896 records

Found because the top-scoring modern records looked too small for what a Board
actually does. They were not mis-scored; most of the big ones are not in the
corpus at all.

    modern (sfbos:) records in items_merged.jsonl      8,611
    modern records the full sweep captured            43,507
    in the sweep and NOT in our corpus                34,896
    in our corpus and not the sweep                        0

A clean subset, so the fix is purely additive and no id collides.

WHY. `sweep_sfbos_all.py` exists precisely to undo this, and its own docstring
names the defect: `fetch_sfbos_minutes.py --extract` writes a row only when an
item resolves to a street, so "everything the Board did to the WHOLE CITY was
discarded at the door... the budget, the emergency proclamations and the
eviction moratoria are not in the file." The modern slice of items_merged.jsonl
was built from the FILTERED set. The re-sweep that keeps every item was written,
ran, and was never merged in.

MEASURED CONSEQUENCES, all of which we saw and misread as something else:

    "Concurring in Actions" items (the COVID emergency motions)
        in our corpus        0
        in the full sweep  112
    covid / coronavirus mentions
        in our corpus       14
        in the full sweep  848
    bracketed titles — the line that NAMES an item's subject
        present on 49 of 1,659 records dated 2020-21

That last one explains the "no subject on this page" epidemic readers reported
in every modern batch, and it explains why v7 needed a rule for "a line naming
a subject but no act". The subject was in the title, and the title was not
captured. We wrote rubric clauses to cope with a data defect.

WHAT IT MEANS FOR THE SCORING PASS. Nothing already scored is wrong — those
8,611 records are real and were read correctly. But the modern era's most
consequential business (emergency powers, the annual budget, minimum wage,
sanctuary policy, eviction moratoria) was never offered to a reader, and the
"what mattered most" ranking for 2015-2026 cannot be trusted until it is.

NEXT: append the 34,896 from cache_sfbos/items_all.jsonl, re-stamp the corpus
checksum, write plain lines for them, and score them at v7. They are additive,
so nothing already done needs redoing.

## Lines written under the retracted "layout B" rule — a targeted correction pass

WORKER.md told writers, until this session, that a title printed after the vote
tally belonged to THAT record for roughly 1940-1970. Measured directionally it
belongs to the NEXT record in every decade, 3,725 to 74. The rule is now deleted
(see the table in WORKER.md), but slices written before the deletion applied it.

Writers who said in their own reports that they followed it, and roughly how far:

    slice 010   1964-65   ~60 lines took the trailing title
    slice 016   1925-26   ~12 records "turn on that call"
    slice 020   1947-49   used it wherever a tally was present
    slice 028   1959/1950 followed the inherited writer's B reading
    slice 030   1960/65/69 followed the spec over its own weaker measurement
    slice 009   1957-59   split policy; used the trailing act where richer

Two of those writers measured their own volumes first and got 60-to-2 and
42-to-1 AGAINST the rule, and followed the spec anyway because it was the spec.
That is the right instinct and the wrong outcome, and it is on the spec.

These are not wrong at random: a line that takes the trailing title describes a
real act that really appears on that page — it just belongs to the record below.
So they read as plausible and will not be caught by the invented-name gate,
which only checks that the words are somewhere in the page's text.

    TO DO: pull those slices' ids back with retract.py and rewrite them under
    the corrected rule. They are identifiable by slice, which is why this list
    exists — do not re-read decades wholesale.

## The corpus is not all minutes — 1,105 records are annual reports

A writer found two thirds of its slice was Board of Public Works annual reports
(`reportofboardof1908sanf`, `annualreportofb1912sanf`, `annualreportbu19151920san`)
rather than Journal minutes: sliding OCR windows over paragraphs, bare table rows
that are a street range and a dash, and the same paragraph repeated across two
volumes as overlapping windows rather than as duplicates.

Measured corpus-wide it is 1,105 records, 0.7% — that slice drew a concentrated
pocket, not a representative sample. Composition:

    Journal of Proceedings          88,876   55.8%
    modern minutes                  56,435   35.5%
    other Journal series             4,960    3.1%
    annual reports                   1,105    0.7%

Small, but they are not decisions and the site presents them beside decisions.
PROMPT.md's honest last-resort line is written for a roll call and does not fit
a table row; the writer wrote what the page states ("Sewer on Seventeenth Avenue
built by Owen McHugh, $2,333") and said the spec has no form for these.

Worth deciding whether they belong in a decisions corpus at all before the next
export.

## THE CHUNK BOUNDARY IS IN THE WRONG PLACE — the largest structural defect left

Four writers reached this independently, from different decades, each verifying
it on consecutive records before saying so:

    the Journal prints   [Title] [File No.] [Resolution No.] [detail] [vote]
    the chunker cuts     ...........................|..............
                                            at the vote

So a chunk holds the TAIL of one item (its verdict) and the HEAD of the next
(its title), and no chunk holds one item whole. That is why the tally-wall rule
is correct and expensive at the same time: a record's own title reliably sits at
the end of the PREVIOUS chunk, where it cannot be used without borrowing.

What it costs, from the writers' own counts:

    slice 008  1960-67   177 of 500 lines (35%) say no subject
    slice 005  1942-49   127 of 500 (25%)
    slice 019  1953-56   159 of 451 (35%)
    slice 011  1990s      90 of 500 (18%)

Measured corpus-wide: 5,028 records have nothing before the tally, and 1,627 of
those have a predecessor whose tail is a usable title. That is smaller than the
per-slice rates above because those also count page footers, index pages and
mid-sentence fragments, which no chunker fix would rescue.

TWO WAYS TO FIX IT, and they are not equal:

  1. Re-chunk at the item boundary. Correct, and it renumbers `i` within every
     volume — which repoints every written line, since an id is `{v}|{i}`. That
     is the one operation the checksum in harness.py exists to prevent doing by
     accident. It would mean rewriting the store from scratch.

  2. Synthesise `ht` at load time from the previous chunk's post-tally tail,
     exactly as the modern records carry a real one. Ids never move, the store
     stays valid, and writers get the subject the Clerk actually printed.
     Recovers ~1,627 records on the measurement above.

(2) is the one to do. It is the same shape as the fix that recovered the modern
era, and it is reversible.

### Tried the load-time title synthesis. It does not work mechanically.

Trial run before writing anything: take each title-less record, look at the
previous chunk's post-tally tail, keep it if it looks like a Title Case heading
with no vote vocabulary. Result: 99 records, and the samples are wrong.

    synthesised title                      the record's actual body
    Authorizing Payment, Water Sepvice.    Granting the Bay Bottling Company...
    Authorizing Payment, Street Repairs.   Amending Ordinance No. 1061...

Two things follow. The 99 is far below the 1,627 the earlier count suggested,
so the tail extraction is picking the wrong span. And where it does fire, the
title belongs to neither this record nor the obvious neighbour — the offset is
not a clean one-record shift everywhere, whatever it is in the volumes the
writers read by hand.

So the writers' finding stands (they verified it by reading consecutive records,
repeatedly, in several decades) and my mechanisation of it does not. Shipping it
would attach a plausible wrong subject to 99 records, which is the failure this
whole pass exists to remove.

What a real fix would need: the chunker's own boundary logic, not a regex over
its output. `_sfbos_sweep.py` already parses the Clerk's typography correctly for
the modern files — it is the historic Journal volumes that lack an equivalent.
That is the piece of work, and it is bigger than a load-time patch.

### The same boundary defect, one layer down: money and names split mid-entry

Three writers, in three decades, found the chunk boundary falling INSIDE a list
entry, not just between items:

  1928-29 appropriation and permit lists (~180 records) — the dollar amount at
  the START of a chunk belongs to the street or owner named at the END of the
  previous one; in the permit-transfer lists the trailing NAME belongs to the
  NEXT chunk's address. Verified three ways by the writer, including a
  name/address pair traced across both the "To ..." and "From ..." lists.

  1927 school and boulevard land purchases — "Resolution No. X, $2,000. (2) To
  John J. McDonnell, for land" — the sum closes the PREVIOUS numbered payee.

  1944-49 DPW sidewalk-width tables — a width note leading a chunk belongs to
  the street above it.

Every one of those writers dropped the figure rather than staple it to the wrong
party, which is the right call and costs the number. It is the same defect as the
trailing title: the chunker cuts where the Clerk did not.

### The backward reach, done safely — a writer found the guard my regex lacked

I trialled synthesising a title from the previous chunk's tail and abandoned it:
the titles did not match the bodies they would attach to. A writer on a 1967-68
slice did the same reach and got it right, because it added the condition I had
not:

    use the previous chunk's trailing heading ONLY where the streets it names
    match the streets in THIS record's own parenthetical.

It then verified the chain on sixteen consecutive pairs in its own slice before
using it once — 4->5, 27->28, 28->29, 36->37, 73->74, 113->114, 115->116,
144->145, 174->175, 176->177, 190->191, 191->192, 205->206, 225->226, 245->246,
247->248 — each time the trailing title's streets reappearing as the next
record's parenthetical.

That is the difference between the reach being sound and being a guess. My
version attached "Authorizing Payment, Water Service" to a bottling permit
because it had no such test. The rule is not "take the previous tail"; it is
"take it when the record itself corroborates it".

Worth building into the harness on those terms, with the street match as a hard
precondition and the record left title-less when it fails.

## Rule 5 (money format) is being abandoned on a false premise — 1,937 lines

Two writers on different slices independently stopped applying PROMPT.md rule 5
("exact with commas under $1,000,000; $3.4M above") and wrote the full comma form
for large amounts. One stated the reason:

> the mechanical gate treats a number not literally in the record as invented —
> `$636M` against a record saying `$636,000,000` would likely flag

"Would likely" — it was never tested. It is false. `gate._rounds_to` exists for
exactly this case, and measured directly:

    $636M  vs "approving $636,000,000 in bonds"      -> CLEAN
    $3.4M  vs "not to exceed $3,400,000"             -> CLEAN
    $60M   vs "a grant of $60,000,000 accepted"      -> CLEAN

So nothing was protecting anything; the deviation bought no safety and cost
consistency. Across the store today:

    full comma form ($1,000,000 and up)   1,937 lines
    $X.XM form                            2,969 lines

40% of large-money lines are off-spec. This is the rare defect that IS safe to
repair mechanically — unlike the title-recovery trial, the number is already in
the line and already verified against the record, so the transform is pure
formatting and cannot introduce a fact. It should still be a deliberate pass with
a before/after diff read, not a drive-by sed.

Two things to fix at the source, so it stops recurring:
- PROMPT.md rule 5 should say outright that the gate understands $X.XM, because
  writers keep inferring that it does not.
- `_rounds_to` requires a literal `$` in the record (`\$\s?([\d][\d,]*)`), so an
  appropriation table printed without dollar signs still fails. That one is real,
  and is the case the note above should NOT claim is covered.

## The most-reported defect in the corpus is two rules colliding — RESOLVED

Nine workers on unrelated slices reported the same thing independently, and
several caught themselves doing it mid-run (006 fixed 6 of its own lines, 026
fixed 9, 032 rewrote 33, 005 rewrote 15, 015 rewrote 13). The collision:

- PROMPT rule 9 says an item's proposal chunk and its vote chunk are one event
  and get the same line.
- The invented-name gate says name nothing this record does not name.

They meet on the vote-only twin, whose entire text is "Resolution No. 170-18
ADOPTED" plus a roll call. Slice 005 named the gap exactly: *"the tally-wall rule
is about the NEXT item; it says nothing about the SAME item continued."*

Both readings were being applied, so the corpus is inconsistent. Worse, each
reading has a real cost and they are NOT symmetric:

**Cost of the strict reading** (measured, slice 015): 13 lines rewritten to stay
inside the terse chunk, losing true and useful detail — "on 24th Street",
"Main Library", "Juvenile Probation", "Laguna Honda". The verdict line now reads
thinner than its own sibling, for no gain in truth.

**Cost of the permissive reading** (measured, slice 006 idx 300–329): lines gain
a detail that is true of the item but absent from that chunk — "Terminal 1" on an
airport concession lease, "until 2022" on a sunset extension.

The second is a page-fidelity slip. The first destroys legibility, which is the
whole point of the corpus. And the genuinely harmful case — the 37 lines retracted
from an earlier out-015, where a mayoral reappointment was written under the wrong
nominee's name — was never this. It was CROSS-ITEM bleed, a different failure.

**Ruling: a line may use other chunks OF THE SAME ITEM, never another item's.**

This is not a judgement call left to the reader, because the precondition is
machine-checkable — same `ht`. Measured across the corpus:

    vote-only chunks whose ht MATCHES the previous chunk   4,729  (95.4%)
    vote-only chunks whose ht DIFFERS                        228   (4.6%)

So the test fires on 95% of cases and correctly refuses the other 5%. Same shape
as the street-match precondition above: the reach is sound when the record itself
corroborates it, and the record does corroborate it here.

Consequence to accept honestly: lines already written under the strict reading are
thinner than they need to be. That is a quality ceiling, not an error, and it is
not worth a re-read on its own — but a v8 pass touching those slices should
restore the detail rather than preserve the thinness.

## Two gaps the same-item rule opened, found by the writer of the last slice

**1. The rule covers detail, not the verdict.** Rule 9 now lets a vote-only chunk
borrow detail from a same-`ht` sibling. It says nothing about the other
direction: a body chunk whose own text carries no outcome word, whose sibling
carries the ADOPTED. "Every line must say whether it happened" forces one anyway,
so the writer carried the verdict backwards — ~15 lines in a 155-record slice,
which extrapolates to a lot of the corpus.

That is almost certainly right (it is the same item, and the precondition already
holds), but it is currently an unstated reading rather than a rule, which is how
the detail question went wrong in the first place. State it explicitly in v8:
the verdict travels within an item exactly as detail does, under identical `ht`.

**2. Identical text gets two different treatments by accident.** The standing
boilerplate "Resolution may be introduced before the Board…" appears with an
inherited `ht` at some indices and with `ht: null` at others. WORKER.md forbids a
no-subject line wherever an `ht` exists, so the same sentence becomes the item's
line in one place and an honest no-subject line in another — decided purely by
whether the Clerk's title happened to spill onto that page.

Neither treatment is wrong on its own; having both is. The boilerplate is
identifiable by its own text and should get one deterministic treatment
regardless of `ht`. Worth a rule, not a judgement call, because at least four
writers have now hit it and each resolved it differently.
