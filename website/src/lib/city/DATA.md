# The city map's data layer

**Block P1.** Written as the work happened, not after it.

The mock (`scratchpad/sf-city-anim/mock-frame.html`) is **15.4 MB of one HTML file**,
6.59 MB over the wire once gzipped, and every byte of it is parsed before the first
frame. This document is how that becomes fetched assets that arrive as the camera
needs them.

---

## 0. What the baseline actually is

Stated precisely, because two different numbers are true and only one of them is the
one that matters on a phone:

| | bytes |
|---|---|
| `mock-frame.html` on disk | 15,772,027 (15.4 MB) |
| the same file gzipped | 6,588,120 (6.28 MiB) |
| **parsed before first frame** | **all of it** |

The plan says *"the site's largest existing data asset is 587 KB"*. That is not true of
the repo as it stands — `public/data/communes-all/index.json` is 19.4 MB and
`public/data/us/sf/spending_subobjects.json` is 5.1 MB. What is true, and is the
constraint that matters, is that **none of those is on the critical path to a first
frame**; they are fetched on a route the reader has already asked for. So the rule this
layer is built to is not a byte cap, it is: *nothing is fetched before the camera can
show it.*

---

## 1. The chunk container

One format for every chunk. Binary, little-endian, self-describing, checksummed.

```
offset  size  field
0       4     magic          'QCT1'  (ASCII)
4       4     u32  headerLen  bytes of header JSON
8       4     u32  payloadLen bytes of payload
12      4     u32  crc32      CRC-32/IEEE of the payload bytes
16      H     header JSON, UTF-8, H = headerLen
16+H    pad   zero bytes to the next multiple of 8
...     P     payload
```

**Why a magic and a CRC and not just raw arrays.** This project has been bitten twice by
data that decoded without complaining and was wrong: a cache holding HTML error pages
under a `.gz` name, and a parcel key truncated by a fixed seven-character slice
(`gen/part3.html` §THE STOREY SUPPLEMENT — the slice resolved 149,445 footprints where
the whole `mblr` resolves 159,852). A raw `ArrayBuffer` of typed arrays has no way to
notice either. `'QCT1'` fails on the first four bytes of `<!DOCTYPE html>`; the CRC fails
on a truncated or a re-encoded body. Both are checked before a single element is read,
and `decodeChunk` throws rather than returning a plausible-looking array.

**Why the header is JSON and not a packed table.** It costs 200–400 bytes a chunk. In
exchange every chunk is readable with `xxd | head` and carries its own field names,
dtypes and provenance — so a chunk found on disk in six months explains itself. That is
the same argument the manifest makes, applied one level down.

**Header JSON shape** (keys always emitted in this order, so the bytes are stable):

```json
{"k":"bldg/8_9","kind":"bldg","fields":[
  {"n":"cnt","t":"u8","o":0,"c":1841},
  {"n":"vx","t":"i8","o":1848,"c":9982}]}
```

`o` is the byte offset **from the start of the payload**; `c` is the element count.
Every `o` is a multiple of that dtype's element size, and the payload starts at an
8-byte boundary, so every field is a zero-copy `new Int8Array(buf, base+o, c)`.

**Dtypes.** `u8 i8 u16 i16 u32 i32 f32`. No `f64` — nothing in this data needs it, and
the sources are quantised well below that (heights are 1 m, ring coordinates 1.0 or
0.25 m, bathymetry is a sqrt quantiser with a worst error of 0.452 m).

---

## 2. The grid

**1024 m square cells, origin (−8192, −8192), 16 × 16 = 256 cells, covering
[−8192, 8192) on both axes.**

`tx = floor((x + 8192) / 1024)`, `ty = floor((y + 8192) / 1024)`, id `"{tx}_{ty}"`.

The origin is where it is because every source in the record has to fit inside it
and the arithmetic should stay in powers of two. Measured, not assumed:

| | x | y |
|---|---|---|
| footprint vertices (replayed out of `bldg-data.js`) | [−6,432, 7,072] | [−6,151, 8,008] |
| footprint centroids | [−6,424.25, 7,060.25] | [−6,145.25, 7,999.53] |
| street-surface origin (`STSURF.ox/oy`) | −7,000 | −6,000 |
| vegetation grid origin (`WORLD.tree.x0/y0`) | −7,200 | −6,600 |

The first attempt put the origin at −7,168 — a tight fit around the footprints —
and the encoder refused to place the vegetation grid, whose origin is 32 m
further west. That refusal is the reason `cells_of()` raises instead of clamping:
a silently clamped cell index is a feature drawn in the wrong square, which is
the class of bug §5.1 is about.

Bathymetry is not on this grid at all. It is the surround grid refined 4x and it
covers the whole bay out to [−16,017, 29,746] in x, so its tiles carry their own
world extent in the manifest and are culled by that.

### Where 1024 m comes from

`lod/BLOCK-L.md` measured the projection. At the 315° bearing `proj()` is axis-aligned,
so a world metre is exactly `1.2247 × cam.scale` px across the screen and
`0.7071 × cam.scale` px down it, and `cam.base = 0.05565` at 1440 × 940. With
`z = cam.scale / cam.base`, one 1440 × 940 canvas sees:

| z | preset | across (x−y), m | down (x+y), m | axis-aligned bbox, m | area, km² | of the city bbox |
|---|---|---|---|---|---|---|
| 1.0 | whole city | 21,128 | 23,888 | 22,508 | 252 | all of it |
| 1.55 | `LOD_Z0` | 13,631 | 15,412 | 14,522 | 105 | all of it |
| 2.35 | `LOD_Z1` | 8,991 | 10,165 | 9,578 | 45.7 | 24 % |
| 2.9 | district | 7,285 | 8,237 | 7,761 | 30.0 | 16 % |
| 7.2 | block | 2,935 | 3,318 | 4.87 km² diamond | 4.87 | 2.6 % |
| 12 | free max | 1,761 | 1,991 | 1.75 km² diamond | 1.75 | 0.9 % |

