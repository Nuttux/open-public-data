/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/street-detail.ts — WHAT IS DRAWN *ON* THE STREET.

   `streets.ts` fills the two published polygons: the right of way, and the
   carriageway inside it. Everything else the street file publishes about a
   street is a LINE or a small ring — the kerb, the refuge, the stair run,
   the centreline — and none of it is drawn by that layer because none of it
   is a fill.

   ── WHY A LINE IS THE HARD CASE ON A GPU ─────────────────────────────────
   A 2D context strokes: it takes a path and a `lineWidth` in PIXELS and the
   rasteriser does the rest. A GPU has no such primitive. `THREE.Line` takes
   a `linewidth` and the core profile of every desktop driver IGNORES it, so
   a kerb asked for at 1.5 px arrives at 1 px, on every machine, for ever.

   So every line in this file is GEOMETRY: a quad strip laid on the ground,
   a width in WORLD METRES rather than in pixels. That is not a workaround,
   it is the honest form — a kerb is a thing of a certain width standing in a
   certain place, and drawing it that way means it thickens as a reader zooms
   in, which is what a kerb does.

   It also means this layer does NOT do the wide shot. A 0.4 m strip is a
   third of a pixel at district zoom and there is no setting of the constant
   that changes that without drawing a kerb four metres wide. The wide-shot
   network is a screen-space job and stays where it is.

   ── THE KERB IS A PUBLISHED BIT, AND ONLY HALF THE EDGES CARRY IT ────────
   `rdKerb` is one bit per ROADWAY VERTEX: is the edge leaving this vertex a
   published kerb, or is it the outer edge of the right of way that the
   roadway ring happens to run along? 1,961.6 km of the first, 1,768.9 km of
   the second. Stroking the whole roadway ring would draw a kerb down the far
   side of every right of way, which is a property line and not a kerb. So
   `isKerbEdge` gates every quad, and the bit is read through the Canvas
   module's own accessor rather than re-derived here.

   ── THE ISLANDS AND THE STAIRS SHIPPED AND DREW NOTHING ──────────────────
   `base/street-misc` has carried 1,120 island rings and 268 stair runs since
   Block B4 and `CityData` has decoded them since B6. The Canvas layer draws
   both; this one does the same from the same arrays, with the same tones and
   the same two declared stair numbers (`ST_STAIR_BAND_M`, `ST_STAIR_TICK_M`,
   an honest global treatment declared as one — the register publishes a
   stair's RUN and neither a width nor a tread count).

   ── AND A KERB HAS A HEIGHT, WHICH IS THE WHOLE OF THIS PASS ─────────────
   Every line here used to be a flat quad lying on the ground in a darker
   tone. At the street camera that is a 1.3 px stripe of `ST_C_KERB` on a
   pavement, and MEASURED against the same frame with the kerbs switched off
   it moved 0.28 % of the pixels: a reader looking for the edge of the road
   finds a change of colour and no OBJECT.

   A kerb IS an object. It has a top you look down on and a face turned to the
   carriageway, and in a scene with a real directional light those two take
   different amounts of it — which is what makes an edge read as an edge from
   any bearing rather than only where the tone happens to contrast. So the
   kerb, the island's rim and the stair's treads are built with a RISE, and
   the riser carries its own horizontal normal so the sun can find it.

   The rise is DECLARED, and declared once, as a fraction of the kerb's own
   drawn width (`KERB_RISE_FRAC`) — no register in this map publishes a kerb
   height. What that lands on for this city is written at the constant, and it
   is a number a reader can check against a real kerb.

   ── THE STAIRS' RISE IS NOT DECLARED. IT IS THE PUBLISHED GROUND ─────────
   `aw7j-9354` gives a stair its RUN and no rise, and the first version of
   this drew a flat band with tick marks across it. But a stair run is a line
   between two points on a DEM this map already publishes, so the rise is a
   subtraction: `elevAt(top) - elevAt(foot)`, spread along the run's own arc
   length and cut into treads at the declared pitch. Nothing is invented.

   WHAT THE DEM ACTUALLY GIVES, and it is a real limit rather than a caveat:
   `TerrainField.elevM` reads the raster at its NEAREST NODE (`Math.round` on
   the grid index, `lib/city/terrain.ts:930`), so the ground this layer can see
   is a step function at 53.8 m. Counted at build over the 268 published runs
   — the tally is on `globalThis.__cityGLStairs`:

       taken per SEGMENT   598 of 711 segments read as level      84 %
       taken per RUN       176 of 268 runs read as level          66 %

   So the rise is taken per RUN, which is also the thing the register
   publishes: 92 runs climb, 10,134 risers are built, and 728 m of the city's
   stairs now go up. The other 176 fall inside one DEM cell, come out flat, and
   draw exactly the band this layer drew before — which is the correct
   degradation, and the number is here so nobody has to guess at it.

   ── NOTHING HERE IS LIFTED OFF THE GROUND ────────────────────────────────
   `ST_LINE_LIFT_M` — the 0.8 m the Canvas raises a centreline off the DEM
   before it projects it — is deliberately NOT used. It is that renderer's
   answer to the same problem this one solves with `polygonOffset`, and in an
   axonometric projection a height is also a SCREEN DISPLACEMENT: 0.8 m of
   lift slides the line up-screen off its own street, which is far more
   visible than the z-fight it was avoiding. `streets.ts` states this for the
   carriageway; it is the same trap and the same answer.

   The depth stack this layer joins, back to front:

       4   right of way      streets.ts
       2   carriageway       streets.ts
       1   island fill, stair band
       0   centreline spine
      -1   kerb, island edge, stair treads
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

import type { CityData } from "@/lib/city/data";
import {
  isKerbEdge,
  ST_C_FOOT,
  ST_C_KERB,
  ST_C_ROAD,
  ST_LINE_INK,
  ST_STAIR_BAND_M,
  ST_STAIR_TICK_M,
  streetCellOf,
} from "@/lib/city/streets";
import type { CityLayer } from "../engine";

export interface StreetDetailLayerOptions {
  elevAt: (x: number, y: number) => number;
  /** the ground's exaggeration — everything here lies ON the ground */
  zex: number;
}

/**
 * THE ONE NUMBER IN THIS FILE THAT IS NOT PUBLISHED.
 *
 * A kerb and a centreline both have a place in the record and NO WIDTH in
 * it: `street_kerb` publishes the line the kerb runs along, `3psu-pn9h`
 * publishes the centreline's geometry, and neither says how wide to draw it.
 * Something has to be declared, so ONE fraction is declared and it is applied
 * to the city's OWN published medians rather than to a metre count written
 * here — `manifest.streets.stats.fw_p50` for the kerb, which divides the
 * carriageway from the footway and is therefore a footway-scale mark, and
 * `w_p50` for the spine, which runs down the middle of a right of way.
 *
 * A twelfth. On this city's medians that is a 0.38 m kerb and a 2.5 m spine —
 * the order of a real kerb-and-gutter edge and of a lane marking — and on a
 * city with wider or narrower streets it moves with them, which a metre count
 * written here could not do.
 */
const INK_FRAC = 0.12;

/**
 * HOW TALL A KERB IS, AS A FRACTION OF HOW WIDE IT IS DRAWN.
 *
 * No register in this map publishes a kerb's height — `street_kerb` publishes
 * the LINE a kerb runs along and nothing about its section — so one number is
 * declared, and it is declared against the width `INK_FRAC` already gives the
 * same kerb rather than as a metre count, so that a city of narrower streets
 * gets a lower kerb by the same arithmetic that gives it a narrower one.
 *
 * Two fifths. On this city's published median footway that is `3.16 x 0.12 x
 * 0.4` = **0.152 m**, which is a real kerb's height to the millimetre — a
 * check on the number rather than its derivation, because the derivation is
 * the fraction and the city's own median.
 *
 * It is the same rise for the traffic islands, because a refuge is a kerbed
 * thing, and for the stair treads' MINIMUM, because a tread that rises by
 * nothing is a painted line and not a step.
 */
const KERB_RISE_FRAC = 0.4;

/**
 * WHEN THE PUBLISHED GROUND SAYS A STAIR SEGMENT IS LEVEL.
 *
 * A tenth of the declared kerb rise on this city's numbers — 0.015 m over a
 * 0.9 m tread, a gradient of 1.7 %, which is a pavement and not a step. Below
 * it the treads are drawn at one height and the flight is the flat band the
 * layer drew before, which is the honest answer where the DEM has nothing to
 * say: this is a 53.8 m raster and a stair run inside one cell of it is read
 * from the bilinear surface, not from a survey of the steps.
 */
const STAIR_FLAT_M = 0.015;

/**
 * WHAT THE DEM ACTUALLY GAVE THE STAIRS, counted at build so the claim above
 * is a number and not a hope.
 *
 * Read it off `globalThis.__cityGLStairs` after the `strt` tier lands. It is a
 * dev tally in the shape `layers/streets.ts` §STAT already uses, and like that
 * one it is written unconditionally and read by nothing in the page.
 */
const STAIR_RISE_STAT = { runs: 0, flatRuns: 0, segs: 0, treads: 0, rise: 0 };

/**
 * A KERB, AN ISLAND AND A TREAD RIDE THE **GROUND'S** EXAGGERATION.
 *
 * `descriptor.look` keeps two: `zex` for the ground, `zexb` for what is built
 * on it. A kerb is 0.15 m of concrete and could be argued either way, and the
 * ground wins for two reasons. It is an EDGE OF THE GROUND — the line where
 * the carriageway stops — so it should rise and fall with the surface it edges
 * and never with the buildings behind it. And it makes a band change one
 * multiplication: `onStep` below scales every Y in place by `zex' / zex`,
 * which is exact only when every Y in the buffer is on the same exaggeration.
 * Mixing the two would need a second array per mesh to un-mix them, for a
 * distinction of 0.06 m at this city's numbers.
 */

/**
 * What the two widths fall back to where a manifest publishes no street
 * medians at all. A nominal street and a nominal footway, so that a city
 * whose manifest is silent draws something rather than nothing; every city
 * that publishes its own stats overrides both on the first line that reads
 * them.
 */
const NOMINAL_ROW_M = 20;
const NOMINAL_FOOT_M = 3;

/** `ringIndex` in `streets.ts`: rings-per-feature + lengths → flat offsets */
function ringIndex(n: number, per: Uint8Array, len: Uint16Array): { off: Uint32Array; fo: Uint32Array } {
  const fo = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) fo[i + 1] = fo[i] + per[i];
  const R = fo[n];
  const off = new Uint32Array(R + 1);
  for (let r = 0; r < R; r++) off[r + 1] = off[r] + len[r];
  return { off, fo };
}

