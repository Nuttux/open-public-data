/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/tree-geometry.ts — A CROWN, AS A SOLID, AND NOT A ROCK.

   The first pass drew every street tree as `IcosahedronGeometry(0.5, 0)`:
   twenty flat facets, one green, no trunk, all 195,310 of them at the same
   orientation. It is fast and it reads as gravel. A reader at the street
   camera sees a pavement with green pebbles on it.

   What the 2D renderer does instead — `lib/city/trees.ts` §the sprite sheet
   — is worth restating, because this file is that decision carried into
   three dimensions:

     · FOUR SILHOUETTES, one per published family, and they differ in SHAPE
       and not in size. A conifer is a cone, a palm is a fan on a bare stem,
       a broadleaf is a lumpy dome.
     · A TRUNK under the crown, so the crown is a canopy OVER something and
       not a bush lying on the ground.
     · THREE VALUES of one green, not one — a lit top, the family's own mid,
       a dark underside. The comment there is blunt about it: with the lit
       lobe gone "the crown had no direction", which is most of why a canopy
       reads as a green mass with a dot texture.

   ── WHAT IS PUBLISHED AND WHAT IS DRAWN ─────────────────────────────────
   Published, and therefore obeyed: the FAMILY (the form byte's low two bits)
   and the CROWN DIAMETER (the one size bit, `CROWN_M`). So every family here
   reaches **exactly r = 1 at its widest** — the caller scales by the crown
   radius and gets the published width back, whichever family it is. What the
   families differ in is HEIGHT and PROFILE, which no register publishes and
   which are therefore a drawing decision, stated here rather than buried.

   THE TRUNK IS THE CLEAREST CASE OF THAT. No register in this map publishes
   a trunk height — the tree file publishes a diameter at breast height for
   some rows and nothing about the stem's length — so the trunk is drawn at a
   fraction of the crown's own radius, short enough that nobody could read it
   as a measurement and long enough that the crown is over the pavement
   rather than on it. It is in the geometry because at the two closest
   cameras a floating crown is the thing that looks wrong.

   ── THE TWO TONES COST NOTHING ──────────────────────────────────────────
   three.js multiplies `material.color * vertexColor * instanceColor` in one
   pass (`color_vertex.glsl` / `color_fragment.glsl`). So the CALLER keeps
   doing exactly what it does now — one `InstancedMesh`, one `setColorAt`
   with the family's published mid green — and the vertical shade rides along
   in the geometry's own `color` attribute. One draw call, two tones, no
   shader, no second material.

   AND IT IS NOT THE SUN. The rig has a real directional light and the facets
   have real normals; baking a light direction in would fight both, and it
   would fight the per-instance yaw below. What is baked is the crown's own
   SELF-OCCLUSION — how much sky the underside of a canopy can see, which no
   directional light and no shadow map at this texel size resolves across a
   three-metre crown. That is the same argument `roof-form.ts` makes for
   `DE.deckv`, and it is why the default `tone` is a little over half of the
   published spread rather than all of it: the published triple IS the light
   in a renderer that has no other, and here it stacks on one that does.

   ── NOTHING HERE KNOWS WHICH CITY IT IS ─────────────────────────────────
   No palette, no register, no coordinate — this file imports three.js and
   nothing else. The greens stay with the caller, which is where the data is.
   The two multipliers below are ratios taken off the published rows, and a
   ratio is not a colour.
   ═══════════════════════════════════════════════════════════════════════ */

import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import type { Quaternion } from "three";

/* ── ONE GREEN PER FAMILY IS WHY A CANOPY READS AS MOSS ──────────────────
   `layers/trees.ts` gives all 195,310 street trees their family's single mid
   green, and `layers/ground-detail.ts` gives all 50,897 park masses one tone
   per cover bin. Both are the published answer and both are right about WHICH
   green; neither has any variation INSIDE it, so a park comes out as one flat
   stippled mass rather than as a lot of trees. Daniel: *"Canopies still look
   like giant bushes"*.

   `ground-detail.ts` already makes exactly this argument about ORIENTATION,
   and it is the same argument: *"Fifty thousand identical solids at one
   orientation is a pattern, and the eye finds a pattern before it finds a
   tree."* A pattern in colour is found just as fast.

   ── WHAT IS PUBLISHED AND WHAT THIS IS ──────────────────────────────────
   The FAMILY is published and is not touched: the base colour still comes
   from the register, and a conifer cannot drift into a palm's green because
   the jitter is a factor ON the family's own value. What is DECLARED is that
   two trees of one family are not the same colour — which no register records
   either way, and which is true of every street in this city.

   It is DETERMINISTIC in the instance's own stable key, so a rebuild, a year
   change or a camera step puts every tree back at the colour it had. A random
   draw would shimmer on every re-emit, which is worse than the flatness it
   fixes.

   Two axes rather than one, because value alone reads as noise: VALUE opens
   the light-to-dark spread inside a family, and WARM skews red against blue so
   a stand contains both the yellow-greens and the blue-greens a real mixed
   canopy does. The magnitudes are declared, not measured — no register
   publishes the hue of an individual tree. */
const FOLIAGE_VALUE_JITTER = 0.22;
const FOLIAGE_WARM_JITTER = 0.09;

/**
 * A per-instance foliage tint, written into `out` and returned.
 *
 * `base` is the family's published green, `seed` the instance's stable key,
 * `out` the caller's scratch — this runs a quarter of a million times per
 * rebuild and must not allocate.
 */
export function foliageTint(base: Color, seed: number, out: Color): Color {
  /* two decorrelated values in [-1, 1] from one integer. An ordinary integer
     hash; nothing depends on the constants beyond the two outputs not moving
     together — a shared low bit would put a visible stripe across a park. */
  let h = Math.imul(seed | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  const v = ((h >>> 8) & 1023) / 511.5 - 1;
  const w = ((h >>> 20) & 511) / 255.5 - 1;

  const k = 1 + v * FOLIAGE_VALUE_JITTER;
  const warm = w * FOLIAGE_WARM_JITTER;
  const cl = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
  out.setRGB(cl(base.r * (k + warm)), cl(base.g * k), cl(base.b * (k - warm)));
  return out;
}

// ── the form byte's families ────────────────────────────────────────────────

/**
 * The published form byte's low two bits, and therefore the index into
 * `CrownSet.geometries`. The 2D renderer indexes its sprite sheet with the
 * same expression (`(form & 3) * 2 + big`), so the two renderers cannot drift.
 */
export const CROWN_BROADLEAF = 0;
export const CROWN_CONIFER = 1;
export const CROWN_PALM = 2;
export const CROWN_UNCLASSED = 3;
/** how many geometries a `CrownSet` holds: `form & 3` has four values */
export const CROWN_FAMILIES = 4;

// ── the two tones, measured off the published rows ──────────────────────────

/**
 * THE SHADE IS A MEASURED RATIO, NOT A GUESS AT ONE.
 *
 * The four published families each ship three values of their own green. A
 * vertex colour is a MULTIPLIER in the renderer's linear working space, so
 * what this file needs is not those twelve colours — the caller has them —
 * but the ratio `lit/mid` and `dk/mid` that turns any one of them into the
 * other two. Converted to linear and measured per channel across all four
 * families:
 *
 * ```
 *              lit / mid                    dk / mid
 *   broadleaf  1.836  1.541  1.744          0.467  0.525  0.502
 *   conifer    1.942  1.650  1.641          0.446  0.505  0.518
 *   palm       1.732  1.501  1.994          0.490  0.511  0.493
 *   unclassed  1.715  1.479  1.771          0.486  0.507  0.541
 *   ─────────────────────────────────────────────────────────────
 *   mean       1.7120                       0.4991
 * ```
 *
 * A single scalar is enough because the spread is small, and that was
 * checked rather than assumed: putting the two means back on each family's
 * own mid reproduces its published lit and dark to within 12 of 255 on the
 * worst channel and 3 on most —
 *
 * ```
 *   broadleaf  lit #8eb665 (published #93ae66)   dk #506837 (#4d6a37)
 *   conifer    lit #648e6a (#6a8c68)             dk #36503a (#33503b)
 *   palm       lit #a1c463 (#a2b96a)             dk #5b7035 (#5a7135)
 *   unclassed  lit #96b866 (#96ac68)             dk #546838 (#53693a)
 * ```
 *
 * So one geometry serves every family and the family's own green arrives per
 * instance, which is the whole point: 195,310 crowns, four geometries, and
 * no colour in this file.
 */
export const CROWN_LIT_K = 1.712;
export const CROWN_DK_K = 0.4991;

/**
 * THE TRUNK IS BROWN WITHOUT A SECOND DRAW CALL, AND THAT IS THE SAME TRICK.
 *
 * An `InstancedMesh` gives the mesh exactly one instance colour, and it is
 * green. But a vertex colour is a per-channel multiplier, so a warm, green-
 * starved triple turns that green into bark: the ratio below is the sprite
 * sheet's own trunk stroke `#5d4a33` over the mean of the four published mid
 * greens, in linear space. Applied to each family's own green it lands at
 * `#5e4c32` (broadleaf), `#6b5331` (palm), `#634d33` (unclassed) and a
 * cooler `#413a35` on the conifer, whose green has the least red in it.
 * Every one of them reads as a stem.
 *
 * A caller that does not switch `vertexColors` on gets a green trunk and a
 * flat crown. That is the correct degradation — nothing breaks, it just
 * looks like the icosahedron did.
 */
export const CROWN_TRUNK_RGB: readonly [number, number, number] = [
  0.7065, 0.2645, 0.4258,
];

// ── the budget ──────────────────────────────────────────────────────────────

/**
 * TRIANGLES PER CROWN AT `detail: 0`, INDEXED BY FAMILY, AND THE TOTAL.
 *
 * ```
 *   0 broadleaf   49    7 trunk + 42 crown   (7 sides x 3 rings, dome)
 *   1 conifer     35    7 trunk + 28 crown   (7 sides x 2 rings, cone)
 *   2 palm        39    7 trunk + 32 crown   (8 fronds, star)
 *   3 unclassed   49    7 trunk + 42 crown   (7 sides x 3 rings, ovoid)
 * ```
 *
 * At 195,310 street trees that is **9,570,190 triangles** if every tree in
 * the city were the most expensive family and **6,835,850** if every one were
 * the cheapest; the mix decides where between those it lands. Against the
 * icosahedron's 20 that is 2.45x at the top of the range.
 *
 * TWO THINGS KEEP THAT HONEST. It is not memory: four geometries are
 * uploaded once and every crown is an instance of one of them, so the vertex
 * buffers are under 4 KB in total no matter how many trees stand on them.
 * And it is not a frame: the layer draws no crown below the block camera at
 * all, and an `InstancedMesh` rasterises only what the frustum keeps —
 * the cost is `triangles x VISIBLE instances`, which at the street camera is
 * a few thousand crowns, not 195,310.
 *
 * The gate that DOES matter was measured on the icosahedron and has nothing
 * to do with the triangle count: 195,310 shadow CASTERS re-rendered into a
 * 2,048 map cost 4,358 ms a frame. They do not cast. Multiplying the
 * triangles by 2.45 does not change that arithmetic.
 */
export const CROWN_TRIS: readonly number[] = [49, 35, 39, 49];

// ── the local space the caller is scaling ───────────────────────────────────

/**
 * THE CONVENTION, STATED ONCE, BECAUSE THE CALLER'S `compose` DEPENDS ON IT.
 *
 * ```
 *   x, z    the crown's own axis is the origin, and the widest ring of every
 *           family touches |r| = 1 EXACTLY at azimuth 0. So `scale = crown
 *           radius in metres` draws the published crown diameter, and the
 *           same number works for all four families.
 *   y       0 IS THE GROUND. The trunk's foot ring sits on y = 0 and every
 *           vertex in every family is at y >= 0, so the caller's `position`
 *           is the GROUND POINT under the tree — the terrain sample, with no
 *           lift added. Nothing is centred on the crown.
 *   height  a family's own business: the crown tops out between 1.46 (palm)
 *           and 2.42 (conifer) crown-radii up. Scale y by the built
 *           exaggeration if the rest of the scene is exaggerated.
 * ```
 *
 * THIS IS A CHANGE FROM THE ICOSAHEDRON, and it is the kind that looks fine
 * and is wrong: that geometry was a ball of radius 0.5 centred on its own
 * origin, so the caller lifted `position` by a trunk's worth of radius and
 * scaled by the DIAMETER. Handing this geometry the same position and the
 * same scale plants every crown half a tree underground at twice its
 * published width. The caller's line becomes
 *
 * ```ts
 *   pos.set(w.x, groundY, w.y);          // the ground, not the crown centre
 *   scl.set(rM, rM * zexb, rM);          // the RADIUS, not the diameter
 *   m4.compose(pos, rot, scl);
 * ```
 */
export const CROWN_GROUND_Y = 0;

/** the maximum horizontal radius every family reaches, in crown radii */
export const CROWN_MAX_R = 1;

// ── the profiles ────────────────────────────────────────────────────────────

/**
 * A crown built as rings of a solid of revolution: an underside centre, one
 * or more rings, an apex. `t` is the position on the shade ramp — 0 is the
 * dark underside, 0.5 the family's own mid, 1 the lit top.
 */
interface DomeProfile {
  readonly kind: "dome";
  readonly name: string;
  /** the trunk's height and foot radius, in crown radii — a DRAWING choice */
  readonly trunkH: number;
  readonly trunkR: number;
  /** azimuthal sides at `detail: 0` */
  readonly sides: number;
  /**
   * THE LOBES ARE WHY IT IS NOT A GEM. A ring at a constant radius with
   * seven sides is a heptagonal prism and the eye reads it as cut stone;
   * pulling `lobes` azimuths in by `wob` gives the silhouette the overlapping
   * bulges the 2D crown gets from its six drawn lobes, and costs nothing —
   * the same vertices at different radii. The dent only ever REMOVES radius,
   * and azimuth 0 is always its peak, so the widest ring still touches
   * exactly 1 and the published crown diameter survives the lumpiness.
   */
  readonly lobes: number;
  readonly wob: number;
  /** the underside's centre: y, t */
  readonly base: readonly [number, number];
  /** the rings from the bottom up: r, y, t */
  readonly rings: readonly (readonly [number, number, number])[];
  /** the apex: y, t */
  readonly apex: readonly [number, number];
}

/**
 * A palm is not a crown with a thinner waist, it is a different object: a
 * bare stem with fronds radiating off the top of it. So it is built as a
 * shallow lens whose rim alternates between a drooping frond TIP at the full
 * crown radius and a NOTCH pulled in between two fronds — a star in plan,
 * which is the silhouette the 2D renderer gets from stroking eight fronds,
 * at four triangles a frond.
 */
interface StarProfile {
  readonly kind: "star";
  readonly name: string;
  readonly trunkH: number;
  readonly trunkR: number;
  /** fronds at `detail: 0`; the rim carries two vertices each */
  readonly fronds: number;
  /** the frond tip: r, y */
  readonly tip: readonly [number, number];
  /** the notch between two fronds: r, y */
  readonly notch: readonly [number, number];
  /** the rim's own t on the shade ramp */
  readonly rimT: number;
  /** the top centre: y, t */
  readonly top: readonly [number, number];
  /** the underside's centre: y, t */
  readonly base: readonly [number, number];
}

type Profile = DomeProfile | StarProfile;

/**
 * FOUR SILHOUETTES, AND WHICH BYTE SELECTS EACH.
 *
 * The order is the form byte's own — the same order the sprite sheet builds
 * its ten cells in — so `geometries[form & 3]` needs no table.
 *
 * ```
 *   0  broadleaf   a BROAD ROUNDED CANOPY: widest at a third of its height,
 *                  2.00 wide against 1.72 tall, three lobes, short trunk.
 *   1  conifer     a CONE: 1.90 wide at the skirt against 2.42 tall, the
 *                  profile bending once on the way to the spire.
 *   2  palm        a SPREADING FLAT-TOPPED FAN on a bare stem: eight fronds
 *                  drooping to the full radius, 1.46 tall, and 77 % of that
 *                  height is trunk.
 *   3  unclassed   a NARROW UPRIGHT OVOID: the same 2.00 width the register
 *                  publishes, carried to 2.26 tall on a two-lobe ellipse, so
 *                  the unclassed cohort is not the broadleaf one again.
 * ```
 */
const PROFILES: readonly Profile[] = [
  {
    kind: "dome",
    name: "broadleaf",
    trunkH: 0.55,
    trunkR: 0.09,
    sides: 7,
    lobes: 3,
    wob: 0.14,
    base: [0.47, 0.02],
    rings: [
      [0.74, 0.7, 0.28],
      [1.0, 1.06, 0.52],
      [0.68, 1.44, 0.8],
    ],
    apex: [1.72, 0.96],
  },
  {
    kind: "dome",
    name: "conifer",
    trunkH: 0.34,
    trunkR: 0.085,
    sides: 7,
    lobes: 5,
    wob: 0.12,
    base: [0.24, 0.02],
    rings: [
      [1.0, 0.42, 0.3],
      [0.52, 1.34, 0.66],
    ],
    apex: [2.42, 0.95],
  },
  {
    kind: "star",
    name: "palm",
    trunkH: 1.12,
    trunkR: 0.075,
    fronds: 8,
    tip: [1.0, 1.16],
    notch: [0.4, 1.32],
    rimT: 0.55,
    top: [1.46, 0.95],
    base: [1.1, 0.1],
  },
  {
    kind: "dome",
    name: "unclassed",
    trunkH: 0.72,
    trunkR: 0.085,
    sides: 7,
    lobes: 2,
    wob: 0.13,
    base: [0.64, 0.02],
    rings: [
      [0.7, 0.9, 0.26],
      [1.0, 1.36, 0.5],
      [0.72, 1.92, 0.8],
    ],
    apex: [2.26, 0.95],
  },
];

/**
 * A THREE-SIDED TRUNK, WHICH IS NOT A CORNER CUT.
 *
 * The 2D renderer strokes the trunk at `R * 0.13` — a hair over a tenth of
 * the crown's radius, three pixels on a forty-pixel crown. A prism that thin
 * has no round to lose: three sides read the same as twelve and cost 7
 * triangles against 25. The top is capped (one triangle) so no camera can
 * ever look down a hollow stem through a gap in the fronds; the foot is left
 * open because it is on the ground.
 */
const TRUNK_SIDES = 3;

// ── the builder ─────────────────────────────────────────────────────────────

interface Sink {
  readonly pos: number[];
  readonly col: number[];
  readonly idx: number[];
  /** the shade ramp, already scaled by `tone` and by any `gain` */
  readonly dk: number;
  /**
   * what `t = 0.5` returns — the family's own published mid, as a multiplier.
   * 1 everywhere except where a caller has re-levelled the whole ramp; see
   * `CanopyMassOptions.gain`.
   */
  readonly mid: number;
  readonly lit: number;
}

/** 0 dark underside, 0.5 the family's own mid, 1 lit top. */
function shadeOf(s: Sink, t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u < 0.5
    ? s.dk + (s.mid - s.dk) * (u / 0.5)
    : s.mid + (s.lit - s.mid) * ((u - 0.5) / 0.5);
}

function vertex(s: Sink, x: number, y: number, z: number, shade: number): number {
  const i = s.pos.length / 3;
  s.pos.push(x, y, z);
  s.col.push(shade, shade, shade);
  return i;
}

function trunkVertex(s: Sink, x: number, y: number, z: number, k: number): number {
  const i = s.pos.length / 3;
  s.pos.push(x, y, z);
  s.col.push(
    CROWN_TRUNK_RGB[0] * k,
    CROWN_TRUNK_RGB[1] * k,
    CROWN_TRUNK_RGB[2] * k,
  );
  return i;
}

/**
 * A ring, counter-clockwise seen from above.
 *
 * WINDING IS NOT A DETAIL HERE: three.js culls back faces by default, so a
 * ring wound the other way gives a crown that is invisible from outside and
 * solid from inside, which on a map full of them looks like the trees failed
 * to load rather than like a bug. Every helper below keeps the same rule —
 * `x = r cos θ`, `z = -r sin θ`, θ ascending — and the test asserts the
 * consequence (a positive signed volume) rather than the rule.
 */
function ring(
  s: Sink,
  n: number,
  r: number,
  y: number,
  t: number,
  lobes: number,
  wob: number,
): number {
  const first = s.pos.length / 3;
  const shade = shadeOf(s, t);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const k = lobes > 0 ? 1 - wob * (1 - Math.cos(lobes * th)) * 0.5 : 1;
    vertex(s, r * k * Math.cos(th), y, -r * k * Math.sin(th), shade);
  }
  return first;
}

/** the side wall between a lower ring and an upper one, outward */
function wall(s: Sink, lo: number, up: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s.idx.push(lo + i, lo + j, up + i);
    s.idx.push(lo + j, up + j, up + i);
  }
}

