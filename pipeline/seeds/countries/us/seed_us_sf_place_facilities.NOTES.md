# `seed_us_sf_place_facilities.csv` — what was corrected, and what stays guarded

A dbt seed is a CSV and a CSV cannot hold a comment, so the review notes live
here. `build_sf_place_facilities.py` calls its own output *"a reviewable seed,
not a black box"*; this is the record of one review.

Reviewed 2026-08-24 against the source register (`nc68-ngbr` City Facilities:
`facility_id`, `common_name`, `address`, `block_lot`, `latitude`, `longitude`)
and the parcel base map (`acdm-wktn`). Every distance below is metres between
two published points.

---

## 1. Six rows removed, three moved — each a facility on a place it is not

### `moscone-center` held the Moscone **Recreation** Center, 3.4 km away

`sf_place_candidates.json` gives `moscone-center` the bare alias **`"Moscone"`**,
and the matcher's phrase rule let it take four facilities at **1800 CHESTNUT ST**
— a Rec & Parks campus in the Marina that is `moscone-rec-center`, a place of its
own. The seed had already measured it and written the distance in the row:

| facility | | seed `distance_m` |
|---|---|---|
| 2049 | Moscone Rec Center | 3399 |
| 1143 | Moscone Maintenance Facility | 3392 |
| 1142 | Moscone Fieldhouse and Bleachers | 3545 |
| 1138 | Moscone Bathrooms | 3559 |

**2049 was already on `moscone-rec-center` as its primary.** The other three were
on the convention centre and nowhere else, so they are **moved** rather than
dropped — they are that campus's own buildings. Their `match_method` is
**`review`**, not `name`: *"Moscone Rec Center"* does not phrase-match *"Moscone
Bathrooms"*, and claiming a name match that did not happen would be worse than
the row it replaces. The evidence is the register's own address and APN, and
`distance_m` is recomputed from the register's point to `moscone-rec-center`'s:
**21 m, 160 m, 162 m**.

`moscone-center` is now five facilities, all in South of Market, all within
206 m: Moscone West, North, South, the Esplanade Ballroom and the garage.

### The two Park libraries had swapped a facility each

`glen-park-branch-library` carries the alias **`"Park Branch Library"`**, which is
*another published place's whole name*. Both libraries ended up holding the
other's building:

| place | facility | | was |
|---|---|---|---|
| `glen-park-branch-library` | 1228 | Park Branch Library, 1833 PAGE ST | **primary**, 4369 m |
| `glen-park-branch-library` | 808 | Glen Park Branch Library, 2825 DIAMOND ST | not primary, 77 m |
| `park-branch-library` | 808 | Glen Park Branch Library | not primary, 2147 m |
| `park-branch-library` | 1228 | Park Branch Library | primary, 2147 m |

Each place now holds only its own, and **Glen Park's real branch is primary**.

**This one mattered more than it looks.** Because the *wrong* facility was
primary, the place's published point was in the Haight too — so the block its APN
named and the point it was checked against **agreed with each other, and both
were wrong**. Every downstream guard passed it, and `glen-park-branch-library`
resolved to **block 1229, in Haight Ashbury, 4.3 km from Glen Park**. A guard
cannot catch a self-consistent defect. Only the seed can.

---

## 2. Two defects that are the SOURCE REGISTER's, and stay guarded

Neither is a matching error and **neither is corrected here**, because correcting
one would mean writing an APN the City has not published. Both are handled
downstream in `pipeline/scripts/us_sf_city/build_block_facts.py` (guards R1 and
R3), which is the honest answer when the register itself is wrong.

### `9900070` — the Port's whole waterfront on one parcel number

`nc68-ngbr` gives `9900070` to Pier 45, Pier 70, the Ferry Building, Pier 27,
Pier 39 and the Southeast treatment plant alike. The parcels the assessor lists
under block `9900` spread **6,562 m** from their own centroid and carry $0 land
and $0 improvement value. It is the Port's bucket, not a block, and no place may
be placed on it. **Guard R1** drops all seven, every run.

### `1263011` — Golden Gate Park's whole estate on Kezar Stadium's parcel

`1263011` is a real active parcel at **510 Frederick Street**, and it is Kezar's.
The register also publishes it as the `block_lot` of:

| facility | its own address | from block 1263 |
|---|---|---|
| 522 Conservatory of Flowers | 100 JOHN F KENNEDY DR | 866 m |
| 929 Japanese Tea Garden Giftshop | 75 HAGIWARA TEA GARDEN DR | 1414 m |
| 813 Golden Gate Park Senior Center | 6101 FULTON ST | 3809 m |

Four different addresses, one APN — the same pathology as `9900070`, one register
down. The place↔facility matches are all **correct**; it is the APN that is
nominal. **Guard R3** — the place's own published point must lie within 500 m of
a parcel of the block its APN names — drops the three that are not Kezar's.

---

## 3. Two things left alone, and why

- **`pier-96` picks a poor primary.** Facility 23, `"1960 | Pier 96"`, is primary
  at **726 m** while eight better-named rows sit at 89–104 m. Promoting one of
  them would move the place's published point and probably recover its block.
  It is a judgement about which building *is* the place, it changes
  `primary_address` and `primary_gross_sq_ft` on the fiche, and it is not one of
  the defects this review was opened for. Recorded, not changed.
- **`sffd-division-of-training` holds two sites 8 km apart.** Facility 688 on
  Treasure Island (primary, 569 m, **no `block_lot` at all**) and 689 at 2310
  Folsom St (8001 m). The register calls both *Fire Division of Training*, and
  the department really did run both, so this is not obviously a matching error.
  R3 drops the Folsom row and the place resolves to no block, which is the
  honest outcome.

---

## 4. The root cause is upstream of this file

Both corrected defects came from **one alias apiece** in
`pipeline/seeds/sf_place_candidates.json`, which this review does not own:

- `moscone-center` → the bare alias `"Moscone"`
- `glen-park-branch-library` → the alias `"Park Branch Library"`, which is
  another published place's entire name

`build_sf_place_facilities.py`'s department-affinity guard cannot see either:
Moscone Center is `ADM`, which accepts any non-school department, and both
libraries are `LIB`. **Until those two aliases are removed, re-running the
builder will reintroduce all six rows**, and this file will have to be reviewed
again. A rule worth adding to the builder: *an alias that is another candidate
place's whole name is not an alias.*

---

## 5. How to re-check this file without BigQuery

```
python3 pipeline/scripts/us_sf_city/build_block_facts.py --fetch       # once
python3 pipeline/scripts/us_sf_city/build_block_facts.py --check-seed
```

It replays the place→block join twice — from this seed, and from the
`places/_facilities.json` export the site ships — and prints what each guard
drops on both, so any divergence between the two is measured rather than
assumed. They converge the next time CI rebuilds `mart_us_sf_place_facilities`.
