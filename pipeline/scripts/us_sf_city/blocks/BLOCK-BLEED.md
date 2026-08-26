# Item-boundary bleed — the 6,643 unplaced

**STATE: DONE and rebuilt.** `blocks/out/` was rebuilt with the fix and re-measured;
`measure_accuracy.py` reproduces the shipped index exactly.

Baseline build (2026-08-21): 49,952 located / 40,113 placed / 9,839 unplaced, of which
**6,643 = "all streets named after the roll call (next item bleed)"**; accuracy 75.4%
exact · 82.9% <=1 block face · 91.7% <=250 m · 5.4% >600 m.
After: **50,156 located / 42,281 placed / 7,875 unplaced, bleed 4,609**; accuracy 75.4% ·
83.2% · 91.8% · 5.3%.

To rebuild from scratch: `python3 prefaces.py && python3 build_index.py &&
python3 measure_accuracy.py && python3 verify_geo.py` (~15 min, offline).

## What the record actually looks like (proved, not assumed)

`journalofproceed46sanfrich` leaf 328 (`/details/journalofproceed46sanfrich/page/n328`),
the whole page, split on `ITEM = Resolution|Ordinance|Motion` exactly as the pipeline
splits it:

```
[1621:2004]  Ordinance No (Series of 1939). Passed for Second Reading by the following
             vote: Ayes: Supervisors Christopher, ... John J. Sullivan - 11.
             Ordering the Improvement of Ordway Street Between San Bruno Avenue and
             Girard Street and Extending City Aid in Approximate Amount of $2,200.
             File No. 7222,
[2004:2372]  Ordinance No (Series of 1939). Passed for Second Reading by the following
             vote: Ayes: ... - 11. Adopted. Declaring Intention to Order Vacation of a
             Portion of Geary Boulevard Between Forty-second and Forty-third Avenues.
             File No. 6970,
```

The Journal prints, in this order: **TITLE**, then `File No. N, Ordinance No. M`, then the
vote. The splitter cuts at the word *Ordinance*, i.e. **inside the second line**, so every
chunk is `[body+rollcall of item K] + [title of item K+1] + [File No. of item K+1]`.
The title is the only place many items name a street at all, and it lands on the item
BEFORE. That is the bleed, and it is structural, not an OCR accident.

So the true span of an item is **`end of previous roll call` → `end of own roll call`**, and
`build_index.before_rollcall()` currently implements only the right-hand half: it correctly
refuses the trailing title, and then throws it away instead of giving it to its owner.
6,643 items have no street of their own on the body side of that cut — because their street
was printed in *their* title, which is sitting at the end of the previous chunk.

## What is recoverable, measured

Of the 6,643 items the baseline counted as "all streets named after the roll call",
**1,866 (28.1%) are placed by the finished rule**:

| tier they land at | n |
|---|---|
| `street` | 1,133 |
| `corner` | 615 |
| `addr` | 67 |
| `segment` | 44 |
| `stated` | 7 |

A further **188 items are placed that were not in the corpus at all** — items whose body
names no resolvable street anywhere, so `extract_texts.py` emitted them with an empty
street list and `build_index.py` never saw them. Their title names the place.

The remaining ~4,600 are not recoverable from the text and are still counted, not guessed
— see the last section.

## The fix

`blocks/prefaces.py` — a third walk of the same cached hOCR, item-for-item the same walk
as `extract_texts.py` and `headings.py` (same page order, same `ITEM` split, same 60..3000
gate, same `locations` gate, same per-volume counter), so the `(volume, item)` join is the
same one. That is asserted at the end, not trusted: every one of the 38,363 prefaces on
the 55 volumes `items.jsonl` covers matches a real item, and the script exits non-zero if
one does not. For each item it emits the **preface**: the text between the
end of the previous item's roll call and this item's `Resolution|Ordinance|Motion` mark.

Unlike `headings.py` this is NOT gated on "does it read like a heading" — a preface is the
item's own text by position, whether or not it is well-formed prose. It is gated on
**connectedness** instead: the preface is only attached when the record itself shows the two
run together — a connector was stripped (`File No. 7222,` / `Supervisor Welch presented:` /
`Also,`) or the preface does not end in a full stop. A preface that ends in a complete
sentence with no connector is a self-contained item of its own and is refused, e.g.

```
Resolution No. 13-58. ... Ayes: ... - 11.  Equestrian Center. Supervisor McCarty called
attention to a meeting to be held on January 9th by the Recreation and Park Commission re
proposed bridle path in Golden Gate Park ... No objection and the Clerk was directed to
comply.
```

which is a whole communication, not the next resolution's title, and whose Golden Gate Park
must not be handed to the resolution that follows it.

## Where the fix lives

