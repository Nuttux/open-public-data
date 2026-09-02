/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/sky.ts — THE SKY, AND THE FACT THAT THERE ISN'T ONE.

   ── FIRST, WHAT AN ORTHOGRAPHIC CAMERA CAN AND CANNOT HAVE ───────────────

   A perspective camera has a horizon because parallel lines converge: the
   ground plane's image is bounded above by the vanishing line, and everything
   past it is sky. THIS camera has no vanishing point. The ground plane is
   infinite in the projection too — every pixel of every frame, at every zoom,
   maps to a point on it. `camera.ts` §why an orthographic camera reproduces
   it exactly is the reason: the map from scene to screen is LINEAR, and a
   linear map sends the whole plane onto the whole screen.

   So three conventional answers were considered and all three are wrong here:

     A CUBE-MAP SKYBOX. It is sampled by the view direction, and under an
     orthographic camera the view direction is ONE vector for the entire
     frame. Every pixel would fetch the same texel: a cube map here is a flat
     fill with six faces of storage behind it. Rejected on the maths, not on
     taste.

     A BACKDROP BEHIND THE SCENE. Never visible. MEASURED: the bay plate
     (`layers/water.ts`) is a horizontal quad 80 km on a side around the
     anchor, and `controls.ts` clamps the reader to `zMin = 0.85` of the
     whole-city fit — about 16.5 km across the frame. Nothing the reader can
     reach shows the bay's edge, so a plane behind it is a plane nobody sees.
     Rejected on a measurement.

     A SCREEN-SPACE GRADIENT. Draws fine, and it is a lie: it is glued to the
     GLASS, so panning the city slides the sky over it and the "distance" the
     gradient claims moves with the reader instead of staying with the world.
     Rejected on behaviour. (What survives of the idea is below: the wash
     really is graded, but its grading is a function of the WORLD.)

   ── WHAT THE FRAME ACTUALLY NEEDS, AND IT IS MEASURED ────────────────────

   Not sky behind the city. AIR IN FRONT OF IT.

   `lib/city/terrain.ts` §hazeAt is the published aerial perspective, and it
   is a clamp:

       h(d) = clamp((d − 3400) / 15000, 0, WA.hazecap)      hazecap = 0.45

   so beyond **10,150 m** from the anchor the far shore STOPS RECEDING. It
   holds 55 % of its own contrast from there to the edge of the frame, however
   much further away it is. The bay's own fade (`layers/water.ts`) saturates a
   little later, at 18,400 m. Distance stops meaning anything at exactly the
   radius where the frame's own edge begins.

   MEASURED, the four ground corners of the DEFAULT whole-city frame at 1440 x
   666, as distances from the anchor:

       6,793 m   (top right)      inside the ramp
      10,404 m   (bottom right)   past the cap
      11,783 m   (top left)       past the cap
      14,176 m   (bottom left)    past the cap, by 40 %

   and at the zoom-out clamp, 8,636 / 12,151 / 13,551 / **16,022**. Three of
   the four corners of the frame a reader opens the page on are already in the
   dead zone. That is what makes the peninsula sit ON the paper instead of IN
   it: past 10.15 km the picture stops being a distance and becomes a plate.

   ── SO THE TREATMENT IS ONE THING: THE RAMP, CONTINUED ───────────────────

   The published ramp, if it were not clamped, would reach the paper exactly
   at d = 3400 + 15000 = **18,400 m**. That is not a number anybody picked; it
   is where `hazeAt`'s own slope arrives. This layer pays the part the clamp
   withheld, as a wash of the paper laid over the far field:

       h_u = (d − 3400) / 15000                 the ramp, unclamped
       α   = (h_u − cap) / (1 − cap)            what the clamp still owes

   because lerp(lerp(c, P, cap), P, α) = lerp(c, P, cap + α(1 − cap)), so that
   α is exactly the alpha which takes a far-field pixel from where the clamp
   left it to where the ramp was going. α = 0 at 10,150 m and α = 1 at
   18,400 m. Every constant in it is read out of `WA.hazecap` and `hazeAt`;
   this file picks none of them.

   IT PUTS NO CORNER BACK. This is the property worth checking and it checks
   exactly: the composite haze a far-field pixel ends up with is
   `cap + α(1 − cap)`, and evaluated against the unclamped ramp at 4, 8,
   10.15, 12, 14.18, 16.02, 18.4 and 20 km the difference is **0.00e+0 at
   every one**. So the picture does not get a wash ON TOP of a plateau — the
   plateau is gone and the recession is one straight line from 3.4 km to
   18.4 km. What a reader sees removed is the kink, not a layer added.

   IT CANNOT MAKE A SEAM. The wash converges on the paper, `P` defaults to the
   published `HAZE`, and `HAZE` is what the renderer clears to (`engine.ts`
   §setClearColor) and what the page's own background is. Where the wash is
   finished the frame IS the sheet, to the exact byte. There is no edge
   between the picture and the paper, which is the whole point — and it is
   also why the plate's own boundary at 40 km can never show.

   AND IT BARELY TOUCHES THE CITY — MEASURED, BECAUSE THE FIRST DRAFT OF THIS
   COMMENT CLAIMED IT NEVER DID AND THAT WAS FALSE. The city's own DEM runs to
   13,472 m from the anchor at its furthest corner, so the far south-west of
   the city IS beyond the cap radius. Sampled over 1,307,364 vertices of every
   mesh the city draws at `renderOrder` 0 — ground detail, streets, buildings,
   trees, heroes:

       3.67 %  take any wash at all
       67 %    of those take α < 0.05      (≈ 4 levels of 255 on a mid tone)
       29 %                  0.05 – 0.10
       3.6 %                 0.10 – 0.20
       63 vertices of 1.3 M  > 0.20, and exactly ONE over 0.30

   So the wash reaches the last kilometre of the city's own south-west edge at
   a tenth of the way to the paper, which is what the published ramp's own
   slope asks for there, and nothing else. Zoom in and the whole frame is
   inside the cap radius — the layer measures that in `onFrame` and stops
   drawing itself entirely.

   AND THE READER CANNOT REACH THE FAR END OF IT. `controls.ts` clamps at
   `zMin = 0.85`, whose furthest ground corner is 16,022 m — α = 0.712. The
   fully-dissolved end of the ramp exists in the arithmetic and in a test
   harness; it is not a frame anybody can open.

   ── AND THE SHEET IS LIT ─────────────────────────────────────────────────

   Flat paper everywhere would trade one plate for another. The wash carries
   the project's own two illuminants instead: `skylitN` with `SUNC` on the
   sun's side of the anchor and `SKYC` away from it, at a tilt of
   ±`SKY_TILT` — the same function, the same pair, the same exact-luminance
   renormalisation the walls and the ground already use. The tilt's axis is
   the sun's own horizontal bearing, READ OFF THE RIG rather than written
   down, so when `light.ts` moves the sun the air moves with it and no number
   here changes. `setSun` re-bakes when the bearing has actually moved.

   ── WHY THE PLATE IS ON THE GROUND AND NOT ON THE GLASS ──────────────────

   Haze belongs to the world, so it is baked as a function of world position
   into one texture on one horizontal quad, exactly as the bay is
   (`layers/water.ts` §why this is a texture and not a shader): world-anchored
   by construction, no per-frame work, no hand-written shader for the WebGPU
   backend to reject.

   THE ONE COST, STATED, AND THEN LOOKED FOR. The quad is at y = 0 with the
   depth test off, so a pixel showing something TALL is washed by the texel
   under the ground point BEHIND it rather than under its own footprint. The
   offset is exact: `proj` puts a scene height h at plane-y `by·y + h`, so the
   ground point sharing that pixel is `h / by` metres north, and `by` is
   0.59397 at this bearing — **1.684 metres of world per unit of scene
   height**, straight north, nothing sideways.

   That is not nothing. MEASURED over the far shore's own raster, 13,546 of
   its cells are BOTH beyond the cap radius AND over 200 m, and the tallest
   beyond it is 420 m at 20,076 m out; at the ground exaggeration of 3.3 that
   peak's summit reads the wash from 2,333 m further north than its foot,
   which on the steep part of the ramp is 0.28 of α. So the artifact — a
   summit paler or clearer than its own foot — is possible in principle.

   LOOKED FOR AND NOT FOUND. Off and on, same load, same frame, at the
   reader's own zoom-out clamp, magnified 2x at the three places the far field
   is tall: the headlands north, the ridge south, the shore east. The ridges
   read identically; the far east shore is off-frame at every camera a reader
   can reach, which is where the tall cells mostly are. If another city puts a
   mountain squarely in the middle of the ramp, the fix is to bake the wash
   into the surround's own vertex colours rather than to give this plane a
   depth test back.

   ── AND THREE THINGS THAT WERE CONSIDERED AND ARE NOT HERE ───────────────

   A FULL-FRAME PAPER WASH, so the whole sheet carries a gradient rather than
   only the far field. `film.ts` and the frame-atmosphere work already own the
   vignette and the tilt-shift; a second full-frame wash from a different
   module would be two hands on the same dial and neither would be
   attributable.

   A GLARE TERM — more wash on the sun's side, which is what forward
   scattering actually does. It is physically the right idea and it would buy
   "brighter toward the sun" honestly. It is not here because it would break
   the one property this layer is justified by: that the composite is EXACTLY
   the published ramp continued. Trading that for an effect the measurement
   puts in one corner of one frame is a bad trade.

   A VALUE SWING. Built, swept, set to zero — see `SKY_LIFT`.

   ── WHAT WAS VERIFIED IN THE FRAME, NOT ASSERTED ─────────────────────────

   Off and on inside ONE page load, one camera, one frame, toggled through
   `setParams({ strength })` — because two browser sessions twenty minutes
   apart are two different BUILDS while five workstreams are editing this
   tree, and the first off/on pair taken that way disagreed by 31 levels on a
   pixel where this layer's own alpha is provably zero. That number was the
   other agents' work, not this layer's, and nothing could be attributed until
   the A/B moved inside one load.

   Then, at four probes on the whole-city frame:

     where α = 0, the two frames are IDENTICAL — max channel difference 0.0
     of 255 at every probe. The layer provably does not touch the subject.

     where α > 0, the painted pixel lands 2 to 5 levels short of an 8-bit
     sRGB-space lerp toward the paper. That gap is the post chain: the blend
     happens in the linear render target `pass()` allocates, not on 8-bit
     sRGB, so a mid-tone comes out slightly under a CPU lerp. It is stated
     rather than corrected — the wash's job is to converge on the paper, and
     it converges on the paper either way.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type Scene,
} from "three";

