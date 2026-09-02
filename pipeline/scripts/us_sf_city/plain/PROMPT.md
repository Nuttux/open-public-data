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
   The gate UNDERSTANDS $3.4M — it resolves it against $3,400,000 in the record
   and does not flag it. Writers keep assuming otherwise and reverting to the
   comma form; measured, that assumption is false. (The one real gap: a record
   that prints the amount with no dollar sign at all.)
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

   THE SAME ITEM CONTINUED IS NOT A NEIGHBOUR. The vote-only twin of an item —
   whose whole text is "Resolution No. 170-18 ADOPTED" plus a roll call — may use
   the detail from that item's own introduction chunk. Nine writers reported this
   as the corpus's most confusing rule, and several stripped true, useful detail
   to be safe ("on 24th Street", "Main Library", "Laguna Honda" were all deleted
   off correct lines). Don't. The test is machine-checkable and you must apply it:

       SAME `ht` as the chunk you are borrowing from  ->  allowed
       DIFFERENT `ht`                                 ->  forbidden, always

   Measured on the corpus: 4,729 vote-only chunks (95.4%) share their `ht` with
   the previous chunk, and 228 (4.6%) do not. The 4.6% is exactly the case the
   rule refuses — and it is the case that produced the worst damage in this
   corpus, 37 lines written under the wrong nominee's name. Check the `ht`; do
   not check your intuition.

Your only deliverable is {OUTFILE}. Do not explain your choices. When finished reply
with just the number of lines written.

A TRANSLATION HAS TO FIT THE SENTENCE. The glossary gives the plain MEANING of a
term, not a phrase to paste in whole. Dropping the definition in where the term
stood produces lines like these, all real:

    BAD : How far back buildings must sit set on Twenty-fifth Avenue
    BAD : How far back buildings sit to be fixed on Shrader Street
    GOOD: Buildings on Twenty-fifth Avenue must be set back from the street
    GOOD: Buildings on Shrader Street will have to sit further back

Read the line back to yourself. If it does not sound like something a person
would say out loud, rewrite it around the plain meaning instead of pasting the
definition into the slot the jargon came out of.

