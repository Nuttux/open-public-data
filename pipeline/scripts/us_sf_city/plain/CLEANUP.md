# The cleanup batch

Lines already written that the spec now writes differently. They are ACCURATE —
nothing here is a correctness fix — so this runs once at the end, over the whole
corpus, with the gate re-run across it. It is not a regex and must not be one.

## Input
`/tmp/clean_in.jsonl` — one object per line: `{"id", "line", "text"}` where
`line` is what we wrote and `text` is the record's full words.

## Output
`/tmp/clean_out.jsonl` — `{"id", "line"}`, same order, same count. Copy the id
from the same input line. If a line needs no change, RETURN IT UNCHANGED — that
is a normal outcome, not a failure.

## What to fix

### 1. The Board named for its own ordinary business
Every record here is the Board of Supervisors'. Naming it as the actor spends
two of eleven words on the one thing the reader already knows.

    Board votes $1,350 for a safety station at Third and Market
    -> $1,350 voted for a safety station at Third and Market

    Board rejects protests against the hospital site on Potrero Avenue
    -> Protests rejected against the hospital site on Potrero Avenue

KEEP the Board where it earns its place:
  * a DIFFERENT board — "Board of Education asked for a site for a courthouse"
  * the Board IS the event — "Board adjourns to meet in August". Dropping it
    there gives "Adjourns to meet in August", which is worse.

Some do not passivise. "Board takes up buying Potrero land for a public park"
has no clean passive AND "takes up" is vague either way — rewrite the sentence
around what the record actually says, do not just reorder it.

### 2. A glossary definition pasted where the jargon stood
The glossary gives a term's plain MEANING, not a phrase to drop into the slot.

    How far back buildings must sit set on Twenty-fifth Avenue
    -> Buildings on Twenty-fifth Avenue must be set back from the street

    How far back buildings sit to be fixed on Shrader Street
    -> Buildings on Shrader Street will have to sit further back

### 3. The tally written as the event (~135 lines, 0.34%)
    Tabled by nine supervisors, two away
    -> <what was tabled> tabled
    Board adopts the measure by fifteen votes, three absent
    -> <what the measure was> adopted

The subject must come from the record's own text. Where the page truly carries
only a tally, say that plainly rather than inventing a subject — and do NOT
reach into a neighbouring record for one.

KEEP lines where supervisors are the event, not the arithmetic:
  · "Four supervisors sent to the League of California Municipalities convention"
  · "Three supervisors named to press officials for speedy action"

## The rules that still hold
* 6-11 words, who did what, where.
* Nothing named that the record does not name — no street, sum, or party that
  is not in `text`. This is checked mechanically afterwards.
* A proposal stays a proposal. If the record says referred, continued, tabled
  or proposed, the line may not say it happened.
* Read the line back to yourself. If nobody would say it out loud, it is not
  finished.

### 4. "No subject on this page" written over a bracketed title
From the 1990s the subject sits in square brackets beside the file number. The
no-subject escape hatch was used over it:

    Ordinance No. 7-99 FINALLY PASSED 981976 [Underground District 342, Octavia Street]
    was : A final vote with no subject on this page
    -> Wires go underground on Octavia Street

Only a record that is roll call and nothing else keeps the honest no-subject line.

### 5. A line claiming more than the record supports
FIRST, A CORRECTION. This rule was written claiming "42.4% of lines carry no
status marker". That number was wrong, and so was the 32% that replaced it. Both
came from matching lines against a hand-written list of verbs, and the list
simply did not know enough English: "City ORDERS Paris Street graded",
"Satterfield DONATES $5,600", "Pacific Telephone LEASES the firehouse site" were
all counted as status-less. Counting this with a word list does not work.

READ INSTEAD. 25 random lines checked by hand against their records: 20 state
the outcome plainly. TWO are the real defect, and only one of those is dangerous:

    LINE: Parts of Lyon, North Point and Beach Streets closed for good
    REC : ... Passed for Second Reading by the following ...
    -> the line says done; the record says it passed one reading

    LINE: Special permission with revised findings for 3400 Laguna Street
    REC : Motion No. 21727, approving a Conditional Use Authorization ...
    -> it was approved; the line does not say so

So the job is NOT rewriting tens of thousands of lines. It is finding the ones
that claim MORE than the record supports — roughly 8% clearly, up to ~20%
counting borderline cases, on a 25-line read.

FIND THEM MECHANICALLY: a line with a completed-action verb (closed, approved,
built, granted, bought) whose record contains only "second reading", "referred",
"continued", "declaring the intention", "requesting", or "passed for printing"
and no final-passage language. That is the same class `overstates` targets, and
it can be listed without re-reading every record.

The terse-but-accurate lines ("Bar licence for the Red Eye at 1337 Mission
Street") are a smaller, separate question: they are not WRONG, only incomplete.
Fix them only if a human decides the map should promise an outcome on every row.

## The rules that still hold
* 6-11 words, who did what, where.
* Nothing named that the record does not name — no street, sum, or party that
  is not in `text`. This is checked mechanically afterwards.
* A proposal stays a proposal. If the record says referred, continued, tabled
  or proposed, the line may not say it happened.
* Read the line back to yourself. If nobody would say it out loud, it is not
  finished.

### 4. "No subject on this page" written over a bracketed title
From the 1990s the subject sits in square brackets beside the file number. The
no-subject escape hatch was used over it:

    Ordinance No. 7-99 FINALLY PASSED 981976 [Underground District 342, Octavia Street]
    was : A final vote with no subject on this page
    -> Wires go underground on Octavia Street

Only a record that is roll call and nothing else keeps the honest no-subject line.

### 5. No status at all — 34,272 lines (42.4%)
The largest defect in the corpus, and the one neither check catches: `invented`
only looks at names and numbers, `overstates` only fires when a proposal is
asserted as a fact. A line stating NEITHER passes both cleanly.

    Bar licence for the Red Eye at 1337 Mission Street
    Bike lanes on Harrison Street from Eleventh to Twenty-Second
    Southern Pacific spur track along Carroll Avenue

Each needs its record re-read to learn the outcome, so this is a re-writing pass,
not a re-wording one — unlike rules 1-4, the answer is not recoverable from the
line itself. Scope it before starting: 42% of the corpus.
