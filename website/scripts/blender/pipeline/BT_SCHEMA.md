# The building table (BT) - schema v1 (pipeline agent, 28/09)

ONE table per city = the single source of truth for building facts (BAR 28/09 19:10 (1)). SQLite (stdlib everywhere: Blender's python,
pods, the Mac), on the SD card: `/Volumes/DANI-SD-DRIVE2/pipeline/bt/sf_bt.sqlite` (pilot + Mission today: 19,165 buildings, 36 MB;
the whole city ~166 k buildings, est. ~300 MB). Builder `bt_build.py`, reader `bt_read.py`, machine-readable summary `bt_schema.json`.

## Identity
`bid` = the render's `gid` (the id every consumer already uses: city_data, gen_buildings, faithful, eras, R.gid.png).
Namespaces: < 1e6 DataSF footprint (ynuv-fyni, index in the city bundle); 8.0e8 fresh (DBI permits); 9.1e8 OSM (newb); 9.9e8 places 'add'.
Stable as long as the city bundle is not rebuilt; external ids ride as attributes (`osm_id`, `permit`, `address`). v2: a crosswalk to
(dataset, source object id / parcel) before any bundle rebuild.

## Tables
| table | columns | what |
|---|---|---|
| `buildings` | bid, origin (datasf / osm / fresh / places_add), area, cx, cy, minx..maxy, ring (json, world m), roles (json), raw (json: the source record exactly as the render reads it), year_built (+ _src), year_demolished (+ _src), demolished_by, rev | one row per building; `rev` = hash of everything about it (diffs -> tiles to re-run) |
| `attrs` | bid, attr, value (json), conf (0..1), src, date, note | EVERY candidate value of every attribute, one row per source (primary key bid, attr, src) |
| `geoms` | bid, kind, idx, geom (json), conf, src, date | extra geometry: `arc` (DataSF curves + LiDAR bulges), `massing_part` (LiDAR roof parts), `front_walls` (faithful), `footprint_places` (a hand-corrected ring) |
| `sources` | src, publisher, dataset, what, licence, retrieved | one row per source key used in attrs / geoms |
| `meta` | k, v | builder version, build time, areas, input file hashes, counts |
| `bt_rt` | rtree(id, minx, maxx, miny, maxy) | spatial index |

## Attributes (v1)
footprint (the ring's source), h, st (storeys), use, ty (facade type), shop, paint + roof_col_aerial, z0 (ground elevation), year_built,
year_demolished, replaced_for_landmark, landmark, landmark_skip, landmark_site, osm_id, permit, address, name, fresh_redated,
facade_col, trim_col, ref_col, roof_col, mat, style, garage, bays, bay_kind, shape (turret / rounded bay / bowed front ... flags),
photos (street photo ids), skip, ov_* (the places agent's render hints: roof, roof_col, facade_col, style).

## Confidence (0..1) by source kind
places 0.95 (hand-checked, 'why' in note) | landmark 0.95 | datasf_fp / datasf_lidar 0.9 | fresh 0.85 | datasf_curves 0.85 | dem 0.85 |
faithful_roof 0.8 | lidar_parts 0.8 | era_fix 0.8 | assessor 0.75 | faithful_photo 0.7 | esri_aerial 0.7 | osm 0.6 | faithful_vlm 0.55 |
faithful_name 0.45 | osm_neighbours 0.3 (inferred from neighbours) | convention 0.1.
v2: per-value confidence where the source gives one (faithful: view count, vote agreement; LiDAR: return count).

## Profiles (which candidate a consumer gets)
- `best` (default of `get` / `attr`): a hand-checked value (places) first, then the highest confidence.
- `render_today` (`records()`): exactly what the render reads today (city_data merge of DataSF + OSM + fresh + places; no faithful,
  no era_fix). Proven equal to `city_data.buildings()` on the pilot, the Mission and a small box, today, ERA 1990 and ERA 2024.5.
- faithful view (`fa_table()`): = `fa_table_v3.json` (NB 2,266 + Mission 302 entries, 0 differences; keys whose value is null are omitted).

## Years
year_built = the chosen candidate (assessor year_property_built 85 % coverage / OSM (often inferred from neighbours) / fresh permit
completion / places / era_fix). year_demolished = OSM 'replaces' (the year the OSM building stands) or fresh supersedes / demolitions
(permit dates). `alive(gid, year)`. Next sources: Sanborn / historical photos (history agent), era_lost.py structures (origin 'lost').

## Rules
- Add a source = add rows (value + conf + src + date); never overwrite another source's row.
- Consumers read through bt_read.py only (no direct SQL outside it), so the schema can move to GeoParquet later if needed.
- Rebuild is cheap (8 s for the pilot + Mission); build to `<db>.tmp` then atomic rename.