(The visible world region is a diamond, because the screen axes are the world
axes rotated 45°; the "bbox" column is its axis-aligned bound, which is what a grid
query costs. Area is the diamond, which is half the bbox.)

At 1024 m the block-zoom view (z = 7.2) touches a 4 × 4 bbox and about **9 cells**;
the free-max view about **4**. The district view touches about **40**. Halving to 512 m
quadruples every one of those and puts 25 requests on a block frame for the sake of a
tighter cull the camera does not need; doubling to 2048 m makes the smallest fetchable
unit 4 km², which is bigger than the entire block-zoom frame. 1024 m is the size at
which *the smallest thing you can ask for is smaller than the smallest thing you can
see* — and at which a footprint cell is a useful ~35 KB rather than a 4 KB request
whose HTTP overhead exceeds its body.

**The grid is in world metres, not in projected space.** `setRot()` exists and the
bearing is not a constant, so a projected-space tiling would be invalidated by a
rotation. `data.ts` therefore takes a world-space query (a rect, or the four
inverse-projected screen corners as a convex polygon) and returns cell ids.

---

## 3. The catalogue

563 chunks under `website/public/data/us/sf/city/`, plus `manifest.json` and two
small JSON companions (`base/blocks-id.json`, `base/marks.json`) for the string
fields nothing in the draw path needs.

| tier | kind | chunks | minZ | bytes | gzip |
|---|---|---:|---:|---:|---:|
| `base` | `bldg` | 1 | 0.0 | 366,511 | 205,143 |
| `base` | `blocks` | 1 | 0.0 | 245,780 | 172,037 |
| `base` | `canopy-tint` | 1 | 0.0 | 67,720 | 30,000 |
| `base` | `coast` | 1 | 0.0 | 5,116 | 3,869 |
| `base` | `massing` | 1 | 0.0 | 179,013 | 92,740 |
| `base` | `parks` | 1 | 0.0 | 34,472 | 19,828 |
| `base` | `terrain` | 1 | 0.0 | 76,194 | 18,457 |
| `base` | `water` | 1 | 0.0 | 117,281 | 31,630 |
| `bldg` | `bldg` | 138 | 1.55 | 3,508,711 | 1,929,486 |
| `canopy` | `canopy` | 1 | 1.55 | 195,084 | 96,346 |
| `strt` | `strt` | 124 | 2.9 | 2,767,056 | 1,244,114 |
| `strt` | `strt-misc` | 1 | 2.9 | 43,636 | 39,714 |
| `tree` | `tree` | 126 | 2.9 | 1,162,104 | 497,370 |
| `water1` | `water` | 26 | 3.0 | 1,552,016 | 236,561 |
| `face` | `face` | 139 | 4.0 | 2,083,826 | 530,542 |
| | **all** | **563** | | **12,404,520** | **5,147,837** |

`minZ` is `cam.scale / cam.base` — the zoom at or above which the renderer can
show the chunk. It is not invented per layer; each one is a threshold the mock
already had:

| tier | minZ | where the number comes from |
|---|---|---|
| `base` | 0 | the first paint |
| `bldg` | 1.55 | `LOD_Z0` in `lod/BLOCK-L.md` — the median building reaches 1.6 px and the dissolve begins |
| `canopy` | 1.55 | `VZ_C0` in `part3.html` |
| `strt`, `tree` | 2.9 | `VZ_T0`; the street surface's own gate is per-feature pixels, and 2.9 is the first preset at which any feature clears it |
| `water1` | 3.0 | the 4x refinement resolves 27.5 m nodes; below z = 3 they are under 2 px and the coarse grid is already at Nyquist |
| `face` | 4.0 | a wall has to be worth openings before openings are drawn |

**What is in the base tier and what is not.** The base tier is exactly what the
whole-city frame draws, and `lod/BLOCK-L.md` decides that, not this encoder:
5,404 block solids on their own published rings, plus every SOLO — a building
outside every assessor block, or at least 20 m high at its derived top — drawn as
itself at every zoom. So the 15,261 solos ship at first paint and the other
150,905 footprints do not. Solos are **not repeated** in any `bldg` cell; the
renderer draws `base/solo` union the cells in view, which is correct at every tier.

`base/canopy-tint` is split out of the canopy chunk for the same reason: the
tint colours the ground at every zoom, the canopy blobs do not appear until 1.55.

---

## 4. Provenance

`manifest.sources` is a table of published sources; `manifest.kinds[kind].provenance`
maps every field of every chunk kind to a key in it. So for any number on screen
the page can answer *where did that come from* without loading anything:

```ts
cityData.provenanceOf("bldg", "h")
// { dataset: "ynuv-fyni", publisher: "DataSF",
//   what: "hgt_mediancm, the median LIDAR return over the footprint",
//   quantised: "1 m, one byte" }
```

