/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/rail.ts — THE TRACK, WHICH THIS MAP HAS NEVER DRAWN.

   `base/terrain`, `strt/*`, `bldg/*`, `tree/*` and `water1/*` are the whole
   of the shipped fabric and not one of them carries a rail. The street
   network is DataSF's centrelines, right of way and kerbs; none of the three
   has a track in it. So San Francisco — whose cable cars are on the city's
   own seal — has been drawn without one.

   ── WHY RAIL READS AT A SIZE NOTHING ELSE DOES ──────────────────────────
   A rail head is 7 cm across. At the deepest camera this project now allows
   (0.18 m a pixel) that is under half a pixel, so drawn honestly it would not
   exist — the same argument `heroes.ts` §CABLE_M makes about a bridge cable,
   and it takes the same answer: a declared drawing convention, stated here.

   What makes it worth drawing at all is that polished steel is the only
   SPECULAR thing on the ground. Everything else down there — asphalt,
   concrete, the ground ramp — is a diffuse surface whose normal points
   straight up, and `PLAN.md` records why that can never catch a highlight at
   this fixed camera and sun. A rail is a narrow cylinder-ish ribbon, so its
   normal sweeps through the angles that DO catch one, and a pair of them
   reads as a line of light long after the geometry is sub-pixel.

   ── WHAT IS PUBLISHED, AND WHAT THIS IS NOT ─────────────────────────────
   `build_rail.py` takes DataSF `9exe-acju` and keeps the lines that dataset
   NAMES as rail — CA, PH, PM cable car, F streetcar, J K L M N T light rail —
   and drops the bus patterns it names on the same corridors. Nothing here
   guesses which is which.

   **The GEOMETRY is today's; the DATES are the city's own.** Each segment
   carries the year the Board of Supervisors is recorded PAYING TO LAY that
   line, from `pipeline/seeds/sf_rail_opened.json`, so the network arrives as
   the city built it — 15.8 km of cable and Market Street in 1906, 27.8 by
   1917, 41.6 by 1919, 57.6 by 1928, 69.3 today. See §WHAT YEAR THIS LAYER CAN
   HONESTLY SPEAK FOR.

   (This paragraph used to say the gate was the dataset's own `asOf`. It was,
   and that was the bug: `asOf` is a publication timestamp, so the test was
   `year >= 2026` and only produced present-only behaviour by accident. Two
   other things in this header were also stale and are corrected above — the
   map runs from 1906, not 1849, and the file names TEN rail lines, not
   eight.)
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Scene,
} from "three";

import type { CityData } from "@/lib/city/data";
import type { CityLayer } from "../engine";

/**
 * HOW WIDE A RAIL IS DRAWN, WORLD METRES — A CONVENTION, AND SAID SO.
 *
 * A real rail head is about 0.07 m. At 0.18 m a pixel that is 0.4 of a pixel
 * and it would not exist. 0.45 m is 2.5 px at the deepest camera and a
 * hairline at the block camera, which is what a track looks like from above.
 * It is NOT a measurement.
 */
const RAIL_W = 1.0;

/**
 * The gauge, world metres — how far apart the two rails are drawn.
 *
 * Muni Metro runs standard gauge, 1.435 m, and the cable cars run 1.067 m.
 * Neither is in the published route file, and at this camera the difference
 * is a third of a pixel, so ONE spacing is drawn for all of it and the fact
 * that it is a single convention is recorded here rather than implied.
 * Widened past standard gauge for the same reason `RAIL_W` is: two rails
 * 1.435 m apart at 0.18 m/px are eight pixels, which reads, but at the block
 * camera they merge into one smear — 2.2 m keeps them legible as a PAIR one
 * stop longer, which is what says "track" rather than "line".
 */
const GAUGE_M = 4.0;

/**
 * ── THE RUNG THIS LAYER SITS ON, AND THE RULE IT WAS BREAKING ────────────
 *
 * `street-markings.ts` §DEPTH, NOT HEIGHT states the rule and names the three
 * other layers that already obey it: *"`polygonOffset`, never a Y offset: in
 * an axonometric projection a metre of height is also tens of pixels of
 * SCREEN, so lifting a mark off the road to win a depth test slides it off the
 * road it is a mark ON."* This layer did exactly that, with a Y lift.
 *
 * It also sat on the wrong rung. That file publishes the ladder, and in it a
 * LOWER number is nearer the camera -- the kerb is at -1 and is on top of
 * everything:
 *
 *       4     right of way          streets.ts
 *       2     carriageway           streets.ts
 *       0     centreline spine      street-detail.ts
 *      -0.5   crosswalks            street-markings.ts
 *      -1     kerb                  street-detail.ts
 *
 * The rail was at renderOrder 3. That is BELOW the carriageway, the spine, the
 * crosswalks and the kerb, so the road surface was drawn over the top of the
 * track on every frame. Measured: with everything else in the scene hidden the
 * rail paints 4,173 px, and with `depthTest` forced off in the full scene it
 * paints 8,344 px -- it was always being drawn and always being buried.
 *
 * A tram rail is steel set into the carriageway, so it belongs just above the
 * crosswalks and below the kerb: a track is not painted over, but a kerb still
 * stands proud of it.
 */