/** a fan from a ring up to an apex, facing out and up */
function capUp(s: Sink, r0: number, n: number, apex: number): void {
  for (let i = 0; i < n; i++) s.idx.push(r0 + i, r0 + ((i + 1) % n), apex);
}

/** a fan from a ring down to a centre, facing out and down */
function capDown(s: Sink, r0: number, n: number, centre: number): void {
  for (let i = 0; i < n; i++) s.idx.push(r0 + i, centre, r0 + ((i + 1) % n));
}

/**
 * The stem. Its foot is on y = 0, which is what makes `CROWN_GROUND_Y` true
 * of the whole geometry, and it is emitted first so that vertex 0 is the
 * thing standing on the ground.
 */
function trunk(s: Sink, h: number, r: number): void {
  const foot = s.pos.length / 3;
  for (let i = 0; i < TRUNK_SIDES; i++) {
    const th = (i / TRUNK_SIDES) * Math.PI * 2;
    trunkVertex(s, r * Math.cos(th), 0, -r * Math.sin(th), 0.78);
  }
  const head = s.pos.length / 3;
  const rt = r * 0.78;
  for (let i = 0; i < TRUNK_SIDES; i++) {
    const th = (i / TRUNK_SIDES) * Math.PI * 2;
    trunkVertex(s, rt * Math.cos(th), h, -rt * Math.sin(th), 1);
  }
  wall(s, foot, head, TRUNK_SIDES);
  // the cap: one triangle for three sides, and the ring is already CCW from
  // above, so the fan needs no reversal
  for (let i = 1; i < TRUNK_SIDES - 1; i++) s.idx.push(head, head + i, head + i + 1);
}