The text is not written fresh here. It is lifted from the header comments in
`gen/build.py` and the `src` / `meta` blocks the mock's own payloads carry —
those comments are the project's record of where each number came from, and they
travel with the data rather than with the renderer. A field's entry can also
carry `not_measured` (the paint chunk's, verbatim: *"This is the roof from above
in present-day imagery. It is NOT the colour anyone painted the front of the
building"*) and `defect` (§5).

Two long findings that were only ever written in `part3.html` are now carried in
the manifest as chunk `note`s, because they are the reason a field looks the way
it does and the next person will hit them:

- **why the footprint stream is a delta chain** — Hilbert order, no per-building
  origin, 1.74 MB gzip against 2.49 MB, and the 878 hops that need an escape.
  It is also why a cell cannot simply be sliced out; see `_bldgsrc.py`.
- **the storey supplement is a join correction, now dead, kept as evidence** —
  `mblr[2:9]` truncated every parcel on a lettered assessor block, the slice
  resolved 149,445 footprints against the whole key's 159,852, and the two
  derivations agree on 9,984 of 9,984 elements. That agreement is the evidence
  the fix recovered published data rather than inventing it, so the array is kept
  and the note says to read `st` first.

---

## 5. What could not be moved faithfully

**Everything in §3 is byte-exact except where this section says otherwise**, and
§7 is the proof. Four things are worth stating.

### 5.1 The street-tree grid is folded, and it was already folded

`world/build_world.py` buckets trees as `B[gj * GW + gi]` with `GW = 400`
columns of 24 m — 9,600 m. From that grid's own origin the city is 14,272 m wide
(the easternmost published footprint vertex is at x = 7,072, the origin is
x0 = -7,200), so 595 columns are needed. `gi` reaches 594, the key aliases, and a
tree at column 450 is written to `(gj + 1, column 50)`.

This is not an inference. **Column 0 is x = -7,200, open Pacific about 800 m west
of Ocean Beach, and it holds 192 tree cells.** There are no street trees in the
ocean. `gi` also saturates at exactly 399 in both the tree and the canopy array,
and the cells-per-column histogram is flat at ~180 across all 400 columns with no
taper at either edge, which a real city does not do. `gen/part3.html` decodes it
the same way the encoder does (`gi = k % gw, gj = (k / gw) | 0`), so the mock is
already drawing these trees in the wrong place: **no tree is drawn east of
x = 2,376 m**, roughly Van Ness, and the western half of the city carries the
eastern half's trees on top of its own.

The true column is **not recoverable** from the shipped file — the modulo
destroyed it. So the trees are carried through byte-faithfully, placed where the
mock's own draw code places them (so the render is unchanged and the defect is
not made *worse* here), and `manifest.sources.tree.defect` and `.canopy.defect`
say all of the above in the manifest so nothing downstream can present these
positions as fact. **The fix is one constant in `world/build_world.py` and a
regenerated `world-data.js`; it belongs there, not here, because inventing a
position here would be inventing data.**

### 5.2 Street rings are stored absolute, not as the source's delta chain

`street-data.js` stores each ring's first vertex absolute and the rest as i16
deltas, and its own comment records why: *"A kerb turns a corner every few metres,
so the deltas are small and gzip finds them: 1.16 MB absolute against 0.87 MB
delta on this file, byte-identical after decode."* That win is a **whole-file**
effect over 22,191 features. A cell holds a few hundred, the chain would have to
be re-anchored per cell as the building chain is, and the geometry here is f32
world metres rather than integers — so the chunks store absolute coordinates and
a cell is independently decodable. **Lossless**: the verifier compares the f32
arrays against the source's decoded values element for element.

The cost is measured, not assumed: `strt` is 2,767,056 bytes raw and 1,244,114
gzipped across 124 cells, against 0.99 MB gzipped for the same geometry as one
whole-file delta chain. **The tiling costs about 254 KB gzipped citywide** — and
buys back the ability to fetch one cell instead of 2.3 MB.

### 5.3 What is quantised, and by how much

Nothing new is quantised here. Every quantiser below is the published file's own,
carried across unchanged, and is named in the manifest field by field:

| field | quantum | worst error |
|---|---|---|
| footprint vertices | 1 m (`BLDG.q = 1.0`) | 0.5 m |
| building height `h` | 1 m, one byte | 0.5 m — and the sub-metre residual it rounds away ships beside it as `hf`, without which 36.0 % of neighbouring buildings on a block would draw at exactly the same height against 0.7 % in the published data |
| build year `yr` | 1 year, one byte from 1849 | none |
| terrain `dem` | one byte over 0..300 m | 0.59 m |
| bathymetry `dep` | sqrt to one byte over 0..120 m | 0.452 m, stated by the source |
| roof colour `paintIdx` | 32 palette entries | mean 5.8, against a median difference of 88 between two randomly chosen SF roofs |
| park and lake rings | decimetres (i32 x 10) | 0.05 m |
| tree position | 1.5 m within a 24 m cell | 0.75 m — but see 5.1 |

The one place the encoder chose a level of detail rather than inheriting one is
`base/water0`, and it chose it by **not resampling**: `WATD.mul` is 4 and the
shipped grid is the surround grid refined 4x, so every 4th node *is* a node of
the published coarse grid. Level 0 is that grid taken exactly. It is lossless
with respect to it, and it is only available because the source says how it was
refined — `part3.html` refuses to draw the field at all if `nw !== XW * mul + 1`.

### 5.4 What was deliberately not moved

`scans-data.js` (1.1 MB) and `photos-data.js` (346 KB) are JPEGs as
`data:image/jpeg;base64` URIs. They are not chunked here: an image belongs in an
`<img>` the browser can cache, decode off-thread and lazy-load, not in a binary
blob a canvas has to unpack. They are P4's, with the drawer that shows them.
`entries-data.js` and `decisions-data.js` (650 KB of citation text) are the same
call — text for a fiche, fetched when a fiche opens.

---

## 6. Measured bytes

### The first paint

| chunk | bytes | gzip | what |
|---|---:|---:|---|
| `base/solo` | 366,511 | 205,143 | 15,261 solo footprints, full geometry and attributes |
| `base/blocks` | 245,780 | 172,037 | 5,404 published assessor block rings |
| `base/massing` | 179,013 | 92,740 | 45,450 (block, year) massing rows + the solo bitset |
| `base/water0` | 117,281 | 31,630 | bathymetry, the published coarse grid |
| `base/terrain` | 76,194 | 18,457 | DEM 260 x 260 + land mask |
| `base/canopy-tint` | 67,720 | 30,000 | canopy fraction on the DEM grid, for the ground tint |
| `base/parks` | 34,472 | 19,828 | 328 park rings + 32 named water bodies |
| `base/coast` | 5,116 | 3,869 | shoreline + the 1906 burn polygon |
| **base tier** | **1,092,087** | **573,704** | |
| `manifest.json` | 108,356 | 23,441 | the catalogue and the provenance |
| **first paint** | **1,200,443** | **597,145** | |