/**
 * One ring → triangles. The same ear clip `streets.ts` uses on a right of
 * way, on a refuge instead, and with the same trap: `triangulateShape` strips
 * a duplicated end point with `points[l - 1].equals(...)`, so the contour has
 * to be REAL `Vector2`s. A `{ x, y }` cast compiles and throws at runtime on
 * a method the value does not have.
 */
function ringTris(
  x: Float32Array,
  y: Float32Array,
  from: number,
  to: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  /** metres of rise above the ground — the plateau a refuge stands on */
  h: number,
  rgb: RGB,
  b: Buf,
): void {
  const m = to - from;
  if (m < 3) return;
  const contour: Vector2[] = new Array(m);
  for (let k = 0; k < m; k++) contour[k] = new Vector2(x[from + k], y[from + k]);
  const faces = ShapeUtils.triangulateShape(contour, []);
  if (!faces.length) return;
  const base = b.pos.length / 3;
  for (let k = 0; k < m; k++) {
    const wx = x[from + k];
    const wy = y[from + k];
    b.pos.push(wx, (elevAt(wx, wy) + h) * zex, wy);
    b.nrm.push(0, 1, 0);
    if (rgb) b.col.push(rgb[0], rgb[1], rgb[2]);
  }
  for (const t of faces) b.idx.push(base + t[0], base + t[1], base + t[2]);
}

