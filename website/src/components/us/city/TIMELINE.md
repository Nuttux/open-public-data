# The year rail

`CityScrub.tsx` — the control surface for the century. `time.ts` holds the rule
the clock runs on, `film.ts` holds the record it is drawn from, and this is the
part a reader can put their hand on: a rail from 1906 to 2025, the years the
Board voted marked on it, a play button, and one line that says what the year
under the handle actually means.

It goes in `CityMap`'s `transport` slot — the row under the stage that draws
nothing while it is empty — exactly where `PAGE.md` §4 said it would, and
nothing else on the page moved to make room for it.

---

## 1. What a reader can do

| | |
|---|---|
| the rail | press or drag anywhere on it and the city rebuilds to that year. The pointer is captured on the press, so a drag that leaves the rail keeps scrubbing. |
| play | runs the century at six years a second. It stops at 2025, and pressing it again from there starts at 1906 rather than doing nothing. |
| 1× 2× 4× | 6, 12 and 24 years a second. The whole span is 119 years, so a run is 20 s, 10 s or 5 s. |
| the keyboard | the rail is a `role="slider"`: arrows move a year, `PageUp` / `PageDown` a decade, `Home` and `End` the two ends. Every key pauses first, because a key is the reader asking for a year and not for a run. `aria-valuenow` and `aria-valuetext` carry the year, and the caption is `aria-live="polite"`. |
| the year | display type at 30 px beside the play button, tabular so nothing shifts while the clock runs. |

## 2. What is drawn on the rail, and where every mark comes from

Nothing on the rail is a shape somebody drew. Every mark is a year the record
puts something in.

- **The ochre bars, above the line** — one per year the swept volumes carry a
  street acceptance, out of `film.json`'s `st.y`. The height is that year's own
  count on a log, because 1947's three segments and 1917's 266 both have to be
  visible on a 16 px rail. There are 27 of them, one per volume, 1906–1947.
- **The grey ticks, below the line** — `time.ts`'s `YEARS_WITH_NO_VOLUME`, the
  thirteen years inside the span with no ingested volume at all. They are drawn
  rather than left blank, and in the other direction from the bars, so a reader
  can tell a quiet year from an unread one without reading the caption for it.
- **The coloured diamonds, on the line** — the nine named things `film.json`
  dates, in `film-draw.ts` §FAM's five family colours.
- **The decades** — generated off the span, not typed, so the rail cannot stop
  labelling before the data does. Every decade on a wide rail; on a phone the
  odd ones are hidden and the twenties are kept.

## 3. The caption, and the three ways this rail could mislead

One line under the rail, and it says three things: how much of the record is
drawn by this year, what is coming next, and **one** caveat — whichever the
year under the handle has earned. Stacking all three caveats reads as a
disclaimer and gets skipped, which is the one outcome that would make the rail
dishonest.

| when | what it says |
|---|---|
| the year has no ingested volume | no volume for it has been read yet, so the record has nothing to say about that year |
| the year is before 1955 | the earliest planting date anywhere in the street tree file is 1955, so the 125,234 trees it does not date are not drawn before then |
| the year is after 1947 | the last acceptance in the volumes read so far lands in 1947, and the buildings after it come from the assessor's roll — which is why the city keeps filling in while the rail stays empty |
| otherwise, once a year is set | 138,368 of the 367,614 buildings, streets, trees and named places carry no date in any published file and are drawn in every year |

Every number in those lines is interpolated from `time.ts`'s `UNDATED` and from
the payload's own years. None of them is typed into the copy.

## 4. The film and the rail do not fight