**597 KB gzipped against the mock's 6,588,120 — 11.0x less on the wire, and 13x
less to parse.** Uncompressed it is 1.20 MB against 15.4 MB.

### The working set at each zoom

Swept over 406 view centres at 500 m spacing across the built city, counting every
chunk a 1440 x 940 frame at that zoom could show. This is the *whole* working set,
base tier included — not an increment.

| camera | z | across (x-y) | down (x+y) | chunks (med / max) | bldg cells (med / max) | raw (med / max) | gzip (med / max) |
|---|---|---:|---:|---:|---:|---:|---:|
| whole city | 1.0 | 21,128 m | 23,888 m | 8 / 8 | 0 / 0 | 1.09 / 1.09 MB | **0.57 / 0.57 MB** |
| `LOD_Z0` | 1.55 | 13,631 m | 15,412 m | 73 / 124 | 64 / 115 | 3.06 / 4.70 MB | 1.65 / 2.55 MB |
| `LOD_Z1` | 2.35 | 8,991 m | 10,165 m | 46 / 75 | 37 / 66 | 2.29 / 3.75 MB | 1.22 / 2.00 MB |
| district | 2.9 | 7,286 m | 8,237 m | 87 / 155 | 27 / 49 | 2.82 / 5.33 MB | 1.46 / 2.70 MB |
| block | 7.2 | 2,935 m | 3,318 m | 46 / 70 | **9 / 14** | 2.15 / 3.26 MB | 1.01 / 1.50 MB |
| free max | 12 | 1,761 m | 1,991 m | 29 / 41 | 5 / 8 | 1.90 / 2.46 MB | 0.90 / 1.13 MB |

Read the shape of that table rather than any one row. **The peak is at
`LOD_Z0` = 1.55, not at the deepest zoom** — that is the dissolve, and it is the
one place where the whole city is still in frame *and* footprints have started
arriving. `lod/BLOCK-L.md` §4 is why it is survivable: buildings arrive by a
per-building stochastic threshold `URND[i] < w`, `w` ramps from 0 at 1.55 to 1 at
2.35, and a cell that has not landed yet reads as *fewer buildings*, which is
what that band is supposed to look like anyway. The cells arrive nearest-first,
so the middle of the frame fills before the edge.

From 2.35 downward the working set falls monotonically, which is the whole claim
of progressive-by-zoom: the closer you look, the less you need.

### Against the baseline

| | mock | this |
|---|---:|---:|
| bytes before the first frame, gzipped | 6,588,120 | **597,145** |
| bytes before the first frame, raw | 15,772,027 | 1,200,443 |
| whole record, gzipped | 6,588,120 | 5,147,837 |
| whole record, raw | 15,772,027 | 12,404,520 |
| base64 round-trip at load | every typed array | none |

The whole-record gzip figures are close, and that is expected — gzip was already
undoing most of base64's 33 %. The win is not the total. **The win is that the
total is never fetched**: the deepest zoom in the table above holds 0.90 MB.

### Where the encoder output lives

`website/public/data/us/sf/city/` — 566 files, currently **untracked and not
gitignored**. Before this ships, decide which: at 12.4 MB it is a large thing to
commit, and every other city data asset in this repo is generated by
`pipeline/scripts/export/` and committed. Consistency says commit it; the size
says generate it in CI. Not P1's call.

---

## 7. The round-trip proof

    python3 pipeline/scripts/us_sf_city/verify_city_chunks.py
    npx vitest run src/lib/city/data.test.ts

**5,014 comparisons over 8,699,049 elements. FAILURES: none.**

Nothing in either harness checks a count, a checksum or a byte total and calls it
proof. This project has been bitten twice by data that decoded without
complaining and was wrong — a cache holding HTML error pages under a `.gz` name,
and a parcel key truncated by a fixed seven-character slice — so:

1. **Geometry is compared after being replayed through `part3.html`'s own walk.**
   `_bldgsrc.replay()` is a transcription of the decoder in the browser, not of
   the encoder's arithmetic. Both the source stream and each chunk's re-anchored
   stream go through it, and all **885,776 vertices** of all **166,166 buildings**
   are compared. That transcription was itself checked against a literal
   line-by-line Python port of the JavaScript loop before it was trusted.
2. **Every other field is compared element for element** against the value the
   mock's own decoder produces: heights, years, use classes, storeys, the
   sub-metre residual, roof colour and flags, the nine facade types, the shop
   bit, the two bits per ring edge, all 22,191 street features with both ring
   sets and the per-vertex kerb bit, all 195,310 trees, 32,482 canopy cells, the
   DEM, the mask, the coastline, the burn polygon, 5,404 block rings, 45,450
   massing rows, and all 1,866,465 bathymetry nodes at both levels.
3. **Partition claims are checked, not assumed.** No building is in two chunks;
   every building is in one; every non-solo centroid is inside the cell it names;
   no `bldg` cell holds a solo and `base/solo` holds nothing else; every `face`
   chunk pairs `gid`-for-`gid` with its `bldg` chunk; the water nodes dropped as
   "all land" are checked to be all zero.
4. **The guards are proved to fire**, in both languages, on an HTML error page
   served under a chunk name, a body truncated by one byte, one flipped byte, and
   a valid chunk served under the wrong name.
5. **The encoder is deterministic**: two full runs, byte-identical output —
   `find ... | xargs shasum -a 256 | shasum -a 256` matches.

