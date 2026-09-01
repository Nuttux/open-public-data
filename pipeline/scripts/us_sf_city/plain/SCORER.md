# Scoring a batch

You are giving each San Francisco Board of Supervisors decision a number, 0–100,
for how much it matters. The corpus is 99,278 decisions, 1906–2026.

## Read first

`pipeline/scripts/us_sf_city/plain/IMPORTANCE.md` — all of it, including
"The line's grammar is not its stage", "Reach picks the band", "Wide reach,
small stakes", "Building a thing, and keeping it running", and the "Do not"
list. Every section in it was written because a reader got that case wrong.

## Work in your own directory

`pipeline/data/sf_bos/rankwork/scratch-NNN/`, matching your batch number, and
nowhere else. Seven other workers run at the same time. One had its working
file silently replaced by a sibling's and scored about 300 records against the
wrong data before its own checksum caught it. Never use a generic name like
`lines.txt` in a shared directory, and check the input's hash before you write.

## The two rules readers get wrong

**Grammar is not stage.** "Street levels to be changed" and "street levels
changed" are one fact written twice. Four readers halved the first. Measured
against the records the lines came from, a line containing "to be" sits over an
ADOPTED record more often than a referred one, in the same proportion as a line
without it. Stage comes only from words that NAME a stage — proposed, sought,
urged, requested, referred, sent to committee, continued, put off, tabled, laid
over, passed for second reading, declaring the intention. Nothing on that list
means it is not a proposal. Mood, tense and the infinitive say nothing.

**No recency.** A 1911 permit and a 2016 permit that do comparable things score
the same. The historic decades are the bulk of this corpus and a thumb on the
scale would empty them.

## If your output file already exists, continue it — do not start over

A whole wave of workers was once killed mid-batch by a rate limit. Their partial
`done-NNN.jsonl` files survived on disk because they appended as they went: 8,268
scored lines across 13 batches. Restarting from line 0 would have thrown all of
it away.

So before you score anything, check whether `done-NNN.jsonl` already exists. If
it does, read the ids already in it and score only the input lines whose ids are
missing, appending in input order. Say in your report how many you inherited and
how many you added. Read a sample of what your predecessor actually DID, not just which ids it
covered. One resumed batch now holds two readings of the same floor rule — the
first half discounted a referral, the second did not — because the second worker
reasoned from the rubric alone. Both halves are defensible and the ids are sound,
so no gate can see the seam. Where the rubric genuinely allows two readings,
follow the one already in the file and say so in your report.

The ingest deduplicates by id, so a repeated id is not
corruption — but re-reading 800 records nobody needed re-read is a waste of the
run, and the batch may be killed again before it reaches the end.

## Inherited rows carry the version they were READ at, not the one you are on

If you resume a batch whose partial output was written under an older rubric,
those rows did not read your rubric — but the ingest stamps the whole file with
YOUR version, so they will silently claim it.

This has happened once. A batch inherited 100 rows scored under v6 into a v7 run;
several contradicted v7 outright (a public-use lease at 78 where the v7 ladder
fixes it at 58, a tow-away zone at 34 where the corridor rung says 44). The
reader spotted it, said so, and named the exact rows. No id gate can see this —
every id is present, valid and in order.

So: do not rescore inherited rows, but DO compare a sample of them against the
rubric you were given, and if they were read at an older version, say so and give
the id range. The orchestrator returns those rows to the queue; a batch is not
allowed to be half one rubric and half another.

## The orchestrator may retire your input while you are still working

When your `done-NNN.jsonl` reaches full length, the ingest can sweep it at any
moment — even while you are doing a final verification pass. It renames
`batch-NNN.jsonl` to `issued-NNN.jsonl` and your output to `taken-NNN-rvN.jsonl`.
This is normal and nothing is lost.

Two workers have met it. Both handled it correctly: they had hashed their own
copy of the input at the start, confirmed the hash still matched the renamed
file, and restored `done-NNN.jsonl` from the taken file. Do the same — keep your
own `in-NNN.jsonl` and its hash, and never assume the input path you started
with still exists.

## Output

`pipeline/data/sf_bos/rankwork/done-NNN.jsonl`, one object per input line, same
count and same order:

    {"id": "<copied character-for-character from its own input line>",
     "score": <int 0-100>, "band": "<band name>", "why": "<up to 8 words>"}

Copy every id from the line it belongs to and verify by position before you
finish. A file whose ids drift by one is worse than no file, because every
score then attaches to the wrong record and nothing downstream can tell.

Derive `band` from the final number in code so the two cannot disagree.

## Report

The count, the band distribution, and — the useful part — any line where the
rubric genuinely did not decide. Do not smooth those over. `RUBRIC_OPEN.md`
collects them, and they are fixed in one version bump rather than one each,
because every bump re-reads the corpus.