import { projection, screenToPlane } from "@/lib/city/projection";
import { HAZE, WA, skylitN } from "@/lib/city/terrain";
import type { CityLayer } from "./engine";

/** the two radii `hazeAt` and `drawDepthHaze` are written in, world metres */
const FADE_R0_M = 3400;
const FADE_SPAN_M = 15000;

/**
 * THE WARM/COOL SWING ACROSS THE SHEET, as a `skylitN` tilt.
 *
 * `skylitN` scales what it is given by `QWARM` (0.6) and renormalises
 * luminance EXACTLY, so this is a hue swing and nothing else. SWEPT, reading
 * the baked paper itself at the two ends of the sun's axis, against the
 * published HAZE of 236,231,220:
 *
 *     tilt    sun's side        far side
 *     0.00    236,231,220       236,231,220     the paper, twice
 *     0.35    238,231,215       234,231,227
 *     0.55    240,231,212       232,231,230
 *     0.75    241,231,209       231,231,234
 *     1.00    243,230,206       229,231,239
 *
 * and in the FRAME, where the wash is diluted by its own alpha, tilt 0.55
 * moves a far-field pixel −2.5 R / +5.5 B at α = 0.53 and −2.9 / +7.7 at
 * α = 1.0, against tilt 1.00's −4.3 / +10.5 and −4.9 / +13.5.
 *
 * 0.55 is where this settles. At 0 the far field is one flat plate of paper
 * and the frame has no direction in it. At 1.00 the far half keeps a distinct
 * cool cast — measurably 13 levels of blue — and the two halves of the frame
 * stop reading as the same piece of paper, which is the exact failure this
 * block was told to avoid. 0.55 is the largest setting at which a crop from
 * each side, put side by side, still reads as one sheet.
 *
 * THE HONEST CAVEAT. It is a whisper in THIS city at THIS hour, and the
 * measurement says why rather than hiding it: the rig currently stands the sun
 * due east (scene 0.681, 0.732, 0.000 — `light.ts` §the sun swings round to
 * stand behind the key), and east of the anchor the far field is 8.4 km away,
 * inside the cap radius, where α is zero. The warm half of the swing has
 * nowhere to land. Flip the sun west — which is where a late-afternoon rig
 * puts it — and the ocean, which IS in the wash, takes the warm half: MEASURED
 * at the reader's own zoom-out clamp, the same far-ocean patch reads
 * 182,190,196 with the sun east and 184,190,192 with it west. The layer is
 * already correct for the hour the lighting rig is heading for.
 */