The TypeScript side additionally decodes **all 563 chunks** from disk, checks
each against its manifest entry, asserts every field view is zero-copy over the
fetched buffer, and asserts every field of every kind names a source that exists.

---

## 8. Using it

```ts
import { CityData } from "@/lib/city/data";

const city = await CityData.load();          // manifest only
await city.loadBase();                       // the first paint can now draw

// every frame - cheap, O(chunks) over 563 entries
city.setView({ z, quad });                   // quad = the 4 inverse-projected corners

// the draw path is synchronous and never fetches
for (const c of city.visible("bldg", view)) {
  const cnt = c.fields.cnt as Uint8Array;
  const vx = c.fields.vx as Int8Array;
  // ... walk the chain exactly as part3.html does
}
```

`setView` is the whole request policy. It recomputes what is wanted, **aborts
anything in flight the new view cannot show** — a request the camera has already
panned past is competing for the same connection as one it is waiting on — and
rebuilds the queue nearest-first so the cell under the cursor lands before the
cell at the edge. The base tier is pinned and never evicted: re-fetching it is a
blank frame.

The view test is a separating-axis test against a convex polygon, not a bbox
test. That matters here more than it usually does: the screen axes are the world
axes rotated 45 degrees, so **the view is a diamond and its axis-aligned bound is
twice its area**.

`data.ts` imports nothing from `projection.ts` or `camera.ts`. It takes world
metres and a zoom. `setRot()` exists, so a projected-space tiling would be
invalidated by a bearing change, and a data layer that imported the camera could
not be tested without one.

---

## 9. Files

    pipeline/scripts/us_sf_city/_srcload.py            read window.X = {...}
    pipeline/scripts/us_sf_city/_chunk.py              the container
    pipeline/scripts/us_sf_city/_grid.py               the 1024 m grid
    pipeline/scripts/us_sf_city/_bldgsrc.py            the delta chain, replay and re-anchor
    pipeline/scripts/us_sf_city/encode_city_chunks.py  the encoder
    pipeline/scripts/us_sf_city/verify_city_chunks.py  the round-trip proof
    website/src/lib/city/data.ts                       manifest, fetch, decode, cache, policy
    website/src/lib/city/data.test.ts                  16 specs

Block P1b added, in the same files:

    encode_city_chunks.py  encode_surround()  encode_heroes()  _encode_caps()
                           _encode_bridge()
    verify_city_chunks.py  sections 6b and 6c, and the ok() property helper
    data.ts                SurroundData / surround() / surroundOrder(),
                           LandmarkTable / landmarks(), and their types
    data.test.ts           21 specs (37 in the file, 303 in the suite)

and these chunks under website/public/data/us/sf/city/:

    base/surround.qc     the 416 x 280 context raster, its two bitsets and its coast
    base/heroes.qc       11 heroes, 127 parts, 3,259 vertices
    base/heroes.json     the prose beside it
    base/caps.qc         68 shaped caps and the six-profile table
    base/bridge.qc       the Golden Gate deck and its two towers

---

# Block P1b — the surround, and the authored landmarks

**Written as the work happened, like the rest of this file.** P3 landed the nine
draw modules against two things P1 had not encoded, so both shipped drawing
nothing. This closes them.

## 10. A correction to §3 and §6 before anything else

**The catalogue in §3 is stale, and not because of this block.** The mock was
regenerated after P1 measured it — `mock-frame.html` is 15,988,944 bytes on disk
now against the 15,772,027 §0 records — and three of its payloads changed with
it. Re-running the P1 encoder *unmodified*, at this commit, gives:

| tier | §3 says | actually, now | |
|---|---:|---:|---|
| `canopy` | 195,084 | 305,574 | `world-data.js` regenerated |
| `strt` | 124 chunks, 2,767,056 | 125 chunks, 2,810,692 | `street-data.js` regenerated |
| `tree` | 126 chunks, 1,162,104 | 129 chunks, 1,169,140 | `world-data.js` regenerated |
| **all** | **563 chunks, 12,404,520** | **566 chunks, 12,522,046** | |

**The base tier is untouched at 1,092,087 raw / 573,704 gzipped**, exactly as §6
states, so the first-paint claim is intact and every §5 fidelity claim still
holds — the drift is entirely in tiers that are fetched by zoom. Stated here
rather than silently corrected in §3 because the numbers in §3 were true when
they were written and the difference is the reason to re-run the encoder rather
than trust a table.

Everything below is measured against the 566-chunk baseline, not the 563.

---

## 11. The surround raster

`gen_context.py`'s output — Marin, the East Bay, the San Mateo peninsula,
Alcatraz, Angel Island, Yerba Buena. Without it the Golden Gate lands on nothing
and the Bay Bridge crosses white paper, which is the review note the file was
written for.

`DRAW.md` §11 called this *"the largest gap in P3, and it is a data-layer gap,
not a renderer one."* `drawSurround`, `buildShoal`, `buildShoalHoles`, the shoal
band and both plate affines were all written against a `SurroundGrid` and given
none, so they painted nothing and returned 0.

### One chunk, `base/surround`

| field | dtype | count | what |
|---|---|---:|---|
| `dem` | `u8` | 116,480 | elevation, `dem[k]/255*zmax` metres, `zmax` = 420 |
| `land` | `u8` | 14,560 | one bit a cell, MSB first — the hydrography's land bit |
| `own` | `u8` | 14,560 | `land` AND NOT already drawn by the city model |
| `segs` | `u16` | 11,676 | 2,919 shoreline segments, 4 node indices each |

**169,192 bytes raw, 59,923 gzipped.** It is base tier and `minZ` 0, because it
is on the whole-city frame — it is the first thing a reader sees that is not San
Francisco.

