/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/heroes.ts — THE HAND-MODELLED BUILDINGS, AS SOLIDS.

   The fabric layer raises 166,166 prisms. Fourteen of those footprints carry
   an authored model instead — rings at published heights, swept by a
   published profile, with columns, drums, lanterns, spires and masts as
   separate parts — and until this layer existed every one of them was an
   anonymous extruded box in the middle of downtown. `base/heroes` ships
   14 heroes, 145 parts and 3,541 ring vertices; it is the smallest chunk in
   the city and the largest single thing missing from the picture.

   ── WHAT IS READ, AND WHAT IS NOT INVENTED ──────────────────────────────
   Every ring, every profile point, every height, every tilt and every
   material index comes out of `data.landmarks()` exactly as the encoder
   moved it out of the authored payload. Nothing here chooses a shape. Three
   things the Canvas renderer does are deliberately NOT done:

   · THE EMPHASIS LAW. `drawHero` scales a hero about its own ground anchor
     so that a 7.8 px dome reads at whole-city zoom. That is a per-frame
     answer to a raster problem: the scale depends on `cam.scale`, and a
     baked mesh has no camera. So this layer draws every hero at emphasis 1
     — its PUBLISHED size, in the city, at the city's own scale. `heroZ`,
     `planScale` and `crownFactor` all reduce to the identity there, which is
     why none of them appear below.

   · THE `arcade` PARTS (9 of 145). An arcade is a set of openings CUT INTO
     a wall that is already drawn — a paint operation on a face, adding
     nothing to the silhouette. The ring-sweep model cannot express a
     subtraction, and giving an opening a depth would be inventing a reveal
     the record does not publish. They are skipped, and the wall behind them
     is drawn whole.

   · THE `rib` PARTS (3 of 145). A rib is a stroked meridian over a swept
     ring. The record publishes HOW MANY meridians and the surface they lie
     on; it publishes no rib width, and the Canvas weight is in screen pixels
     (`0.9 * sqrt(plan)`), which is not a measurement. A rib drawn as a solid
     would need a thickness nobody published, so they are skipped too.

   That leaves 133 solid parts, and they are the mass: the drums, the domes,
   the crowns, the 50 engaged columns tagged `g:"col"` — each of which is
   already its own solid with its own six-vertex ring, so a "column group"
   needs no special case — the lanterns, the finials, the masts and the
   spires.

   ── THE VERTICAL, AND WHY A BRIDGE IS ON THE OTHER DIAL ─────────────────
   A hero's part heights are heights ABOVE ITS OWN GROUND, so a vertex sits
   at `elevAt(anchor) * zex + partHeight * zexb` — the same two dials, in the
   same order, as `buildings.ts`. A bridge is not: every height in that
   record is above SEA LEVEL, deck clearance and tower heads alike, so the
   whole structure rides `zex` alone. Both cases are carried by one pair of
   per-vertex attributes — a ground term and a built term — so one pass over
   Y answers a camera step for either.

   ── ONE MESH A HERO, AND THE YEAR IS A BOOLEAN ──────────────────────────
   The fabric gates a century scrub with a draw range over an index buffer
   sorted by year, because it has 166,166 things to gate. There are sixteen
   things here, so the gate is `mesh.visible`, which costs nothing and needs
   no rebuild.

   ── WHY THIS BUILDS AFTER IT RETURNS ────────────────────────────────────
   `CityData.landmarks()` is async — the geometry is in the chunk, but the
   material table is a JSON companion beside it. So the layer is returned
   at once with an EMPTY `meshes` array and an EMPTY `skipGids`, both of
   which are then filled IN PLACE, and `onBuilt` fires when they hold
   something. A caller adds the meshes to the scene from inside `onBuilt`,
   and uses the same call to tell the fabric which footprints it must stop
   drawing. `null` comes back only when the chunk is not loaded at all, which
   is a city without an authored register rather than a failure.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
} from "three";