const RAIL_OFFSET = 0.6;

/* ── AND polygonOffset IS WHY NONE OF THAT WAS EVER SEEN ──────────────────
 * `RAIL_OFFSET` above reaches three.js only as `polygonOffsetFactor` and
 * `polygonOffsetUnits`, and on the WebGPU backend those are mapped onto a
 * pipeline's depth bias and never applied. So the track was laid at exactly
 * `elevAt` -- the bare ground -- while every road surface over it is drawn at
 * the same height and wins on draw order.
 *
 * Measured at the Nob Hill cable camera, hiding the layer and differencing the
 * frame: the rail changes ONE pixel. With `depthTest` forced off in the same
 * frame it changes 52,569 -- 6.9 % of the view. The ballast, the sleepers, the
 * cable slot and both steel ribbons were all being drawn, every frame, under
 * the road. Raising `RAIL_OFFSET` to 30 changed nothing, which is what a
 * constant that reaches nothing looks like.
 *
 * So the separation is a real height, in ground metres, applied to the vertex
 * -- `mesh.scale.y` carries `zex`, so it exaggerates with everything else.
 * `street-detail.ts` warns that a lift is also a SCREEN DISPLACEMENT in an
 * axonometric projection and that the Canvas renderer's 0.8 m slides a line
 * off its own street. That warning is about 0.8 m. These are a quarter of it
 * and less: at the closest zoom the view spans about 0.35 m a pixel, so 0.2 m
 * of steel moves half a pixel up-screen, and at any wider zoom, less. It is
 * the smallest lift that survives a depth test and the largest that cannot be
 * seen as displacement. */
const RAIL_BED_LIFT_M = 0.1;
/* a sleeper lies ON the ballast and the rail lies ON the sleeper, which is
   the order a track is actually assembled in */
const RAIL_TIE_LIFT_M = 0.15;
const RAIL_STEEL_LIFT_M = 0.2;

/**
 * ── AND THE RUNG ABOVE WAS READ OFF THE WRONG CONVENTION ────────────────
 *
 * The table above is `street-markings.ts`'s and its numbers go DOWN toward
 * the camera. The numbers those layers actually hand three.js do not: read
 * off the running scene at a street camera, the right of way is at 1, the
 * carriageway at 2, the uncovered roads at 2.5, the crossings at 4 and 6 and
 * the kerbs at 5 and 6 — three.js draws a HIGHER `renderOrder` LATER, which
 * is to say on top. The two conventions are mirror images and this layer was
 * written against the wrong one: `-RAIL_OFFSET` is -0.6, which is below the
 * ground itself, so the fix that moved the track off Y and onto the ladder
 * put it further under the road than it had been.
 *
 * 3.5 is where a tram rail belongs stated in the convention the renderer
 * really uses: above the carriageway it is set into and above the roads with
 * no published polygon, below the painted marks that are laid over it and
 * below the kerb, which stands proud of everything.
 *
 * `userData.wash` then puts it on `engine.ts`'s clearance, for the same
 * reason every other ground wash needs one — `polygonOffset` is inert on this
 * backend, and without the clearance the terrain's own chord eats the track
 * on exactly the hills a cable car climbs.
 */