/**
 * ONE SEGMENT OF LINE, AS FOUR CORNERS ON THE GROUND.
 *
 * `ext` is the segment's own butt cap, in metres, and it exists for corners:
 * a kerb that turns is two segments meeting at an angle, and two quads that
 * stop dead at the shared vertex leave a wedge of roadway showing through the
 * outside of every turn. Extending each by its own half width closes that
 * wedge for a hundredth of the cost of solving a miter, and the price is that
 * a run's two true ENDS overhang by the same half width — 0.2 m on a kerb,
 * which is below the quantum the island and stair rings are even published
 * at. Passed 0 where an end is a real end and must stay put, which is the
 * stair band: a stair is 2.2 m wide, so its cap would overhang by 1.1 m.
 */
/**
 * Running buffers: a position, its normal, its colour and the index list.
 *
 * THE COLOUR IS PER VERTEX BECAUSE AN OBJECT HAS MORE THAN ONE FACE.
 * A kerb's top and a kerb's face are the same concrete and two different
 * published tones — see §THE KERB READS BECAUSE ITS TOP IS NOT ITS FACE. One
 * mesh, one draw call, two tones, exactly the way `street-markings.ts` carries
 * the unpaved carriageway on a vertex colour rather than on a second material.
 * `col` is empty on a buffer whose mesh takes one flat colour, and `mesh`
 * below reads that as "no vertex colours".
 */
interface Buf {
  pos: number[];
  nrm: number[];
  col: number[];
  idx: number[];
}

function newBuf(): Buf {
  return { pos: [], nrm: [], col: [], idx: [] };
}

/** an rgb triple in the renderer's own linear working space, or null for "no
 *  vertex colour on this buffer" */
type RGB = readonly [number, number, number] | null;

/**
 * A published CSS tone as the renderer's own working-space triple.
 *
 * A vertex colour is NOT converted by the renderer — it is taken as already
 * being in the working space — so the sRGB-to-linear step has to happen here.
 * Handing the bytes straight through paints every kerb in the city too light
 * by the gamma curve. `street-markings.ts` carries the same note and the same
 * three lines.
 */
function linear(css: string): [number, number, number] {
  const c = new Color();
  c.setStyle(css, SRGBColorSpace);
  return [c.r, c.g, c.b];
}