import type {
  BridgeSpan,
  CityData,
  HeroData,
  HeroPartData,
  LandmarkTable,
} from "@/lib/city/data";
/* The bridge's own fallbacks and its two paints, from the shared city
   library that owns the landmark law. Read rather than restated: a record
   that carries its own deck clearance, tower heads and year uses those, and
   the constants below stand in only where it does not — which is exactly
   what `drawBridge` does. `legM` is the one number in this file that is a
   drawing convention rather than a measurement, and it is named and stated
   there. */
import {
  BRIDGE_PAINT,
  GGB,
  GGB_DECK,
  GGB_PAINT,
  GGB_PIER,
} from "@/lib/city/landmarks";
import type { CityLayer } from "../engine";

export interface HeroesLayerOptions {
  /** ground elevation at a world point — the terrain field's own */
  elevAt(x: number, y: number): number;
  /** the ground's exaggeration, and the built height's */
  zex: number;
  zexb: number;
  /** the gids the fabric layer must NOT draw, so a hero is not drawn twice */
  onBuilt?(skipGids: Set<number>): void;
}

/** the fill and the cap colour a material table without an entry falls back to */
const FILL_FALLBACK = "#b9b2a2";
const TOP_FALLBACK = "#d0c9ba";

/**
 * The cap cut-off, and it is the draw path's own: below this the top ring has
 * collapsed to a point and what would be drawn is a fan of slivers. Eight of
 * the 133 solids end that way — the spires and the finials — and they close
 * themselves.
 */
const CAP_MIN_S = 0.03;

/** the piers' own half-length along the deck, the reference's own 4.5 m */
const PIER_HALF_M = 4.5;
/** where a pier stands across the deck, as a fraction of the half-width */
const PIER_LAT_FRAC = 0.55;
/** a pier is drawn only where the DEM puts ground this far above the water */
const PIER_GROUND_M = 3;

type RGB = readonly [number, number, number];

const _c = new Color();
/** the palette entries are sRGB; three.js wants the working space */
function toRGB(style: string): RGB {
  _c.setStyle(style, SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}

/** the vertex streams one mesh is accumulated into */
interface Buf {
  pos: number[];
  col: number[];
  /** the ground term, in metres — multiplied by `zex` */
  elev: number[];
  /** the built term, in metres — multiplied by `zexb` */
  built: number[];
  idx: number[];
}

function newBuf(): Buf {
  return { pos: [], col: [], elev: [], built: [], idx: [] };
}

function vert(
  b: Buf, x: number, y: number, elev: number, built: number, rgb: RGB,
): void {
  /* the scene's axes are (world x, up, world y) — `buildings.ts`'s own
     convention. Y is written by `setY` and left at zero here. */
  b.pos.push(x, 0, y);
  b.elev.push(elev);
  b.built.push(built);
  b.col.push(rgb[0], rgb[1], rgb[2]);
}

/** one mesh, plus what a camera step needs to rewrite its Y */
interface Piece {
  mesh: Mesh;
  material: MeshLambertMaterial;
  /** the year this thing starts existing */
  year: number;
  pos: Float32Array;
  attr: BufferAttribute;
  elev: Float32Array;
  built: Float32Array;
}

function finish(b: Buf, year: number): Piece | null {
  if (!b.idx.length) return null;
  const pos = new Float32Array(b.pos);
  const attr = new BufferAttribute(pos, 3);
  const g = new BufferGeometry();
  g.setAttribute("position", attr);
  g.setAttribute("color", new BufferAttribute(new Float32Array(b.col), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(b.idx), 1));
  /* FLAT SHADING AND DOUBLE-SIDED, for the reasons `buildings.ts` states:
     the face normal is recovered per fragment, so a corner shared by two
     bands still gets two crisp faces without two copies of itself; and a
     band that tapers is seen from BOTH sides, because a face that leans back
     is tilted up and from above a cone shows its far slopes. Lambert and not
     a physically based material: this city is painted, not photographed. */
  const material = new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: DoubleSide,
  });
  const mesh = new Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    material,
    year,
    pos,
    attr,
    elev: Float32Array.from(b.elev),
    built: Float32Array.from(b.built),
  };
}

function setY(p: Piece, zex: number, zexb: number): void {
  const n = p.elev.length;
  for (let v = 0; v < n; v++) p.pos[v * 3 + 1] = p.elev[v] * zex + p.built[v] * zexb;
  p.attr.needsUpdate = true;
  p.mesh.geometry.computeBoundingSphere();
}

