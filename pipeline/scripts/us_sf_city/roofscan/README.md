# roofscan — roof shape, roof clutter and building massing, from the 2023 scan

The record publishes a footprint, a height and a use class per building. It does
not publish roof SHAPE, and `lib/city/roofs.ts` spends a long header proving
that shape cannot be recovered from the published LiDAR *zonal statistics* —
they are aggregates over a whole polygon and carry no location.

That argument is correct and it is also an argument for going to get the
point cloud the statistics were computed from.

## The source

`CA_SanFrancisco_1_B23` — USGS 3DEP, flown **20 April 2023**, 13.09 billion
points, public domain, served as EPT from a public AWS bucket.

MEASURED on two 200 m squares: **132–164 points/m²** all returns, against the
61.8 the survey advertises. Points are labelled ground / unclassified only —
**there is no building class**, so where a building IS still comes from the
published footprints. The scan says what shape it has.

## The scripts

| | |
|---|---|
| `chunks.py` | reads the published `.qc` chunks from Python — a port of `lib/city/data.ts` §decodeChunk and `lib/citygl/bldg.ts` §decodeBldg, CRC included |
| `fetch.py`  | pulls one small square at full depth, for testing |
| `city.py`   | streams the whole city into two memory-mapped rasters |
| `extract.py`| roof plane, pitch, ridge, clutter boxes and levels, per footprint |
| `look.py`   | hillshades a raster, to look at what the scan actually holds |
| `preview.py`| rebuilds the city from the EXTRACTED features alone, beside the scan |

## Two things measured the hard way

**Depth 9, not 10.** The EPT octree can be stopped early. Depth 8 keeps building
massing but turns rooftop plant into speckle; depth 9 keeps the tanks, the ducts
and the pitched roofs and is 5x cheaper than full depth. 0.35 m cells, which is
where `controls.ts`'s closest camera — 0.18 m/px — stops being able to show
anything smaller.

**`base/solo.qc` is a footprint chunk.** The tiled `bldg/` grid holds 150,901 of
the 166,166 footprints; the other 15,265 (`manifest.buildings.nSolo`) are the
large and the tall, in one tier-0 chunk. Reading `bldg/*.qc` alone yields a San
Francisco whose tallest building is 19 m and which has no downtown.

## Running it

```
python city.py            # hours; resumable, writes city_dsm.u16 / city_dtm.u16
python extract.py city    # every footprint, off that raster
```

The rasters are ~5 GB each and are **disposable** — `city.py` rebuilds them from
AWS. Nothing here belongs in the repo but the code.
