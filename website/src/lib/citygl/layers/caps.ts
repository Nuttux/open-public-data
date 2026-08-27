/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/caps.ts — THE SECOND SOLID, AS GEOMETRY.

   Every building in `layers/buildings.ts` is ONE PRISM at its published
   median height, which is the right statistic for a building's MASS and the
   wrong one for its SILHOUETTE: a median is by construction the height half
   the roof is below, so a tower, a drum, a spire or a campanile — anything a
   MINORITY of the roof does — is averaged out of the picture. Downtown then
   reads as a field of boxes rather than as a skyline.

   The record answers that with a second stream. `form()` merges two published
   chunks into one slot table and this layer sweeps each slot with
   `roof-form.ts`'s `capForm`, which is the same builder the flat roof's tray
   and the dwelling's hip come out of.

   ── WHAT THE RECORD ACTUALLY PUBLISHES, MEASURED OFF THE CHUNKS ──────────
   Two chunks, and neither is the one a reader would guess from its name:

     `form` (kind `form`)  478 STEP slots — `bi` `top` `rad` `ang` `dx` `dy` —
                           plus 40 MAST slots in their own parallel columns
                           (`mbi` `mtop` `mrad` `mang` `mdx` `mdy` `mspire`).
                           The two streams are disjoint (measured: 0 of the 40
                           masts land on a footprint that already carries a
                           step), so the merged table is 518 slots.
     `cap`  (kind `cap`)   59 rows and SIX PROFILE CURVES. It is not a per-cap
                           stream: `bi` + `prof` name the 59 buildings whose
                           cap is not a plain prism, and `poff`/`pu`/`ps` carry
                           the curves themselves. Every other slot sweeps the
                           identity.

   Merged and resolved against the footprint tables, the 518 slots come out
   as 447 prisms, 28 domes, 15 crowns, 12 spires and 10 campaniles — 512 drawn,
   6 refused, at a measured 25,560 vertices and 30,704 triangles in ONE draw
   call.

   AND THE SIXTH PROFILE IS NEVER DRAWN, which is worth writing down rather
   than quietly rounding to five. `arcade` is a real published curve and
   exactly one of the 59 cap rows takes it — and that row's host is one of the
   14 authored heroes, so the refusal below removes it. The renderer supports
   it; this record, today, has nothing left for it to draw.

   Nothing else is in the file, and the negative is the load-bearing half:
   there is no mast HEIGHT beyond `mtop`, no tank, no penthouse box and no
   cornice anywhere in either chunk. `scene.ts` draws no such thing either —
   its only roof-cap call is `drawStep`, and `cornice` there is a FACADE
   column, not a roof one. A mast is drawn by the second solid's own
   machinery: 40 slots in the `m*` columns, all at one radius (measured: every
   one of the 40 is `mrad` 453 cm), 10 of which `mspire` gives the spire
   profile and 30 of which sweep the identity. It adds not one column to the
   record, and this layer invents nothing to go with it.

   ── WHAT IS REFUSED, AND WHY EACH REFUSAL IS THE RECORD'S OWN ────────────
   · 5 slots stand on a footprint an authored hero already models. The hero
     draws its own drum and its own lantern; a second solid over it is one
     building wearing two shapes. `scene.ts` drops these before it queues a
     cap and so does this — see `skipGids`.
   · ONE slot — a crown — has no lift over the roof plane the page already
     drew: its published `top` lands 0.03 m UNDER its host's own published
     median. That is the whole of this refusal, and 0.03 m is the size of the
     disagreement between two published columns, not a modelling choice.
     `capForm` refuses a cap with `topM <= baseM` and leaves the sink
     untouched, so it costs nothing. (The remaining lifts run 0.07 m to
     166.32 m, median 11.13 m — all measured over the 512 drawn.)

   ── THE GATE IS THE RECORD'S OWN, PER CAP ───────────────────────────────
   This layer used to be switched off whole at the wide camera (`fromStep: 1`)
   because *"a mesh cannot re-decide per frame the way a fill can: this
   layer's one index buffer already spends its only draw range on the century
   scrub"*. That was true of ONE draw range and it threw away the wrong half.

   MEASURED. `drawStep` refuses a cap on two floors in pixels of the thing
   itself — `FSTEP_LIFT_PX` 1.4 px of LIFT and `FSTEP_W_PX` 0.7 px of WIDTH —
   so the scale a cap needs is

       need = max( 1.4 / (zexb * liftM),  0.7 / (2 * rad * |(ax, ay)|) )

   and the whole-city camera on this city sits at 0.0790 px per plane unit
   (measured off the page's own fit). At `zexb` 1.6 the lift floor there
   passes every cap whose lift is 11.1 m or more — and the shipped median
   lift, recorded above, is 11.13 m. **So half the published caps are legal
   at whole-city zoom, and they are the tall half: the skyline.** Switching
   the layer off at that camera removed exactly the caps the Canvas keeps,
   which is the opposite of what the pixel floors are for. The Canvas is
   right and its own sentence says why: *a skyline is made of lifts, not of
   widths.*

   So the gate is per cap now, and the mechanism is a SECOND AXIS rather than
   a second draw range. The caps are bucketed by `need`, each bucket is one
   `geometry.groups` entry over a contiguous run of the index buffer, and
   inside a bucket the caps are still ordered by year — so the century scrub
   stays a prefix WITHIN each group and the camera gate is that group's
   `count`. One geometry, one material, `gateBuckets` draw calls.

   WHAT THE QUANTISATION COSTS, STATED. A bucket is turned on at its own
   LOWEST `need`, so a cap can be drawn slightly below its floor — never
   above it, so nothing the record refuses outright appears late. The buckets
   are equal-population quantiles of the measured `need`, so the bound is
   each bucket's own internal spread; `capsGateSpread` reports it and
   `caps.test.ts` holds it.

   ── AND NOTHING IS LAYERED WITH A Y OFFSET ───────────────────────────────
   The projection is axonometric, so a Y offset is also a SCREEN offset: a cap
   nudged up to clear its roof slides visibly out of its own footprint. It is
   not nudged. It does not have to be: `capForm` builds no bottom face, and
   where the cap meets the roof its walls are VERTICAL against a HORIZONTAL
   deck. Two surfaces at right angles share an edge, not a plane, so there is
   nothing here for the depth buffer to fight over and no `polygonOffset` is
   asked for. The sibling ground layers need one because their fills really
   are coplanar; this one does not, and saying so is cheaper than carrying a
   number nobody can justify.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
} from "three";

