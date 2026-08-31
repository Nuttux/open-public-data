You are writing one short English sentence for each San Francisco Board of Supervisors record in your slice, so an ordinary person can read them on a map of the city.

INPUT: {INFILE} — one JSON object per line: {"id", "anchor", "year", "text"}.
OUTPUT: {OUTFILE} — one JSON object per line:
    {"id": "<copied exactly>", "anchor": "<copied exactly>", "line": "<your sentence>"}

CRITICAL — ALIGNMENT. Copy BOTH the id and the anchor from the SAME input line you
are writing about. The anchor is the first six words of that record; it exists so
misalignment can be detected. A previous worker produced 300 fluent sentences and
stapled half of them to the wrong records — every line real, every line attached to
the wrong thing. That is the worst possible failure here. Process the input file
strictly in order, one line at a time, and never write a sentence without copying
that record's own id and anchor beside it. Same number of output lines as input
lines, same order.

THE REGISTER — six to eleven words. Who did what, where.

GOOD:
  Delia Williams offers her land to the city
  Associated Oil gets a filling station on Noe Street
  Land bought for the Andrew Jackson School
  Anton Delucchi refused a stable at 425 Lyon Street after neighbors objected
  Occidental Planing Mill allowed a 45 horsepower engine on Second Street
  City takes over the new roadway on Baker Street
  Flinn & Treacy given 90 more days on Pacific Street
  Twenty-five year franchise offered to burn the city's garbage

BAD:
  Accepted the said land being described as follows, to wit
  Resolution No. 1234 granting permission revocable at will of the Board
  Authorizing an expenditure to be made out of the General Fund
  Zoning and land use — Clement Street         (a category, not an event)

RULES
1. NAME THE PARTY — businesses, institutions and people. The name is what makes it read.
2. NEVER INVENT. Every name, number and street in your sentence must appear in that
   record. If the record does not say which street, do not supply one.
3. NEVER WRITE A PROPOSAL AS A FACT. If the record says "urging", "referred",
   "intention", "to consider", "laid over", "contemplated" — your line may not say
   "built", "approved", "allowed", "closed". Write "proposed", "to be closed",
   "asked for", "put off".
4. NUMBERS DESTROYED BY THE SCANNER: LEAVE THEM OUT. `$054`, `.">:;() Folsom`,
   `$(i5(:0` are mangled beyond reading — do NOT guess the figure, write the line
   without it. Mangled WORDS are fine to read through: `Conmiis- Hloners` is
   Commissioners, `Pood Co.` is Food Co. Words yes, numbers no.
5. MONEY: exact with commas under $1,000,000 ($808, $54,290); $3.4M above.
6. NO JARGON. "conditional use" -> "a change of use"; "full/conditional acceptance of
   the roadway" -> "the city takes over the new roadway"; "official grades" -> "street
   levels"; "set-back lines" -> "how far back buildings must sit"; "revocable at will
   of the Board of Supervisors" -> drop it; "Second Residential District" ->
   "two-family housing"; "Commercial District" -> "shops".
7. Streets capitalised: "Mission Street", "Van Ness Avenue".
8. Never leave a line blank. A vote tally or an adjournment still gets an honest short
   line: "Board adjourns to meet in August".
9. Duplicates are common — the Journal prints an item at introduction, at printing and
   at final passage. Same event, same line; do not invent a difference.

Your only deliverable is {OUTFILE}. Do not explain your choices. When finished reply
with just the number of lines written.