/**
 * The ring's AREA centroid — the point the authoring scaled each profile
 * ring about. It has to be that point and not the vertex mean, or the
 * containment the build gate proved is not the containment that gets drawn.
 * Falls back to the vertex mean on a ring with no area, which is what the
 * draw path does.
 */
function ringCentroid(rx: Float32Array, ry: Float32Array): [number, number] {
  const n = rx.length;
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let t = 0; t < n; t++) {
    const u = (t + 1) % n;
    const cr = rx[t] * ry[u] - rx[u] * ry[t];
    a2 += cr;
    cx += (rx[t] + rx[u]) * cr;
    cy += (ry[t] + ry[u]) * cr;
  }
  if (Math.abs(a2) < 1e-9) {
    cx = 0;
    cy = 0;
    for (let t = 0; t < n; t++) {
      cx += rx[t];
      cy += ry[t];
    }
    return [cx / n, cy / n];
  }
  return [cx / (3 * a2), cy / (3 * a2)];
}

/**
 * A CAP IS EAR-CLIPPED AND NOT FANNED, and that is not fussiness.
 *
 * `buildings.ts` fans its roofs and says why it may: a fan's stray triangles
 * are coplanar with the roof, in the roof's own colour, and the depth buffer
 * resolves them into exactly the roof. A hero's rings are not roofs. They are
 * jagged published footprints and star-shaped podiums, and every vertex of
 * every one of them was gated as INSIDE the measured footprint. A fan over a
 * non-convex ring lays colour out to the convex hull — outside the footprint,
 * on the ground the neighbours stand on — which would break the one promise
 * the authored register makes about itself.
 *
 * `triangulateShape` mutates the contour it is handed (it drops a repeated
 * end point), so it is always given a fresh array; dropping a trailing
 * duplicate cannot move any surviving index.
 *
 * MEASURED, over all 125 cap rings in the shipped register: ear clipping
 * resolves 121 of them exactly, and the other four are rings the record
 * publishes NON-SIMPLE — they cross themselves, at their own published scale,
 * before anything here touches them. Ear clipping covers their nonzero region
 * with overlapping triangles, which is what the draw path's own `fill()` puts
 * on screen for the same ring under the nonzero rule. So the two agree; what
 * neither does is invent a shape the ring does not have.
 */
function triangulate(ring: Vector2[]): number[][] {
  try {
    const faces = ShapeUtils.triangulateShape(ring, []);
    if (faces.length) return faces;
  } catch {
    // a ring ear-clipping cannot resolve falls through to the fan below
  }
  const fan: number[][] = [];
  for (let k = 1; k + 1 < ring.length; k++) fan.push([0, k, k + 1]);
  return fan;
}

/**
 * ONE SOLID PART: a ring swept between two heights by a profile.
 *
 * `profile[r] = (u, s)` is a height fraction and a radius scale, so row `r`
 * is the part's own ring scaled by `s` about its area centroid, displaced by
 * the part's published tilt, standing at `z0 + (z1 - z0) * u`. A prism is the
 * two-point profile `[(0,1),(1,1)]`; a dome, a cornice, a lantern, a mast and
 * a set-back crown are the same primitive with more points.
 *
 * Bands between consecutive rows are quads. The TOP is closed, in the part's
 * own cap material. The BOTTOM is not, and that is deliberate twice over: it
 * is never seen from an axonometric camera looking down, and a part stacked
 * on the one below it would put its floor exactly on that part's ceiling —
 * two coplanar surfaces at one height, which is a z-fight rather than a
 * drawing.
 */
