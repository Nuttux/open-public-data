# The page

`/us/city/sf/the-city` — what a reader sees, what they can do, and where the
copy comes from. `SHELL.md` is the other half: the renderer, the scene, the
data layer. **`SHELL.md` §2 describes the route as it was before this pass**
(`PageIntro`, four `IntroStat`s, three explanatory sections); what is below is
what the route is now.

---

## 1. Why it was rebuilt

Opened in production, the page read as an engineering report wrapped around a
canvas: a stats strip, then the map as one element among several, then three
sections — a precision-tier table, a byte-and-chunk table, and a field-by-field
provenance list of forty rows written in the vocabulary of the encoder. Two
faults, and they are separate:

1. **Nothing to do.** The map sat there. Nothing invited a reader in, nothing
   moved, and the only working affordances — pan, zoom, click a block — were
   named in 11 px mono under a column of readouts.
2. **Too much explanation, too prominent.** Provenance is the point of this
   project and none of it is deleted. It is *demoted*: one line under the map,
   and the rest behind a disclosure that has to be opened.

---

## 2. The layout

```
main
 ├ .fx-city-shell            position: relative — the plate's frame
 │   ├ <CityMap>             full width, no page wrapper
 │   │   ├ .fx-city-stage    the canvas + hud + the four camera stops
 │   │   ├ .fx-city-ledger   the record margin, 288 px
 │   │   ├ .fx-city-transport  (only if `transport` is passed)
 │   │   └ .fx-city-help     drag / scroll / click, and the keys
 │   └ <CityEntry>           the entry plate, over the stage
 ├ .fx-city-note             one line + "How this map is made"
 └ <SfSourceFooter>          perimeter, coverage, the JSON
```

The stage height is `--fx-city-h` (`min(74vh, 720px)`, `min(66vh, 560px)` on a
phone) and it is a **variable** because three things have to agree on it: the
stage, the entry plate that sits over it, and the placeholder `next/dynamic`
paints while the canvas module is still loading. `--fx-city-ledger` is the same
288 px `LEDGER_W` the camera is told about, and it is `0px` under 819 px, where
the margin stacks below the map — the case `Camera.strip()` was written for.

**The plate is not inside `CityMap`.** `CityMap` is `ssr: false`, the canvas
cannot be server-rendered, and the page's `<h1>` has to be in the HTML the
server sends. So `CityEntry` is a plain client component the route renders
itself and positions against `.fx-city-shell`.

---

## 3. What a reader can do

| | |
|---|---|
| the plate | one primary action, one secondary. Primary hands over the map (or plays the film); secondary opens the method note. Either dismisses the plate. |
| the four camera stops | on the stage, top right, against the ledger's edge — whole city, district, block, street. The one control that visibly changes the city. |
| a block | click it, or `Enter` on the block in the middle of the frame. The record margin fills with what the Board decided there, each line linked to the page of the scan. |
| the keyboard | arrows pan, `+`/`−` zoom, `Home` returns, `Enter` opens, `Escape` closes — `SfBudgetTimeline`'s pattern: a labelled `role="group"` with `aria-pressed`, and the canvas carries `role="img"` with a label rebuilt from the live frame. |

---

## 4. The seam the film drops into

`film.ts` / `time.ts` and the transport UI are a separate block. Everything it
needs is already here, and nothing on the page has to be rearranged for it:

```tsx
<CityMap
  hud={…}         /* over the canvas: the year, the beat card          */
  transport={…}   /* under the stage: the play button, the year axis   */
  ledger={…}      /* replaces the IDLE margin only — never the record  */
  onReady={(h) => …}  /* called once: h.renderer, h.focus()            */
/>
```

- `hud` and `transport` render nothing when they are not passed. `transport`
  draws no border and takes no height while it is empty.
- `ledger` replaces the idle content of the record margin. A block the reader
  picked always wins over it — the record is not something the film may cover.
- `onReady` is called once, when the renderer exists, and is read through a ref
  so an inline arrow in the caller cannot tear the renderer down and rebuild
  it. `h.renderer` is the camera: `setYear`, `goToPreset`, `home`,
  `invalidate`.
- On the plate, `primary` becomes the film's play button and `meta` its running
  time and beat count. `TheCityClient` already branches on `film.ready`, so the
  page reads the same whether the film is there or not.

---

## 5. The copy

Every reader-visible string is on a `us.sf.thecity.*` key in **both `en.ts` and
`fr.ts`**, identical English in each (ADR-0010 D3, like the rest of the SF
surface). Rules this page holds itself to:

- **No filenames, no dataset codes, no field names, no chunk or tier
  vocabulary, no precision-class names in prose.** `ynuv-fyni`,
  `year_property_built`, `hgt_mediancm`, "base tier", "gzipped", "leaf" and
  "corpus" are all gone from the page. They are in `manifest.json`, which is
  linked and downloadable at the foot of the page.