import type { CityData } from "@/lib/city/data";
import { FLAG_NOYEAR } from "@/components/us/city/palette";
import { FSTEP_LIFT_PX, FSTEP_W_PX, RSHADE, roofHeight } from "@/lib/city/roofs";
import { projection } from "@/lib/city/projection";
import { decodeBldg } from "../bldg";
import { capForm, type FormSink } from "../roof-form";
import type { PlaneCamera } from "../camera";
import { bldgMaterials, roofShadeTable, type MaterialConfig } from "../materials";
import type { CityLayer } from "../engine";
import { upFaceTransfer } from "../up-face";
import { WA } from "@/lib/city/terrain";

/* ── THE SHAFT TAKES THE WALL'S OWN GRADE, AND ITS OWN LIGHT ────────────
   A cap's shaft was given `wallRGB[mat.wall[i]]` RAW: neither the top/bottom
   grade every wall in the city carries (`WA.wtop` / `WA.wbot`) nor the
   compensation `layers/buildings.ts` applies for what a real directional
   light does to a vertical face (`WALL_LIGHT_COMP`). So a drum was not only
   flat where the wall under it was graded — it was a DIFFERENT VALUE from
   that wall, which is most of why it read as a separate object dropped on
   the roof rather than as the building continuing upward.

   These are the fabric's own three numbers, imported rather than restated so
   the two cannot drift. `layers/buildings.ts` owns the reasoning for
   `WALL_LIGHT_COMP`; this file owns only the decision to use it here too. */
export const CAP_WTOP = WA.wtop * 1.5;
export const CAP_WBOT = WA.wbot * 1.5;
const WALL_FALLBACK: [number, number, number] = [0.78, 0.72, 0.62];