function buildDome(p: DomeProfile, s: Sink, detail: number): void {
  const n = p.sides + 2 * detail;
  /* a mass has no stem — `trunkH: 0` is how a profile says so, and the guard
     is here rather than at the call because every other part of a dome is the
     same object whether something is holding it up or not */
  if (p.trunkH > 0) trunk(s, p.trunkH, p.trunkR);
  const under = vertex(s, 0, p.base[0], 0, shadeOf(s, p.base[1]));
  const rows: number[] = [];
  for (const [r, y, t] of p.rings) rows.push(ring(s, n, r, y, t, p.lobes, p.wob));
  const apex = vertex(s, 0, p.apex[0], 0, shadeOf(s, p.apex[1]));
  capDown(s, rows[0], n, under);
  for (let i = 0; i + 1 < rows.length; i++) wall(s, rows[i], rows[i + 1], n);
  capUp(s, rows[rows.length - 1], n, apex);
}

function buildStar(p: StarProfile, s: Sink, detail: number): void {
  const fronds = p.fronds + 2 * detail;
  const n = fronds * 2;
  trunk(s, p.trunkH, p.trunkR);
  const under = vertex(s, 0, p.base[0], 0, shadeOf(s, p.base[1]));
  const rim = s.pos.length / 3;
  const shade = shadeOf(s, p.rimT);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const tip = (i & 1) === 0;
    const r = tip ? p.tip[0] : p.notch[0];
    const y = tip ? p.tip[1] : p.notch[1];
    vertex(s, r * Math.cos(th), y, -r * Math.sin(th), shade);
  }
  const top = vertex(s, 0, p.top[0], 0, shadeOf(s, p.top[1]));
  capDown(s, rim, n, under);
  capUp(s, rim, n, top);
}