/* ── AND THE ROAD'S OWN SURFACES WERE IN FRONT OF THE TRACK ───────────────
 * `engine.ts` seats every `userData.wash` mesh toward the eye by
 * `2.5 + 0.25 * renderOrder`. At 3.5 the rail sat at 3.375 while the
 * carriageway sits at 3.0, the crossings at 3.5 and the centreline, kerbs and
 * markings at 3.75 and 4.0 -- so the road was drawn in front of the steel and
 * the track was painted over along most of its length.
 *
 * This took four sessions to see because the instrument was lying. Hiding a
 * layer and differencing the frame is the right measurement, but a camera move
 * REBUILDS layers and puts them back: measured, 253 of 2,218 meshes were
 * visible again 3.5 s after being hidden, and those 253 were precisely
 * `streets`, `street-uncovered` and `street-markings`. So every run that
 * concluded "hiding the roads changes nothing" had never hidden the roads.
 * `raildiff.mjs` now re-applies a hide after the settle and refuses to be
 * trusted unless it verifies that it held.
 *
 * At 6.5 the bed sits at 4.125 and the steel at 4.15, in front of everything
 * the road lays down. Cable camera 67 px -> 238, T Third 101 -> 117.
 *
 * BE HONEST ABOUT WHAT THIS COSTS: the note above wants the track "just above
 * the crosswalks and below the kerb", and the kerb is at `street-detail`'s 6,
 * so there is no gap left to sit in and the steel now passes in front of a
 * kerb it should duck under. A kerb crossed by a rail is a smaller error than
 * a railway that cannot be seen at all, and this is that trade taken
 * deliberately rather than a ladder read wrongly a second time. */
const RAIL_RUNG = 6.5;

/* ── AND THE LADDER'S STEP IS NOT WHAT THE TRACK HAS TO CLEAR ─────────────
 * The 0.25 m step separates the road's coplanar washes FROM EACH OTHER. The
 * track has to clear the road's whole stack AND whatever else stands over a
 * carriageway, and measurement says that takes about 10: at 4.125 the T Third
 * line paints 36 px of a 764,928 px frame, and pushed to 10.125 it paints
 * 4,035 -- a hundred and twelve times more. The same push at Nob Hill is
 * 130 -> 3,012.
 *
 * IT COSTS NOTHING TO LOOK AT. Seating is a translation along the view axis,
 * and in an orthographic projection that is PURE DEPTH: `pushscreen.mjs`
 * measured a 6-unit push moving a vertex **0.00 px** on screen and 1.5e-5 in
 * ndc z. This is not the 0.8 m lift `street-detail.ts` warns about, which
 * moves a line UP-SCREEN off its own street; nothing moves at all.
 *
 * Asking for it through `renderOrder` would have meant rung 30, claiming a
 * draw order this layer has no opinion about, so `engine.ts` takes an explicit
 * `washM` instead and the rung stays where the ladder wants it.
 *
 * What it buys is that the track wins depth against anything within 10 units
 * of it. Checked at district, street and close zoom at three cameras: the
 * steel stays on the street, still interrupted by the buildings that stand in
 * front of it, and does not float over a roof. */
const RAIL_SEAT_M = 10;

/**
 * ── EVERY WIDTH BELOW WAS RE-DERIVED FROM THE CAMERAS, NOT NUDGED ───────
 *
 * Daniel, on the first cut: *"i really dont distinguish the railroad ... it
 * looks like two lines not a RAILROAD ... if its a pixel issue just make sure
 * its viewable still for a close and medium zoom distance."* It was a pixel
 * issue, and the arithmetic says so. The map draws at 0.0776 px per metre at
 * its base scale, so a camera's own resolution is that times its zoom:
 *
 *     block   x5     2.58 m/px
 *     street  x12    1.07 m/px
 *     close   x24    0.54 m/px
 *
 * Against those, the first cut's bed was 4.2 m — 1.6 px at the block camera —
 * and its sleepers were 0.55 m every 2.4 m, which is half a pixel of timber
 * every two pixels at the street camera. That is not a ladder, it is noise,
 * and it resolves to a smear. The steel at 0.45 m was 0.4 px.
 *
 * So each is solved for the coarsest camera it has to survive rather than for
 * the deepest one it looks right at: the BED has to read as a continuous
 * corridor at the block camera (3 px, so 8 m), the SLEEPERS have to read as a
 * rhythm at the street camera (a timber over a pixel wide and a gap over two,
 * so 1.4 m every 4.0 m), and the STEEL has to be a pair rather than a smear
 * at the street camera (1.0 m at a 4.0 m gauge is two lines a pixel wide,
 * three pixels apart).
 *
 * These are DECLARED DRAWING CONVENTIONS and every one of them is several
 * times the real thing — a rail head is 0.07 m, a sleeper 0.25 m, standard
 * gauge 1.435 m. Nothing here is a measurement of any track. What IS from the
 * record is where the track goes and what kind it is.
 */