function emitSolid(
  b: Buf,
  part: HeroPartData,
  mat: readonly (readonly string[])[],
  elev: number,
): void {
  const n = part.rx.length;
  const NR = part.profile.length;
  if (NR < 2 || n < 3) return;
  const [cx, cy] = ringCentroid(part.rx, part.ry);
  const wall = toRGB(mat[part.mat]?.[2] ?? FILL_FALLBACK);
  const base = b.elev.length;

  for (let r = 0; r < NR; r++) {
    const s = part.profile[r].s;
    const u = part.profile[r].u;
    const h = part.z0 + (part.z1 - part.z0) * u;
    for (let t = 0; t < n; t++) {
      vert(
        b,
        cx + (part.rx[t] - cx) * s + part.tiltX * u,
        cy + (part.ry[t] - cy) * s + part.tiltY * u,
        elev,
        h,
        wall,
      );
    }
  }
  for (let r = 0; r + 1 < NR; r++) {
    const lo = base + r * n;
    const hi = base + (r + 1) * n;
    for (let t = 0; t < n; t++) {
      const t1 = (t + 1) % n;
      b.idx.push(lo + t, lo + t1, hi + t1, lo + t, hi + t1, hi + t);
    }
  }

  const sTop = part.profile[NR - 1].s;
  if (sTop <= CAP_MIN_S) return;
  /* the cap carries the part's own accent material where it has one, which is
     what `capColour` reads; the accent BLEND above it is a function of how far
     the accent's parts have opened at this camera, and at emphasis 1 it is
     zero, so the cap is the material's own top and nothing is mixed into it */
  const capMi = part.accentMat >= 0 ? part.accentMat : part.mat;
  const top = toRGB(mat[capMi]?.[1] ?? TOP_FALLBACK);
  const uTop = part.profile[NR - 1].u;
  const hTop = part.z0 + (part.z1 - part.z0) * uTop;
  const capBase = b.elev.length;
  const ring: Vector2[] = [];
  for (let t = 0; t < n; t++) {
    const x = cx + (part.rx[t] - cx) * sTop + part.tiltX * uTop;
    const y = cy + (part.ry[t] - cy) * sTop + part.tiltY * uTop;
    // a class instance, never an {x, y} literal: three.js reads Vector2 here
    ring.push(new Vector2(x, y));
    vert(b, x, y, elev, hTop, top);
  }
  for (const f of triangulate(ring)) {
    b.idx.push(capBase + f[0], capBase + f[1], capBase + f[2]);
  }
}

/** every solid part of one hero, as one mesh */
function heroPiece(
  h: HeroData,
  mat: readonly (readonly string[])[],
  elev: number,
): Piece | null {
  const b = newBuf();
  for (const part of h.parts) {
    if (part.kind !== "solid") continue;
    emitSolid(b, part, mat, elev);
  }
  /* A HERO WHOSE PARTS CANNOT PRODUCE A SOLID IS NOT DRAWN, and the fabric
     keeps its prism. Nothing is stood in for it. */
  return finish(b, h.year);
}

// ── the bridges ─────────────────────────────────────────────────────────────

