/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/contact-shadow.ts — THE DISC A CANOPY SITS ON.

   A crown and a canopy mass in this renderer are solids standing on the
   ground and NOTHING MARKS WHERE THEY MEET IT. The reference does mark it,
   twice, and it is the first thing in either sprite:

     lib/city/trees.ts §buildSpriteSheet, a crown
       globalAlpha 0.20; fillStyle "#3b3222"
       ellipse(-R*0.30, AY - R*0.06, R*0.92, R*0.40)

     …and a canopy mass
       globalAlpha 0.22; fillStyle "#3b3222"
       ellipse(-R*0.26, AY - R*0.30, R*1.02, R*0.44)

   Every crown and every mass on the published page is drawn on top of one of
   those. The mesh port has none, and that is most of the tonal shortfall a
   canopy ablation measures: with the layer switched off and on at the street
   camera, the canopy's OWN pixels span 74.6 of luminance on the published
   page against 60.8 here — and the missing spread is all at the dark end,
   because the dark end IS the ellipse.

   ── WHAT IS PUBLISHED, WHAT IS READ OFF THE REFERENCE, AND WHAT IS NEW ───
   Nothing here is published: no register in this map says where a tree's
   shadow falls. Everything here is READ OFF THE REFERENCE's own two calls
   above, converted from its screen ellipse into a ground circle by the
   projection's own two axes, and the conversion is written out below so a
   reader can check it. The only thing that is neither published nor in the
   reference is the SOFT RIM, and it says so where it is declared.

   ── A SCREEN ELLIPSE IS A GROUND CIRCLE, AND THE CONVERSION IS PUBLISHED ─
   `lib/city/streets.ts` §ST_KPROJ states the projection exactly: at ROT 315
   *"world metres reach the screen at 1.2247 * cam.scale across and 0.7071 *
   cam.scale up, so a width at an unknown bearing projects at the geometric
   mean, 0.9306."* Three numbers, and they settle two questions.

   1. IS THE REFERENCE'S ELLIPSE A GROUND CIRCLE? A ground circle projects to
      an ellipse of ratio 0.7071 / 1.2247 = 0.577. The reference draws 0.40 /
      0.92 = 0.435 for a crown and 0.44 / 1.02 = 0.431 for a mass — the same
      number twice, and it is FLATTER than a circle by a quarter. So the
      reference's shadow is a drawn ellipse, not a projected disc, and its two
      axes were chosen by eye at one bearing. A mesh cannot copy that: a disc
      on the ground turns with the camera and there is only one camera here,
      so what carries across is the SIZE, taken off the axis the projection
      does not squash.

   2. HOW BIG IS IT IN GROUND METRES? The sprite radius `R` is the crown's own
      radius drawn at the geometric mean (`rp = radius_m * 0.9306 * scale`),
      and the ellipse's semi-major is on the ACROSS axis (`1.2247 * scale`).
      So a semi-major of `k * R` is a ground radius of

          k * 0.9306 / 1.2247  =  k * 0.7599

      of the crown radius the sprite was drawn at. Crown: 0.92 * 0.7599 =
      **0.699**. Mass: 1.02 * 0.7599 = **0.775**. Both a little over two
      thirds of the thing standing on them, which is what a contact shadow is.

   ── AND THE OFFSET IS *NOT* CARRIED ACROSS WHOLE ─────────────────────────
   The reference's ellipse centre sits at `(-R*0.30, AY - R*0.06)` for a crown
   and `(-R*0.26, AY - R*0.30)` for a mass, where `AY` is the sprite's own
   GROUND anchor. Two different displacements, and they are not the same kind
   of thing:

     · THE UP-SCREEN PART IS THE LIFT, and it does not port. A sprite is flat:
       its crown is painted `CROWN_LIFT` = 2.613 radii up-screen of the anchor
       and its shadow a fraction of a radius up, and the gap between those two
       numbers is the entire reason the shadow shows below the crown. Here the
       crown is a SOLID at a real height over real ground and the projection
       produces that gap by itself. Baking it in as well would put the shadow
       twice as far from the trunk as the reference does.

     · THE ACROSS-SCREEN PART IS THE SUN, and it does. 0.26 to 0.30 of a
       radius, to the LEFT, on a page whose light `buildSpriteSheet` states is
       *"upper-right on screen"* — so it is the shadow leaning away from the
       light. Across-screen is the axis the projection does not squash, so the
       fraction carries into ground metres with no conversion at all. What
       replaces the baked screen vector is this renderer's own `SUN_SCENE`:
       the disc leans away from the real sun, so if the hour ever moves the
       shadows move with it.

   ── THE DEPTH RUNG, DECIDED ─────────────────────────────────────────────
   `layers/streets.ts` §ONE DEPTH LADDER: a NEGATIVE `polygonOffsetFactor`
   brings a coplanar surface FORWARD, and the ground's ladder is

       0 ground · -1 block tint · -2 right of way · -3 carriageway
       -4 contrast · -5 kerbs, islands, stairs · -6 crossings, lane lines

   A tree's shadow falls across every one of those — across the grass, across
   the footway, over the kerb, over the crossing painted on the road. There is
   no rung in that ladder where it belongs BETWEEN two of them, so it takes
   the rung after the last: **-7**, one step in front of the closest thing the
   ground draws.

   That is only half the decision. The other half is that it writes NO DEPTH.
   `depthWrite: false` with `depthTest: true` is what makes -7 safe: the disc
   is TESTED against the ground (and passes, being in front of it) and against
   the solid standing on it (and fails where the solid is nearer, which is
   what hides the middle of every disc under its own mass) — but it leaves the
   buffer alone, so nothing drawn afterwards can be occluded by a shadow.

   ── AND IT BLENDS, WHICH IS THE HONEST FORM ─────────────────────────────
   An opaque disc would have to be the composite of `#3b3222` at 0.22 over
   whatever is beneath — and beneath is grass, sand, asphalt, a footway, a
   painted crossing, four park tones and the bay's own edge. There is no one
   answer, so it is not baked: `transparent: true` at the reference's own
   alpha over whatever is actually there, which is the same operation the 2D
   context performs and therefore the same result. Two discs that overlap
   darken twice, exactly as two of the reference's sprites do.

   ── NOTHING HERE KNOWS WHICH CITY IT IS ─────────────────────────────────
   No palette, no register, no coordinate. The tone is the caller's, for the
   reason `tree-geometry.ts` gives for the greens: a colour belongs where the
   data is. What this file holds is a shape and four ratios, and a ratio is
   not a colour.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MeshBasicMaterial,
  NormalBlending,
  SRGBColorSpace,
} from "three";