/** the ballast strip, world metres — 3 px at the block camera */
const BALLAST_W = 6.6;
/** its tone. RETUNED ON A SHOT OF DANIEL'S: at #a39a8a the ballast was a
 *  pale unbroken stripe and the whole track read as a paved median — "you
 *  cant see at all its a railways its just two lines grey in parallel". What
 *  says RAILWAY at a glance is not the steel and not the strip, it is the
 *  LADDER, so the bed is tuned to sit between the asphalt below it and the
 *  sleepers on it: measured off the frame, road (15,18,29), ballast
 *  (86,75,63), sleeper (48,40,31), steel (183,180,170). */
const BALLAST_C = 0x8a8073;
/** a sleeper's length across the track, and its width along it */
const SLEEPER_LEN_M = 5.8;
const SLEEPER_W_M = 1.15;
/** how far apart the sleepers are laid, world metres */
const SLEEPER_STEP_M = 2.4;
/** creosoted timber, warmer and darker than the ballast it sits in */
const SLEEPER_C = 0x231e19;
/** the steel itself */
const RAIL_C = 0xf2f5f7;

/**
 * ── AND A CABLE CAR TRACK IS NOT A BALLASTED ONE ────────────────────────
 *
 * `build_rail.py` carries a KIND on every segment, off the published
 * `lineabbr`: cable for CA/PH/PM, streetcar for F, metro for J/K/L/M/N/T. It
 * has been read and thrown away since the file was written — every metre of
 * track was drawn as the same ballasted bed, including Powell Street.
 *
 * A cable car is defined by the thing that makes it a cable car: the cable
 * runs under the street in a conduit and the car grips it through a SLOT
 * between the rails. That is not a detail of how San Francisco lays its
 * track, it is what the vehicle is. So a cable line is drawn as it is built —
 * set into paving, no ballast and no sleepers, with the slot down the middle
 * — and the ballast-and-sleeper bed is kept for the two kinds that run on
 * one. Which kind a segment is comes from the file; how each kind is DRAWN is
 * a convention, stated here.
 */
const SLOT_W = 1.2;
const SLOT_C = 0x241f1c;
/** the paving a cable track is set into, a shade off the carriageway */
const CABLE_BED_C = 0x7d776c;

/**
 * ── AND WHY A SEGMENT IS A CHAIN AND NOT A QUAD ─────────────────────────
 *
 * This is what was actually hiding the track, and it is not a tone.
 *
 * `build_rail.py` merges every pattern that shares a corridor and keeps the
 * result as straight runs, so a published segment is LONG: the median is
 * 59.4 m, the 99th is 303.8 m and the longest is 1,277.7 m. Each was drawn as
 * ONE quad with the ground sampled at its two ends only — a straight chord
 * from one end of a San Francisco hill to the other, sagging under the ground
 * everywhere between.
 *
 * MEASURED at the L Taraval camera, by sweeping how far the whole layer is
 * pushed toward the eye along the view axis and counting the pixels it wins
 * with the depth test on:
 *
 *     clearance   3.4 m ->    618 px
 *                 4.4 m ->    618
 *                 6.4 m ->  1,535
 *                11.4 m ->  5,745
 *                23.4 m ->  9,548        (7,491 is all it has)
 *
 * A surface that needs ELEVEN METRES of clearance is not losing a fight
 * between coplanar surfaces; it is under the hill. And it comes back
 * gradually rather than at a threshold, which is the signature of a chord
 * sagging, not of a rung being wrong.
 *
 * `layers/streets.ts` had already solved this for its own polygons —
 * `MAX_EDGE_M = 22` splits any triangle that spans more ground than that.
 * This is the same rule, applied along a ribbon rather than across a
 * triangle, and tighter because a track is narrow enough that its own sag is
 * the only thing holding it up.
 */
const RIB_STEP_M = 8;

/* ══ AND IT IS STILL NOT LEGIBLE, WHICH THIS SAYS RATHER THAN IMPLIES ═════
   Five separate defects are fixed above and every one of them is measured,
   but Daniel's actual complaint — *"it looks like two lines not a
   RAILROAD"* — is NOT answered yet, and nothing here should be read as
   claiming it is. At the L Taraval street camera the track is still not
   visible on Taraval Street.

   What has been RULED OUT, each by a measurement rather than by inspection:

     - it is not missing. Forced to flat red with the depth test off it
       paints 7,396 px at that camera, so the geometry is built, in frame and
       correctly placed in x and z.
     - it is not the rung. The clearance sweep needs ELEVEN metres before
       most of it appears, and moving it one rung is a quarter of a metre.
     - it is not the chord sag, which is what the 8 m subdivision above was
       for: the pixel count did not move when the segment count did.
     - it is not the height. Sampled against every other ground layer at one
       world point, the rail sits at worldY 8.76 with the streets at 8.43 and
       the terrain at 6.98 — above both, which is where it belongs.
     - it is not the year gate and not frustum culling, both checked.

   What remains, and what the next session should measure FIRST: how much of
   the 7,396 is genuinely behind buildings and street trees at a 315-degree
   axonometric camera over a dense low-rise grid. The 22-degree sun made
   every one of those shadows more than twice as long, and a 1 m rail under a
   street tree is not a rendering problem. If that is most of it, the answer
   is not another depth fix — it is that the drawn convention has to be
   WIDER again, because a track that is only visible where nothing overhangs
   it is a track nobody sees. */