/** one vertical quad, its two corners in plan and its two heights */
function wall(
  b: Buf,
  x0: number, y0: number, x1: number, y1: number,
  h0: number, h1: number,
  rgb: RGB,
): void {
  const i = b.elev.length;
  vert(b, x0, y0, h0, 0, rgb);
  vert(b, x1, y1, h0, 0, rgb);
  vert(b, x1, y1, h1, 0, rgb);
  vert(b, x0, y0, h1, 0, rgb);
  b.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

/** one horizontal quad, four corners in plan at one height */
function slab(
  b: Buf,
  p: readonly (readonly [number, number])[],
  h: number,
  rgb: RGB,
): void {
  const i = b.elev.length;
  for (const [x, y] of p) vert(b, x, y, h, 0, rgb);
  b.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

/**
 * ONE SPAN — the deck, the towers and the approach piers.
 *
 * The axis is read off the published ring and off nothing else: the ring is a
 * closed quad, so the centreline runs between its two end edges' midpoints and
 * the half-width is the perpendicular distance from it to a corner.
 *
 * WHAT IS DRAWN AND WHAT IS NOT. The deck, the tower legs and the piers are
 * solids and are here. The main cables, the suspenders, the cross-braces and
 * the roadway line are STROKES in the reference — the record publishes the
 * curve a cable follows and the spacing of the suspenders, and publishes no
 * diameter for either. Giving them one is inventing structure, so they are
 * left to a later block that can carry a stated convention for it.
 *
 * THE PIER RULE IS THE RECORD'S. A pier is drawn only where the DEM the page
 * already carries puts ground above the water under the deck. Nothing is
 * drawn out over the channel, where the record says the deck hangs from the
 * cables it does not yet have.
 */
function spanPiece(
  span: BridgeSpan,
  elevAt: (x: number, y: number) => number,
): Piece | null {
  const ring = span.ring;
  if (ring.length < 4 || span.towers.length < 2) return null;
  const ax = (ring[0][0] + ring[1][0]) * 0.5;
  const ay = (ring[0][1] + ring[1][1]) * 0.5;
  const bx = (ring[2][0] + ring[3][0]) * 0.5;
  const by = (ring[2][1] + ring[3][1]) * 0.5;
  const L = Math.hypot(bx - ax, by - ay);
  if (!(L > 1)) return null;
  const ux = (bx - ax) / L;
  const uy = (by - ay) / L;
  const nx = -uy;
  const ny = ux;
  const half = Math.abs((ring[0][0] - ax) * nx + (ring[0][1] - ay) * ny);
  if (!(half > 0.5)) return null;

  const dz = span.deckZ ?? GGB.deckZ;
  /* EVERY TOWER, WITH ITS OWN HEAD, AND THE TWO TRAVEL TOGETHER. The towers
     are ordered along the centreline before they are drawn, and one span's
     four heads are not all equal — one of them is 463 ft against its
     neighbours' 520 — so a position sorted apart from its height would put
     the short tower under the wrong saddle. `towerZ` is the obstacle file's
     own AMSL figure per tower; the fallback applies only to a record that
     carries none. */
  const twr = span.towers
    .map((t, i) => ({
      t: Math.max(0, Math.min(1, ((t[0] - ax) * ux + (t[1] - ay) * uy) / L)),
      h: span.towerZ?.[i] ?? GGB.towerFt * 0.3048,
    }))
    .sort((p, q) => p.t - q.t);
  const paint = (span.k && BRIDGE_PAINT[span.k]) || GGB_PAINT;
  const deckRGB = toRGB(GGB_DECK);
  const pierRGB = toRGB(GGB_PIER);
  const legRGB = toRGB(paint.legLit);
  const legTopRGB = toRGB(paint.legTop);

  /** a point on the span: `t` along the centreline, `lat` metres across it */
  const W = (t: number, lat: number): [number, number] => [
    ax + ux * t * L + nx * lat,
    ay + uy * t * L + ny * lat,
  ];

  const b = newBuf();

  /* THE DECK, as the flat ribbon the reference draws. `P(t, lat, h)` is affine
     in both arguments, so the deck between its ends is exactly one quad and
     sampling it would add vertices and no shape. It has no thickness because
     the record publishes none: `deckZ` is the NAVIGATIONAL CLEARANCE, which is
     a height and not a slab. */
  slab(b, [W(0, -half), W(1, -half), W(1, half), W(0, half)], dz, deckRGB);

  /* THE PIERS. The reference's pier is a flat quad in the (axis, height)
     plane — 9 m along the deck, no width across it, because a stroke does not
     need one. A solid does, and the only length the record's own pier carries
     is that 9 m, so the pier is square: the same number in both directions,
     stated rather than fitted. No top face: it would sit exactly under the
     deck at the same height, and two coplanar surfaces are a z-fight. */
  const t0 = twr[0].t;
  const step = 1 / Math.max(6, Math.round(L / 70));
  const pw = PIER_HALF_M / L;
  const lat = -half * PIER_LAT_FRAC;
  for (let t = step; t < t0; t += step) {
    const g = elevAt(ax + ux * t * L, ay + uy * t * L);
    if (g < PIER_GROUND_M) continue;
    const c: [number, number][] = [
      W(t - pw, lat - PIER_HALF_M),
      W(t + pw, lat - PIER_HALF_M),
      W(t + pw, lat + PIER_HALF_M),
      W(t - pw, lat + PIER_HALF_M),
    ];
    for (let k = 0; k < 4; k++) {
      const d = c[(k + 1) % 4];
      wall(b, c[k][0], c[k][1], d[0], d[1], g, dz, pierRGB);
    }
  }

  /* THE TOWERS. A leg is a BOX whose width is ACROSS the bridge and whose
     legs stand the published deck width apart, which is the whole of why a
     tower reads as a tower and not as a longer piece of deck. `legM` is a
     drawing convention and the reference says so: at the published 11 m the
     two legs nearly touch and read as one bar; at 7 m they are two legs with
     a gap. Every published tower is drawn — two on one of these spans, four
     on the other — each at its own head height off the obstacle record.
     The Canvas paints a third value on the leg's shaded face; here the sun
     does that, so a leg is its own paint and its top is the top's. */
  const legL = GGB.legM / L;
  const legW = GGB.legM / 2;
  for (const { t, h: head } of twr) {
    for (const side of [-half, half]) {
      const c: [number, number][] = [
        W(t, side - legW),
        W(t + legL, side - legW),
        W(t + legL, side + legW),
        W(t, side + legW),
      ];
      for (let k = 0; k < 4; k++) {
        const d = c[(k + 1) % 4];
        wall(b, c[k][0], c[k][1], d[0], d[1], 0, head, legRGB);
      }
      slab(b, c, head, legTopRGB);
    }
  }

  /* the year it EXISTED — the completion year off the record, per span, so
     the two open in the order they opened */
  return finish(b, span.year ?? GGB.year);
}

// ── the layer ───────────────────────────────────────────────────────────────

/**
 * Every authored hero and every published bridge, as real geometry.
 *
 * Returns `null` for a city whose base tier carries no authored register —
 * which is a city without heroes, not an error. Otherwise the layer comes
 * back at once and fills itself: see the header on why `onBuilt` exists.
 */
export function heroesLayer(
  data: CityData,
  o: HeroesLayerOptions,
): (CityLayer & { meshes: Mesh[]; skipGids: Set<number> }) | null {
  if (!data.get("base/heroes")) return null;

  const meshes: Mesh[] = [];
  const skipGids = new Set<number>();
  const pieces: Piece[] = [];
  let zex = o.zex;
  let zexb = o.zexb;
  let year: number | undefined = undefined;
  let disposed = false;

  const applyStep = (): void => {
    for (const p of pieces) setY(p, zex, zexb);
  };
  /* THE YEAR GATE, and it refuses the same way the draw path refuses: a hero
     is not drawn before the year its own register gives it. */
  const applyYear = (): void => {
    for (const p of pieces) {
      p.mesh.visible = year === undefined || Math.floor(year) >= p.year;
    }
  };

  void (async () => {
    let lm: LandmarkTable | null = null;
    try {
      lm = await data.landmarks();
    } catch (e) {
      console.warn("citygl: no authored landmarks —", e);
      return;
    }
    if (!lm || disposed) return;

    for (const h of lm.heroes) {
      /* THE FOOTPRINT IS SPOKEN FOR EITHER WAY. A gid is handed over whether
         or not its parts produced a solid and whatever year is on the clock,
         because the fabric's own gate is a baked prefix of an index buffer
         and cannot be reopened for one building per year. */
      skipGids.add(h.bi);
      const p = heroPiece(h, lm.materials, o.elevAt(h.ax, h.ay));
      if (p) {
        pieces.push(p);
        meshes.push(p.mesh);
      }
    }

    if (lm.bridge) {
      for (const span of [lm.bridge as BridgeSpan, ...lm.bridge.more]) {
        const p = spanPiece(span, o.elevAt);
        if (p) {
          pieces.push(p);
          meshes.push(p.mesh);
        }
      }
    }

    applyStep();
    applyYear();
    o.onBuilt?.(skipGids);
  })();

  return {
    name: "heroes",
    meshes,
    skipGids,
    onStep(_step: number, nextZex: number, nextZexb: number) {
      zex = nextZex;
      zexb = nextZexb;
      applyStep();
    },
    onYear(next: number | undefined) {
      year = next;
      applyYear();
    },
    dispose() {
      disposed = true;
      for (const p of pieces) {
        p.mesh.geometry.dispose();
        p.material.dispose();
      }
      pieces.length = 0;
      meshes.length = 0;
      skipGids.clear();
    },
  };
}
