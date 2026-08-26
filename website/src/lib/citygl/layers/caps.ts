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
import { RSHADE, roofHeight } from "@/lib/city/roofs";
import { decodeBldg } from "../bldg";
import { capForm, type FormSink } from "../roof-form";
import { bldgMaterials, roofShadeTable, type MaterialConfig } from "../materials";
import type { CityLayer } from "../engine";

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
   * The first camera step this layer is drawn at. 1 by default.
   *
   * THE CANVAS PATH DOES NOT HAVE THIS, and the difference is stated rather
   * than hidden. `scene.ts` queues a cap at ALL THREE rungs and lets
   * `drawStep` decide per cap, on two floors in PIXELS OF THE THING ITSELF
   * (`FSTEP_LIFT_PX` = 1.4 px of lift, `FSTEP_W_PX` = 0.7 px of width) —
   * because the gate that matters is not the building's width but the cap's
   * own lift, and *a skyline is made of lifts, not of widths*.
   *
   * A mesh cannot re-decide that per frame the way a fill can: this layer's
   * one index buffer already spends its only draw range on the century scrub,
   * and a second independent prefix over the same triangles does not exist.
   * So the per-cap pixel floor becomes a per-LAYER camera floor, which is the
   * same gate `layers/streets.ts` and `layers/street-detail.ts` run for the
   * same reason. Set it to 0 to draw the caps at every camera.
   */
  fromStep?: number;
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
  /** the year the host starts existing; -1 where the roll does not date it */
  year: number;
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
): (CityLayer & { meshes: Mesh[]; count: number }) | null {
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
        side: wallRGB[mat.wall[i]] ?? [0.78, 0.72, 0.62],
        year: (tb.u[i] & FLAG_NOYEAR) !== 0 ? -1 : o.materials.year0 + tb.yr[i],
      });
    }
  }
  if (!standing.length) return null;

  /* ── EMITTED IN YEAR ORDER, SO THE CENTURY SCRUB IS A DRAW RANGE ────────
     Undated first — a footprint the roll does not date is drawn in every year
     — then by the roll's own year ascending, with the gid breaking ties so
     the buffer is byte-identical run to run. The set that exists in year Y is
     then a PREFIX and the gate is `setDrawRange(0, n)`: one number, no
     upload, no rebuild. Exactly `layers/buildings.ts` §the year is a draw
     range, and a cap has to follow its host or a tower outlives its tower. */
  standing.sort((a, b) => a.year - b.year || a.gid - b.gid);

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

  /** `idx.length` after each emitted cap, and that cap's year */
  const marks: number[] = [];
  const years: number[] = [];
  let count = 0;
  for (const st of standing) {
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
    marks.push(idx.length);
    years.push(st.year);
    count++;
  }
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
  const mesh = new Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const meshes = [mesh];

  const fromStep = o.fromStep ?? 1;

  return {
    name: "caps",
    meshes,
    count,
    onStep(step: number, zex: number, zexb: number) {
      /* see `fromStep`: the per-cap pixel floors the Canvas runs become one
         camera floor, because this buffer's only draw range belongs to the
         year */
      mesh.visible = step >= fromStep;
      setStep(zex, zexb);
    },
    onYear(year: number | undefined) {
      const k = upTo(years, year);
      g.setDrawRange(0, k ? marks[k - 1] : 0);
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