export interface RailLayerOptions {
  scene: Scene;
  elevAt: (x: number, y: number) => number;
  /** vertical exaggeration of the ground, by camera step */
  zex: number;
}

interface RailFile {
  asOf: string;
  /** x0, y0, x1, y1, kind, and the year the city paid to lay it (0 = before the map opens) */
  segs: [number, number, number, number, string, number][];
  trackKm: number;
  lines: string[];
}

export async function railLayer(
  data: CityData,
  o: RailLayerOptions,
): Promise<(CityLayer & { trackKm: number; kinds: Record<string, number> }) | null> {
  let file: RailFile;
  try {
    const res = await fetch(`${data.assetBase}/base/rail.json`);
    if (!res.ok) return null;
    file = (await res.json()) as RailFile;
  } catch {
    /* a city with no rail file draws no rail, which is not an error */
    return null;
  }
  if (!file.segs?.length) return null;

  /* ── WHAT YEAR THIS LAYER CAN HONESTLY SPEAK FOR ───────────────────────
     `9exe-acju` is the CURRENT network and carries no dates of its own, which
     is why this layer drew at the present for as long as it did. It has dates
     now, and they are not guesses: the pipeline joins a year per line quoted
     from the Board's own record of paying for its construction — the Church
     street line's Contract No. 23 in 1917, Eaton & Smith's fifth payment on
     the Twin Peaks tunnel line in 1918, their first on Taraval in 1919, their
     fourth on Ocean View track and paving in 1925, their second on the Sunset
     line in 1928, and the Board's hearing on "the new T-Third Street MUNI
     line" in 2007.

     THE GATE IS THE TRACK, NOT THE ROUTE'S NAME. The F was branded in 1995 and
     Market Street has carried rail since the 1860s; gating the F's steel at
     1995 would leave Market bare for ninety years of a century that had five
     streetcar lines on it. A line older than the map's first frame carries
     year 0 and is drawn from the beginning — the convention `streets.ts` uses
     for a street its record is silent about.

     AND IT ONLY EVER GROWS. San Francisco's system peaked around 1920, most of
     it privately run, and what was torn up is not in today's geometry, so it
     cannot be drawn. The 1920s read emptier than the city was. That is the
     same floor the streets already stand on — a demolished street is not drawn
     either — and it is a limit on what this shows, not a claim about the city.

     This used to compare the scrub's year against the file's `asOf` YEAR, and
     that was wrong even though it looked right. `asOf` is a PUBLICATION
     timestamp — 2026-04-08 on the shipped file — so the test read
     `year >= 2026`. It produced present-only behaviour by accident, because no
     year the scrub can select reaches 2026, and it would have started drawing
     track across the whole century the moment somebody rebuilt the file from
     an older extract. A gate whose correctness depends on a build date is not
     a gate.

     `onYear(undefined)` is the present — `CityGLMap.tsx` turns the scrub's own
     maximum into `undefined` — and draws the whole network. */
  const asOf = String(file.asOf).slice(0, 10);

  /* ── THE BED AND THE STEEL CANNOT SHARE A MATERIAL ────────────────────
     They did, and it is most of why Daniel could not see a railroad. The one
     material was `metalness: 0.45`, chosen for the STEEL, and the ballast and
     the sleepers were being rendered through it too. A half-metal surface has
     half the diffuse term, so it shows the environment rather than its own
     colour — and the environment here is a small procedural sky. Every
     declared tone below therefore arrived washed toward one grey, which is
     exactly the "two lines" and not a track.

     Measured at a real cable segment: the layer paints 5,699 px at the close
     camera with the depth test on, so nothing was missing. It was there and
     it was the colour of the road it sits in.

     So: two buffers, two materials. Stone and creosote are matte, and only
     the rail head is metal. */
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const sPos: number[] = [];
  const sCol: number[] = [];
  const sIdx: number[] = [];
  const tPos: number[] = [];
  const tCol: number[] = [];
  const tIdx: number[] = [];
  const off = GAUGE_M / 2;
  let zex = o.zex;

  /* ── A PAIR OF HAIRLINES IS NOT A TRACK ────────────────────────────────
     Two rails alone, drawn at their honest 0.45 m, are 0.1 px wide at the
     district camera and about one pixel at the deepest one. Correctly placed
     and still invisible, which is the whole of *"i still dont see detailled
     railroad, tram tracks"*.

     What makes a track legible from above is not the steel. It is the BED:
     a ballast strip a few metres wide, and the ladder of sleepers across it.
     The strip survives to the district camera as a continuous line, the
     sleepers come in as a rhythm at the block camera, and the steel is the
     last thing to arrive — which is the order a real track resolves in.

     Every width here is a DECLARED DRAWING CONVENTION in the same sense
     `RAIL_W` already is, not a measurement of any track. */
  const c = new Color();
  /** which buffer a quad lands in — the matte bed, or the steel */
  const bed = { pos, col, idx };
  const ties = { pos: tPos, col: tCol, idx: tIdx };
  const steel = { pos: sPos, col: sCol, idx: sIdx };
  let into = bed;
  let liftM = RAIL_BED_LIFT_M;
  const quad = (
    ax: number, ay: number, bx: number, by: number,
    nx: number, ny: number, w: number, hex: number,
  ): void => {
    const h = w / 2;
    const az = o.elevAt(ax, ay) + liftM;
    const bz = o.elevAt(bx, by) + liftM;
    const i = into.pos.length / 3;
    into.pos.push(
      ax + nx * h, az, ay + ny * h,
      ax - nx * h, az, ay - ny * h,
      bx - nx * h, bz, by - ny * h,
      bx + nx * h, bz, by + ny * h,
    );
    c.setHex(hex, SRGBColorSpace);
    for (let k = 0; k < 4; k++) into.col.push(c.r, c.g, c.b);
    into.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };

  const kinds = { cable: 0, streetcar: 0, metro: 0, other: 0 };

  /* ── EMITTED IN THE YEAR THE CITY PAID TO LAY IT ───────────────────────
     `streets.ts` §EMITTED IN ACCEPTANCE-YEAR ORDER, for the same reason and
     with the same shape: sorting the segments by year makes the century scrub
     a DRAW RANGE rather than a rebuild of 175,000 vertices. Year 0 is an
     alignment older than the map's first frame -- the cable franchises and
     Market Street -- and sorts to the front, so it is drawn in every year. */
  const dated = [...file.segs].sort((a, b) => (a[5] || 0) - (b[5] || 0));
  const marks: { year: number; bed: number; ties: number; steel: number }[] = [];
  let lastYear = -1;
  for (const [x0, y0, x1, y1, kind, segYear] of dated) {
    const yr = segYear || 0;
    if (yr !== lastYear) {
      if (lastYear >= 0) marks.push({ year: lastYear, bed: idx.length, ties: tIdx.length, steel: sIdx.length });
      lastYear = yr;
    }
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    if (!(L > 1e-6)) continue;
    const nx = -dy / L;
    const ny = dx / L;
    const ux = dx / L;
    const uy = dy / L;
    const cable = kind === "cable";
    kinds[kind === "cable" || kind === "streetcar" || kind === "metro" ? kind : "other"]++;

    /* the bed, a CHAIN of strips along the segment. A cable track is set into
       paving and a ballasted one is not, so the two are the same strip in a
       different tone — see §AND A CABLE CAR TRACK IS NOT A BALLASTED ONE. */
    const steps = Math.max(1, Math.ceil(L / RIB_STEP_M));
    const rib = (
      w: number, hex: number, lateral: number,
    ): void => {
      for (let k = 0; k < steps; k++) {
        const ta = (k / steps) * L;
        const tb = ((k + 1) / steps) * L;
        quad(
          x0 + ux * ta + nx * lateral, y0 + uy * ta + ny * lateral,
          x0 + ux * tb + nx * lateral, y0 + uy * tb + ny * lateral,
          nx, ny, w, hex,
        );
      }
    };
    rib(BALLAST_W, cable ? CABLE_BED_C : BALLAST_C, 0);

    if (cable) {
      /* the slot the grip reaches through, down the centre and unbroken */
      rib(SLOT_W, SLOT_C, 0);
    } else {
      /* the sleepers, across it. Stepped in world metres so the rhythm is the
         same on a long segment and a short one, and offset from the segment's
         own start so two segments meeting at a corner do not double up. */
      into = ties;
      liftM = RAIL_TIE_LIFT_M;
      /* ── AND THIS IS WHY THERE WAS NEVER A LADDER ───────────────────
         `quad(a, b, nx, ny, w)` offsets BOTH ends by +-(nx, ny) * w/2, so
         (nx, ny) has to be PERPENDICULAR to a -> b or the four corners come
         out collinear. A sleeper ran a -> b along the track at (ux, uy) and
         passed (ux, uy) as the normal as well: parallel, zero area, nothing
         drawn. Every crosstie in the city was a degenerate sliver, which is
         exactly what "its just two lines grey in parallel" looks like — the
         ballast strip and the two rails, and no ties between them, because
         the ties had no area to rasterise.

         A sleeper lies ACROSS the track. So a -> b runs along the normal for
         SLEEPER_LEN_M, and the width it is given is its thickness ALONG the
         track, offset by (ux, uy). */
      const half = SLEEPER_LEN_M / 2;
      for (let t = SLEEPER_STEP_M * 0.5; t < L; t += SLEEPER_STEP_M) {
        const cx = x0 + ux * t;
        const cy = y0 + uy * t;
        quad(
          cx - nx * half, cy - ny * half,
          cx + nx * half, cy + ny * half,
          ux, uy, SLEEPER_W_M, SLEEPER_C,
        );
      }
      into = bed;
      liftM = RAIL_BED_LIFT_M;
    }

    /* and the steel, one ribbon each side of the centreline */
    into = steel;
    liftM = RAIL_STEEL_LIFT_M;
    for (const sgn of [-off, off]) rib(RAIL_W, RAIL_C, sgn);
    into = bed;
    liftM = RAIL_BED_LIFT_M;
  }
  if (lastYear >= 0) marks.push({ year: lastYear, bed: idx.length, ties: tIdx.length, steel: sIdx.length });

  /** one buffer set -> one mesh, so the two can carry different materials */
  const build = (
    P: number[], C: number[], I: number[],
    mat: MeshStandardMaterial, rung: number,
  ): { mesh: Mesh; posArr: Float32Array } => {
    const g = new BufferGeometry();
    const posArr = new Float32Array(P);
    g.setAttribute("position", new Float32BufferAttribute(posArr, 3));
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(C), 3));
    g.setIndex(I);
    g.computeVertexNormals();
    const mesh = new Mesh(g, mat);
    mesh.scale.y = zex;
    mesh.renderOrder = rung;
    mesh.userData.wash = true;
    /* BALLAST, SLEEPERS, STEEL — three seats, in that order. Each part of a
       track lies on the one below it, and coplanar parts of one mesh speckle
       rather than stack: the sleepers were quads in the ballast's own buffer
       and came out as scattered dots on a smooth band. The rung carries the
       order (6.5 / 6.55 / 6.6) and this turns it into depth. */
    mesh.userData.washM = RAIL_SEAT_M + (rung - RAIL_RUNG) * 3;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    o.scene.add(mesh);
    return { mesh, posArr };
  };

  /* ── THE BED IS STONE AND TIMBER, AND NEITHER OF THEM SHINES ─────────
     Matte, so the ballast is the ballast's colour and the sleeper is the
     sleeper's. This is the material the first cut did not have, and its
     absence is why every tone in the bed arrived as the same grey. */
  const bedMat = new MeshStandardMaterial({
    vertexColors: true,
    metalness: 0,
    roughness: 0.95,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: RAIL_OFFSET,
    polygonOffsetUnits: RAIL_OFFSET,
  });

  /* ── STEEL, AND IT IS NOT FULLY METAL — AN EARLIER CUT GOT THAT WRONG ─
     This is the one surface in the fabric meant to be specular; everything
     around it is matte by intent, so the sky environment `engine.ts` builds
     lands here and nowhere else on the ground.

     Shipped at metalness 0.95 once and the track came out nearly BLACK. That
     is correct PBR and a bad picture: a metal has no diffuse term at all, it
     shows only what it reflects, and the environment here is a 32x16
     procedural sky at half intensity. Give a mirror nothing to mirror and it
     returns nothing.

     Half metal keeps a diffuse floor, so the rail is a bright line in sun and
     a grey one in shade instead of a black one in both — which is what steel
     in a street actually looks like from above. What has changed is WHAT
     WEARS IT: the two rails, and not the bed they are laid in.

     ── AND THE SUN COMING DOWN TOOK THE REST OF IT ─────────────────────
     0.45 was solved against a 40-degree sun. At 22 the beam arrives at a
     grazing angle on an up-facing surface and the environment does the rest
     of the work, so a half-metal rail went dark again — the track read as two
     dotted lines on a boulevard, which is the complaint this was meant to
     answer. 0.15 keeps a glint without spending the albedo on a dim sky, and
     the albedo is what has to carry a 1 m line at 1 px. */
  const steelMat = new MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.15,
    roughness: 0.4,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: RAIL_OFFSET,
    polygonOffsetUnits: RAIL_OFFSET,
  });

  const bedMesh = build(pos, col, idx, bedMat, RAIL_RUNG);
  /* ── THE SLEEPERS ARE THEIR OWN MESH, AND THAT IS THE WHOLE POINT ─────
     They were quads in the BED's buffer, at the bed's lift and the bed's
     seat, so a sleeper and the ballast under it were exactly coplanar. The
     ladder did not lose -- it SPECKLED, and at the close camera Daniel's
     shot showed the crossties as a row of scattered dots on a smooth tan
     band. A railway seen from above is mostly its sleepers; without them
     this is a stripe with two lines on it.

     Its own mesh gets its own seat, and a seat is depth along the view axis,
     which costs nothing on screen. */
  const tieMesh = build(tPos, tCol, tIdx, bedMat, RAIL_RUNG + 0.05);
  /* the steel sits ON the sleepers */
  const steelMesh = build(sPos, sCol, sIdx, steelMat, RAIL_RUNG + 0.1);
  const mesh = bedMesh.mesh;
  const posArr = bedMesh.posArr;
  const meshes = [bedMesh, tieMesh, steelMesh];

  /* ── THE BAND'S EXAGGERATION IS A SCALE, NOT SOMETHING TO BAKE ────────
     This layer used to multiply `zex` into every vertex and leave the mesh at
     scale 1. It was wrong, and it was wrong in the way that hides itself: the
     track came out at the right x and z, so nothing looked misplaced -- it was
     simply UNDER the ground, and a buried mesh is indistinguishable from a
     layer that was never built.

     MEASURED against the terrain mesh at the same point: the ground's own
     vertex sat at 57 m with `mesh.scale.y = 3.3` on it, so it draws at 188.
     The rail's vertex read 159, because the `zex` it had baked in was 2.79 --
     a different band's. Twenty-nine units below the ground, everywhere, and
     the layer has been invisible since the day it was written.

     So it is done the way `layers/surround.ts` and the terrain itself do it:
     positions stay in REAL METRES and the band's exaggeration is a scale on
     the mesh. The two cannot drift apart again, because there is no longer a
     second copy of the number to go stale. The lift is scaled with everything
     else, which is right -- it is there to clear z-fighting with a road that
     is being exaggerated by the same factor. */
  for (const b of meshes) b.mesh.geometry.computeBoundingSphere();
  void mesh;
  void posArr;

  return {
    name: "rail",
    trackKm: file.trackKm,
    kinds,
    onStep(_step: number, z: number): void {
      zex = z;
      for (const b of meshes) b.mesh.scale.y = zex;
    },
    onYear(year: number | undefined): void {
      /* ── THE TRACK ARRIVES AS THE CITY PAID FOR IT ────────────────────
         This used to be `visible = year === undefined` — the present and
         nowhere else — because the file carried no dates and inventing them
         was worse than withholding them. It carries them now, quoted from the
         Board's own record of paying for each line's construction, so the gate
         is the same draw range `streets.ts` uses: the segments were emitted in
         year order, so showing a year is choosing how far along the buffer to
         stop. `asOf` stays a provenance string and never a test.

         `undefined` is the present and draws everything. */
      void asOf;
      let bed = idx.length;
      let tie = tIdx.length;
      let steel = sIdx.length;
      if (year !== undefined) {
        bed = 0;
        tie = 0;
        steel = 0;
        for (const m of marks) {
          if (m.year > year) break;
          bed = m.bed;
          tie = m.ties;
          steel = m.steel;
        }
      }
      for (const b of meshes) {
        const ro = b.mesh.renderOrder;
        const count =
          ro >= RAIL_RUNG + 0.1 ? steel : ro >= RAIL_RUNG + 0.05 ? tie : bed;
        b.mesh.geometry.setDrawRange(0, count);
        b.mesh.visible = count > 0;
      }
    },
    dispose(): void {
      for (const b of meshes) {
        o.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
      }
      bedMat.dispose();
      steelMat.dispose();
    },
  };
}
