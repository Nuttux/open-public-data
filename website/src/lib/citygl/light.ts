/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/light.ts — THE SUN, THE SKY, AND A SHADOW THAT IS MEASURED
   RATHER THAN DRAWN.

   The Canvas renderer's shadows are marks: a translated copy of the
   footprint, filled translucent, capped at nine pixels because a real throw
   would have to be sorted against everything it crosses. It cannot ask
   whether a shadow lands on a neighbour's roof, on a hill, or on nothing —
   there is no one to ask.

   A shadow map asks the only question that matters, per pixel: *is there
   anything between this point and the sun?* Buildings then shade their own
   walls, throw across the street onto the facade opposite, and run up the
   slope of a hill — none of which is drawn by anybody. It is the single
   largest difference between a map with height on it and a model of a city.

   ── THE SUN IS THE PROJECT'S OWN, EXCEPT WHERE IT IS STATED NOT TO BE ────
   `lib/city/terrain.ts` §SUN is the vector every hillshade and wall grade in
   the Canvas renderer agrees on. Two departures from it are stated below and
   both are recorded where they are made: the AZIMUTH swings to screen-right
   (§the sun swings round to stand behind the key) and the ELEVATION drops to
   35.26 degrees (§an hour, committed to).

   ── WHAT THIS FILE IS, STRUCTURALLY ─────────────────────────────────────
     solveSunRig()   four numbers a reader can argue about — how bright the
                     ground is, what share of that is the sun, how bright a
                     sunlit wall is, how far the shaded walls spread — turned
                     into the four light intensities that produce them.
     sunRig()        the lights themselves, plus a shadow camera fitted in
                     the LIGHT's own axes rather than in world x/z.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  LinearSRGBColorSpace,
  OrthographicCamera,
  Vector3,
  type Scene,
} from "three";

import { SKYC, SUN, SUNC } from "@/lib/city/terrain";

/** `SUNC` and `SKYC` are multipliers around 1, not colours in [0,1]; three
 *  wants a colour, so they are normalised by their own largest channel and the
 *  overall level is carried by the light's intensity, where it belongs.
 *
 *  ── AND THIS IS A TRAP FOR A NEUTRAL TRIPLE ────────────────────────────
 *  It divides by the LARGEST CHANNEL, so `rgbHex([0.34, 0.34, 0.34])` returns
 *  `0xffffff` — pure white — and not the dark grey it reads as. That is not a
 *  hypothetical: the screen-right key light's DARK END was written that way,
 *  and MEASURED in the browser its `groundColor` came back `ffffff`, exactly
 *  equal to its bright end. So the wall ramp this whole file is built around
 *  was not a ramp: it was a uniform ambient of 1.60, reaching every surface in
 *  the scene at full strength whichever way it faced. Worked back through
 *  three's own arithmetic with the colours read out of the running page, the
 *  two faces of a diagonal-grid tower stood at 2.235 and 1.889 — a split of
 *  **1.18**, where `buildings.ts` §wallK puts the published page's at 2.08.
 *  Anything that wants a VALUE, not a hue, states it in linear directly —
 *  see `coolLinear` below, which is the only caller left. */
function rgbHex(c: readonly [number, number, number] | number[]): number {
  const m = Math.max(c[0], c[1], c[2]) || 1;
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round((v / m) * 255)));
  return (ch(c[0]) << 16) | (ch(c[1]) << 8) | ch(c[2]);
}

/**
 * THE SHADOW SIDE IS NOT GREY.
 *
 * `key.groundColor` is what a surface the sun never reaches is lit BY, and
 * it was a NEUTRAL of a solved value. That is the single largest reason
 * this city read as overcast: on a sunny day the light in a shadow is the
 * sky, and the sky is blue. A frame whose lit side is warm and whose shaded
 * side is grey has half of a time of day.
 *
 * The hue is `SKYC`'s own departure from white, scaled the same way
 * `SUN_WARMTH` scales the sun's — so the two ends of the frame are pushed
 * apart along the two axes the project already publishes, rather than along
 * an invented pair. At 1.6 the fill's blue-over-red is 1.34.
 *
 * The LUMINANCE is preserved exactly: the solve in `solveSunRig` is an
 * arithmetic identity on `lum()`, so a hue that changed the value would
 * silently break every target the solve hits and every assertion in
 * `light.test.ts` that checks them. Scaling to `v / lum(chroma)` keeps the
 * rig exactly where the solve put it and changes only its colour.
 */