// ── the set ─────────────────────────────────────────────────────────────────

export interface CrownSet {
  /** one geometry per published family, indexed by the form byte's family */
  geometries: BufferGeometry[];
  dispose(): void;
}

export interface CrownSetOptions {
  /**
   * 0 is the budget above and what the city ships. Each step adds two
   * azimuthal sides to a dome and two fronds to a palm — worth it for a hero
   * shot or a fiche, never for 195,310 of them.
   */
  detail?: number;
  /**
   * How much of the published spread between a family's dark and its lit
   * value goes into the vertex colour, 0..1. 1 is the whole of it and is
   * right for a caller with no light of its own; the default is a little
   * over half, because this renderer HAS a sun and the two stack.
   */
  tone?: number;
}

/**
 * Build one crown per published family.
 *
 * The geometries are plain `BufferGeometry` — position, normal, uv-free,
 * colour, indexed — so any material works. What they are made for is
 * `MeshLambertMaterial({ vertexColors: true, flatShading: true })` on an
 * `InstancedMesh` per chunk, with the family's own published green arriving
 * through `setColorAt`.
 *
 * The caller owns them. `dispose()` when the layer disposes.
 */
export function crownSet(o?: CrownSetOptions): CrownSet {
  const detail = Math.max(0, Math.min(3, Math.round(o?.detail ?? 0)));
  const tone = Math.max(0, Math.min(1, o?.tone ?? 0.55));
  const geometries: BufferGeometry[] = [];

  for (const p of PROFILES) {
    const s: Sink = {
      pos: [],
      col: [],
      idx: [],
      dk: 1 + tone * (CROWN_DK_K - 1),
      mid: 1,
      lit: 1 + tone * (CROWN_LIT_K - 1),
    };
    if (p.kind === "dome") buildDome(p, s, detail);
    else buildStar(p, s, detail);

    const g = new BufferGeometry();
    g.name = `crown:${p.name}`;
    g.setAttribute("position", new Float32BufferAttribute(s.pos, 3));
    g.setAttribute("color", new Float32BufferAttribute(s.col, 3));
    g.setIndex(s.idx);
    /* Smooth normals, even though the material this is made for shades flat:
       `flatShading` takes its normal from the fragment's own derivatives and
       ignores the attribute entirely, so this costs nothing there and is the
       difference between a crown and a facetted lump if the caller ever turns
       it off. */
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    geometries.push(g);
  }

  return {
    geometries,
    dispose() {
      for (const g of geometries) g.dispose();
      geometries.length = 0;
    },
  };
}