Every array is **the source file's own bytes, moved unchanged**: `add_bytes`
with no re-encoding, so the chunk is byte-identical to what `context-data.js`
base64s. Nothing here is quantised by this encoder. The one quantiser in the
field is `gen_context.py`'s own — float32 3DEP metres to one byte over 0..420 m,
**1.647 m a step, worst error 0.824 m** — and it is named in the manifest as
that file's, not as ours.

### The grid, and why the cell size is in the manifest

416 × 280 cells over the lon/lat box `(−122.62, 37.60, −122.10, 37.95)`, through
the same `to_m` the city model uses, giving **cellW = 110.0096 m, cellH =
139.1500 m** and a world extent of `[−16,017.4, −17,811.2, 29,746.6, 21,150.8]`.
That is much larger than the 1024 m grid of §2, and like the bathymetry it is
culled by its own extent rather than tiled.

It is the same grid the bathymetry is a 4× refinement of — `WATD.mul` = 4 and
`nw = XW*4+1` — so **every 4th node of `base/water0`'s grid is a node of this
one**, and the encoder asserts the two node mappings agree rather than trusting
that they do.

**`cellW` and `cellH` are carried explicitly in the manifest, and that is the
point of this chunk as much as the raster is.** They are the divisor a hillshade
needs, and this project got that divisor wrong twice. Block W found `LAM`
reading *"metres of rise per CELL, used as a slope"* in the city and fixed it;
the same expression lit the surround, dividing by **1.8** against a cell of
110.01 × 139.15 m. A reader who has only the bbox has to re-derive the cell from
a projection they must also guess. Now they do not.

### The proof that this is the corrected field

The encoder computes no hillshade — `buildSurroundLam` in `terrain.ts` does, and
it already takes `cellW`/`cellH`. So the claim this chunk has to support is
narrower and checkable: *the elevation field encoded here is the one
`terrain.ts`'s measurements describe.* The verifier decodes the chunk and re-runs
**both** hillshades off it, the broken one and the fixed one:

```
                    p01     p05     p50     p95    mean
  shipped (/1.8)  0.000   0.000   0.081   0.730   0.294
  per metre       0.114   0.296   0.717   0.942   0.676
```

All ten figures reproduce `terrain.ts`'s doc-comment table exactly, off the
decoded bytes, and so do the counts around it: **63,352 land cells, 62,496 of
them interior, 30,651 clipped to exactly zero by the shipped path — 48.4 % — of
which 856 are the border ring the loop skips.** The slope over-read is 61.1×
across and 77.3× down. A flat cell returns `SUN[2]` = 0.730.

That is what "make sure it is the corrected field" can mean for a field that is
an input rather than an output: the numbers that named the bug are reproducible
from the bytes shipped, so the fix downstream is being applied to the data it
was measured on.

### `own` is not decoration — it is the paint list

`drawSurround` walks `g.order` and **applies no land test of its own**. So the
rule *do not draw a second, coarser, differently-coloured copy of San Francisco*
is enforced entirely by which cells are in `order`, and `order` must be built
over `own`, not over `land`. `own` is `land` minus the city model's own 260 × 260
mask dilated by two cells — 56,330 cells of the 63,352 — and the dilation is
`gen_context.py`'s, so the two shorelines cannot disagree into a fringe of the
wrong tone.

`land` is still needed and still shipped, because it is what the shoal band's
BFS measures distance from (`buildShoal(XW, XH, isLand)`), and that band reaches
into the water from the *real* shoreline, not from the paint list.

Both are bitsets, **MSB first within each byte** — `numpy.packbits`'s order,
kept rather than converted so the bytes are the source's. Bit `k` is
`(a[k >> 3] >> (7 - (k & 7))) & 1`, and that sentence is in the manifest note
because a bitset read the other way round decodes silently and wrongly, which is
the failure mode §1 exists to prevent.

### What `data.ts` can supply and what it cannot

`surround()` returns the decoded grid: `XW`, `XH`, `mx`, `my`, `z(i,j)`,
`isLand(i,j)`, `isOwn(i,j)`, `centre(i,j)`, `segs`, `cellW`, `cellH`, `zmax`,
`labels`. That is everything in `SurroundGrid` **except `lam` and `order`**, and
neither of those can honestly come from here:

- **`lam`** is `buildSurroundLam`'s, and it lives in `terrain.ts`. Duplicating
  the hillshade law in the data layer to satisfy a field would be re-writing the
  bug's own arithmetic in a second place.
- **`order`** is a far-to-near depth sort, and depth is the projection's.
  §8 is explicit that `data.ts` imports nothing from `projection.ts` or
  `camera.ts`, because `setRot()` exists and a data layer that imported the
  camera could not be tested without one.

So the composition is the caller's, and it is four lines. `data.ts` provides
`surroundOrder(depth)` — which takes a depth callback and returns the `own`
cells sorted far-to-near — so that **the rule about which cells are painted
stays with the data that encodes it**, while the projection stays with the
caller:

```ts
const s = city.surround()!;
const lam = buildSurroundLam(s.XW, s.XH, s.z, s.cellW, s.cellH, proj.zex);
const order = s.surroundOrder((x, y) => proj.depth(x, y));
drawSurround(frame, terrainField, { ...s, lam, order });
```

The spread satisfies `SurroundGrid` structurally, so nothing imports across the
boundary in either direction.

---

## 12. The authored landmarks

`hero-data.js` was never encoded, so `landmarks.ts` shipped the *law* — the
containment gate, volume and n-gon conservation, the emphasis curve, the
roofline test, the accent derivation, both winding fixes — with no table behind
it. The eleven heroes, the 68 shaped caps and the Golden Gate deck drew nothing.

**The source is `wonder/hero-data.js`, not `hero/hero-data.js`.** Both exist,
the second is 42 KB and the first is 77 KB, and DRAW.md §11 quotes the smaller.
The mock embeds the larger one — verified by extracting `window.HERO` out of
`mock-frame.html` and hashing it against both files, which matches
`wonder/`'s to the byte. It is a superset: the same 11 heroes and 18 materials,
plus the `wo` emphasis constants and the `note` that says a hero is not to
scale.