- **Every number is measured, not typed.** The counts, the year span, the
  volume count, the share that names only a street and the hand-scored accuracy
  are all read out of `manifest.json`, `block-index.json` and `accuracy.json`
  by `page.tsx`. The publisher list is derived from the manifest's own
  provenance table, so it cannot drift; our own derived layers are filtered out
  of it, because a source that is us is not a source.
- **The claim that costs something is the one on screen.** The line under the
  map is that only what is standing today is in the record — the limit that
  most changes how the map should be read.

### What was cut, and where it went

| cut | now |
|---|---|
| stats strip (4 `IntroStat`s) | one line on the plate: buildings, and decisions you can open |
| *Click a block, read the record* — 4 facts + the 5-tier table | the record margin (decisions, years, blocks with something) and one sentence in the note |
| hand-scored accuracy paragraph | one sentence in the note |
| *What it costs to look* — chunks, gzip, tiers, `minZ` | nothing. `manifest.json` at the foot of the page |
| *Where every field came from* — 40 rows of encoder prose | the note: three short paragraphs and the publishers, linked |
| the margin's readouts (zoom, blocks massed, data held, chunks in flight) | nothing. They were a debug panel |
| "Loading the first paint — 3 of 12 base chunks" | "Drawing the city…" |

---

## 6. Verified by looking

Screenshots at 1440 × 900 and 390 × 844, against the dev server, before and
after, beside `scratchpad/sf-city-anim/mock-frame.html` at the same viewport.
The question asked of each: *would a stranger arriving know what to do?*
Before, the first screen was a title, a stats row and a map with a column of
readouts beside it. After, the first screen is the city, one sentence, and a
button.


---

## 7. Block B4 — moving between the five levels, and knowing where you are

Three things on this page were bugs rather than gaps, in the sense FOCUS.md sets: they were
visibly wrong when a reader used the map rather than looked at it.

### a. The map never said which block the record belonged to

A click filled 288 px with a century of decisions and **nothing on the canvas marked the block
that answered**. `CityMap` now draws a pin — a ring and the block's own id — over the stage.

- it is anchored on the **point the reader clicked**, converted to the projection plane. Plane →
  screen is a similarity transform (`projection.ts` §plane → screen), so the pin holds its spot
  through every pan and zoom for free, and no centroid has to be asked of the block table.
- the pick carries an index and no position, so the pointer is recorded on the STAGE in the
  **capture phase**, which runs before the canvas's own listener; by the time the renderer calls
  `onPick` the point that caused it is in hand. A pick from the keyboard (`Enter` picks the
  middle of the frame) falls back to that same middle, which is where it was.
- `pointer-events: none`, so the map under it stays grabbable, and it is not drawn while the
  film has the camera or when the block is off frame.

### b. `Find it on the map`

The pin answers "which block"; this answers "where did it go". In the fiche's head, passed down
only when the map knows the point. **The order is the whole of it**: `clamp()` is
scale-dependent — at the whole-city stop the camera cannot roam, because the city is fitted —
so the first version centred and then zoomed, and the block ended up wherever the zoom carried
it. The scale is set first, the centre second, so the clamp and the frame bias both do their
arithmetic at the scale the reader is about to be looking at. It cuts rather than glides:
`glideTo` interpolates the centre it is given at the scale it starts from, and a jump to a place
a reader asked to be taken to reads as an arrival. On a phone it also scrolls the stage back
into view, because there the record is under the map and the camera move was happening off
screen.

### c. The four stops spent most of their life saying nothing

`Camera.pressedPreset()` returns −1 anywhere between two stops — the honest answer, and it is
where a wheel, a pinch and **every window resize** leave the camera. Measured: after a resize
from 1440 to 1600 none of the four read pressed, at the whole-city fit. So the one control that
says how close the view is said nothing at all most of the time.

`aria-pressed` stays exact, because standing on a stop and being nearest to one are different
claims. The **nearest** stop is marked for the eye instead — blue label, 3 px rule under it —
computed as the smallest `|log(scale / presetScale(i))|`.

The strip also gained a cap: `ZOOM · WHOLE CITY | DISTRICT | BLOCK | STREET`. Four uppercase
mono words floating over a map read as four labels until something says they are a control. The
group already carried the accessible name; the cap is the same thing for the eye, and it is the
first thing to go under 819 px where the strip already runs the width of a phone.

### d. The help line

It said `click a block to read its record`, which the margin says in full at every moment before
the first pick, and which the pin now answers after it. That clause was replaced with the thing
no other part of the interface says: `press a zoom stop to jump between the whole city and one
street`. The keyboard line is unchanged and stays visible — it is written for people who cannot
use the first line.

### e. Verified by looking

`.parity/b4shot.py` and `.parity/b4act.py`, both against the dev server. Four fiches at
1440 × 900 @2× — 3752 (South of Market, 229 decisions, four repeated subjects), 1705
(Sunset/Parkside, 7, quiet after 1947), 1147 (Lone Mountain, 2 of its own and 672 on its
streets), 0001 (Russian Hill, nothing at all) — the whole page at 390, 768 and 1600, and the
pin followed through a preset change, a drag off frame and a `Find it on the map`. Files are
`b4-*` in `.parity/out/`.