// ── the canopy mass ─────────────────────────────────────────────────────────

/**
 * A CANOPY MASS IS NOT A SMALLER TREE AND IT IS NOT A FLAT HEXAGON EITHER.
 *
 * What this replaces: `IcosahedronGeometry(0.5, 0)` squashed on Y and shaded
 * with one instance colour. Twenty facets, all of them very nearly horizontal
 * once the solid is flattened, all lit by the same near-vertical sun — so
 * every facet came back the same value and the silhouette of a detail-0
 * icosahedron seen from above is a HEXAGON. Fifty thousand identically
 * oriented ones tile a park with a hex pattern. MEASURED on the two street
 * captures over the same park crop, the luminance of the green pixels:
 *
 * ```
 *              p05    p95    span
 *   published  86.7  181.6   94.9
 *   the hexes 111.9  165.5   53.6     -44 %
 * ```
 *
 * Half the tonal range of the thing it is a port of, which is the numeric form
 * of *"no volume, no light on top and shade beneath"*.
 *
 * WHAT THE 2D RENDERER ACTUALLY DRAWS, since that is the thing to reproduce:
 * `lib/city/trees.ts` §buildSpriteSheet's canopy cell is the SAME six-lobe
 * silhouette as a broadleaf crown — mid fill, a lit pair of lobes up-right, a
 * dark lobe down-left — laid at 1.05 of the crown's lobe radii and sitting at
 * `CANOPY_LIFT` = 1.30 rather than a tree's 2.613, *"the same wash, no trunk,
 * sitting lower on the ground"*.
 *
 * So this is a dome of revolution with the same three values in its own
 * `color` attribute — a dark underside, the caller's own green at the waist, a
 * lit crest — and no trunk. One instanced draw, one material, and the light on
 * it is the crown's own self-occlusion rather than a second sun.
 *
 * ── THE PROPORTIONS, AND WHICH OF THEM ARE BORROWED ──────────────────────
 * The widest ring is at r = 1 and the apex at y = 1, so the caller scales by
 * ONE number and gets a mass exactly as tall as it is wide in radii. That is
 * the height the icosahedron already stood at and its argument carries over
 * unchanged: `CANOPY_LIFT / CROWN_LIFT` = 1.30 / 2.613 = **0.4976**, a ratio
 * of two reference numbers, and 2 x 0.4976 = 0.995. Nothing published gives a
 * canopy cell a height; this is a borrowed ratio and it says so.
 *
 * The widest ring sits at **0.42 of the height**, which is the broadleaf
 * crown's own 1.06 / 2.42 = 0.44 rounded to the ring this profile has, so a
 * mass and the crowns standing in it have the same shoulder.
 */