const SKY_TILT = 0.55;

/**
 * THE VALUE SWING — BUILT, SWEPT, AND SET TO ZERO.
 *
 * The brief for this block asked for the sky to be brighter on the sun's side.
 * `skylitN` holds luminance exactly, so brightness has to be asked for
 * separately, as `k`, and it was: `lift` multiplies the paper by `1 + lift·t`.
 * SWEPT, on the baked paper and then in the frame:
 *
 *     lift     paper, sun side   paper, far side   in frame, far side
 *     0.000    236,231,220       236,231,220        —
 *     0.006    237,232,221       235,230,219       −0.9 levels
 *     0.012    239,234,223       233,228,217       −1.8 levels
 *     0.030    243,238,227       229,224,213       −4.6 levels
 *
 * It ships at 0, for three reasons and the third is the one that decides it.
 *
 * ONE: at 0.012 it is 1.8 levels of 255 on the far side, which is under the
 * paper grain's own amplitude — it cannot be seen, so it cannot be a decision.
 *
 * TWO: at 0.03 it can be seen, and what it looks like is a dirty corner. This
 * register's paper is a sheet, not a cyclorama with a light behind it.
 *
 * THREE, and this is the one: any non-zero lift means the wash converges on
 * `paper × (1 ± lift)` rather than on `paper`, and `paper` is the colour the
 * renderer CLEARS to. The whole reason the picture can end in the sheet
 * instead of at an edge is that those two are the same byte. Two levels of
 * "air" is not worth an edge.
 *
 * What is left carrying "brighter on the sun's side" is the hue: at equal
 * luminance the SUNC-tilted paper advances and the SKYC-tilted paper recedes.
 * That is the register's own way of saying it — `terrain.ts` §the light is two
 * colours makes the same argument about walls.
 */