DO NOT NAME THE BOARD AS THE ACTOR. Every record here is the Board of
Supervisors' own business, so "Board approves the licence at 620 Treat Avenue"
spends two of your eleven words saying what the reader already knows. Write the
plain passive — "Brew-pub licence approved at 620 Treat Avenue" — and spend those
words on what actually happened, and where.
Name a board only when it is a DIFFERENT one ("Board of Education asked for a
site for a courthouse"), or when the Board itself is the event ("Board adjourns
to meet in August").

THE VOTE COUNT IS NEVER THE LINE. How the Board split is furniture; WHAT it
decided is the record. A line that reports the tally and not the subject tells a
reader nothing they came for:

    BAD : Tabled by nine supervisors, two away
    BAD : Board adopts the measure by fifteen votes, three absent
    BAD : Adopted unanimously after being put off from February 12
    GOOD: Bond money for the Sunset reservoir tabled
    GOOD: Geary Street paving contract adopted

Never write "unanimously", "N supervisors", "N ayes", "N absent", or a named
supervisor's excusal as the substance of a line.

LOOK FOR THE BRACKETED FILE TITLE BEFORE GIVING UP. From the 1990s the Journal
prints the subject in square brackets beside the file number, and it is easy to
mistake the surrounding roll call for the whole record:

    Ordinance No. 7-99 FINALLY PASSED 981976 [Underground District 342,
    Octavia Street]
    BAD : A final vote with no subject on this page
    GOOD: Wires go underground on Octavia Street

    Resolution No. 31-99 ADOPTED 982117 [Emergency Repair, Brannan Street Sewer]
    BAD : Emergency repair ordered on the Brannan Street sewer
    GOOD: An adoption vote with no subject on this page

    ── THIS EXAMPLE USED TO SAY THE OPPOSITE, AND IT WAS WRONG ──────────────
    A bracketed title at the END of a chunk, after a file number that is not
    this record's, introduces the item BELOW it. `_sfbos_sweep.py` measured
    the Clerk's typography directly: "The header sits ABOVE the item it
    introduces, and never anywhere else" — `NNNNNN [` occurs 24,624 times
    across the 390 PDFs and behaves that way in every one.

    Three writers reported this file contradicting WORKER.md and ERA-1940 D,
    and each checked it against the corpus before following the correction:
    consecutive records showed the trailing bracket to be the NEXT record's
    subject (a claim, a lease at One Jones Street, Lech Walesa parking). It
    is worth ~51 lines in a single slice, so the disagreement was expensive.

    A bracket that opens a chunk, or one that follows this record's own file
    number with nothing in between, IS this record's subject. Use it.

Only when there is NO title, in brackets or otherwise, and the whole record is
roll call, say so plainly ("A vote with no subject on this page"). That is a
last resort for a page that truly carries nothing, not a way past a record whose
subject takes a moment to find.

Supervisors DO belong in a line when they are the event rather than the
arithmetic: "Four supervisors sent to the League of California Municipalities
convention" is a real thing that happened.

THE TALLY IS A WALL. DO NOT READ PAST IT. This section used to say the
opposite — that in 10.2% of records the substance sits on the far side of the
roll call, with this example:

    Ordinance No. 118-58. Finally Passed by the following vote: Ayes: … — 10.
    Absent: Supervisor McCarty — 1. ORDERING THE IMPROVEMENT OF BOWDOIN STREET,
    BETWEEN GAVEN AND SWEENY STREETS …

    it said:  GOOD: Bowdoin Street improvement between Gaven and Sweeny finally passed

That is the NEXT item's title, and the line attributes its act to this record.
Measured directionally over the whole corpus — does a post-tally street name
appear in this record's own pre-tally text, or in the next record's — the answer
is the next record 3,725 times against 74, in every decade. WORKER.md carries
the table.

The 10.2% figure was real and its conclusion was backwards: those records DO
carry nothing of their own, and the honest line is that the page states no
subject. Writing the neighbour's act instead produces a line that reads
perfectly and is about the wrong thing, which no mechanical check here catches,
because the words really are on the page.

    GOOD: A final passage vote with no subject on this page

ONE EXCEPTION, and it is narrow. Where the post-tally text CONTINUES THIS
MOTION rather than introducing a new titled item — "Motion to amend adopted by
the following vote: [tally] Supervisor Daly moved to amend page 16 …" — it is
this record's own business and you may use it. The test is whether the text
after the tally has its own file number or title. If it does, it belongs below.

The names in a roll call are never the content of a line. Neither is the count.

EVERY LINE MUST SAY WHETHER IT HAPPENED. This is the single most important fact
in a Board record, and it is the one most easily left out. Measured over 80,762
written lines, 42% stated neither — the reader cannot tell a granted permit from
a refused one:

    BAD : Bar licence for the Red Eye at 1337 Mission Street
    GOOD: Bar licence granted for the Red Eye at 1337 Mission Street
    GOOD: Bar licence refused for the Red Eye at 1337 Mission Street
    GOOD: Bar licence sought for the Red Eye at 1337 Mission Street

    BAD : Bike lanes on Harrison Street from Eleventh to Twenty-Second
    GOOD: Bike lanes approved on Harrison Street from Eleventh to Twenty-Second
    GOOD: Bike lanes proposed on Harrison Street from Eleventh to Twenty-Second

    BAD : Southern Pacific spur track along Carroll Avenue
    GOOD: Southern Pacific allowed a spur track along Carroll Avenue

A bare noun phrase — "Bar licence for X", "Sidewalk widths on Y" — names the
SUBJECT and stops. Finish the sentence: the record always says what became of
it. Read to the end and use the Board's own outcome word: granted, refused,
adopted, finally passed, ordered, set aside, referred, continued, tabled,
withdrawn, filed.

Where the record genuinely does not say — an item introduced with no action
recorded on that page — write it as what it is ("asks for", "seeks", "proposed"),
never as a bare noun phrase and never as a decision.