const MASS: DomeProfile = {
  kind: "dome",
  name: "canopy",
  /* no stem: a canopy cell is the mass itself, not a tree standing under one */
  trunkH: 0,
  trunkR: 0,
  /* ELEVEN SIDES, NOT THE CROWN'S SEVEN, AND THE REASON IS SCREEN SIZE. A
     street tree is 6.6 m across and a full canopy cell's mass is
     `blobRadius(576 m2) x 1.26` = 19.2 m of radius — MEASURED at the street
     camera (2.60 px per world metre) that is 8.6 px against 100 px, so the
     polygon a crown can hide the mass cannot. Nine still showed straight
     edges on the street capture; eleven does not. The cost is in
     `CANOPY_MASS_TRIS`. */
  sides: 11,
  /* three lobes, and deeper than a crown's: the reference's blob is the
     SAME six-lobe path as its crown, so a mass is at least as lumpy */
  lobes: 3,
  wob: 0.17,
  base: [0.1, 0.0],
  rings: [
    [0.66, 0.14, 0.14],
    [1.0, 0.42, 0.5],
    [0.74, 0.74, 0.8],
  ],
  apex: [1.0, 1.0],
};

/**
 * TRIANGLES PER MASS: 11 under + 2 x 22 wall + 11 over = **66**.
 *
 * Against the icosahedron's 20 that is 3.3x, and at 50,897 cells it is
 * 3.36 M triangles against 1.02 M if every one of them is in frame. They are
 * not: `layers/ground-detail.ts` buckets the cells into a grid of meshes so
 * the frustum can throw most of them away, which the single city-wide mesh
 * this replaces could never do. MEASURED at the street camera with the
 * buckets in: 5.2 M triangles in the whole frame, 330 draw calls, 11.1 ms.
 */