// ── the four ratios, off the reference's own two calls ──────────────────────

/**
 * THE SPRITE'S SEMI-MAJOR, AS A GROUND RADIUS.
 *
 * `0.9306 / 1.2247` — the projection's geometric mean over its across axis.
 * A sprite is drawn at the first and its ellipse's long axis lies on the
 * second, so this is what turns one into the other. See the header §2.
 */
export const CONTACT_SCREEN_TO_GROUND = 0.9306 / 1.2247;

/**
 * A CROWN'S DISC, in crown radii: `0.92 * 0.7599`.
 *
 * The crown geometry's widest ring is at r = 1 and the caller scales it by the
 * published crown radius, so this multiplies the SAME number the crown does
 * and the two cannot drift apart.
 */
export const CONTACT_R_CROWN = 0.699;

/**
 * A CANOPY MASS'S DISC, in the radius its published area implies: `1.02 *
 * 0.7599`.
 *
 * Read against `blobRadius(area)` and NOT against the drawn spread, because
 * the reference's `R` for a mass cell is `blobRadius` too — its silhouette
 * reaches 1.26 of that (`CANOPY_MASS_SPREAD`) and its shadow 1.02, both in the
 * same unit. So a mass's disc is 0.775 / 1.26 = **0.615 of the mass's own plan
 * radius**: it is entirely inside the dome in plan, and what shows is the
 * crescent the dome's height leaves uncovered. That is the reference's
 * proportion, and it is why a mass reads as SEATED rather than as a solid with
 * a saucer round it.
 */