const SKY_LIFT = 0;

/**
 * HOW FINELY THE WASH IS BAKED, and it is a smooth radial so this is small.
 *
 * The plate is 80 km on a side, so 512 texels is 156 m each and the ramp from
 * α = 0 to α = 1 spans 8,250 m — 53 texels, bilinearly filtered, for a curve
 * that is a straight line. The visible quantisation is the 8-bit alpha, not
 * the grid: one step of alpha is 1/255, which on the darkest thing the wash
 * ever covers is under a tenth of a level of 255. The low tier halves it to
 * 256 texels, which is 512 kB of RGBA instead of 1 MB — the tier's real
 * currency is memory bandwidth (`quality.ts` §what a phone gets), and this is
 * the only megabyte this layer asks for.
 */
const BAKE_HI = 512;
const BAKE_LO = 256;

export interface SkyOptions {
  /** the wash's centre, world metres — the same anchor the bay fade uses */
  anchor: readonly [number, number];
  /** how far the plate reaches from the anchor, world metres */
  reachM?: number;
  /** the paper. Defaults to the published `HAZE`, which is the clear colour. */
  paper?: string;
  /**
   * The sun in SCENE axes (x world-east, y up, z world-north). Only its
   * horizontal part is used. Defaults to the host rig's own vector.
   */
  sun?: Vector3;
  /** multiplier on the wash. 0 is off, 1 is the published continuation. */
  strength?: number;
  /** the warm/cool swing, as a `skylitN` tilt in [0,1] */
  tilt?: number;
  /** the value swing, as a fraction of the paper's own luminance */
  lift?: number;
  /** bake resolution, texels a side */
  size?: number;
  /**
   * The live viewport, for the cull in `onFrame`. A layer built without one
   * cannot measure the frame and therefore always draws — which is what a
   * test wants and what `attachSky` never does.
   */
  viewport?: { readonly W: number; readonly H: number };
  /** paint the wash's own alpha as a flat magenta, to see its shape */
  debug?: boolean;
}