function sideAt(c: readonly number[], k: number): [number, number, number] {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export interface CapsLayerOptions {
  /** how tall the built height is drawn — a cap is BUILT height, not ground */
  zexb: number;
  /** ground elevation at a world point — the terrain field's own */
  elevAt: (x: number, y: number) => number;
  /** the measured aerial roof palette, from the city's manifest */
  roofPalette: readonly string[];
  /** the wall palette, from the renderer's own material table */
  wallPalette: readonly string[];
  /** what decides which entry of each a footprint gets — the buildings' own */
  materials: MaterialConfig;
  /** footprints a hand-modelled landmark already stands on — never capped */
  skipGids?: ReadonlySet<number>;
  /**
   * How many buckets the per-cap camera gate is quantised into. 8 by default,
   * and see §THE GATE IS THE RECORD'S OWN, PER CAP for what it costs.
   */
  gateBuckets?: number;
  /** world-metre floors handed straight to `capForm`; 0 builds every slot */
  minLiftM?: number;
  minWidthM?: number;
}

const _c = new Color();
function toRGB(hex: string): [number, number, number] {
  /* the palette entries are sRGB hex and three's working space is linear —
     the same conversion `layers/buildings.ts` does, for the same reason */
  _c.setStyle(hex, SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}

/** one slot, joined to the footprint it stands on */
interface Standing {
  slot: number;
  /** the host's gid, so the emission order is deterministic on a year tie */
  gid: number;
  /** the AREA centroid the octagon is drawn about, world metres */
  cx: number;
  cy: number;
  /** ground under the host, UNEXAGGERATED */
  elev: number;
  /** the roof plane the page already drew, built metres */
  baseM: number;
  /** the measured top, built metres */
  topM: number;
  rad: number;
  ang: number;
  profile: { readonly u: ArrayLike<number>; readonly s: ArrayLike<number> } | null;
  roof: [number, number, number];
  side: [number, number, number];
  sideFoot: [number, number, number];
  /** the year the host starts existing; -1 where the roll does not date it */
  year: number;
  /** the camera scale `drawStep`'s own two pixel floors ask for — see the
   *  header. Filled after `capForm` has agreed to build the cap. */
  need: number;
}

/** how many emitted caps exist in `year` — they are sorted, so bisect */
function upTo(years: number[], year: number | undefined): number {
  if (year === undefined) return years.length;
  let lo = 0;
  let hi = years.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (years[mid] <= year) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Every published second solid, as one mesh.
 *
 * Returns null when the record holds no slot table — the caller then draws the
 * prisms alone, which is what the page did before this chunk existed.
 */
export function capsLayer(
  data: CityData,
  o: CapsLayerOptions,
): (CityLayer & { meshes: Mesh[]; count: number; gateSpread: number }) | null {
  const form = data.form();
  if (!form || !form.n) return null;

  /* ── THE JOIN, AND WHY IT IS DONE THE CHEAP WAY ROUND ───────────────────
     `form.bi` is a city-wide gid and the footprints live in one chunk per
     grid cell, so the slot table has to be resolved chunk by chunk. Decoding
     a footprint chunk means walking its whole delta chain — the accumulator
     is global across the chunk, so there is no way to decode row 400 without
     decoding rows 0..399 — and that is the expensive half.

     The `gid` column, on the other hand, is a plain array in the file and
     needs no walk at all. So the membership test is run on `gid` FIRST and
     the chain is walked only where it can pay: measured on this record, 84 of
     the 139 footprint chunks carry at least one of the 518 slots, so 55 whole
     chunks are never decoded. */
  const wanted = new Set<number>();
  for (let s = 0; s < form.n; s++) wanted.add(form.bi[s]);

  /* THE PROJECTION'S OWN PLAN SCALE, READ ONCE. `drawStep` measures a cap's
     drawn width as `2 * rad * |(ax, ay)| * cam.scale`, so this is the factor
     that turns a published radius in metres into plane units. It depends on
     the BEARING alone — the band moves `zex`, which is the other half of the
     projection — so reading it at build time reads it for the life of the
     page. */
  const c0 = projection.coeffs();
  const LMAX = Math.hypot(c0.ax, c0.ay) || 1;

  const roofRGB = roofShadeTable(o.roofPalette).map(toRGB);
  const wallRGB = o.wallPalette.map(toRGB);
  /* `roofShadeTable` lays the palette out as (entry x shade), so the stride
     is the shade table's own length and is read from it rather than typed */
  const SHADES = RSHADE.length;

  const standing: Standing[] = [];
  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "bldg") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const gids = chunk.fields.gid as Uint32Array | undefined;
    if (!gids) continue;
    let hit = false;
    for (let i = 0; i < gids.length; i++) {
      if (wanted.has(gids[i])) { hit = true; break; }
    }
    if (!hit) continue;

    const tb = decodeBldg(chunk);
    const mat = bldgMaterials(tb, o.materials);
    for (let i = 0; i < tb.n; i++) {
      const gid = tb.gid[i];
      if (!wanted.has(gid)) continue;
      /* A HERO STANDS HERE, so the second solid does not. The authored model
         carries its own drum, lantern and finial inside the same measured cap
         this slot describes; drawing both is one building wearing two shapes.
         Measured on this record: 5 of the 518 slots. */
      if (o.skipGids?.has(gid)) continue;
      const s = form.slotOf[gid] - 1;
      if (s < 0 || s >= form.n) continue;

      /* THE ELEVATION IS THE BUILDING'S, NOT THE CAP'S OWN CENTRE. The cap
         stands at the footprint's AREA centroid (`cx + dx`) while the prism
         under it was raised from the ground under its VERTEX MEAN. Sampling
         the terrain twice would put the two on different datums and float the
         cap a few centimetres off its own roof; one sample, at the
         building's own point, is what `scene.ts` passes as `zg`. */
      const elev = o.elevAt(tb.cx[i], tb.cy[i]);
      /* AND THE ROOF PLANE IS THE FULL MEASURED HEIGHT, including on the 6
         slots whose host the material table calls pitched. `layers/buildings
         .ts` drops those walls to the eave and lifts a hip whose RIDGE is at
         this height, so this is the top of the solid in both cases and the
         cap stands on the ridge — which is where `scene.ts` puts it too (it
         passes the same `hM`). */
      const baseM = roofHeight(tb.h[i], tb.hf[i]);

      const pi = form.prof[s];
      standing.push({
        slot: s,
        gid,
        cx: tb.cx[i] + form.dx[s],
        cy: tb.cy[i] + form.dy[s],
        elev,
        baseM,
        topM: form.top[s],
        rad: form.rad[s],
        ang: form.ang[s],
        /* profile 0 is `prism`, the identity, and means the slot took no
           shape — the same test `drawStep` runs (`pi > 0 ? ... : undefined`) */
        profile: pi > 0 ? (form.profiles[pi] ?? null) : null,
        roof: roofRGB[mat.roof[i] * SHADES + mat.shade[i]] ?? [0.6, 0.58, 0.54],
        /* THE SIDES TAKE THE WALL'S ENTRY AND NOT THE ROOF'S, which is
           `drawStep`'s own choice (`t.wall[t.wallO + q]`): a tower's shaft is
           wall, and the plate on top of it is roof. What is NOT ported is the
           four-way lambert bucket that index carries — those quartiles ARE
           the sun, computed on the CPU because a 2D fill has no normal, and
           here a real directional light computes the same thing per facet.
           `wallJitter` is not applied either: it is a per-building nudge the
           Canvas gives the wall and not the cap, and inventing one here would
           be a difference between a shaft and the wall it rises out of that
           no column asks for. */
        side: sideAt(wallRGB[mat.wall[i]] ?? WALL_FALLBACK, CAP_WTOP),
        sideFoot: sideAt(wallRGB[mat.wall[i]] ?? WALL_FALLBACK, CAP_WBOT),
        year: (tb.u[i] & FLAG_NOYEAR) !== 0 ? -1 : o.materials.year0 + tb.yr[i],
        /* `drawStep`'s own two floors, inverted for the camera scale. A cap
           with no lift at all would ask for an infinite scale; `capForm`
           refuses it anyway (`topM <= baseM`), so the guard is only so the
           arithmetic below never sees an Infinity it has to sort. */
        need: Math.max(
          form.top[s] > baseM
            ? FSTEP_LIFT_PX / (o.zexb * (form.top[s] - baseM))
            : Infinity,
          form.rad[s] > 0 ? FSTEP_W_PX / (2 * form.rad[s] * LMAX) : Infinity,
        ),
      });
    }
  }
  if (!standing.length) return null;

  /* ── BUCKETED BY CAMERA NEED, AND WITHIN A BUCKET BY YEAR ───────────────
     See the header §THE GATE IS THE RECORD'S OWN, PER CAP. The buckets are
     EQUAL-POPULATION quantiles of the measured `need` rather than a ladder
     somebody chose, so the quantisation error is the data's own spread and
     not a constant nobody can justify. Within a bucket the order is the one
     `layers/buildings.ts` §the year is a draw range asks for: undated first
     — a footprint the roll does not date is drawn in every year — then by
     the roll's own year ascending, with the gid breaking ties so the buffer
     is byte-identical run to run. */
  const NB = Math.max(1, Math.min(64, Math.round(o.gateBuckets ?? 12)));
  /* A GEOMETRIC LADDER AND NOT EQUAL-POPULATION QUANTILES, and the first cut
     was quantiles. What matters is the RATIO between what a cap needs and
     what its bucket opens at, because that ratio IS how far below its own
     pixel floor the cap can be drawn — and equal-population buckets put the
     whole tail in the last one: MEASURED on this record, 8 quantile buckets
     gave a worst ratio of 91. A ladder with a constant ratio bounds it by
     construction, and the ratio is the (max/min) of the measured needs to
     the 1/NB — nobody's constant.

     MEASURED over the 518 slots: need runs 0.0143 to 0.245 at the 99th
     percentile, median 0.0787 — against a whole-city camera at 0.0790.
     Non-finite needs are left out of the ladder and only out of the ladder:
     they are the caps with no lift at all, which `capForm` refuses anyway,
     and letting an Infinity into a max would collapse the ladder. */
  const finite = standing
    .map((st) => st.need)
    .filter((v) => isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const lo = finite.length ? finite[0] : 1;
  const hi = finite.length ? finite[finite.length - 1] : 1;
  const ratio = NB > 1 && hi > lo ? Math.pow(hi / lo, 1 / (NB - 1)) : 1;
  /** the LOWEST need in each bucket — the scale that turns the bucket on */
  const gateAt: number[] = [];
  for (let i = 0; i < NB; i++) gateAt.push(lo * Math.pow(ratio, i));
  const bucketOf = (need: number): number => {
    if (!(need > gateAt[0])) return 0;
    /* a need above the top rung — or an Infinity — belongs to the last
       bucket, which then simply never opens at a camera that cannot reach it */
    const b = Math.floor(Math.log(need / lo) / Math.log(ratio || 1));
    return Math.max(0, Math.min(NB - 1, isFinite(b) ? b : NB - 1));
  };
  standing.sort(
    (a, b) =>
      bucketOf(a.need) - bucketOf(b.need) || a.year - b.year || a.gid - b.gid,
  );

  const xz: number[] = [];
  const elev: number[] = [];
  const hgt: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const sink: FormSink = {
    vertex(x, y, elevM, hM, r, g, b) {
      xz.push(x, y);
      elev.push(elevM);
      hgt.push(hM);
      col.push(r, g, b);
      return elev.length - 1;
    },
    tri(a, b, c) {
      idx.push(a, b, c);
    },
  };

  /** `idx.length` after each emitted cap, and that cap's year — PER BUCKET,
   *  so the century prefix and the camera gate are two independent numbers */
  const marks: number[][] = Array.from({ length: NB }, () => []);
  const years: number[][] = Array.from({ length: NB }, () => []);
  /** where each bucket's run starts in the index buffer */
  const starts = new Array<number>(NB).fill(0);
  /** the widest need/need ratio inside any one bucket — the gate's own error */
  let spread = 1;
  let seen = -1;
  let count = 0;
  for (const st of standing) {
    /* the index length BEFORE this cap — a bucket's run starts where its
       first surviving cap's triangles start, not where they end */
    const before = idx.length;
    /* `capForm` settles its whole plan before it appends anything, so a
       refusal here leaves the buffers exactly as they were and the roof the
       page already drew still stands. That is asserted in `roof-form.test.ts`
       and it is why no mark is pushed on false. */
    const made = capForm(
      sink,
      {
        cx: st.cx, cy: st.cy,
        baseM: st.baseM, topM: st.topM,
        rad: st.rad, ang: st.ang,
        n: form.octN,
        profile: st.profile,
      },
      st.elev,
      st.roof,
      {
        side: st.side,
        sideFoot: st.sideFoot,
        /* THE FULL SHAPE, and the ramp is deliberately not ported. `drawStep`
           opens the profile from the prism over `LR_FORM_PX`..`LR_FORM_FULL`
           of DRAWN size so a dome does not change shape on a threshold; a
           mesh is built once and has no drawn size, so it is built as the
           class's own shape and the projection does the rest. Same argument
           for the plate's tray weight, which `drawStep` ramps on `trayW` of
           the plate's own drawn width. */
        form: 1,
        tray: 1,
        minLiftM: o.minLiftM ?? 0,
        minWidthM: o.minWidthM ?? 0,
      },
    );
    if (!made) continue;
    const bk = bucketOf(st.need);
    if (bk !== seen) {
      /* a bucket with no cap that survived `capForm` still needs a start, so
         every bucket from the last one seen is opened here at once */
      for (let b = seen + 1; b <= bk; b++) starts[b] = before;
      seen = bk;
    }
    marks[bk].push(idx.length);
    years[bk].push(st.year);
    if (isFinite(st.need) && st.need > 0 && gateAt[bk] > 0) {
      spread = Math.max(spread, st.need / gateAt[bk]);
    }
    count++;
  }
  for (let b = seen + 1; b < NB; b++) starts[b] = idx.length;
  if (!count) return null;

  const VT = elev.length;
  const fXZ = new Float32Array(xz);
  const fElev = new Float32Array(elev);
  const fH = new Float32Array(hgt);
  const fCol = new Float32Array(col);

  /* THE POSITION IS BAKED, and `onStep` rewrites its Y — the same decision
     `layers/buildings.ts` states at length: a custom vertex shader would hide
     the geometry from every pass that overrides the material, and the shadow
     map is one of those. `elev` and `h` stay as attributes because rewriting
     Y needs them, and because the ground and the built height take DIFFERENT
     exaggerations (`zex` and `zexb`) that one mesh scale cannot express. */
  const pos = new Float32Array(VT * 3);
  for (let v = 0; v < VT; v++) {
    pos[v * 3] = fXZ[v * 2];
    pos[v * 3 + 2] = fXZ[v * 2 + 1];
  }
  const posAttr = new BufferAttribute(pos, 3);

  const g = new BufferGeometry();
  g.setAttribute("position", posAttr);
  g.setAttribute("aElev", new BufferAttribute(fElev, 1));
  g.setAttribute("aH", new BufferAttribute(fH, 1));
  g.setAttribute("color", new BufferAttribute(fCol, 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));

  const setStep = (zex: number, zexb: number): void => {
    for (let v = 0; v < VT; v++) pos[v * 3 + 1] = fElev[v] * zex + fH[v] * zexb;
    posAttr.needsUpdate = true;
    g.computeBoundingSphere();
  };
  /* THE GROUND'S OWN EXAGGERATION IS THE ENGINE'S, NOT THIS FILE'S: a value
     for it here would be one city's constant in a city-free directory. So the
     buffer is filled at 1 and `CityEngine.add` calls `onStep` with the real
     pair before the first frame is drawn. */
  setStep(1, o.zexb);

  /* LAMBERT, FLAT-SHADED, VERTEX COLOURS — the same material the roofs under
     these caps wear, for the same reason: this city is painted, not
     photographed, and flat shading recovers the face normal per fragment so a
     sweep needs one ring of vertices per profile level rather than four
     vertices per band.

     AND FRONT-FACING, WHICH WAS TWO-SIDED ON A GUESS. The guess was that a
     published profile might cross its own axis — `campanile` steps out from
     0.9 to 1.0 of its radius and back — and that an inverted band would punch
     a hole in the tower. Neither half survives measurement. No `s` in the file
     is negative (measured over all 32 published profile points: min 0.0, max
     1.0), so nothing crosses the axis; and every triangle `capForm` emits is
     wound to be seen from the side it is meant to be seen from. Swept over all
     six published profiles and over each of `capForm`'s other branches — the
     flat plate a plate under 0.693 m falls back to, the flat plate a lift
     under `DE.parapet` falls back to, `tray: 0`, and `form: 0` — the count of
     triangles facing DOWNWARD is ZERO, and the only inward-facing faces are
     the 16 the parapet's inner ring is supposed to be.
     `roof-form.test.ts` §winding holds that, so it cannot rot quietly.

     So two-sided bought nothing and cost two things: every side fragment
     shaded twice, and a shadow pass with no back face to bias against.
     Front-facing is three's own default, so this asks for nothing at all. */
  const mat = new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  /* ONE MATERIAL, `NB` TIMES OVER. `geometry.groups` index into a material
     ARRAY, and repeating the same instance is what says "these are the same
     surface, drawn in several calls": one program, one set of uniforms, and
     `mat.color` below still reaches every group. */
  const mesh = new Mesh(g, new Array<MeshLambertMaterial>(NB).fill(mat));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const meshes = [mesh];
  for (let b = 0; b < NB; b++) {
    const end = b + 1 < NB ? starts[b + 1] : idx.length;
    g.addGroup(starts[b], end - starts[b], b);
  }

  /** the camera the gate was last answered for, and the year with it */
  /* OPEN UNTIL A CAMERA SAYS OTHERWISE. See `layers/heroes.ts` on the same
     line: a layer that never receives an `onFrame` has to fall back to the
     whole record rather than to nothing. */
  let scale = Infinity;
  let yearNow: number | undefined = undefined;
  /* THE TWO GATES ARE ONE ASSIGNMENT PER BUCKET. The century scrub is a
     prefix INSIDE a bucket (`marks`), the camera is the bucket's own lowest
     `need`, and the group's `count` is their intersection — which is a range
     because the prefix starts at the bucket's start. */
  const applyGate = (): void => {
    for (let b = 0; b < NB; b++) {
      const grp = g.groups[b];
      if (scale < gateAt[b]) {
        grp.count = 0;
        continue;
      }
      const k = upTo(years[b], yearNow);
      grp.count = (k ? marks[b][k - 1] : starts[b]) - starts[b];
    }
  };
  applyGate();

  /** the rig's own up-face transfer, resolved on the first frame */
  let comp: number | null = null;

  return {
    name: "caps",
    meshes,
    count,
    /** the widest `need` ratio inside one bucket — how far below its own
     *  floor a cap can be drawn. 1 is exact; `caps.test.ts` holds the bound. */
    gateSpread: spread,
    onFrame(cam: PlaneCamera) {
      if (cam.scale !== scale) {
        scale = cam.scale;
        applyGate();
      }
      /* ── A CAP MUST BE THE COLOUR OF THE ROOF IT STANDS ON ────────────
         `layers/buildings.ts` §AND WHAT THE RIG RETURNS has the measurement:
         the lighting rig returns 0.763 for an UP normal where it should return
         1.0, so every up-facing surface renders a third of a stop under the
         colour the record gave it. The fabric's roofs now carry the reciprocal;
         without this the second solids sat at 0.763 beside a roof at 1.0, and a
         mast came out darker than the roof it rises from.

         Resolved from the scene's own lights rather than typed in, because the
         rig is still being tuned and a constant would go stale the moment it
         moved. Once, on the first frame that has lights. */
      if (comp !== null) return;
      const t = upFaceTransfer(mesh);
      if (t === null || !(t > 0)) return;
      comp = Math.min(4, 1 / t);
      mat.color.setScalar(comp);
    },
    onStep(_step: number, zex: number, zexb: number) {
      /* the camera STEP no longer gates anything here — see the header
         §THE GATE IS THE RECORD'S OWN, PER CAP. All this rung does is move
         the two exaggerations. */
      setStep(zex, zexb);
    },
    onYear(year: number | undefined) {
      yearNow = year;
      applyGate();
    },
    dispose() {
      g.dispose();
      mat.dispose();
      meshes.length = 0;
      marks.length = 0;
      years.length = 0;
    },
  };
}