- **`blocks/prefaces.py`** (new) — the walk, `cache/prefaces.json`, 38,363 prefaces over
  the 55 volumes in `items.jsonl` (all of them join to a real item; the check is in the
  script and refuses to write on drift).
- **`blocks/build_index.py`** — `LT()/LR()/preface_locs()/load_items()`. An item is now
  located from `preface + body up to its own roll call`. `before_rollcall()` searches the
  roll call in the **body only**, so a roll-call remnant left in a preface can never cut
  the body's own streets away. `stated_blocks()` still reads the body alone — the stated
  block is the ground truth `measure_accuracy.py` scores against and must never come out
  of a preface.
- **`blocks/measure_accuracy.py`** — loads items through `BI.load_items()` so the two
  passes see the same corpus.
- **`blocks/verify_geo.py`** — a one-line fix to a latent `KeyError` that had been killing
  the whole geometry check (see below), plus `joined.json` now carrying the streets the
  item was actually located from.

## Result

```
                       before      after
located items          49,952     50,156    +204 located ONLY by their preface
placed                 40,113     42,281    +2,168
unplaced                9,839      7,875
  next-item bleed       6,643      4,609    -2,034   <- the target
  street >60 blocks     2,858      2,926
  omnibus (>6 streets)    338        340
precision  stated          715        723
           addr          4,205      4,301
           segment       3,093      3,184
           corner       13,034     13,955
           street       19,066     20,118
coverage   blocks with >=1 block-precision decision   4,383 -> 4,407 (81.6%)
           blocks with >=1 decision of any precision    4,989 -> 4,991
           blocks with nothing at all                     415 ->   413
```

### Accuracy, `blocks/measure_accuracy.py` — before vs after

| | n | exact | <=1 block face | <=250 m | >600 m |
|---|---|---|---|---|---|
| **before** | 240 | 75.4% | 82.9% | 91.7% | 5.4% |
| **after**  | 244 | 75.4% | 83.2% | 91.8% | 5.3% |

| tier | before n / exact / face | after n / exact / face |
|---|---|---|
| addr    | 165 · 87.9% · 92.7% | 165 · 87.9% · 92.7% |
| corner  |  66 · 43.9% · 59.1% |  70 · 45.7% · 61.4% |
| segment |   9 · 77.8% · 77.8% |   9 · 77.8% · 77.8% |

**Read this as "did not move", not as "improved".** The ground truth is 244 placements;
four items joined it and the whole shift is inside a couple of items' worth of noise. The
claim the numbers do support is the one that matters: **placements grew 5.4% and accuracy
did not fall.**

### What actually changed underneath

Re-running `locate()` with the prefaces stripped back out, item by item:

```
unchanged           39,095
newly placed         2,167
changed placement    1,019   median move 0 m; 82.7% still within one block face
no longer placed         9
```

Of the 1,019 changes, **252 are an item moving UP from `street` to `corner` precision**,
16 from `street` to `segment` and 16 from `street` to `addr` — the title carried the second
street, or the house number, that the body never repeated. Most of the rest are the same
block set with a block or two added, which is why the median move is 0 m.

### Geometry, independent of the address table the join uses

`verify_geo.py` measures every block-decision link against the street CENTRELINES, which
never pass through the parcel address table the join is built from. `joined.json` now
carries the streets the item was actually located from (preface included), so the check
sees the whole join instead of half of it:

```
tier         links    p50    p90     p99   <=40m   <=120m   >200m
stated         579     12     64    8566   86.2%    92.1%   7.25%
addr         9,191     14     18     107   94.0%    99.3%   0.00%
segment      6,527     13     16      36   99.2%   100.0%   0.00%
corner      33,461     13     16      18   99.8%   100.0%   0.00%
street     515,275     15     17      97   95.7%    99.6%   0.00%
```

**0 of 564,454 inferred links sit more than 200 m from a street the decision names**, which
is the invariant the index had before the change and still has after it.

`verify_geo.py` had a latent crash: `tiers` had no entry for tier 4 (`stated`), which was
added to the index after the check was written, so the whole check died with a `KeyError`
before printing anything. Fixed here. The `stated` row is the one tier where >200 m is
EXPECTED and not a defect: that block comes from the Board writing "Assessor's Block 6071",
not from a street, so nothing requires it to sit on a street the item names — a McLaren
Park land purchase names the park and states a block 9 km from the nearest centreline
segment carrying that name.

## Before / after, checkable by eye

Each of these was previously counted in `unplaced.json` under "all streets named after
the roll call". The preface is the title the Journal printed above the item; the body is
what the splitter left it with.