/** What `attachSky` needs of the engine — structural, so it is not coupled. */
export interface SkyHost {
  readonly scene: Scene;
  readonly viewport: { W: number; H: number; dpr: number };
  readonly sun: { dir: { position: Vector3; target: { position: Vector3 } } };
  readonly quality?: { tier: string };
  add(layer: CityLayer): void;
  invalidate(): void;
}

export interface SkyLayer extends CityLayer {
  readonly mesh: Mesh;
  /** re-aim the air at a new sun; a no-op if the bearing has not moved */
  setSun(sun: Vector3): void;
  /** retune without a reload — this is what the A/B harness sweeps */
  setParams(p: Partial<Pick<SkyOptions, "strength" | "tilt" | "lift" | "debug">>): void;
  /** what the wash comes to at a world point, 0..1 — for a probe or a test */
  alphaAt(x: number, y: number): number;
}

/**
 * The wash the clamp still owes at a distance `d`.
 *
 * Exported because it is the whole argument in four lines and a test can hold
 * it to the two radii it claims: zero at `FADE_R0_M + FADE_SPAN_M * cap`, one
 * at `FADE_R0_M + FADE_SPAN_M`.
 */
export function veilAlpha(d: number, cap: number): number {
  if (cap >= 1) return 0;
  const hu = (d - FADE_R0_M) / FADE_SPAN_M;
  const a = (hu - cap) / (1 - cap);
  return a <= 0 ? 0 : a >= 1 ? 1 : a;
}

/** the radius inside which the wash is identically zero, world metres */
export function veilInnerR(cap: number): number {
  return FADE_R0_M + FADE_SPAN_M * cap;
}