- **While the film runs it owns the camera and the clock.** The whole transport
  row is hidden for the duration by the film's own CSS (`html[data-city-film]
  .fx-city-transport{display:none}`), and `filmOn` stops the rail's loop and
  stops it writing a year, so there is no frame where both are setting one.
- **On the way out the film hands the year over.** `CityFilm`'s `exit()` used
  to call `renderer.setYear(undefined)`, which threw a reader who stopped the
  film in the 1930s back to the present city — against the film's own stated
  contract that *the frame it stopped on IS the explorer*. It now sets the
  year it stopped on and publishes it as `CityFilmApi.exitYear`; the rail
  adopts it and owns the year from there. `play()` clears it back to null so a
  second exit on the same year hands over again.
- **One fetch.** The rail reads `film.json` through `CityFilmApi.payload`
  rather than fetching the same file a second time.

Measured: film played to shot 6, `Escape`, rail came up at **1945** with the
handle at 32.77 % — `(1945 − 1906) / 119` — and a click at 1912 moved the city
straight afterwards. `shots/s1-after-film-exit.png`.

## 5. No frame goes through React

`CityMap`'s own rule. While the rail plays, the handle and the filled track are
written straight onto their nodes and React state is touched only when the
**integer** year changes — six times a second at 1×, not sixty. The renderer's
content key already carries the integer year (Block T §9), so a year change
costs one rasterisation and a fractional one costs nothing.

## 6. Verified by looking

| shot | what it shows |
|---|---|
| `s1-page-initial.png` | the rail on the page, at the default — the whole roll, handle at the right |
| `s1-scrub-1906.png` | 1906. The Sunset is dunes, downtown is thin, the named places are three |
| `s1-scrub-1930.png` | 1930. The Sunset grid has arrived and the west side is filling |
| `s1-scrub-1917.png` | mid-rail, and the clearest look at the marks |
| `s1-sunset-1954.png` / `s1-sunset-1955.png` | the tree gate at district zoom — 1.64 % of the frame moves across 1955 |
| `s1-after-film-exit.png` | the handover, at 1945 |
| `s1-mobile-rail.png` | 390 px: play and year on one row, the rail on its own, half the decades |
| `s1-mock-ribbon.png` | the mock's own ribbon, for comparison |

## 7. Found and NOT fixed

- **`time.ts`'s `TREE_UNDATED_FROM` is 1900, not 1955, and the whole undated
  tree gate is therefore off.** It reads `TREE_YEAR0`, which `trees.ts` marks
  `@deprecated` for exactly this reason: it is `TREE_YEAR_BASE`, the offset the
  year byte is stored against, and not `TREE_EARLIEST`, the earliest date
  anywhere in the file. *"This name meant both and was one of them."* Through
  `applyUndatedTreeGate` the test becomes `year >= 1900`, which is true at
  every year this rail can reach, so all 125,234 undated trees would be drawn
  in 1906 — the exact defect the clock exists to fix, and silent, because a
  tree drawn early looks like a tree.

  `time.ts` is another block's file and was not edited. The rail sets
  `WFLG.undated` against `TREE_EARLIEST` itself, with the reason in the code,
  and **that whole branch goes back to one `applyUndatedTreeGate(year)` call
  the moment the constant is corrected.**

- **The rail is empty over its last 78 years.** 1948 to 2025 carries no mark,
  because the street-acceptance sweep ends at 1947, and the caption is the only
  thing that says so. The city visibly keeps building through that stretch —
  the buildings are the assessor's roll, not the Journal — so the two do not
  contradict each other, but a reader who only looks at the rail could read the
  empty half as a quiet half. A second series over that stretch (the 76,419
  placed decisions already on the page have years) is the obvious next thing,
  and it is a data question rather than a control one.

- **The cohort does not rise.** `scene.filmRunning` is what turns on the
  per-building stagger, and it is set only by `driveFilm`. The rail does not
  set it — `scene.ts` and `renderer.ts` belong to another block — so a year
  arrives as a cut rather than a wave. It reads fine under a drag, where the
  reader is moving faster than the stagger anyway, and it is the one thing that
  would make **play** better than it is.

- **The nine diamonds cluster.** Four of them are 1912 and they overlap into
  one mark at 1440 px. They are the record's own years and nothing here spreads
  them; a hover that names them would need the rail to take pointer events,
  which would cost the drag.

- **`prefers-reduced-motion` is not read.** Playback only ever starts on a
  press, so nothing moves that a reader did not ask for, but a reader on
  reduced motion who presses play gets the same run as anyone else.