function strip(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfW: number,
  ext: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  /** metres of rise above the ground, before the exaggeration */
  h: number,
  rgb: RGB,
  b: Buf,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy);
  // a zero-length edge has no direction to offset along, and the published
  // rings do contain repeated vertices
  if (L < 1e-6) return;
  const ux = dx / L;
  const uy = dy / L;
  const ex = ux * ext;
  const ey = uy * ext;
  const nx = -uy * halfW;
  const ny = ux * halfW;
  const x0 = ax - ex;
  const y0 = ay - ey;
  const x1 = bx + ex;
  const y1 = by + ey;
  const base = b.pos.length / 3;
  const c: [number, number][] = [
    [x0 + nx, y0 + ny],
    [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny],
    [x0 - nx, y0 - ny],
  ];
  for (const [wx, wy] of c) {
    b.pos.push(wx, (elevAt(wx, wy) + h) * zex, wy);
    b.nrm.push(0, 1, 0);
    if (rgb) b.col.push(rgb[0], rgb[1], rgb[2]);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * ONE SEGMENT OF KERB, AS AN OBJECT: A TOP AND A FACE.
 *
 * The top is `strip`'s own quad raised by `h`. The face is the wall from that
 * quad's `side` edge down to the ground, and it is the piece that makes a kerb
 * legible — it is VERTICAL, so it carries a horizontal normal and the rig's
 * directional light gives it a value the top does not have. `layers/streets.ts`
 * fills a road; this is where the road STOPS.
 *
 * `side` is +1 when the face should be built on the strip's left normal
 * `(-uy, ux)` and -1 for the right. The caller knows which side the
 * carriageway is on — the roadway ring's own winding says so — and passing it
 * in rather than guessing is what keeps the face turned outward on an
 * anticlockwise ring as well as a clockwise one. A face built on the wrong
 * side is not invisible: it is a wall standing INSIDE the footway, and at a
 * hundred and forty kilometres of it that is the whole pavement fenced off.
 *
 * WINDING: the two triangles are wound so the face's outward side is the one
 * `side` points at. The material is `DoubleSide` — the same one the flat
 * strips use — so a mistake here costs shading and not visibility, which is
 * why the normal is pushed explicitly rather than left to `computeVertexNormals`.
 */
function lip(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfW: number,
  ext: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  h: number,
  side: number,
  /** the tone of the top and the tone of the face — see the header */
  topRGB: RGB,
  faceRGB: RGB,
  b: Buf,
): void {
  strip(ax, ay, bx, by, halfW, ext, elevAt, zex, h, topRGB, b);
  if (h <= 0) return;
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const ux = dx / L;
  const uy = dy / L;
  const ex = ux * ext;
  const ey = uy * ext;
  /* the face stands on the edge of the top quad, so it is offset by the same
     half width the top is — a face on the CENTRELINE would leave the top
     hanging over nothing on one side and buried on the other */
  const fx = -uy * halfW * side;
  const fy = ux * halfW * side;
  const p0x = ax - ex + fx;
  const p0y = ay - ey + fy;
  const p1x = bx + ex + fx;
  const p1y = by + ey + fy;
  const g0 = elevAt(p0x, p0y);
  const g1 = elevAt(p1x, p1y);
  const base = b.pos.length / 3;
  // the outward horizontal normal: the same side the face is on
  const nx = -uy * side;
  const ny = ux * side;
  b.pos.push(p0x, (g0 + h) * zex, p0y);
  b.pos.push(p1x, (g1 + h) * zex, p1y);
  b.pos.push(p1x, g1 * zex, p1y);
  b.pos.push(p0x, g0 * zex, p0y);
  for (let i = 0; i < 4; i++) {
    b.nrm.push(nx, 0, ny);
    if (faceRGB) b.col.push(faceRGB[0], faceRGB[1], faceRGB[2]);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * WHICH SIDE OF A PUBLISHED RING IS ITS INSIDE.
 *
 * Twice the signed area, by the shoelace sum. Positive means the ring runs
 * counter-clockwise in world x/y, and the interior is then on each edge's LEFT
 * normal `(-uy, ux)`; negative means the interior is on the right. The
 * roadway rings and the island rings are both published without a stated
 * winding and both orientations occur, so this is read rather than assumed —
 * see `lip` for what assuming costs.
 */
function ringSide(
  x: Float32Array,
  y: Float32Array,
  from: number,
  to: number,
): number {
  let a = 0;
  for (let i = from; i < to; i++) {
    const j = i + 1 < to ? i + 1 : from;
    a += x[i] * y[j] - x[j] * y[i];
  }
  return a >= 0 ? 1 : -1;
}

/**
 * The sRGB bytes behind a CSS colour the street module publishes, and its
 * alpha. Both forms appear there: the tones are hex, the centreline ink is
 * `rgba(...)` with an alpha that is part of the published look.
 */
function srgb(css: string): [number, number, number, number] {
  if (css.startsWith("#")) {
    const v = parseInt(css.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 1];
  }
  const m = css.match(/[\d.]+/g) ?? [];
  return [
    Number(m[0]) || 0,
    Number(m[1]) || 0,
    Number(m[2]) || 0,
    m.length > 3 ? Number(m[3]) : 1,
  ];
}

/**
 * THE INK HAS AN ALPHA AND A LAMBERT MATERIAL HAS NOT.
 *
 * `ST_LINE_INK` is `rgba(58,44,20,.20)` — the published centreline ink is a
 * translucent one, and what a reader actually sees is that ink COMPOSITED
 * over whatever is under the line, which for a centreline is the carriageway.
 * Handing the raw string to `Color.setStyle` would silently drop the alpha
 * and paint a near-black stripe down every arterial in the city.
 *
 * So the composite is done here instead, and it is done in sRGB BYTES rather
 * than in the renderer's linear working space, because sRGB is the space the
 * 2D context composites in — mixing in linear would give a different colour
 * from the Canvas page for the same published pair, which is exactly what a
 * parity screenshot exists to catch.
 */
function over(fg: string, bg: string): string {
  const f = srgb(fg);
  const b = srgb(bg);
  const ch = (i: number): number => Math.round(f[i] * f[3] + b[i] * (1 - f[3]));
  return "#" + ((1 << 24) | (ch(0) << 16) | (ch(1) << 8) | ch(2)).toString(16).slice(1);
}

function mesh(
  b: Buf,
  colour: string,
  offset: number,
): Mesh | null {
  if (!b.idx.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(b.pos), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(b.idx), 1));
  /* THE NORMALS ARE THE BUFFER'S, NOT `computeVertexNormals`'s.
     A flat top is FLAT UP like the ground and like the street surfaces — the
     slope is already in the vertices, and a Lambert term taken from a strip
     that twists as it follows a kerb round a corner would flicker quad to
     quad. A kerb's FACE is vertical and carries a horizontal normal, which is
     the whole point of building it. `computeVertexNormals` would average the
     two at every shared vertex and give the top a tilt and the face a tilt,
     which is neither. So each helper pushes what its own quad means. */
  g.setAttribute("normal", new BufferAttribute(new Float32Array(b.nrm), 3));
  if (b.col.length) {
    g.setAttribute("color", new BufferAttribute(new Float32Array(b.col), 3));
  }
  g.computeBoundingSphere();

  const c = new Color();
  c.setStyle(colour, SRGBColorSpace);
  const m = new MeshLambertMaterial({
    color: b.col.length ? 0xffffff : c,
    vertexColors: b.col.length > 0,
    side: DoubleSide,
    polygonOffset: true,
    /* ── BOTH HALVES OF THE BIAS, AND THE SLOPE HALF IS THE ONE THAT
       KEEPS A ROAD OUT OF A HILL ────────────────────────────────────────
       `polygonOffsetUnits` is the CONSTANT half: a fixed nudge in depth,
       the same everywhere, which is all a flat street needs to sit on top
       of flat ground.

       `polygonOffsetFactor` scales the bias by the polygon's DEPTH SLOPE in
       screen space — how fast its depth changes from pixel to pixel. That is
       exactly the error a constant cannot cover: two near-coplanar surfaces
       drift apart in depth in proportion to how steeply they are turned away
       from the viewer, so on a hill the constant runs out and the ground wins
       pixels it should not. Daniel, on the Sunset and Twin Peaks slopes:
       *"its that the terrain 'gobbles' it sometimes, like i feel when theres
       height chnages its like swallowed by the ground."*

       ── THIS WAS ZEROED ONCE, ON A WRONG DIAGNOSIS ──────────────────────
       The slope term was set to 0 here on the theory that a view-dependent
       bias was what made the ground shimmer when the map moved. It was not.
       The shimmer was the camera: the frame was rasterised from a continuous
       centre, so every thin thing in the city landed on a new sub-pixel phase
       each frame — `camera.ts` §THE CAMERA THE FRAME IS DRAWN FROM has the
       measurements and the fix. With the camera on the pixel grid the eighth-
       of-a-pixel reversal count is 0%, WITH this term restored. Zeroing it
       bought nothing and cost every sloped street in the city. */
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
  const out = new Mesh(g, m);
  /* ── AND THE ORDER IS EXPLICIT, WHICH IS THE REST OF THE FIX ──────────
     three sorts TRANSPARENT objects by `renderOrder` first and by distance
     from the camera second. 143 of these ground washes were all sitting at the
     default order 0, so their order was being decided by the distance tie-break
     — and coplanar surfaces have no meaningful distance between them, so the
     tie-break's answer changed every time the camera moved. That is the
     shimmer, and it is why zeroing the depth-slope term above did not fix it on
     its own: `polygonOffset` never got to decide, the SORT did.

     So every rung of the ladder in `layers/streets.ts` §ONE DEPTH LADDER now
     carries its own order and nothing has to be guessed. The offset already
     encodes the rung, so the order is read straight off it. */
  out.renderOrder = -offset;
  out.receiveShadow = true;
  out.castShadow = false;
  return out;
}

/** a geometry whose draw range is a year, and the sorted years to find it by */
interface Gate {
  g: BufferGeometry;
  /** `idx.length` after the feature at this position was emitted */
  marks: number[];
  /** that feature's year, ascending; -1 where the record is silent */
  years: number[];
}

/** how many features of `years` are drawn in `year` — they are sorted, so bisect */
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

export function streetDetailLayer(
  data: CityData,
  o: StreetDetailLayerOptions,
): CityLayer & { meshes: Mesh[] } {
  const meshes: Mesh[] = [];
  const gates: Gate[] = [];

  /* THE TWO WIDTHS COME OUT OF THE CITY'S OWN MANIFEST, which is the whole
     reason this file can sit in a city-free engine and still draw a kerb at a
     believable size: a city with 12 m streets gets a narrower one without a
     line of code moving. */
  const stats = (data.manifest.streets as
    { stats?: { w_p50?: number; fw_p50?: number } } | undefined)?.stats;
  const rowP50 = stats?.w_p50 && stats.w_p50 > 0 ? stats.w_p50 : NOMINAL_ROW_M;
  const fwP50 = stats?.fw_p50 && stats.fw_p50 > 0 ? stats.fw_p50 : NOMINAL_FOOT_M;
  const inkHalf = (fwP50 * INK_FRAC) / 2;
  const spineHalf = (rowP50 * INK_FRAC) / 2;
  /* the one declared height in this file — see `KERB_RISE_FRAC`. It is the
     kerb's own drawn WIDTH times the fraction, so the two move together. */
  const kerbRise = inkHalf * 2 * KERB_RISE_FRAC;

  /* ── THE KERB READS BECAUSE ITS TOP IS NOT ITS FACE ─────────────────────
     The flat version of this drew the whole kerb in `ST_C_KERB`, the palette's
     darkest street tone, and it disappeared — because `street-markings.ts`
     §1 sinks the FOOTWAY 0.42 of the way to that same tone to separate the
     right of way from the block interiors. Relative luminance, its own table:
     footway 70.8 %, kerb 51.6 %, and the pavement immediately either side of
     the kerb is the first of those. A dark line on a mid-dark pavement, 2.5 px
     wide. MEASURED at 160 m across, the whole of this layer moved 0.59 % of
     the frame.

     A real kerb is not a dark line. It is a pale TOP — the same concrete as
     the footway, because it is the footway's own edge — with a FACE turned to
     the road that is in its own shadow most of the day. So the object gets
     both published tones: `ST_C_FOOT` on the top, at the palette's full
     value rather than the sunk one, and `ST_C_KERB` on the face. Neither is
     invented and neither is mixed; what changed is which of the two goes
     where, and the result is a light edge over a dark one, which is what an
     edge is.

     The same pair does the island rim, for the same reason and on the same
     object. */
  const topRGB = linear(ST_C_FOOT);
  const faceRGB = linear(ST_C_KERB);

  // ── the kerbs ─────────────────────────────────────────────────────────────
  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "strt") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const cell = streetCellOf(chunk);
    const n = cell.cls.length;
    if (!n) continue;

    const rd = ringIndex(n, cell.rdN, cell.rdLen);
    const buf = newBuf();

    /* ── EMITTED IN KERBING-YEAR ORDER ───────────────────────────────────
       `krb` is the year the Board is recorded ordering the kerb, and it is a
       DIFFERENT year from `yr`: 438 rights of way carry one, and 1,974 stand
       unkerbed at some point in the record while the roadway under them is
       already there. `periodOf`'s rule, in emission order — `krb` where the
       record has one, the acceptance year where it does not, and a silent
       record means drawn in every year. Sorting by it makes the century
       scrub a draw range instead of a rebuild, exactly as `streets.ts`
       does for the surfaces. */
    const kerbYear = (i: number): number =>
      cell.krb[i] !== 0 ? cell.krb[i] : cell.yr[i] !== 0 ? cell.yr[i] : -1;
    const ord = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => kerbYear(a) - kerbYear(b) || a - b,
    );

    const marks: number[] = [];
    const years: number[] = [];
    for (const i of ord) {
      for (let r = rd.fo[i]; r < rd.fo[i + 1]; r++) {
        const a = rd.off[r];
        const b = rd.off[r + 1];
        if (b - a < 3) continue;
        /* ── WHICH WAY THE KERB FACES, READ OFF THE RING ──────────────────
           A roadway ring's INSIDE is the carriageway, so the face of every
           kerb on it turns inward. `ringSide` reads that off the published
           winding rather than assuming one — both orientations occur in this
           file and a face built the wrong way is a wall standing across the
           footway rather than a missing one. Read once per ring, not per
           edge: it is a fact about the ring. */
        const inward = ringSide(cell.rdX, cell.rdY, a, b);
        for (let v = a; v < b; v++) {
          // the ring closes, so the last vertex's edge runs back to the first
          const w = v + 1 < b ? v + 1 : a;
          if (!isKerbEdge(cell, v)) continue;
          lip(
            cell.rdX[v], cell.rdY[v], cell.rdX[w], cell.rdY[w],
            inkHalf, inkHalf, o.elevAt, o.zex, kerbRise, inward,
            topRGB, faceRGB, buf,
          );
        }
      }
      marks.push(buf.idx.length);
      years.push(kerbYear(i));
    }

    /* the flat colour is unused where the buffer carries its own — `mesh`
       takes the vertex colours when they are there — but it is still the
       honest name for what this mesh IS, and it is what a caller sees if the
       two-tone pass is ever taken back out */
    const m = mesh(buf, ST_C_KERB, -5);
    if (m) {
      meshes.push(m);
      gates.push({ g: m.geometry, marks, years });
    }
  }

  // ── the islands and the stairs ────────────────────────────────────────────
  const misc = data.streetMisc();
  if (misc) {
    /* THE ISLANDS ARE FOOTWAY, because that is what a refuge is — the same
       tone the footway takes in `streets.ts`, with the kerb that rings it
       drawn as its own strip. Neither carries a year: `emxt-b6yg` publishes
       the ring and no date, so a refuge is drawn in every year, which is the
       rule the undated streets and the undated trees are drawn under. */
    const isB = newBuf();
    const ikB = newBuf();
    let v = 0;
    for (let r = 0; r < misc.islandLen.length; r++) {
      const nv = misc.islandLen[r];
      /* ── A REFUGE STANDS ON ITS OWN KERB ────────────────────────────────
         The fill is raised by the same declared rise the kerbs take, and the
         rim is a `lip` facing OUT — which is the same object seen from the
         other side: a kerb round a roadway has the carriageway inside it, a
         kerb round an island has the carriageway outside it. So `ringSide` is
         negated here, and that negation is the entire difference between an
         island and a hole.
         The fill also has to move up WITH its rim or the rim is a low wall
         round a puddle of roadway, which is what a flat fill inside a raised
         ring looks like from this camera. */
      const outward = -ringSide(misc.islandX, misc.islandY, v, v + nv);
      ringTris(misc.islandX, misc.islandY, v, v + nv, o.elevAt, o.zex, kerbRise, null, isB);
      for (let k = 0; k < nv; k++) {
        const a = v + k;
        const b = k + 1 < nv ? v + k + 1 : v;
        lip(
          misc.islandX[a], misc.islandY[a], misc.islandX[b], misc.islandY[b],
          inkHalf, inkHalf, o.elevAt, o.zex, kerbRise, outward,
          topRGB, faceRGB, ikB,
        );
      }
      v += nv;
    }
    const isM = mesh(isB, ST_C_FOOT, -5);
    const ikM = mesh(ikB, ST_C_KERB, -6);
    if (isM) meshes.push(isM);
    if (ikM) meshes.push(ikM);

    /* ── THE STAIRS ──────────────────────────────────────────────────────
       A band the width of the declared `ST_STAIR_BAND_M` with a tread tick
       every declared `ST_STAIR_TICK_M`, both taken from the Canvas module
       rather than restated, and both an honest global treatment: `aw7j-9354`
       publishes the RUN of each stair and neither a width nor a tread count,
       so every stair in the city gets the same two numbers and NEITHER IS A
       MEASUREMENT OF THAT STAIR.

       The Canvas gates the ticks on being more than two pixels apart, and
       that gate cannot come across: this geometry is built once and the
       camera meets it afterwards. What replaces it is the projection itself —
       at a zoom where 0.9 m is sub-pixel the ticks merge into the band they
       are drawn on, which is the same picture the gate was protecting. */
    /* ── A FLIGHT OF STEPS, AND THE RISE IS THE PUBLISHED GROUND ────────
       The band-and-ticks version of this drew the plan of a stair: a 2.2 m
       ribbon with a line across it every 0.9 m, flat on the hillside. From
       this camera that is a ladder painted on a slope.

       A stair has a THIRD dimension and this map publishes it. `aw7j-9354`
       gives the run and no rise, but a run is a line between two points on a
       DEM that is already in hand, so each segment's rise is a subtraction —
       `elevAt(end) - elevAt(start)` — and each tread is that divided by the
       segment's own tread count. Nothing is invented: on ground the DEM reads
       as flat the treads come out flat and the geometry is the band it always
       was, which is the correct degradation and is what happens on the
       fraction of runs recorded in `STAIR_RISE_STAT` below.

       The treads are the pale footway tone and the RISERS are the kerb tone —
       which is exactly what the ticks were, seen from above, and now they are
       the surfaces that were casting them. */
    const bandHalf = ST_STAIR_BAND_M / 2;
    const sbB = newBuf();
    const stB = newBuf();
    v = 0;
    for (let r = 0; r < misc.stairLen.length; r++) {
      const nv = misc.stairLen[r];
      if (nv < 2) {
        v += nv;
        continue;
      }
      /* ── THE RISE IS TAKEN ACROSS THE WHOLE RUN, NOT PER SEGMENT ───────
         `TerrainField.elevM` reads the DEM at its NEAREST NODE — `Math.round`
         on the grid index, `lib/city/terrain.ts:930` — so the ground this
         layer can see is a step function at 53.8 m. MEASURED against the
         published runs, taking each SEGMENT's own two ends: 598 of 711
         segments have both ends inside one cell and read as perfectly level.
         A flight of steps drawn from that is 84 % flat.

         A RUN is the thing the register publishes and it is the thing that
         climbs: 268 of them, foot to top. So the rise is read once at the
         run's two ends and spread along its own arc length, which is what a
         flight between two levels is. Nothing is interpolated that the record
         does not hold — the two elevations are both published DEM nodes and
         the arc length is the published polyline's — and where a whole RUN
         still falls inside one cell it comes out flat and draws the band this
         layer drew before. The count of those is in `STAIR_RISE_STAT`. */
      const e0 = o.elevAt(misc.stairX[v], misc.stairY[v]);
      const e1 = o.elevAt(misc.stairX[v + nv - 1], misc.stairY[v + nv - 1]);
      let runL = 0;
      for (let k = 0; k + 1 < nv; k++) {
        runL += Math.hypot(
          misc.stairX[v + k + 1] - misc.stairX[v + k],
          misc.stairY[v + k + 1] - misc.stairY[v + k],
        );
      }
      STAIR_RISE_STAT.runs++;
      if (Math.abs(e1 - e0) < STAIR_FLAT_M) STAIR_RISE_STAT.flatRuns++;
      STAIR_RISE_STAT.rise += Math.abs(e1 - e0);
      const grade = runL > 1e-6 ? (e1 - e0) / runL : 0;
      /** how far along the whole run this segment starts */
      let along = 0;
      for (let k = 0; k + 1 < nv; k++) {
        const ax = misc.stairX[v + k];
        const ay = misc.stairY[v + k];
        const bx = misc.stairX[v + k + 1];
        const by = misc.stairY[v + k + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy);
        if (L < 1e-6) continue;
        const ux = dx / L;
        const uy = dy / L;
        /* the band's own half width, across the run */
        const px = uy * bandHalf;
        const py = -ux * bandHalf;
        /* HOW MANY TREADS. `ST_STAIR_TICK_M` is the declared tread pitch the
           Canvas module already ships, taken from there rather than restated;
           at least one, because a segment shorter than a tread is still a step
           up rather than nothing. */
        const N = Math.max(1, Math.round(L / ST_STAIR_TICK_M));
        STAIR_RISE_STAT.segs++;
        let prevE = e0 + grade * along;
        for (let t = 0; t < N; t++) {
          const s0 = (t / N) * L;
          const s1 = ((t + 1) / N) * L;
          /* a real tread is HORIZONTAL and stands at the top of its own
             riser, so the whole flight climbs in steps rather than as a ramp
             with lines drawn on it */
          const eT = e0 + grade * (along + s1);
          const q0x = ax + ux * s0;
          const q0y = ay + uy * s0;
          const q1x = ax + ux * s1;
          const q1y = ay + uy * s1;
          const base = sbB.pos.length / 3;
          const corners: [number, number][] = [
            [q0x + px, q0y + py],
            [q1x + px, q1y + py],
            [q1x - px, q1y - py],
            [q0x - px, q0y - py],
          ];
          for (const [wx, wy] of corners) {
            sbB.pos.push(wx, eT * o.zex, wy);
            sbB.nrm.push(0, 1, 0);
          }
          sbB.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);

          /* THE RISER, and it is skipped where the ground gives it nothing to
             be: a zero rise means the record's own DEM has this whole run
             inside one cell, and a riser of no height is two coincident
             triangles. */
          const dRise = eT - prevE;
          if (Math.abs(dRise) > 1e-4) {
            STAIR_RISE_STAT.treads++;
            const rb = stB.pos.length / 3;
            /* the face turns back DOWN the flight, against the direction of
               travel, so it is the surface a reader looking up a hill sees */
            const sgn = dRise > 0 ? -1 : 1;
            stB.pos.push(q0x + px, eT * o.zex, q0y + py);
            stB.pos.push(q0x - px, eT * o.zex, q0y - py);
            stB.pos.push(q0x - px, prevE * o.zex, q0y - py);
            stB.pos.push(q0x + px, prevE * o.zex, q0y + py);
            for (let i = 0; i < 4; i++) stB.nrm.push(ux * sgn, 0, uy * sgn);
            stB.idx.push(rb, rb + 1, rb + 2, rb, rb + 2, rb + 3);
          }
          prevE = eT;
        }
        along += L;
      }
      v += nv;
    }
    const sbM = mesh(sbB, ST_C_FOOT, -5);
    const stM = mesh(stB, ST_C_KERB, -6);
    if (sbM) meshes.push(sbM);
    if (stM) meshes.push(stM);
  }

  // ── the spine of the arterials ────────────────────────────────────────────
  /* RANK 0 AND RANK 1, AND THE RANK TABLE IS WHY THEY SHARE A WIDTH.
     `ST_W` — the per-class weight the Canvas strokes centrelines at — opens
     `[1.5, 1.5, 1.0, ...]`: the published classcode ranks 0 and 1 are the
     same weight in it, and 2 is not. So one width for the two of them is the
     rank table's own answer and not a shortcut, and the ceiling at 1 is the
     point where that table steps down.

     `strt/street-unimplied` falls out of the same test for free — it is
     classes 5 to 7 by construction, so it is never rank 0 or 1. */
  const spineInk = over(ST_LINE_INK, ST_C_ROAD);
  for (const c of data.streetLines()) {
    const nF = c.cls.length;
    /* NO RISE. A centreline is PAINT — the one thing in this file that really
       does lie flat on the carriageway — so it stays a flat strip at h = 0
       while the kerb beside it stands up. */
    const buf = newBuf();
    const marks: number[] = [];
    const years: number[] = [];

    /* the vertex runs are packed feature after feature, so the offsets have
       to be walked in FILE order even though the emission is in year order —
       hence one pass to find each feature's base and a second to draw */
    const base = new Uint32Array(nF);
    let off = 0;
    for (let i = 0; i < nF; i++) {
      base[i] = off;
      off += c.len[i];
    }
    const lineYear = (i: number): number => (c.yr[i] !== 0 ? c.yr[i] : -1);
    const ord: number[] = [];
    for (let i = 0; i < nF; i++) if (c.cls[i] <= 1) ord.push(i);
    ord.sort((a, b) => lineYear(a) - lineYear(b) || a - b);

    for (const i of ord) {
      const b0 = base[i];
      const m = c.len[i];
      for (let k = 0; k + 1 < m; k++) {
        strip(
          c.x[b0 + k], c.y[b0 + k], c.x[b0 + k + 1], c.y[b0 + k + 1],
          spineHalf, spineHalf, o.elevAt, o.zex, 0, null, buf,
        );
      }
      marks.push(buf.idx.length);
      years.push(lineYear(i));
    }

    /* `cov` — does a published right of way cover this line? — is read by the
       Canvas to FADE a line as its surface arrives, and is deliberately not
       read here. At the zooms this layer exists for the surface is always
       there, and a spine drawn over a carriageway in the carriageway's own
       ink at a twelfth of its width reads as the lane marking it sits where.
       A fade would need transparency on a ground-coplanar quad, which is the
       depth-sorting problem `polygonOffset` was chosen to avoid. */
    const m = mesh(buf, spineInk, -6);
    if (m) {
      meshes.push(m);
      gates.push({ g: m.geometry, marks, years });
    }
  }

  /* the stairs' own tally, published to the dev globals the harnesses read —
     `runs` / `flatRuns` how many published stair runs the DEM gives a rise
     and how many it reads as level, `segs` their segments, `treads` the risers
     actually built, `rise` the total climb in ground metres */
  (globalThis as { __cityGLStairs?: typeof STAIR_RISE_STAT }).__cityGLStairs =
    STAIR_RISE_STAT;

  return {
    name: "street-detail",
    meshes,
    onYear(year: number | undefined) {
      for (const gt of gates) {
        const k = upTo(gt.years, year);
        gt.g.setDrawRange(0, k ? gt.marks[k - 1] : 0);
      }
    },
    onStep(step: number, zex: number) {
      /* the kerbs and the spines are a close-camera treatment for the same
         reason the surface is — see `streets.ts` */
      for (const m of meshes) m.visible = step >= 1;
      /* the ground's exaggeration moved, so every vertex moves with it — the
         same one pass over Y the surfaces and the footprints take */
      const k = zex / o.zex;
      for (const m of meshes) {
        const p = m.geometry.getAttribute("position") as BufferAttribute;
        const arr = p.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) arr[i + 1] *= k;
        p.needsUpdate = true;
        m.geometry.computeBoundingSphere();
      }
      o.zex = zex;
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshLambertMaterial).dispose();
      }
      meshes.length = 0;
      gates.length = 0;
    },
  };
}