export const CONTACT_R_MASS = 0.775;

/**
 * HOW FAR THE DISC LEANS AWAY FROM THE SUN, in its own radius.
 *
 * The mean of the reference's two across-screen offsets — 0.30 for a crown,
 * 0.26 for a mass, both to the left of a light it puts upper-right — expressed
 * against the disc's own radius rather than the sprite's, which is what makes
 * one number serve both: `0.28 * R_sprite` is `0.28 / 0.699 = 0.40` of a
 * crown's disc and `0.28 / 0.775 = 0.36` of a mass's. Split the difference at
 * 0.38 and the error against either is under two hundredths of a crown radius,
 * which at the street camera is a quarter of a pixel.
 */
export const CONTACT_LEAN = 0.38;

/**
 * THE DEPTH RUNG. See the header — one step in front of the closest thing the
 * ground ladder draws, because a shadow falls across all of it.
 */
export const CONTACT_DEPTH = -7;

/**
 * THE SOFT RIM, AND IT IS THE ONE THING HERE THAT IS NEITHER PUBLISHED NOR IN
 * THE REFERENCE.
 *
 * The reference fills a hard-edged ellipse; a 2D context antialiases the edge
 * and at a crown's size on screen that is the whole of its softness. A mesh
 * has no such edge — an eight-sided disc at full alpha is an OCTAGON, and
 * fifty thousand identical octagons on a lawn is the same defect the crowns'
 * own hex pattern was.
 *
 * So the rim ramps to zero alpha over this fraction of the disc's radius,
 * OUTSIDE it — the core keeps the reference's own size and its own alpha, and
 * the feather is added beyond. A renderer that ignores the vertex alpha
 * degrades to a hard disc 22 % too wide rather than to nothing.
 */
export const CONTACT_FEATHER = 0.22;

/** azimuthal sides for a street tree's disc — 24 triangles */
export const CONTACT_SIDES_CROWN = 8;
/** …and for a canopy mass's, which is three times as wide — 36 triangles */
export const CONTACT_SIDES_MASS = 12;

/** triangles a disc of `sides` costs: `sides` under the core, `2 * sides` in
 *  the feather ring */
export function contactTris(sides: number): number {
  return sides * 3;
}

// ── the geometry ────────────────────────────────────────────────────────────

export interface ContactDiscOptions {
  /** azimuthal sides; the two constants above are what the city ships */
  sides?: number;
  /** the feather's width as a fraction of the core radius */
  feather?: number;
}

/**
 * One contact disc, flat on `y = 0`, core radius exactly 1.
 *
 * THE CONVENTIONS, because the caller's `compose` depends on both:
 *
 * ```
 *   x, z    the core ring is at |r| = 1 EXACTLY, so `scale = the disc's own
 *           ground radius in metres`. The feather ring is outside it at
 *           `1 + feather` and carries zero alpha, so it costs the caller
 *           nothing to reason about.
 *   y       0, and every vertex is on it. The disc is FLAT: it takes no
 *           vertical exaggeration, and the caller's `position.y` is the
 *           ground sample it lies on, already exaggerated.
 * ```
 *
 * The alpha rides in a FOUR-component `color` attribute, which three.js's node
 * materials multiply into `vec4(diffuse, opacity)` whole — so one flat
 * material at the reference's own alpha, one instanced draw, and the rim fades
 * with no shader and no second pass. The rgb is 1 everywhere: the tone is the
 * material's, and the caller owns it.
 */