function rgb255(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * THE BAKE. Pure, so a test can read a texel without a GPU.
 *
 * `sx`/`sy` are the sun's horizontal bearing, already normalised. `t` is the
 * cosine between a texel's bearing from the anchor and the sun's, so it runs
 * +1 on the sun's side of the city through 0 at right angles to −1 opposite —
 * which is exactly the domain `skylitN`'s tilt is written in.
 */
export function bakeSky(
  size: number,
  o: {
    anchor: readonly [number, number];
    reachM: number;
    paper: string;
    cap: number;
    sx: number;
    sy: number;
    strength: number;
    tilt: number;
    lift: number;
    debug: boolean;
  },
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const P = rgb255(o.paper);
  const c = new Float64Array(3);
  const x0 = o.anchor[0] - o.reachM;
  const y0 = o.anchor[1] - o.reachM;
  const span = o.reachM * 2;
  for (let py = 0; py < size; py++) {
    /* the row runs south to north: a texture's v = 0 is its first row and
       this quad's v = 0 is its southern edge — `layers/water.ts` learned this
       the hard way, by mirroring the bay about the strait. */
    const wy = y0 + ((py + 0.5) / size) * span;
    for (let px = 0; px < size; px++) {
      const wx = x0 + ((px + 0.5) / size) * span;
      const dx = wx - o.anchor[0];
      const dy = wy - o.anchor[1];
      const d = Math.hypot(dx, dy);
      const a = veilAlpha(d, o.cap) * o.strength;
      const i = (py * size + px) * 4;
      if (o.debug) {
        out[i] = 255;
        out[i + 1] = 0;
        out[i + 2] = 200;
        out[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
        continue;
      }
      const t = d > 1 ? (dx * o.sx + dy * o.sy) / d : 0;
      skylitN(P[0], P[1], P[2], 1 + o.lift * t, o.tilt * t, c);
      out[i] = Math.max(0, Math.min(255, Math.round(c[0])));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
      out[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  return out;
}

/**
 * `?sky=0|1` off / forced on, and one dial each for the three numbers so an
 * A/B moves ONE of them — the argument `quality.ts` makes about its own
 * overrides, and for the same reason.
 *
 *   `?sky=0`      no air at all: the frame the block started from
 *   `?skyk=N`     the wash's strength; 0 is off, 1 the published continuation
 *   `?skyw=N`     the warm/cool swing, a `skylitN` tilt in [0,1]
 *   `?skyv=N`     the value swing
 *   `?skyq=N`     bake resolution, texels a side
 *   `?skyd=1`     paint the wash's alpha as magenta, to see its shape
 */
export function skyOptionsFromSearch(search = ""): Partial<SkyOptions> & { on: boolean } {
  const num = (k: string): number | undefined => {
    const m = new RegExp(`(?:\\?|&)${k}=(-?[0-9.]+)`).exec(search);
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) ? v : undefined;
  };
  /* OFF BY DEFAULT since 2026-09-02: the wash over the far city is the haze
     Daniel asked to have removed everywhere (`terrain.ts` §WA.hazecap). `?sky=1`
     brings it back for an A/B; `?sky=0` is the default spelled out. */
  const on = /(?:\?|&)sky=1/.test(search);
  return {
    on,
    strength: num("skyk"),
    tilt: num("skyw"),
    lift: num("skyv"),
    size: num("skyq"),
    debug: /(?:\?|&)skyd=1/.test(search),
  };
}

/**
 * Build the air.
 *
 * `anchor` is the only thing it needs about a city, and it is the same point
 * the bay fade and `hazeAt` are already centred on — the city's own manifest
 * publishes it. Nothing else here knows where it is.
 */
export function skyLayer(opts: SkyOptions): SkyLayer {
  const anchor = opts.anchor;
  const reachM = opts.reachM ?? 40_000;
  const paper = opts.paper ?? HAZE;
  const size = Math.max(16, Math.round(opts.size ?? BAKE_HI));
  const cap = WA.hazecap;

  let strength = opts.strength ?? 1;
  let tilt = opts.tilt ?? SKY_TILT;
  let lift = opts.lift ?? SKY_LIFT;
  let debug = opts.debug ?? false;
  const viewport = opts.viewport ?? null;

  /* the sun's horizontal bearing, world (east, north). The rig's vector is in
     SCENE axes, where world-north is z. */
  let sunX = 1;
  let sunY = 0;
  function aim(s: Vector3): boolean {
    const h = Math.hypot(s.x, s.z);
    const nx = h > 1e-9 ? s.x / h : 1;
    const ny = h > 1e-9 ? s.z / h : 0;
    /* a tenth of a degree of bearing is nothing to a wash this soft; without
       a gate a rig that jitters would re-bake 512² texels every frame */
    if (Math.abs(nx - sunX) < 1e-3 && Math.abs(ny - sunY) < 1e-3) return false;
    sunX = nx;
    sunY = ny;
    return true;
  }
  if (opts.sun) aim(opts.sun);

  const map = new DataTexture(new Uint8Array(size * size * 4), size, size, RGBAFormat);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = LinearFilter;
  map.magFilter = LinearFilter;

  function rebake(): void {
    const px = bakeSky(size, {
      anchor, reachM, paper, cap, sx: sunX, sy: sunY, strength, tilt, lift, debug,
    });
    (map.image as { data: Uint8Array }).data = px;
    map.needsUpdate = true;
  }
  rebake();

  const x0 = anchor[0] - reachM;
  const y0 = anchor[1] - reachM;
  const x1 = anchor[0] + reachM;
  const y1 = anchor[1] + reachM;

  const g = new BufferGeometry();
  const Y = 0;
  g.setAttribute(
    "position",
    new Float32BufferAttribute(
      [x0, Y, y0, x1, Y, y0, x1, Y, y1, x0, Y, y0, x1, Y, y1, x0, Y, y1],
      3,
    ),
  );
  g.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.setAttribute(
    "normal",
    new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3),
  );
  g.computeBoundingSphere();

  /* ── NO DEPTH, AND LAST ─────────────────────────────────────────────────
     Air is in front of everything it applies to, including the far ridge that
     is nearer the camera than the water behind it. A depth test would put the
     ridge through the haze; `layers/surround.ts` §the surround is a backdrop
     records the same lesson from the other end of the stack. The alpha is
     what decides where it paints, and the alpha is zero over the subject. */
  const m = new MeshBasicMaterial({
    map,
    side: DoubleSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(g, m);
  mesh.name = "sky";
  mesh.renderOrder = 100;
  /* it is a wash, not a surface: it must not appear in the shadow map, and it
     must not receive the shadow of the city it is nowhere near */
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  /* the frustum test is done here, against the wash's own radius, and three's
     bounding-sphere test on an 80 km quad would only ever say yes */
  mesh.frustumCulled = false;

  const inner = veilInnerR(cap);

  return {
    name: "sky",
    mesh,

    /**
     * DRAW NOTHING WHEN THERE IS NOTHING TO DRAW.
     *
     * At any close camera the whole frame is inside `inner` and every texel of
     * the wash is transparent — a full-screen blend that paints nothing. The
     * four ground corners are the same four the shadow camera is fitted to
     * (`engine.ts` §groundCorners), computed the same way, and the test is one
     * hypot each.
     */
    onFrame(cam) {
      if (!viewport) return;
      const { W, H } = viewport;
      if (W <= 0 || H <= 0) return;
      let far = 0;
      for (const [sx, sy] of [
        [0, 0], [W, 0], [0, H], [W, H],
      ] as const) {
        const pl = screenToPlane(sx, sy, W, H, cam);
        const w = projection.invAt(pl[0], pl[1], 0);
        const d = Math.hypot(w[0] - anchor[0], w[1] - anchor[1]);
        if (d > far) far = d;
      }
      mesh.visible = strength > 0 && far > inner;
    },

    setSun(s: Vector3) {
      if (aim(s)) rebake();
    },

    setParams(p) {
      if (p.strength !== undefined) strength = p.strength;
      if (p.tilt !== undefined) tilt = p.tilt;
      if (p.lift !== undefined) lift = p.lift;
      if (p.debug !== undefined) debug = p.debug;
      rebake();
    },

    alphaAt(x: number, y: number) {
      return veilAlpha(Math.hypot(x - anchor[0], y - anchor[1]), cap) * strength;
    },

    dispose() {
      g.dispose();
      m.dispose();
      map.dispose();
    },
  };
}

/**
 * ONE CALL FROM THE MOUNT.
 *
 * Reads the tier and the sun off the engine it is given and hands back a
 * handle, or `null` when `?sky=0`. Everything it needs of the engine is in
 * `SkyHost`, which is structural — this file imports no engine class and the
 * engine imports nothing from this file.
 */
export function attachSky(
  host: SkyHost,
  opts: SkyOptions,
  search = typeof window !== "undefined" ? window.location.search : "",
): (SkyLayer & { detach(): void }) | null {
  const q = skyOptionsFromSearch(search);
  if (!q.on) return null;

  const tierSize = host.quality?.tier === "low" ? BAKE_LO : BAKE_HI;
  const dir = host.sun.dir;
  const sun = new Vector3().subVectors(dir.position, dir.target.position);

  const layer = skyLayer({
    size: tierSize,
    viewport: host.viewport,
    sun: sun.lengthSq() > 0 ? sun : undefined,
    ...opts,
    strength: q.strength ?? opts.strength,
    tilt: q.tilt ?? opts.tilt,
    lift: q.lift ?? opts.lift,
    ...(q.size !== undefined ? { size: q.size } : {}),
    debug: q.debug || opts.debug,
  });

  host.scene.add(layer.mesh);
  host.add(layer);
  host.invalidate();

  if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
    (globalThis as { __cityGLSky?: unknown }).__cityGLSky = layer;
  }

  return Object.assign(layer, {
    detach() {
      host.scene.remove(layer.mesh);
      layer.dispose();
      if (typeof globalThis !== "undefined") {
        delete (globalThis as { __cityGLSky?: unknown }).__cityGLSky;
      }
    },
  });
}