export const CANOPY_MASS_TRIS = 66;

/** the maximum horizontal radius a mass reaches, in the caller's own scale */
export const CANOPY_MASS_MAX_R = 1;

/**
 * THE SPREAD THE REFERENCE DRAWS A MASS AT, WHICH IS NOT ITS OWN RADIUS.
 *
 * `blobRadius(area)` is what the caller scales by, and the 2D renderer does
 * NOT stop the mass there: its sprite lays the six-lobe path at 1.05 of the
 * crown's lobe radii, and the widest lobe is `[-0.52, 0.12, 0.68]`, so the
 * silhouette reaches `(0.52 + 0.68) x 1.05` = **1.26** of the radius the
 * area implies. A mesh that stops at 1.00 covers `1 / 1.26^2` = **63 %** of
 * the ground the reference paints for the same published cell, which is most
 * of why a forest came back as scrub: MEASURED over the Presidio crop, green
 * pixels 32.5 % against the published page's 51.4 %.
 *
 * Exported rather than folded into the profile because it is a fact about the
 * REFERENCE's drawing of a published area, not about the shape of a dome.
 */
export const CANOPY_MASS_SPREAD = 1.26;

/**
 * HOW TALL A MASS IS, IN THE RADIUS ITS PUBLISHED AREA IMPLIES.
 *
 * The first cut of this made a mass exactly as tall as it is wide in radii
 * and justified it with `CANOPY_LIFT / CROWN_LIFT` = 1.30 / 2.613 = 0.4976,
 * doubled. That ratio is about where the sprite's CENTRE sits and says
 * nothing about its height, and on screen the result was a lens: on any
 * hillside the dome sank into ground the renderer had already exaggerated by
 * 3.3, and what showed was a crescent of its own downhill rim.
 *
 * The reference's own arithmetic does give a height, and this is it.
 * `lib/city/trees.ts` §CROWN_LIFT states the conversion outright — a crown
 * two radii of REAL HEIGHT up sits `2 x ZEXB / 1.2247` = 2.613 radii up the
 * SCREEN, so a screen lift of `L` radii is a world height of `L / 1.3065`.
 * The canopy sprite's mass is drawn centred at `CANOPY_LIFT` = 1.30 screen
 * radii and its lobes reach `0.46 x 0.9 + 0.62 x 1.05` = 1.065 radii above
 * that, so its crest is at 2.365 screen radii — **1.81 radii of world
 * height**, and its underside at 0.18.
 *
 * So a mass is 1.81 of `blobRadius` tall against 1.26 of it wide: taller than
 * it is broad in the radius the AREA implies, and 0.72 as tall as it is wide
 * once the spread is in. Nothing invented; two numbers off the reference's
 * own sprite, divided by the reference's own screen-to-world constant.
 */
export const CANOPY_MASS_RISE = 1.81;

export interface CanopyMassOptions {
  /** azimuthal sides added to the nine, for a hero shot; the city ships 0 */
  detail?: number;
  /**
   * How much of the published dark-to-lit spread goes into the vertex
   * colour, 0..1.
   *
   * HIGHER THAN A CROWN'S, AND THE REASON IS THE NORMALS. `crownSet` defaults
   * to 0.55 because *"this renderer HAS a sun and the two stack"* — true of a
   * 2.4-radii-tall crown, whose sides face outward and pick up a real Lambert
   * gradient. A mass is HALF AS TALL AS IT IS WIDE, so every normal on it is
   * within about 25 degrees of straight up and the sun's own term is nearly
   * constant across the whole solid. There is almost nothing to stack with,
   * so the ramp carries the volume on its own.
   */
  tone?: number;
  /**
   * A flat multiplier on the whole ramp, mid included. 1 is the ramp as the
   * published triples give it.
   *
   * WHAT THIS IS FOR, AND IT IS THE WATER'S OWN DISCIPLINE. `lib/city/
   * water.ts` §DEPTH_UM re-centres the bathymetry ramp *"so that the
   * area-weighted mean colour of the water is the value Block W set for the
   * open bay — what changes is the VARIATION, not the level"*. Same shape of
   * problem here: the 2D renderer paints a canopy mass at its base green
   * times its own light model, which at the measured median of that field is
   * `0.86 + 0.20 x 0.730` = **1.006** — so the published mass IS its base
   * green. A dome under a real directional light is not: its sides face
   * outward, take a fraction of the diffuse term, and the same green comes
   * back darker. The caller measures the shortfall on a capture and hands it
   * back here, so the LEVEL is the register's and the VARIATION is the sun's.
   *
   * Deliberately not defaulted to anything but 1: a gain is a claim about a
   * particular light rig, and a geometry file has no business assuming one.
   */
  gain?: number;
}

