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

## The rules that still hold
* 6-11 words, who did what, where.
* Nothing named that the record does not name — no street, sum, or party that
  is not in `text`. This is checked mechanically afterwards.
* A proposal stays a proposal. If the record says referred, continued, tabled
  or proposed, the line may not say it happened.
* Read the line back to yourself. If nobody would say it out loud, it is not
  finished.

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
