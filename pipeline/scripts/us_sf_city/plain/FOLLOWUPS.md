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