### Three chunks and a sidecar

| chunk | raw | gzip | what |
|---|---:|---:|---|
| `base/heroes` | 38,048 | 14,688 | 11 heroes, 127 parts, 3,259 ring vertices, 454 profile points |
| `base/caps` | 864 | 556 | 68 shaped caps + the shared six-profile table |
| `base/bridge` | 256 | 181 | the deck ring, 5 vertices, and the two towers |
| `base/heroes.json` | 13,155 | 3,617 | the prose: names, registers, what is measured, what is drawn |
| **all four** | **52,323** | **19,042** | |

All base tier: a hero is drawn at emphasis **precisely so that it reads at the
whole-city frame**, which is the first paint.

The split between chunk and sidecar is §3's, unchanged — `base/marks.json` and
`base/blocks-id.json` already carry string fields beside their chunks. Sentences
a fiche prints are not worth a binary format; 3,259 ring vertices are.

### Two number formats, for two different reasons

This is the one place in the record where the encoder chose a storage format
rather than inheriting one, so both choices are stated and both are asserted.

- **Ring and profile coordinates are `f32`.** `part3.html` loads them straight
  into `Float32Array` (`P.wx`, `P.wy`, `P.pu`, `P.ps`), so **f32 is the
  precision the page draws at** and storing f32 is lossless with respect to what
  a reader sees. Only 477 of the 6,518 ring decimals in the JSON are exactly
  representable in f32 — which is exactly why the mock's own arrays are the
  reference and the JSON text is not.
- **Every authored height, cut-off, pitch, margin and tilt is `i32`
  centimetres.** These the mock keeps as f64 JS numbers, so f32 would lose
  precision against it: 117.6 m is not an f32, and **106 of the 127 `z1` values
  are not**. All 127 are whole centimetres — asserted in the encoder, which
  refuses to write otherwise — so centimetres are **exact**, and the verifier
  checks the round trip is exact rather than close.

One sentinel. `pi` is an arcade's pitch in metres and three parts carry `1e9`,
the file's way of writing *one opening, no repetition* — the Ferry Building's
clock face and two single arches. `1e9` m in centimetres overflows `i32`, so it
maps to **−1**, which a pitch can never otherwise be, and decodes back to
`Infinity`. The encoder asserts that **only** `1e9` maps to −1, so a second
sentinel cannot be swallowed silently.

### The anchor had to be derived, and it is measured why

`part3.html` takes a hero's ground anchor from `UX[HBI[q]]` — **the footprint's
own vertex mean**, a property of the building rather than of the hero record. So
it is not in `hero-data.js` at all.

**Three of the eleven buildings are not solos** — the Conservatory of Flowers,
the Dutch Windmill and the Peace Pagoda — checked against `base/solo`'s own
`gid` array, not assumed. Their footprints live in a `bldg` cell that does not
arrive until z ≥ 1.55, so at first paint their anchor would not exist and three
heroes would silently fail to place. The anchor is therefore computed by the
same arithmetic (`_bldgsrc.read_bldg()`'s `cx`/`cy` *are* part3's `UX`/`UY`) and
shipped on the hero, `f32` as the mock stores it. The verifier compares it
element for element against that array.

### `measured` is composed, and that is stated

`landmarks.ts`'s `Hero` asks for `measured` as a **sentence**. The source carries
the measurement as a **structure** (`ms` = area, roof, top, plan radius, roll
year, vertex count). So the sidecar renders one mechanically — the same template
for all eleven, no number touched — and ships `ms` alongside so a caller can
format it differently. Nothing is added that is not in `ms`.

### The two source disagreements

**City Hall's footprint. Settled: `ms.a` = 11,251.5 m² is right, and it is
derived, not published.**

Three numbers were in play and the arithmetic separates them cleanly:

| m² | what it is |
|---:|---|
| 11,205.92 | the **published** DataSF `ynuv-fyni` ring — 26 vertices, 441.5 m perimeter |
| **11,251.5** | **that same ring after the mock's own 1 m vertex quantiser** (`BLDG.q = 1.0`) |
| 11,177 | in `PLAN-NIGHT2.md` twice, and reproduces **no** derivation in the tree |

Rounding the published ring to 1 m gives a vertex set **identical** to the
shipped one and an area of **exactly 11,251.5** — so the second number is the
first, quantised: **+45.6 m², +0.407 %.** The mock's own comment in the emphasis
rule already says *"an 11,251 m² footprint"*, and the containment gate is stated
against *the ring the page draws*, so the drawn ring's area is the right thing
for this field to carry.

11,177 is neither. Its sentence-mate in the same paragraph — War Memorial
Complex's Article 10 ring at 22,163 m² — reproduces **exactly** (22,163.3), so
the write-up is not wholesale wrong; that one figure is unsourced.
`PLAN-NIGHT2.md` is corrected, the manifest carries `landmarks.msAreaNote`
saying which number is which, and a reader quoting a footprint should quote
**11,205.92 and say it is the published ring**.

**The bridge year. Settled: 1937, and the code was already right.**

`rzic-39gi` gives the landmark `yearbuilt` **1933**; the FHWA National Bridge
Inventory gives `YEAR_BUILT_027` **1937**. These are not two opinions about one
event: **1933 is when construction began and 1937 is when the bridge was
completed and opened.** A map that draws where a bridge *is* wants the year it
existed.

`landmarks.ts`'s `GGB.year` is 1937 and `marks-data.js` already ships `ggbYr`
1937, so nothing in the code changed. What was stale was the prose:
`render/BLOCK-LR.md` called it *"a call for Daniel and not a bug"* and
`marks/BLOCK-N.md` said 1933 in four places. **Both are corrected in place**,
dated, with the reason. The chunk gates on 1937 and carries 1933 as
`yearLandmark`, labelled as the start of work — both published figures survive,
neither is presented as the other.