| item | preface (its own title) | now | source page |
|---|---|---|---|
| 1951-01-15 `journalofproceed46sanfrich` #54 | *Ordering the Vacation of Portion of Esmeralda Avenue Between Peralta Avenue and Franconia Street.* | corner, block **5635** (Bernal Heights) | [n67](https://archive.org/details/journalofproceed46sanfrich/page/n67/mode/1up) |
| 1953-11-30 `journalofproceed48sanfrich` #746 | *Ordering the Improvement of Portions of Putnam Street Between Jarboe and Tompkins Avenues, and Extending $1,200 City Aid.* | corner, blocks **5698, 5731** (Bernal Heights) | [n1045](https://archive.org/details/journalofproceed48sanfrich/page/n1045/mode/1up) |
| 1958-06-09 `journalofproceed53sanfrich` #287 | *Declaring Intention to Change or Modify the Official Grade on O'Farrell Street Between Taylor and Mason Streets.* | segment, blocks **0315, 0317, 0324-0326** (Tenderloin) | [n430](https://archive.org/details/journalofproceed53sanfrich/page/n430/mode/1up) |
| 1947-11-17 `journalofproceed42sanfrich` #656 | *Ordering Improvement of Portion of Thrift Street Between Capitol and Plymouth Avenues, by Increasing Amount of City Aid to $2,273.84.* | corner, blocks **7052, 7053, 7056, 7057** (Oceanview) | [n2114](https://archive.org/details/journalofproceed42sanfrich/page/n2114/mode/1up) |
| 1955-07-18 `journalofproceed50sanfrich` #386 | *Tucker Avenue from Alpha Street Northwest to Existing Pavement, and Extending City Aid in Approximate Amount of $5,800.* | corner, blocks **6200, 6203** (Visitacion Valley) | [n528](https://archive.org/details/journalofproceed50sanfrich/page/n528/mode/1up) |
| 1969-11-17 `journalofproceed64sanfrich` #383 | *Prohibiting left-hand turns for eastbound traffic on Portola Drive into Burnett Avenue.* | street, 8 blocks on Portola/Burnett (Twin Peaks) | [n1038](https://archive.org/details/journalofproceed64sanfrich/page/n1038/mode/1up) |

One of them checks itself. 1953-11-16 `journalofproceed48sanfrich` #712 is placed from its
preface — *"Confirming Sale of Surplus City-Owned Land Located on Twenty-seventh Street
East of Guerrero Street ... for $4,300"* — onto the blocks fronting 27th and Guerrero. The
BODY of that item, which the preface join never reads, says *"(Portions of Lots 14 and 15,
Block 6595...)"*, and **6595 is in the placed set**. Noe Valley, where 27th meets Guerrero.

## What is still unplaced, and why it stays that way

4,609 items still have no street on the body side of their roll call and nothing usable in
their preface:

- their own title names no place — *"Authorizing Payment of Demands", "Granting Leave of
  Absence", "Approving Concession Agreement ... for Golf Professional Services"*;
- the title sits on the previous PAGE and the preface walk carries only the last 700
  characters across a page break, which is enough for a title but not for a whole column;
- the record gives no evidence the two texts run together, so the walk refuses to claim
  the title at all. 9,233 windows were refused for this reason alone — including whole
  self-contained items like the Equestrian Center communication above, whose Golden Gate
  Park would otherwise have been handed to the next resolution.

That refusal is the point. **The recoverable share of the 6,643 was ~2,000, not 6,643**,
and the remainder is counted in `unplaced.json` rather than guessed onto a block.

## Two things found on the way, not fixed

1. **`cache/items.jsonl` is stale against the hOCR cache.** 59 volumes are cached;
   `items.jsonl` covers 55. `journalofproceed61sanfrich` (1966), `journalofproceed65sanfrich`
   (1970) and `journalofproceed88janaprsanfrich` (1993) were fetched AFTER it was written,
   and `journaljanaprofproceed71sanfrich` (1976) is the file the old sweep lost — this walk
   reads all four without error. Re-running `extract_texts.py` would add roughly 1,100 more
   items across four volumes. Left alone deliberately: it changes the corpus, and the point
   of this session was to change the boundary rule and measure it against the same corpus.
   `prefaces.py` prints the four volume ids every run.
2. **Column-order noise in the pre-1920 volumes.** In `journalofproceed1913sanfrich` #500
   the preface is `... Boundary Line." Approving and Adopting Monument Map of Point Lobos
   Avenue ...` — a title that the search-text stream places immediately before an ordinance
   about a schoolhouse on Haight Street. Two-column pages can interleave in hOCR order, and
   no boundary rule reading a single text stream can undo that. It adds a street-tier block
   to that item; it does not touch its block-precision placement.
3. **`out/street/` is never swept.** A build writes the street files it needs and leaves
   behind the ones it no longer does — 16 files in `out/street/` predate this build and
   are not referenced by any block's `s[]`. Harmless to a renderer that only follows
   `s[]`, but the directory grows with every schema change.
