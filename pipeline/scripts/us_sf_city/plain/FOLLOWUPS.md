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