const SHADOW_COOL = 1.6;
function coolLinear(v: number): Color {
  const c = [0, 1, 2].map((i) => 1 + (SKYC[i] - 1) * SHADOW_COOL);
  const k = v / (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
  return new Color().setRGB(c[0] * k, c[1] * k, c[2] * k, LinearSRGBColorSpace);
}

/** Rec.709 luminance of a colour already in the renderer's linear space. */
function lum(c: Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** the published sun, in scene axes: (world x, up, world y) */
export const SUN_SCENE = new Vector3(SUN[0], SUN[2], SUN[1]).normalize();

/**
 * THIS RENDERER'S SUN, IN THE TERRAIN FIELD'S OWN AXES — `[i, j, up]`.
 *
 * `TerrainField` bakes its hillshade and marches its ridge shadows against a
 * sun, and its default is the PUBLISHED one at azimuth 69 degrees east of
 * north, elevation 47. This renderer cannot use that sun: §the sun swings
 * round to stand behind the key gives the two reasons, and the binding one is
 * geometric rather than aesthetic — under this projection only an azimuth on
 * screen-right throws shadows horizontally across the frame.
 *
 * So the ground has to be shaded for the sun that actually casts on it, and
 * this is that sun, derived from the same camera basis `aimKey` uses rather
 * than written down as a constant — if the bearing ever moves, this moves
 * with it. Scene axes are (x = east, y = up, z = north); the field's are
 * (i = east, j = north, up).
 *
 * MEASURED off the rig at all three zoom bands: east 0.866, north 0.000,
 * up 0.500 — due east at 30 degrees, and the same at every band because the
 * projection's bearing is fixed.
 */
export function fieldSun(right: Vector3): [number, number, number] {
  const h = Math.hypot(right.x, right.z) || 1;
  const c = Math.cos(SUN_ELEV);
  return [(right.x / h) * c, (right.z / h) * c, Math.sin(SUN_ELEV)];
}

/* ══ AN HOUR, COMMITTED TO ══════════════════════════════════════════════
   The published sun stands 47.0 degrees above the horizon — near noon, and a
   noon sun throws a shadow shorter than the thing that casts it. The whole
   point of a shadow in this picture is that it LIES ACROSS SOMETHING: down an
   avenue, over the block opposite, off a hill and across the district below
   it. So the sun comes down, and the elevation it comes down to is derived
   rather than dialled.

   This projection shows a building two ways: its ROOF, which faces straight
   up, and the WALL turned toward the light, which in the diagonal half of any
   grid stands at 45 degrees to the sun's own azimuth. Those two surfaces take
       roof  sin(e)          wall  cos(e) * cos(45)
   of the direct beam, and they are EQUAL when `tan(e) = cos(45)`:

       e = atan(0.70711) = 35.264 degrees

   which is the one elevation at which a strong sun does not make the sunlit
   walls outrun the roofs (or the roofs outrun the walls) as it is turned up.
   It also lands on a number worth remembering: `1 / tan(e)` is exactly
   **sqrt(2)**, so every shadow in the city is its caster's height times 1.414.
   At the published 47.0 degrees it was 0.93 — shorter than the tower.

   WHAT IS GIVEN UP: the ground's baked hillshade in `terrainRGB` still runs
   from the published elevation. The relief and the cast shadows now disagree
   about the hour as well as (already) about the compass. That is the same
   trade §the sun swings round to stand behind the key made and for the same
   reason — the hillshade is a gentle wash over gentle ground and the cast
   shadows are hard edges on the thing a reader is looking at. */
/* ── AND THEN IT CAME DOWN FURTHER, BECAUSE PARITY IS NO LONGER THE TARGET
   The elevation above is the one at which a sunlit wall and a sunlit roof
   take an EQUAL share of the beam. That was the right solve while this
   renderer was graded on its distance from the published Canvas page,
   because equality is the neutral choice and neutrality is what a port
   wants.

   It is not what a PICTURE wants. Every renderer whose light reads as a
   time of day puts the sun low: the shadow is long enough to cross the
   thing beside it, the lit wall outruns the roof, and the eye gets a
   direction to read the city by. Daniel, on the whole surface: *'it looks
   like some pre-renaissance painting, false illusion of depth but theres
   not really feelings of depth'*. A vertical sun is most of that.

   30 degrees. Stated rather than solved, and the number it lands on is
   worth as much as the old one: `1 / tan(30)` is exactly **sqrt(3)**, so
   every shadow in the city is its caster's height times 1.732 where it
   used to be 1.414 — a third longer.

   WHY NOT LOWER. Below about 25 degrees a dense block puts its whole
   opposite side in shadow and the city stops reading as buildings and
   starts reading as a shadow field. The shadow box also grows with the
   throw, and `light.test.ts` holds it under 1,900 m at the street camera.
   30 is the low end of what this projection carries; it is not the low
   end of what looks good in isolation. */
/* ── AND THEN IT WENT BACK UP, BECAUSE 30 DEGREES CUT THE STREETS ────────
   The argument above is about a PICTURE and it is a good argument. It is the
   wrong argument for a map somebody has to follow a street across, and the
   page said so first. Daniel: *"shadow is so strong so long it really look
   slike its cutting streets ... id either like no shadow or very light, even
   tho i like the warm sun coloring."*

   The arithmetic is the whole of it. At 30 degrees a shadow runs 1.732 times
   its caster's height, so an ordinary 10 m Richmond house threw 17.3 m — WIDER
   THAN THE STREET IT LANDED IN. Two facing rows then closed their shadows over
   the carriageway between them and the grid stopped being legible. At 40 the
   throw is 1.19 and the same house throws 11.9 m: across the pavement, onto
   the near half of the road, and no further.

   40 rather than back to the old 35.264: that number was the elevation at
   which a lit wall and a lit roof take an EQUAL share of the beam, which was
   the right neutral for a port graded on its distance from the Canvas page and
   is not a reason for anything now. This one is chosen against the thing the
   shadow has to fit inside — the street — and the city publishes that width.

   WHAT IS GIVEN UP, and it is the same trade §and then it came down further
   made in the other direction: less rake across the walls, so the frame leans
   a little less on the light for its depth and more on the occlusion, the
   material and the palette. All three of those moved on 2026-08-28. */
const SUN_ELEV = (40 * Math.PI) / 180;
/** how far a shadow runs per unit of caster height */
export const SHADOW_THROW = 1 / Math.tan(SUN_ELEV);
/** the 45-degree wall's own share of the beam — equal to `sin(SUN_ELEV)` */
const WALL45 = Math.cos(SUN_ELEV) * Math.cos(Math.PI / 4);

/* ══ THE FOUR NUMBERS THE LOOK ACTUALLY IS ══════════════════════════════
   Everything below used to be four light intensities tuned against each
   other, which is why every change to one of them moved three things nobody
   was looking at. These are the four QUANTITIES instead, each of them a
   statement about the picture, and `solveSunRig` turns them into intensities.

   All four are irradiance in three.js's own units: a Lambert surface reflects
   `irradiance * albedo / PI`, so `groundE = 2.398` puts open ground at 0.763
   of its own colour. */
export interface SunLook {
  /**
   * THE IRRADIANCE ON A SURFACE THAT FACES STRAIGHT UP — the ground, and
   * every flat roof.
   *
   * ── IT USED TO BE THE ONE NUMBER THAT MAY NOT MOVE ──────────────────────
   * 2.398 is what the port was MEASURED at — the light colours' own
   * luminances read back out of the browser, times the shipped intensities —
   * and it was held there because the port's ground sat within a couple of
   * points of the published page's at the two wide cameras. Everything else
   * was redistributed underneath it.
   *
   * That is a parity constraint, and holding it is what capped the frame.
   * §and 0.52 now bought deeper shadows and §and then it came down further
   * bought longer ones, and MEASURED, the two together made the frame DARKER
   * without making it WIDER: median luminance fell 5 to 12 levels while the
   * p05-p95 spread did not move (125->128, 132->127, 112->112). A ceiling
   * with more shadow under it is not more range, it is less light.
   *
   * 3.2 is that ceiling lifted, and it is spendable now because `engine.ts`
   * §and a tone curve puts an ACES shoulder above it — MEASURED, 0.00 % of
   * pixels reach 254 at any camera, where the uncurved frame was already
   * clipping 0.03 to 0.21 % at a LOWER `groundE`.
   */
  groundE: number;
  /**
   * WHAT SHARE OF THAT IS THE SUN, and therefore how much a shadow can
   * possibly remove. The port shipped at **0.219** — MEASURED, and it is the
   * whole complaint: toggling the shadow pass moved the frame's mean by 1.5
   * of 255 with a maximum of 24, because 78 % of the light on the ground was
   * fill that a shadow cannot touch.
   *
   * At 0.50 a shadowed roof keeps half its linear value, which on ground
   * reading 160 of 255 is 117 — a drop of 43 levels.
   */
  sunShare: number;
  /**
   * THE SUNLIT WALL, AS A FRACTION OF THE SUNLIT ROOF.
   *
   * This is the number that pays for the sun, and it was solved by
   * measurement rather than by argument. Moving light out of the key and into
   * the sun takes it away from every wall the sun never reaches — under this
   * projection the whole square half of the grid shows one face and the sun's
   * azimuth is screen-right, so that face gets NO direct light at any
   * elevation — and walls are what a close camera is made of.
   *
   * MEASURED, twelve rigs at four cameras against the published page's own
   * capture at the same camera (the block stop, mean of the map area):
   *
   *     wallCap   1.00   1.15   1.25   1.35   1.45   1.50
   *     frame     -28.2  -16.0   -9.6   -4.0   +0.6   +1.0   of 255
   *     clipped    0.00   0.00   0.01   0.03   0.06   0.07  % of pixels
   *
   * At 1.00 — a sunlit wall exactly as bright as a sunlit roof, which is what
   * the elevation in §an hour makes the BEAM do — the frame came back 28
   * points under the page, which is the "renderer went dark" this file's own
   * history says the eye reads as worse before it reads as more contrast. At
   * 1.50 the block frame sits ON the page's mean with its p10 eleven points
   * above and its p90 eight below, and 0.07 % of pixels clip.
   */
  wallCap: number;
  /**
   * HOW FAR APART THE TWO SHADED WALLS SIT — the wall square-on to the frame
   * over the wall turned away from the light. It is what keeps `planeQuartile`'s
   * FOUR steps from collapsing into two: the sun separates lit from unlit by
   * itself, and this is the only thing separating unlit from unlit.
   *
   * `lib/city/buildings.ts` §wallK runs 0.50 to 1.04 in four steps, so
   * neighbouring steps are 1.26 apart and the two ends are 2.08 apart.
   *
   * ── 1.35 WAS TUNED TO A MEAN AND LEFT THE SHADOWS LIFTED ────────────────
   * `wallCap`'s own note says what it settled for: at 1.50 the block frame
   * sits ON the published page's mean "with its p10 eleven points above". A
   * mean that matches while the dark end sits eleven points high is a frame
   * with its shadows filled in, and that is what it looked like — Daniel, on
   * the whole city: *"streets still looking kinda weird"*, over buildings
   * whose shaded sides were all one pale cream.
   *
   * So this is tuned against the DISTRIBUTION instead, over the same ground
   * on both renderers (`scratchpad/ab.mjs` drives the published page's own
   * camera). GL minus published, at five percentiles, mean of two cameras:
   *
   *     wallRamp   1.35   1.70   1.80   1.90   2.05
   *     mean |d|    9.4    3.6    3.5    3.8    4.3   of 255
   *
   * 1.35 is nearly ten levels bright everywhere. Past 1.9 the mid-tones
   * overshoot dark while the shadows are still high — the ramp cannot buy any
   * more shadow without spending the rest of the frame.
   *
   * ── AND THE CEILING IS THE SOLVE'S, NOT THE CURVE'S ─────────────────────
   * The floor of that curve is 1.8, by a tenth of a level over 1.7. It is not
   * what ships, because the rig cannot hold its own targets there: §the solve
   * clamps `P` at zero when the targets are impossible together, and at 1.8
   * some of the (sunShare, wallCap) pairs `light.test.ts` sweeps fall past
   * that clamp — an up face came back at 2.422 against a `groundE` of 2.398.
   * A look that is a tenth of a level better at one camera and silently wrong
   * at the corners of the range is not better.
   *
   * So 1.7, which the solve holds everywhere the sweep goes: at the hill
   * camera the mid and upper tones land within a couple of levels (p50 +1.3,
   * p75 0.0, p90 -1.0) and the darkest twentieth is +8.3 rather than +13.3.
   */
  wallRamp: number;
}

/** what the solve hands the lights */
export interface SunLevels {
  /** the directional sun's intensity */
  sunI: number;
  /** the screen-right key hemisphere's intensity and its dark end, LINEAR */
  keyI: number;
  keyDark: number;
  /** how far above the horizon the key's own axis sits, radians */
  keyElev: number;
  /** the sky hemisphere's intensity — held, not solved */
  skyI: number;
  ambientI: number;
  /**
   * DID THE THREE TARGETS ACTUALLY CLOSE?
   *
   * `P` is what is left of the key once its swing is paid for, and it can come
   * out negative — a very bright wall floor beside a very dark up face is not a
   * rounding error, it is a pair of targets that cannot both hold. The solve
   * clamps `P` at zero and carries on, which means `wallFlat` and `wallLit`
   * then silently miss. This says so instead, so a caller or a test can tell an
   * impossible look from a met one rather than inferring it from `keyDark`.
   */
  reachable: boolean;
  /** what the solve predicts, for a test and for a harness */
  predict: {
    up: number;
    /** the wall turned toward the light, at 45 degrees to it */
    wallLit: number;
    /** the wall turned away from the light, at 45 degrees to it */
    wallDark: number;
    /** the wall square-on to the frame, which no sun reaches at all */
    wallFlat: number;
    /** anything the shadow map says is blocked, on an up face */
    upShadowed: number;
  };
}

/** the two hemisphere lights' own luminances, which the solve needs */
export interface RigLuminance {
  /** the directional light's colour */
  sun: number;
  /** the sky hemisphere seen by a surface facing straight up */
  skyUp: number;
  /** the sky hemisphere seen by a vertical wall — the two colours, half each */
  skyWall: number;
}

/**
 * ── THE SOLVE ────────────────────────────────────────────────────────────
 *
 * Four surfaces carry this picture. In scene axes, with the camera's own
 * screen-right at `+x` and the sun's azimuth on it:
 *
 *   up        (0, 1, 0)              ground, and every flat roof
 *   wallLit   (+0.707, 0, -0.707)    the diagonal grid's face toward the light
 *   wallDark  (-0.707, 0, -0.707)    the same building's other visible face
 *   wallFlat  (0, 0, -1)             the square grid's one visible face, which
 *                                    the sun cannot reach at ANY elevation
 *                                    because its azimuth is screen-right
 *
 * A hemisphere light mixes its two colours by `0.5 * dot(n, axis) + 0.5`, so
 * with the key's axis at elevation `p` and the sun's azimuth on `+x`:
 *
 *   t(up)       = 0.5 + 0.5 sin p
 *   t(wallLit)  = 0.5 + 0.5 cos p cos45      t(wallDark) = 1 - t(wallLit)
 *   t(wallFlat) = 0.5
 *
 * Write `A = keyI * (1 - keyDark)` for the ramp's whole swing and
 * `P = keyI * keyDark` for its floor; `B` for ambient plus sky on a wall and
 * `Bu` for the same on an up face. Then, with `S = sunShare * groundE` the
 * direct term on the ROOF, and `W = WALL45 / sin(e)` the 45-degree wall's own
 * share of that same beam — 1 at the elevation §an hour used to pick, and
 * sqrt(1.5) at the 30 degrees §and then it came down further ships:
 *
 *   wallFlat = B + P + A/2
 *   wallDark = wallFlat - Q            Q = A/2 * cos p * cos45
 *   wallLit  = wallFlat + Q + S W
 *   up       = Bu + P + A/2 + A/2 sin p + S = groundE
 *
 * Three targets — `wallLit = wallCap * groundE`, `wallFlat / wallDark =
 * wallRamp`, and `up = groundE` — close it in one pass with no iteration:
 *
 *   wallFlat = (wallCap - sunShare W) * groundE / (2 - 1 / wallRamp)
 *   Q        = wallFlat * (1 - 1 / wallRamp)
 *   A cos p  = Q / (0.5 cos45)
 *   A sin p  = 2 * (groundE (1 - sunShare) - wallFlat + B - Bu)
 *
 * and `A`, `p` are that pair's length and angle. The KEY'S ELEVATION is
 * therefore an OUTPUT of the look and not a dial — which is the part that had
 * been guessed before, at 20 degrees, for no measured reason.
 */
export function solveSunRig(
  look: SunLook,
  L: RigLuminance,
  skyI: number,
  ambientI: number,
): SunLevels {
  const E = look.groundE;
  const S = look.sunShare * E;

  const Bu = ambientI + skyI * L.skyUp;
  const B = ambientI + skyI * L.skyWall;

  /* ── THE WALL'S SHARE OF THE BEAM, WHICH IS NO LONGER THE ROOF'S ───────
     `WALL45 / sin(SUN_ELEV)` is what the 45-degree wall takes of the direct
     beam over what the up face takes. §an hour used to pick the elevation that
     made this exactly 1, and the inversion below was written for that: it
     subtracts `sunShare` from `wallCap` as if the wall's direct term were the
     same `S` the roof gets.

     §and then it came down further reopened that. At 30 degrees the wall takes
     `sqrt(1.5)` = 1.2247 of the roof's share — 22 % more — so an inversion that
     assumes 1 overshoots every `wallCap` target it is given, which is exactly
     what `light.test.ts` caught: 2.826 against a target of 2.638.

     Written as a ratio rather than folded into a constant, so that ANY
     elevation solves correctly and the 35.264-degree case still returns 1. */
  const beamWall = WALL45 / Math.sin(SUN_ELEV);
  const flat =
    ((look.wallCap - look.sunShare * beamWall) * E) / (2 - 1 / look.wallRamp);
  const Q = flat * (1 - 1 / look.wallRamp);

  const aCos = Q / (0.5 * Math.cos(Math.PI / 4));
  const aSin = 2 * (E * (1 - look.sunShare) - flat + B - Bu);
  const A = Math.hypot(aCos, aSin);
  const keyElev = Math.atan2(aSin, aCos);

  /* `P` is what is left of the key once its swing is paid for. It CAN come
     out negative — that is the solve telling you the targets are impossible
     (a very bright wall floor next to a very dark up face), not a rounding
     error — so it is clamped and the caller sees it in `predict`. */
  const Praw = flat - B - A / 2;
  const P = Math.max(0, Praw);
  const keyI = P + A;
  const keyDark = keyI > 0 ? P / keyI : 1;
  const sunI = S / (Math.sin(SUN_ELEV) * L.sun);
  /* the same beam, on the 45-degree wall — `S * beamWall` by construction,
     computed from the rig rather than from the target so a test can check the
     two agree rather than having to trust that they do. */
  const sunOnWall = sunI * WALL45 * L.sun;

  const tUp = 0.5 + 0.5 * Math.sin(keyElev);
  const key = (t: number) => P + A * t;
  const upFill = Bu + key(tUp);
  const tLit = 0.5 + 0.5 * Math.cos(keyElev) * Math.cos(Math.PI / 4);

  return {
    sunI,
    keyI,
    keyDark,
    keyElev,
    skyI,
    ambientI,
    reachable: Praw >= 0,
    predict: {
      up: upFill + S,
      wallLit: B + key(tLit) + sunOnWall,
      wallDark: B + key(1 - tLit),
      wallFlat: B + key(0.5),
      upShadowed: upFill,
    },
  };
}

/**
 * THE SHIPPED LOOK.
 *
 * `groundE` is MEASURED off the shipped rig rather than chosen — the light
 * colours' luminances read back out of the running page (sun 0.9586, sky 0.7399
 * on an up face, 0.7909 on a wall) times the shipped intensities:
 *
 *     0.02 + 0.34 * 0.7399 + 1.60 * 1.0 + 0.75 * 0.7319 * 0.9586 = 2.398
 *
 * The `1.60 * 1.0` in that line is the bug in §rgbHex: the key's dark end was
 * white, so it contributed its full 1.60 to every surface in the scene
 * regardless of which way the surface faced. Two thirds of the light in this
 * city was a constant.
 */
export const DEFAULT_LOOK: SunLook = {
  groundE: 3.2,
  /* ── AND THE SUN GIVES BACK A SIXTH OF ITS SHARE ────────────────────────
     0.55 means a shadow removes 55 % of an open ground's light, which was
     solved to land a shadow 40-60 levels deep — the right target for a frame
     that had none. On a HILLSIDE it doubles up: the terrain's colour already
     carries the project's own baked hillshade, so a slope turned away from the
     sun is darkened once by the data and again by the cast pass, and the
     streets crossing it stop reading. Daniel: *"theres so much shadow that it
     makes streets look weird especially in areas with height differentials."*

     0.42 keeps a shadow worth roughly 40 levels — still unmistakably a sun,
     still the thing that gives the frame a time of day — and takes a fifth of
     the doubling off every slope in the city.

     ── AND 0.52 NOW, FOR THE SAME REASON THE SUN CAME DOWN ─────────────
     0.42 was a retreat from 0.55, and the thing it retreated from is real:
     the ground's colour arrives from `terrainRGB` with the project's own
     hillshade already baked in, so a slope facing away from the sun is
     darkened once by the data and again by the cast pass.

     But the retreat was paid for by the whole frame, not by the slopes. A
     shadow that removes 42 % of the light is a shadow the eye reads as a
     smudge; at 0.52 it removes half, which is what a shadow on a sunny day
     actually does, and it is the other half of the direction the lowered
     sun buys. The double-darkening on slopes is a TERRAIN problem and is
     being fixed where it lives rather than by keeping the sun weak
     everywhere. */
  sunShare: 0.52,
  wallCap: 1.5,
  wallRamp: 1.7,
};

/* WHAT THOSE FOUR PRODUCE, MEASURED IN THE BROWSER at the four cameras, the
   same frame with `shadow.intensity` at 1 and at 0:

     stop        shipped before          this rig
                 mean |d| / max          mean |d| / max      frame mean
     city          0.61 / 23              4.39 / 68          155.4 -> 157.4
     district      1.90 / 24              8.06 / 71          136.2 -> 137.1
     block         3.13 / 25             11.46 / 70          134.3 -> 133.3
     street        4.51 / 20             14.84 / 68          120.0 -> 115.7

   A shadow that moved the frame by 1.5 of 255 at its strongest now moves it
   by 15, and a shadowed surface drops 68 levels where the deepest it could
   drop before was 25 — at a frame mean within a point or two of what the port
   already had. The whole of that came out of the fill, not out of the
   exposure.

   ── AND ONE THING THIS RIG DOES THAT A PHOTOGRAPH DOES NOT ──────────────
   `wallCap` at 1.5 puts the key's own axis 47 degrees BELOW the horizon —
   the solve's own output, not a dial — which is a light bouncing back up off
   the sunlit pavement to the right. It is a real thing to point a light at,
   and it has one consequence worth stating: a surface facing straight up sits
   near the ramp's DARK end, so a roof IN SHADOW (1.079) comes out darker than
   a wall that never sees the sun at all (1.340). A real sky does the
   opposite — a roof sees all of it and a wall sees half. What is bought for
   that is that a shadow on the ground READS, which is the whole brief. */

export interface SunOptions {
  /** shadow map edge, texels */
  mapSize?: number;
  /** tallest thing that can cast, in SCENE units — sets the light-space slab */
  maxBuiltY?: number;
  /** override any of the four look targets */
  look?: Partial<SunLook>;
  /** the sky hemisphere's level — held at the published 0.34 unless overridden */
  skyI?: number;
  ambientI?: number;
}

/** what the shadow fit came out as, for a harness that wants to price it */
export interface ShadowFit {
  /** the light-space box, world metres */
  spanU: number;
  spanV: number;
  /** metres per shadow texel on each of the box's own axes */
  mPerTexelU: number;
  mPerTexelV: number;
}

export interface SunRig {
  readonly dir: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly ambient: AmbientLight;
  /** the screen-right key — see §the key light is the camera's, not the world's */
  readonly key: HemisphereLight;
  readonly levels: SunLevels;
  readonly look: Readonly<SunLook>;
  readonly fitStats: ShadowFit;
  /**
   * Aim the key, and the sun's azimuth with it, along the camera's screen-right.
   * @param right the axon basis's `R`, a unit vector in scene space
   * @param forward the axon basis's `F` — the camera sits along it, and the
   *        shadow fit needs it to know where a TALL thing has to stand to be
   *        visible at all
   */
  aimKey(right: Vector3, forward?: Vector3): void;
  /**
   * Point the shadow camera at what the viewport can see.
   * @param corners the four visible ground points, world metres
   */
  fit(corners: readonly (readonly [number, number])[]): void;
  setEnabled(on: boolean): void;
  /** re-solve the rig live — this is what the A/B harness sweeps */
  setLook(p: Partial<SunLook>): void;
  dispose(): void;
}

export function sunRig(scene: Scene, o: SunOptions = {}): SunRig {
  const mapSize = o.mapSize ?? 2048;
  const maxBuilt = o.maxBuiltY ?? 500;
  const look: SunLook = { ...DEFAULT_LOOK, ...o.look };
  const skyI = o.skyI ?? 0.34;
  const ambientI = o.ambientI ?? 0.02;

  /* THE SKY IS A LIGHT, NOT A CONSTANT. A hemisphere light gives a surface
     turned away from the sun the colour of what it IS facing — the sky above
     or the warm ground below — which is the two-illuminant idea the Canvas
     palette bakes into `skylit`, done geometrically instead of per entry.

     It is the one level NOT solved: it is what a surface in shadow is lit BY,
     it is the coolness the whole frame is graded against, and the published
     0.34 is where it has been since the ground was matched. The solve
     redistributes the KEY and the SUN around it. */
  const hemi = new HemisphereLight(
    rgbHex(SKYC),
    rgbHex([
      (SKYC[0] + SUNC[0] * 0.35) / 1.35,
      (SKYC[1] + SUNC[1] * 0.35) / 1.35,
      (SKYC[2] + SUNC[2] * 0.35) / 1.35,
    ]),
    skyI,
  );
  const ambient = new AmbientLight(0xffffff, ambientI);

  /* ══ THE KEY LIGHT IS THE CAMERA'S, NOT THE WORLD'S ═════════════════════
     The published page states this outright. `lib/city/buildings.ts`
     §planeQuartile:

       *"(ax, ay) is coeffs() — the world-space gradient of SCREEN X — so t is
        the cosine between the wall's outward normal and screen-right... The key
        light in this frame is upper right, and this is that sentence as
        arithmetic."*

     and it goes on to record, as a fixed bug, the exact mistake a port makes
     if it shades a wall by `max(0, n · SUN)` against the world sun — *"every
     wall turned away from the light — half of every building in the city —
     took step 0... A block of houses came out two values where the reference
     gives it four."*

     ── AND IT IS A HEMISPHERE, WHICH IS THE PART THAT MAKES IT WORK ─────────
     A directional light is `max(0, cos)`: it throws away the whole negative
     half of the range, which is that collapse. A hemisphere light mixes its
     two colours by `0.5 · dot(n, axis) + 0.5` — a WRAP-AROUND ramp that runs
     continuously from one end to the other with nothing clamped. Pointed along
     screen-right it is `planeQuartile` exactly, minus the rounding to four
     steps.

     ── AND THE KEY CARRIES VALUE ONLY, NOT COLOUR ─────────────────────────
     The first cut gave this hemisphere the published warm/cool pair, reasoning
     that `qTilt` colours the wall ramp that way. It does, and doing it HERE was
     still wrong, because a hemisphere light reaches every surface in the scene
     and not just the walls: scaling the cool end down leaves the MIDPOINT
     warm, and the midpoint is what every up-facing surface gets — the entire
     ground. MEASURED over four ground-heavy views, red minus blue ran 5 to 6
     points above the published page on every one and a city of parks lost its
     parks to a light. So the key is a pure value ramp and the COLOUR stays
     where it belongs: warm on the directional sun, cool on the sky hemisphere.

     ── AND ITS DARK END IS NOW ACTUALLY DARK ───────────────────────────────
     It was written `rgbHex([0.34, 0.34, 0.34])`, which returns WHITE — see
     §rgbHex. The dark end states its linear value directly instead.

     ── AND IT IS NO LONGER A PURE VALUE RAMP ──────────────────────────────
     The paragraph above is right that a hemisphere reaches EVERY surface, so
     colouring an end tints the ground too, and it is right that the first cut
     failed by leaving the midpoint warm. What it concluded from that — colour
     belongs on the sun and the sky, never here — was measured against the
     published page, and that is no longer the target.

     `coolLinear` colours the DARK end only, and MEASURED at three cameras it
     does what the separation needs rather than what the old bug did: on a
     building-heavy frame red-minus-blue falls 5.6 points (the shaded walls
     picking up sky) while on ground-heavy frames it RISES 2 to 5 (the warm sun
     on open ground). The two ends of the frame move apart instead of together,
     which is the thing a pure value ramp cannot do. */
  const key = new HemisphereLight(0xffffff, 0x000000, 1);
  /* three reads a hemisphere's axis off its POSITION, so aiming it is setting
     a position; `aimKey` does that from the camera basis each time the
     projection changes. Until then it points up, which is the fill it replaces. */
  key.position.set(0, 1, 0);

  /* ── AND THE SUN IS MOSTLY WHITE, BECAUSE THE GROUND IS ALREADY LIT ─────
     `SUNC` is the published warm key, and pointing a light of that colour at
     this city warms it TWICE. The ground's own colour is not a pigment: it
     comes out of `terrainRGB` with the project's hillshade, its sun and its
     sky already inside it. A second warm light on top is a second sunset.

     MEASURED over four ground-heavy views, red minus blue ran about 5 points
     above the published page and green minus red about 3 below — a fabric that
     reads sandy where the page reads grey-green, and it is most obvious on
     open ground.

     So the key keeps a little of its warmth and gives up most of it. The
     fraction is stated rather than tuned by eye: 0.6 of the way to white,
     which takes `SUNC`'s own 11.8 % red-over-blue spread down to 4.7 % — under
     the 5 points the measurement found. */
  /* ── EXCEPT THAT THE WHOLE ARGUMENT ABOVE WAS A PARITY ARGUMENT ────────
     It is measured and it is honest, and what it measures is the distance
     from the published page: 'red minus blue ran about 5 points above the
     published page'. The page is no longer the target.

     The double-warming it describes is still real — the ground texture
     carries its own sun. The answer is not to bleach the light; it is to
     put the warm/cool separation where the eye actually reads it, which is
     BETWEEN the lit and the shaded, not inside the lit. So the sun gets
     warmer than `SUNC` and the fill it does not reach goes cool (below).

     `SUN_WARMTH` scales `SUNC`'s own departure from white rather than
     mixing toward it, so it can exceed 1 and stay on the published hue's
     own axis. At 2.2 the light's red-over-blue is 1.46 — roughly a 4,300 K
     sun, an hour or so before it goes properly orange. CHOSEN, not
     measured: there is no record of what colour the light over this city
     was, and this file should not pretend otherwise. */
  const SUN_WARMTH = 2.2;
  const warm = (i: number): number => 1 + (SUNC[i] - 1) * SUN_WARMTH;
  const dir = new DirectionalLight(rgbHex([warm(0), warm(1), warm(2)]), 1);

  /* the solve needs what the three colours are actually WORTH, and the honest
     source of that is the Colour objects three just built — hex, colour
     management and all — rather than a constant copied out of a header */
  const luminance: RigLuminance = {
    sun: lum(dir.color),
    skyUp: lum(hemi.color),
    skyWall: (lum(hemi.color) + lum(hemi.groundColor)) / 2,
  };

  let levels = solveSunRig(look, luminance, skyI, ambientI);
  function applyLevels(): void {
    dir.intensity = levels.sunI;
    key.intensity = levels.keyI;
    key.groundColor.copy(coolLinear(levels.keyDark));
    hemi.intensity = levels.skyI;
    ambient.intensity = levels.ambientI;
  }
  applyLevels();

  dir.castShadow = true;
  /* ── A SHADOW REMOVES THE WHOLE DIRECT TERM, AND NOTHING ELSE ───────────
     `shadow.intensity` used to be the lever that decided how dark a shadow
     was, because the direct term was so small that removing all of it barely
     showed. Now that the sun carries half the light on an up face there is
     nothing to fake: a blocked surface loses the sun and keeps the sky, which
     is what a shadow IS. It stays 1 and `sunShare` is the dial. */
  dir.shadow.intensity = 1.0;
  dir.shadow.mapSize.set(mapSize, mapSize);
  /* A BIAS IN WORLD UNITS, NOT A GUESS. Too small and every lit surface
     stripes itself (acne); too large and a shadow detaches from the wall that
     casts it (peter-panning). `normalBias` moves the sample along the
     surface normal, which is the one that fixes acne without detaching.

     Both are scaled to the TEXEL in `refit` below: the same 1.2 m that stops
     acne at the whole-city camera detaches a shadow by more than a car length
     at the street camera, where a texel is a quarter of a metre. */
  /* ── A WIDER SHADOW KERNEL WAS TRIED HERE, AND IT IS NOT WORTH IT ────
     `PCFSoftShadowMap` samples nine texels in a bilinear tent one texel
     wide, which sounded like the thing to replace: a sixteen-point Poisson
     disc with the radius in texels, on `shadow.filterNode`, so the softness
     would hold in PIXELS as the fit changes with the camera. It was built,
     wired, and confirmed ACTIVE — radius 0.01 against radius 40 moves the
     frame by 1.51 of 255, so the hook works.

     It is not worth its cost. MEASURED at the downtown camera, where towers
     throw the longest shadows this city has, hard against soft:

       mean absolute difference over the frame      0.18 of 255
       the busiest sixth of the frame               1.50
       frame cost, block camera                     14.10 ms against 13.30
       drift from the published page                4.0 against 3.7

     Eight tenths of a millisecond and a step away from the reference, for a
     change no reader can see at thirty times magnification. The reason is
     the fit rather than the filter: the box is already tight (§the shadow
     box is fitted in the light's axes) and the map is 4,096, so a texel is
     well under a metre and the tent is already soft at this scale. The
     shadow that WOULD show a penumbra — tight at the caster, wide far from
     it — needs a blocker search, and the texture this hook is handed is a
     comparison sampler that cannot report a depth. That is the thing to
     build if this is ever worth revisiting; a wider kernel is not. */
  dir.shadow.bias = -0.0006;
  dir.shadow.normalBias = 1.2;
  dir.shadow.camera.near = 1;

  scene.add(hemi, ambient, key, dir, dir.target);

  const cam = dir.shadow.camera as OrthographicCamera;
  /* where the sun stands, once `aimKey` has had the camera's own right */
  const sunDir = SUN_SCENE.clone();
  /* the camera's own F — the shadow fit needs it; see `fitCorners` */
  const camF = new Vector3(0, 1, 0);
  /* the light's own screen axes, rebuilt with the sun */
  const lx = new Vector3(0, 0, -1);
  const ly = new Vector3(0, 1, 0);
  let lastCorners: readonly (readonly [number, number])[] | null = null;
  const fitStats: ShadowFit = { spanU: 0, spanV: 0, mPerTexelU: 0, mPerTexelV: 0 };

  /** the light's own basis, matching what `LightShadow.updateMatrices` will
   *  build: three points the shadow camera with `lookAt` and the DEFAULT up,
   *  so its right is `up x forward` and its up is `forward x right`. Deriving
   *  the same pair here is what lets the box below be stated in the light's
   *  axes and land in the shadow camera's. */
  function lightBasis(): void {
    lx.set(0, 1, 0).cross(sunDir);
    if (lx.lengthSq() < 1e-8) lx.set(1, 0, 0);
    lx.normalize();
    ly.copy(sunDir).cross(lx).normalize();
  }

  /**
   * ── THE SHADOW BOX IS FITTED IN THE LIGHT'S AXES, NOT IN WORLD X/Z ──────
   *
   * The fit this replaced took the viewport's ground box in WORLD x/z, grew it
   * on all four sides by how far the tallest thing in the city can throw, took
   * the larger of the two sides, and then circumscribed a square around it —
   * three separate multiplications of the area, none of which buys anything.
   * MEASURED at the four cameras, that box came out
   *
   *     city 22,440 m   district 7,696   block 3,484   street 2,009
   *
   * against 2,048 texels, so a shadow texel was 10.96 / 3.76 / 1.70 / 0.98 m
   * where a SCREEN pixel is 10.34 / 3.10 / 1.03 / 0.31 m. At the street camera
   * the shadow was three and a bit screen pixels a texel, which is the
   * staircase.
   *
   * The whole margin was a symptom of fitting in the wrong space. In the
   * LIGHT's own axes a caster and the shadow it throws sit at the SAME (u, v):
   * that is what light space is. So a box drawn tightly around the visible
   * ground already contains every caster whose shadow can land on it, and the
   * only thing that has to be widened is the DEPTH, which costs no texels at
   * all.
   *
   * MEASURED after, with the high tier's map at 4,096 (see `quality.ts`):
   *
   *     camera     box, world m     m per texel     m per screen pixel  ratio
   *     city       15,540 x 9,318    3.79 / 2.27          10.34          0.37
   *     district    5,596 x 3,289    1.37 / 0.80           3.10          0.44
   *     block       2,753 x 1,568    0.67 / 0.38           1.03          0.65
   *     street      1,759 x   966    0.43 / 0.24           0.31          1.38
   *
   * against 1.06 / 1.21 / 1.64 / 3.16 before. Three of the four cameras now
   * have a shadow texel SMALLER than the pixel it is drawn into, which is the
   * only definition of "crisp" that means anything: past that the map is finer
   * than the frame and nothing more can be seen. The street camera is the one
   * that is not, at 1.38, and §the slab below says why and what it would cost.
   *
   * ── WHY NOT CASCADES ─────────────────────────────────────────────────────
   * They were the first plan and they do not fit this renderer. Three's
   * cascade addon patches `#include <lights_fragment_begin>` through
   * `onBeforeCompile`, which is a GLSL hook; this scene is a node graph on
   * `WebGPURenderer` and has no such seam. The only way to a second shadow map
   * without touching the graph is a second `DirectionalLight`, and that does
   * not work either: two lights each carry their own share of the DIFFUSE
   * term, so nesting a fine box inside a coarse one makes the near half of the
   * frame lose 100 % of the sun where it is blocked and the far half lose only
   * its share — one city, two shadow depths, with a seam between them.
   *
   * What made cascades unnecessary is above: a 2,009 m box at a 420 m camera
   * was never a resolution problem, it was 1,400 m of margin that light space
   * does not need.
   *
   * What does still have to be added is the other margin, and it is a
   * different one: geometry standing OUTSIDE the visible ground box that is
   * tall enough to lean INTO the frame. Under this projection height is pure
   * screen-y, so a thing of scene height `Y` appears where a ground point
   * `F * (Y / F.y)` away appears — one ray, four corners, eight points, and
   * the box around all eight is exactly the world region the viewport can see
   * anything of.
   */
  function fitCorners(): Vector3[] | null {
    const corners = lastCorners;
    if (!corners || corners.length === 0) return null;
    const out: Vector3[] = [];
    /* ── THE SLAB, AND IT IS THE ONE REAL TRADE IN THIS FIT ─────────────
       Sea level to the tallest thing that can stand in the frame. `maxBuiltY`
       is built height; terrain rides above it on a hill, so the slab is
       opened by half again rather than exactly.

       Every metre of it is paid for at the closest camera, because the lean is
       `yHigh / F.y` and lands entirely on the box's U axis. MEASURED at the
       street camera, whose visible ground is only 420 x 455 m:

           slab      lean      box U    m/texel at 4,096   vs a screen pixel
           480       831 m     1,406      0.34                1.11 x
           720     1,247 m     1,759      0.43                1.38 x
           1,080   1,870 m     2,382      0.58                1.87 x

       and going the other way, a slab too SHORT does not soften anything: it
       drops a band at the bottom of the frame out of the shadow map, and
       `ShadowNode` reads outside its own frustum as FULLY LIT. The failure is
       a hard lit stripe under the nearest hill, not a blur.

       1.5 is where that lands: every building the roll carries is inside it,
       and so are the hills at the two close cameras. At the two wide cameras
       the box is over-provisioned three times over (0.37 and 0.44 of a screen
       pixel a texel), so a taller slab there would cost nothing — which is the
       argument for making this step-aware, and the reason not to is that the
       SAME number would then be 1.87 at the street camera. It wants a per-step
       MAP SIZE, and three builds the shadow render target once, from
       `shadow.mapSize`, when the node graph compiles; writing that field later
       resizes nothing. Recorded rather than done. */
    const yHigh = maxBuilt * 1.5;
    const lean = Math.abs(camF.y) > 1e-4 ? yHigh / camF.y : 0;
    for (const [x, z] of corners) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      out.push(new Vector3(x, 0, z));
      out.push(new Vector3(x + camF.x * lean, yHigh, z + camF.z * lean));
    }
    return out;
  }

  /** the shadow box, for the corners last supplied — re-run when the sun moves */
  function refit(): void {
    const pts = fitCorners();
    if (!pts) return;
    lightBasis();

    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    let w0 = Infinity, w1 = -Infinity;
    for (const p of pts) {
      const u = p.dot(lx), v = p.dot(ly), w = p.dot(sunDir);
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
      if (w < w0) w0 = w;
      if (w > w1) w1 = w;
    }
    if (!Number.isFinite(u0)) return;

    /* a caster sitting ON the box's rim is half in and half out; three culls
       by bounding sphere, so what is lost is the silhouette of the largest
       thing at the edge. One block's worth of slack, and no more. */
    const pad = 60;
    u0 -= pad; u1 += pad; v0 -= pad; v1 += pad;

    let spanU = u1 - u0;
    let spanV = v1 - v0;
    /* ── TEXEL SNAPPING ─────────────────────────────────────────────────
       A box whose centre moves by a fraction of a texel re-quantises every
       shadow edge in the frame, and a pan turns into a crawl along every
       silhouette in the city. Rounding the box's span UP to a whole texel and
       its centre to a whole texel makes the map's grid stand still in world
       space while the camera moves across it. */
    const tU = spanU / dir.shadow.mapSize.x;
    const tV = spanV / dir.shadow.mapSize.y;
    let uc = (u0 + u1) / 2;
    let vc = (v0 + v1) / 2;
    if (tU > 0 && tV > 0) {
      uc = Math.round(uc / tU) * tU;
      vc = Math.round(vc / tV) * tV;
      /* the snap moves the centre by up to half a texel, so the box grows by
         one to keep both edges covered */
      spanU += tU;
      spanV += tV;
    }

    cam.left = -spanU / 2;
    cam.right = spanU / 2;
    cam.top = spanV / 2;
    cam.bottom = -spanV / 2;

    /* depth costs no texels: the near plane goes back far enough to swallow
       anything standing between the box and the sun, and the far plane past
       the bottom of the slab. */
    const wc = (w0 + w1) / 2;
    const back = (w1 - wc) + 200;
    cam.near = 1;
    cam.far = back + (wc - w0) + 200;
    cam.updateProjectionMatrix();

    const centre = new Vector3()
      .addScaledVector(lx, uc)
      .addScaledVector(ly, vc)
      .addScaledVector(sunDir, wc);
    dir.target.position.copy(centre);
    dir.target.updateMatrixWorld();
    dir.position.copy(centre).addScaledVector(sunDir, back);
    dir.updateMatrixWorld();

    fitStats.spanU = spanU;
    fitStats.spanV = spanV;
    fitStats.mPerTexelU = spanU / dir.shadow.mapSize.x;
    fitStats.mPerTexelV = spanV / dir.shadow.mapSize.y;

    /* ── AND THE BIAS FOLLOWS THE TEXEL ─────────────────────────────────
       Acne is a function of how far a texel's worth of surface can slope away
       from the depth stored for it, so the bias that stops it is proportional
       to the texel's own size. A fixed 1.2 m was solved at one camera and is
       four times too much at the street camera, where it lifts every shadow
       off the wall that casts it. 0.9 of a texel was the smallest multiple
       that stayed clean at all four. */
    const texel = Math.max(fitStats.mPerTexelU, fitStats.mPerTexelV);
    dir.shadow.normalBias = texel * 0.9;
    dir.shadow.bias = -Math.max(1e-5, texel * 4e-5);
  }

  return {
    dir,
    hemi,
    ambient,
    key,
    get levels() {
      return levels;
    },
    get look() {
      return look;
    },
    get fitStats() {
      return fitStats;
    },
    aimKey(right: Vector3, forward?: Vector3) {
      /* ── AND THE SUN SWINGS ROUND TO STAND BEHIND THE KEY ────────────────
         The published page holds two directions at once: its WALLS are shaded
         from screen-right (`planeQuartile`) and its shadow marks are thrown
         from the world sun at azimuth 69 degrees. It can afford that, because
         its shadow is a translated copy of a footprint filled translucent —
         a mark, not a measurement, and a mark does not have to agree with the
         light that made the wall it starts from.

         This renderer throws a real shadow, so the two cannot disagree: a
         tower lit down its right-hand face and casting its shadow off to the
         north reads as two suns. MEASURED with the sun left at 69 degrees, the
         wall the sun happened to face came back at 172 where the page draws
         110 — the ramp inverted on a third of the city's walls.

         There is a second reason, and it is the one that decides it. Under
         this projection screen-y does not depend on world x at all, so a sun
         whose azimuth is screen-right throws every shadow HORIZONTALLY across
         the frame — never up-screen, where it would hide behind the very thing
         casting it. Swing the azimuth toward the reader and the shadows fall
         away from the eye and disappear behind the towers; swing it away and
         the whole city is backlit and every visible wall is in shade. */
      sunDir.copy(right).multiplyScalar(Math.cos(SUN_ELEV));
      sunDir.y += Math.sin(SUN_ELEV);
      sunDir.normalize();
      if (forward) camF.copy(forward);
      refit();

      /* the key's own elevation is an OUTPUT of the solve — see `solveSunRig`
         — so this only has to put its azimuth on screen-right and tilt it by
         however far the look asked for. */
      key.position.copy(right).multiplyScalar(Math.cos(levels.keyElev));
      key.position.y += Math.sin(levels.keyElev);
      key.position.normalize();
      /* a hemisphere light's axis is its POSITION, and a position of length 1
         at the origin is fine; three normalises it in the shader anyway. */
    },
    fit(corners) {
      lastCorners = corners;
      refit();
    },
    setEnabled(on: boolean) {
      /* ── DO NOT TOGGLE `castShadow` ONCE THE MAP EXISTS ─────────────────
         On the node backend the shadow map is built inside the light's own
         node graph, and clearing `castShadow` after that graph is compiled
         leaves the graph holding a null render target: the very next frame
         throws `Cannot read properties of null (reading 'depthTexture')`
         inside `ShadowNode.updateShadow`. It cost a measurement run to find.

         So `castShadow` is only touched before anything has been drawn — the
         phone tier, which decides at construction — and a runtime toggle rides
         `shadow.intensity`, which is a uniform and removes the shadow's EFFECT
         without disturbing the map. */
      dir.shadow.intensity = on ? 1 : 0;
      if (dir.shadow.map === null) dir.castShadow = on;
    },
    setLook(p: Partial<SunLook>) {
      Object.assign(look, p);
      levels = solveSunRig(look, luminance, skyI, ambientI);
      applyLevels();
      /* the key's elevation is part of the solve, so its axis has to be rebuilt
         with it — the azimuth is whatever `aimKey` last put on screen-right */
      const azim = Math.hypot(key.position.x, key.position.z) || 1;
      const kx = key.position.x / azim;
      const kz = key.position.z / azim;
      key.position.set(
        kx * Math.cos(levels.keyElev),
        Math.sin(levels.keyElev),
        kz * Math.cos(levels.keyElev),
      );
    },
    dispose() {
      scene.remove(hemi, ambient, key, dir, dir.target);
      dir.dispose();
      hemi.dispose();
      ambient.dispose();
    },
  };
}