/**
 * One canopy mass. `y = 0` is the ground and the widest ring is `r = 1`, so
 * the caller composes `pos.set(x, groundY, z)` and `scl.set(k, k, k)`.
 *
 * Made for `MeshLambertMaterial({ vertexColors: true })` — SMOOTH, not
 * `flatShading`: a dome exists to be round, and the whole defect this
 * replaces was a solid whose facets all read as one flat plate.
 */
export function canopyMass(o?: CanopyMassOptions): BufferGeometry {
  const detail = Math.max(0, Math.min(3, Math.round(o?.detail ?? 0)));
  const tone = Math.max(0, Math.min(1, o?.tone ?? 0.85));
  const gain = Math.max(0.1, Math.min(4, o?.gain ?? 1));
  const s: Sink = {
    pos: [],
    col: [],
    idx: [],
    dk: gain * (1 + tone * (CROWN_DK_K - 1)),
    mid: gain,
    lit: gain * (1 + tone * (CROWN_LIT_K - 1)),
  };
  buildDome(MASS, s, detail);
  const g = new BufferGeometry();
  g.name = "canopy:mass";
  g.setAttribute("position", new Float32BufferAttribute(s.pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(s.col, 3));
  g.setIndex(s.idx);
  /* ── AND ITS NORMALS ARE ITS OWN, WHICH WAS NOT THE OBVIOUS ANSWER ─────
     `layers/terrain.ts` §"THE GROUND'S NORMALS POINT STRAIGHT UP, ON PURPOSE"
     is the rule for a surface that already carries a baked shade, and a mass
     is one of those — so straight-up normals were tried here first, and they
     are wrong for a different reason: with the rig's term made constant the
     only variation left on the solid is this ramp, which runs with HEIGHT,
     and a squat dome seen from above shows almost none of its own height.
     MEASURED by ablating the layer on both pages at the street camera, the
     spread of the canopy's own pixels: published 74.6 of luminance, true
     normals 51.6, straight up 49.7, no light at all 45.4.
     So the dome keeps its own normals and the rig's `HemisphereLight` key —
     a light that is brighter from above — and its directional between them
     tell one SIDE of a mass from another. What that costs is LEVEL, not
     colour, and the caller re-levels it with a measured `gain`. */
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ── the orientation ─────────────────────────────────────────────────────────

/**
 * A YAW PER TREE, FROM ITS INDEX, AND NEVER FROM `Math.random()`.
 *
 * Four geometries drawn 195,310 times all facing the same way is a repeating
 * pattern, and the eye finds a repeating pattern faster than it finds a tree.
 * One turn about the vertical axis fixes it and costs nothing: the lobes,
 * the fronds and the facets all land somewhere else.
 *
 * It has to be DERIVED and not drawn, for the reason the dissolve is: a
 * geometry rebuild, a chunk that arrives late, a second pass over the same
 * data must put every crown back exactly where it was, or the canopy shuffles
 * itself every time the camera crosses a band. This is an xorshift32 over the
 * index — the same machinery the 2D renderer's `vrnd` uses to decide which
 * trees a dissolve keeps, for the same reason.
 *
 * YAW ONLY, AND THAT IS DELIBERATE. A tilt would read as wind and would be a
 * claim about a tree the register does not make — and it would SHEAR, because
 * the caller's scale is not uniform (y carries the scene's built
 * exaggeration) and a rotation that is not about the scaled axis does not
 * commute with it. A yaw about y does.
 */
export function crownYaw(i: number): number {
  let s = (0x9e3779b9 ^ Math.imul(i | 0, 2654435761)) >>> 0;
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  return (s / 4294967296) * Math.PI * 2;
}

/**
 * Write tree `i`'s yaw into a quaternion the CALLER owns.
 *
 * THE SIGNATURE IS THE POINT. `Matrix4.compose` reads a quaternion's PRIVATE
 * `_x/_y/_z/_w`, so a `{ x, y, z, w }` object literal cast to the type
 * compiles, runs, throws nothing, and writes NaN into all nine
 * rotation-and-scale components of every instance — 195,310 crowns at a valid
 * position with a NaN size, of which the renderer draws exactly none and
 * about which it says exactly nothing. That has cost this project an hour
 * once already. So this takes a real `Quaternion` and hands it back, and
 * there is no way to call it with a literal.
 *
 * `.set` is the class's own setter — it assigns those private fields and
 * fires the change callback — and it allocates nothing, which matters in a
 * loop that runs once per tree.
 *
 * ```ts
 *   const rot = new Quaternion();          // ONCE, outside the loop
 *   setCrownYaw(idx, rot);
 *   m4.compose(pos, rot, scl);
 * ```
 */
export function setCrownYaw(i: number, out: Quaternion): Quaternion {
  const h = crownYaw(i) * 0.5;
  return out.set(0, Math.sin(h), 0, Math.cos(h));
}