export function contactDisc(o?: ContactDiscOptions): BufferGeometry {
  const sides = Math.max(3, Math.min(64, Math.round(o?.sides ?? CONTACT_SIDES_CROWN)));
  const feather = Math.max(0, Math.min(2, o?.feather ?? CONTACT_FEATHER));

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  /* the centre, at the full alpha the caller's material carries */
  pos.push(0, 0, 0);
  col.push(1, 1, 1, 1);

  /* WINDING, and it is the same rule `tree-geometry.ts` states: `x = r cos θ`,
     `z = -r sin θ`, θ ascending, which is counter-clockwise seen from above.
     A ring wound the other way is back-facing and invisible — and this
     material is `DoubleSide` anyway, so getting it wrong would cost nothing
     and teach nothing. It is kept because every other ring in this engine is
     wound that way and one exception is how the next one gets it wrong. */
  const ring = (r: number, a: number): number => {
    const first = pos.length / 3;
    for (let i = 0; i < sides; i++) {
      const th = (i / sides) * Math.PI * 2;
      pos.push(r * Math.cos(th), 0, -r * Math.sin(th));
      col.push(1, 1, 1, a);
    }
    return first;
  };
  const core = ring(1, 1);
  const rim = ring(1 + feather, 0);

  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    idx.push(0, core + i, core + j);
    idx.push(core + i, rim + i, core + j);
    idx.push(core + j, rim + i, rim + j);
  }

  const g = new BufferGeometry();
  g.name = "canopy:contact";
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  /* STRAIGHT UP, and not computed. `computeVertexNormals` on a flat ring gives
     the same answer, and the material is unlit anyway — but a normal buffer
     that exists is a normal buffer that gets uploaded, and 246,207 instances
     of a shape share exactly one of these. This is the cheapest correct one. */
  const n = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) n[v * 3 + 1] = 1;
  g.setAttribute("normal", new Float32BufferAttribute(n, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ── the material ────────────────────────────────────────────────────────────

/**
 * The one material a disc wants, and every clause of it is a decision the
 * header argues:
 *
 *   `MeshBasicMaterial`  a shadow is not lit. Running it through a Lambert
 *                        term would brighten the shadows on the sunny side of
 *                        a hill, which is the opposite of what a shadow does.
 *   `transparent`        because what is under it varies — see the header.
 *   `depthWrite: false`  so a shadow can never occlude anything.
 *   `polygonOffset -7`   the rung, see the header.
 *   `DoubleSide`         a disc lying on a hillside the terrain has
 *                        exaggerated by 3.3 can present its underside to an
 *                        oblique camera on the far slope; one-sided, it winks
 *                        out there.
 *   `NormalBlending`     source-over, which is what `globalAlpha` in a 2D
 *                        context is. Named rather than left to the default so
 *                        that "the same operation the reference performs" is
 *                        checkable rather than assumed.
 *
 * `alpha` and `css` are the caller's: the reference's two numbers live with
 * the data, not in the engine.
 */
export function contactMaterial(css: string, alpha: number): MeshBasicMaterial {
  const c = new Color();
  c.setStyle(css, SRGBColorSpace);
  return new MeshBasicMaterial({
    color: c,
    vertexColors: true,
    transparent: true,
    opacity: alpha,
    blending: NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: CONTACT_DEPTH,
    polygonOffsetUnits: CONTACT_DEPTH,
    fog: false,
  });
}

// ── where the disc goes ─────────────────────────────────────────────────────

/**
 * The disc's centre, given the foot of the thing standing on it.
 *
 * `sunX` / `sunZ` are the horizontal part of the light's own direction —
 * `light.ts` §SUN_SCENE, which points FROM the scene TOWARD the sun, so the
 * shadow leans along its negative. The pair is passed in rather than imported
 * so this file stays a shape and four ratios: a caller with no sun at all
 * passes `0, 0` and gets a disc concentric with its own foot, which is what a
 * contact shadow is when nothing is casting it.
 *
 * Writes into the caller's own two-element scratch so a loop over 246,207
 * instances allocates nothing.
 */
export function contactCentre(
  footX: number,
  footZ: number,
  radiusM: number,
  sunX: number,
  sunZ: number,
  out: [number, number],
): [number, number] {
  const L = Math.hypot(sunX, sunZ);
  if (L < 1e-9) {
    out[0] = footX;
    out[1] = footZ;
    return out;
  }
  const k = (radiusM * CONTACT_LEAN) / L;
  out[0] = footX - sunX * k;
  out[1] = footZ - sunZ * k;
  return out;
}