### The towers are checked against the deck, not trusted

The two FAA obstacle points are projected onto the City's published deck line —
a tower cannot stand beside its own bridge — and the encoder **refuses to write
the chunk** if either lands more than `GGB_TOWER_TOL_M` = 31.0 m from the
published ring. Measured: **16.16 m and 0.14 m**, against a file that gives its
coordinates to the whole arc-second, which is 31 m of latitude here. The two
towers come out **1,304.4 m** apart, which is the file's own `dtower` and 1.9 %
off the NBI's published 1,280.2 m main span.

---

## 13. The round trip, extended

    python3 pipeline/scripts/us_sf_city/verify_city_chunks.py
    npx vitest run src/lib/city/data.test.ts

**5,619 comparisons over 8,923,205 elements. FAILURES: none.**

P1's suite was extended, not duplicated: the same `eq()` element-for-element
comparator, the same file, the same totals line. The baseline at this commit is
5,032 comparisons over 8,756,321 elements, so **P1b adds 587 comparisons over
166,884 elements**. A new `ok()` records a named property as one comparison over
one element, so the totals stay a count of things actually compared.

What is new, beyond field-for-field equality on all four chunks:

1. **The surround's hillshade table is reproduced off the decoded bytes.** Both
   hillshades are re-run — the broken `/1.8` one and the per-metre one — and all
   ten percentile figures match `terrain.ts`'s doc comment to 5 × 10⁻⁴, along
   with 63,352 land cells, 62,496 interior, 30,651 zeros at 48.4 %, 856 of them
   the border ring, and the 61.1× / 77.3× over-read. **That is what proves the
   field encoded is the field those numbers were measured on.**
2. **The two grids are asserted to share metres**, rather than assumed: the
   bathymetry is this grid at `mul` = 4 (`nw = XW*4+1`) and the two world frames
   agree to 0.15 m.
3. **`own ⊆ land`**, so the paint list cannot invent land.
4. **The hero geometry is compared against a transcription of `part3.html`'s own
   HERO decoder**, not against the encoder's arithmetic — every default resolved
   as the browser resolves it (`c` → `m`, `dk` → 0.75, `ink` → 0), all 127 parts,
   all 3,259 vertices, all 454 profile points.
5. **The gate's own ceiling is checked on the table**: no part's `z1` stands
   above its hero's measured top.
6. **The centimetre store is proved exact**, and the pitch sentinel is proved to
   be a bijection.
7. **The bridge towers are proved to fall on the published deck** within the
   tolerance `landmarks.ts` states.

The encoder remains deterministic: two full runs, byte-identical
(`find … | xargs shasum -a 256 | shasum -a 256` matches).

The TypeScript side adds **21 specs** (37 in `data.test.ts`, 303 in the suite),
which decode the real chunks off disk and assert the bitset is read MSB-first by
*counting* both bit fields rather than trusting the header, that `surroundOrder`
is monotone in depth and touches only `own` cells, that every hero has a finite
anchor, and that both federal bridge sources carry a URL, a retrieval date and a
64-hex SHA-256.

### What the first paint now costs

| | P1 | P1b | |
|---|---:|---:|---|
| base chunks | 8 | 12 | |
| base tier, raw | 1,092,087 | 1,300,447 | |
| base tier, gzipped | 573,704 | 649,052 | |
| **first paint, gzipped** | **597,145** | **681,661** | **+14.2 %** |
| against the mock's 6,588,120 | 11.0× less | **9.7× less** | |

**The ceiling in `data.test.ts` moved from 600 KB to 700 KB and the test says
why**, in the test, per the rule that an assertion changes meaning only out
loud. The growth is not slack — it is 59,923 gzipped bytes of everything outside
San Francisco, which was blank paper before, and 19,042 of the landmarks the
whole map is pointed at. Both are drawn at the whole-city frame, so both belong
where they are.

---

## 14. What the draw modules still need, and what is still unencoded

Stated so the next block does not have to find it:

- **`SurroundGrid` cannot be satisfied by `data.ts` alone**, by design. `lam`
  and `order` are composed at the call site in four lines (§11). If a future
  block would rather `data.ts` returned a complete `SurroundGrid`, that means
  moving `buildSurroundLam` out of `terrain.ts` and giving `data.ts` a depth
  function — both are real changes to landed, green modules and neither was
  P1b's to make.
- **`landmarks.ts`'s `HeroPart` carries 8 of the 20 fields a part actually
  has.** `kind`, `z0`, `z1`, `profile`, `rx`, `ry`, `mat` and `min` are typed;
  the mock's draw functions also read `c` (the accent material), `ink`, `w`,
  `pi`, `mg`, `sh`, `dk`, `n` (rib count) and the `t` tilt. **All twenty are
  encoded and exposed on `HeroPartData`**, so nothing is lost — but a part drawn
  through the current `HeroPart` will have no arcade shape, no reveal darkening
  and no rib count. That is a renderer-side widening, not a data gap.
- **`Hero.measured` is typed as a string** and the source is a structure; §12
  says how that is bridged. `HeroData` exposes `ms` as well, and a future
  `Hero` that took the structure would be strictly better.
- **`render-data.js`'s `cls`/`CLS` and `tram` are NOT encoded.** `cls` is a
  13-way building class (church, museum, library, …) over 1,052 buildings, and
  `tram` is the cable-car geometry. Neither is read by any of the nine landed
  draw modules — `labels.ts`'s `PlaceClass` is the *marks* file's
  designated/named split, which `base/marks.json` already ships, and is a
  different taxonomy. Left out deliberately rather than missed.
- **The `hf` sub-metre residual, the tree fold and the storey supplement** are
  unchanged from §5; nothing here touched them.
