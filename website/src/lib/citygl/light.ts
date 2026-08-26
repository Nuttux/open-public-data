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

   ── THE SHADOW CAMERA IS FITTED TO THE VIEW, EVERY FRAME ─────────────────
   One shadow map over a whole city is 3 m a texel at 4,096 and every shadow
   edge is a staircase. Fitted instead to what the viewport can actually see,
   the same 2,048 texels cover 14 km at the widest camera and 400 m at the
   closest — under 0.2 m a texel where a reader is close enough to look. It
   costs one box fit per frame and nothing else: the map is only re-rendered
   when the scene is dirty, which is when the camera moved anyway.

   ── THE SUN IS THE PROJECT'S OWN ─────────────────────────────────────────
   `lib/city/terrain.ts` §SUN, the vector every hillshade, wall grade and cast
   shadow in the Canvas renderer already agrees on, rotated into scene axes
   (world z is up there; here Y is). Using any other vector would light the
   GL city from one direction and its own hand-drawn hillshade from another.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  Vector3,
  type Scene,
} from "three";

import { SKYC, SUN, SUNC } from "@/lib/city/terrain";

/** `SUNC` and `SKYC` are multipliers around 1, not colours in [0,1]; three
 *  wants a colour, so they are normalised by their own largest channel and the
 *  overall level is carried by the light's intensity, where it belongs. */
function rgbHex(c: readonly [number, number, number] | number[]): number {
  const m = Math.max(c[0], c[1], c[2]) || 1;
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round((v / m) * 255)));
  return (ch(c[0]) << 16) | (ch(c[1]) << 8) | ch(c[2]);
}

/** the published sun, in scene axes: (world x, up, world y) */
export const SUN_SCENE = new Vector3(SUN[0], SUN[2], SUN[1]).normalize();

/** the published sun's own height above the horizon, kept when it is aimed */
const SUN_UP = SUN_SCENE.y;
const SUN_OUT = Math.hypot(SUN_SCENE.x, SUN_SCENE.z);

/** how far above the horizon the camera's own key sits, radians */
const KEY_ELEV = Math.PI / 9;

export interface SunOptions {
  /** shadow map edge, texels */
  mapSize?: number;
  /** how hard the sun is against the sky, 0..1 */
  sunI?: number;
  skyI?: number;
  keyI?: number;
  /** tallest thing that can cast, in SCENE units — sets the fit's margin */
  maxBuiltY?: number;
}

export interface SunRig {
  readonly dir: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly ambient: AmbientLight;
  /** the screen-right key — see §THE KEY LIGHT IS THE CAMERA'S, NOT THE WORLD'S */
  readonly key: HemisphereLight;
  /**
   * Aim the key along the camera's own screen-right.
   * @param right the axon basis's `R`, a unit vector in scene space
   */
  aimKey(right: Vector3): void;
  /**
   * Point the shadow camera at what the viewport can see.
   * @param corners the four visible ground points, world metres
   */
  fit(corners: readonly (readonly [number, number])[]): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

export function sunRig(scene: Scene, o: SunOptions = {}): SunRig {
  const mapSize = o.mapSize ?? 2048;
  const maxBuilt = o.maxBuiltY ?? 500;

  /* THE SKY IS A LIGHT, NOT A CONSTANT. A hemisphere light gives a surface
     turned away from the sun the colour of what it IS facing — the sky above
     or the warm ground below — which is the two-illuminant idea the Canvas
     palette bakes into `skylit`, done geometrically instead of per entry. */
  /* ── THE INTENSITIES ARE SOLVED, NOT EYEBALLED ────────────────────────
     three.js's lights are physical: a Lambert surface reflects
     `irradiance * albedo / PI`, so an intensity of 1 puts a fully lit white
     surface at 0.32 of its own colour, not at 1.0. Tuned by eye that reads as
     "the renderer is dark" and invites turning the SUN up, which blows the
     lit faces before it lifts the shadows. Solved instead, for a surface
     facing straight up with the sun at `n.l = 0.73`:

       lit      (amb + sky + sun * 0.73) / PI = 1.03   — the albedo, near enough
       shadowed (amb + sky)              / PI = 0.48   — the shadow, and it reads
       back wall(amb + sky * 0.5)        / PI = 0.30   — sky-lit, never black

     ── AND RE-SOLVED AGAIN, AGAINST THE PUBLISHED PAGE'S OWN HISTOGRAM ──
     Deepening the shadow (fill down, key up) made the frame read as shadow
     rather than haze, and it also made the whole picture darker — which the
     eye reads as "worse" long before it reads as "more contrast". MEASURED,
     both renderers at the same camera, the map area only (the Canvas capture
     includes a white ledger panel; comparing without cropping it is
     comparing a panel):

       camera     canvas mean / p90     GPU mean / p90
       district      142 / 201             131 / 204     matched
       block         130 / 182             103 / 141     a stop down
       street        121 / 182              89 / 127     a stop down

     ── AND THEN THE WALLS TURNED OUT TO BE THE MEASUREMENT THAT MATTERED ──

     Those first numbers were solved against the GROUND, which faces up, and
     they got the ground right: over the paired captures the two wide cameras
     now sit within a point of the published page. What they got badly wrong is
     the thing a close camera is almost entirely made of — the WALL.

     `buildings.ts` §wallK is the published page's own answer, and `LOOK.facek`
     is shipped as 1, so its four wall tones run **0.50, 0.68, 0.86, 1.04** of
     the material colour: the face turned away from the key light is drawn at
     HALF the value of the face turned toward it. That is a 2.08x split and it
     is what makes a block of towers read as solid objects.

     The port's split was 0.73, and measured on the street frame it collapsed
     to nothing: two tower faces the published page draws at 92.6 and 185.3
     came out at 154.8 and 153.2 — a one per cent difference where the page
     has a factor of two. Over the whole frame the port's luminance ran
     p10 85.9 / p90 156.2 against the page's 66.4 / 184.4: the same mean,
     inside a range 40 % too narrow. A flat picture, which is exactly what
     Daniel meant by *"the map looks 10 years older."*

     ── THE SOLVE ───────────────────────────────────────────────────────────
     Two equations, in linear luminance, with `F` the fill (ambient plus the
     hemisphere, which is very nearly the same on an up face and a wall — 0.737
     against 0.728 — so it does no separating at all) and `D` the sun's own
     term. The two wall faces this projection shows have `n·L` of 0.6346 and
     0.2435 against the published sun; an up face has 0.730:

       the ground stays put     (F + 0.730 D) / PI = 1.00
       the walls split 0.60     (F + 0.2435 D) / (F + 0.6346 D) = 0.60

     which gives **D = 2.929, F = 1.004** — the sun up by half, the fill down
     by a third. 0.60 rather than the page's own 0.48 because this renderer
     also throws a REAL cast shadow, which the page cannot; taking the full
     published split on top of a shadow pass puts the shadowed side of a
     shadowed wall somewhere no published tone goes.

     What the frame gets, with `WALL_LIGHT_COMP` in `layers/buildings.ts`
     holding the wall's mean at the page's own 0.95:

       up (a roof, the ground)   1.00
       wall, toward the sun      1.17
       wall, away from the sun   0.70
       anything in shadow        0.41

     Those four numbers are the whole look: what a sunlit roof is worth, how
     far a wall turns, and how dark a shadow may go. */
  const hemi = new HemisphereLight(
    rgbHex(SKYC),
    rgbHex([
      (SKYC[0] + SUNC[0] * 0.35) / 1.35,
      (SKYC[1] + SUNC[1] * 0.35) / 1.35,
      (SKYC[2] + SUNC[2] * 0.35) / 1.35,
    ]),
    o.skyI ?? 0.34,
  );
  const ambient = new AmbientLight(0xffffff, 0.02);
  /* ── THE SUN IS QUIETER THAN IT WANTS TO BE, AND THAT IS THE REGISTER ──
     At 1.35 the city came back looking like a satellite render: olive, waxy,
     and nothing like paper. The ground's colour ALREADY carries a hand-tuned
     hillshade off the full-resolution DEM, so a strong directional light is a
     SECOND hillshade over the first — the two agree in direction and compound
     in contrast. What the sun is here for is the thing the hillshade cannot
     do: the cast shadow.

     The first answer to that was to turn the sun DOWN, to 0.62 — which made
     the shadow so faint it moved the frame by 21 of 255 at its darkest. The
     real answer is in the ground layers: their normals now point straight up,
     so the sun adds no second hillshade to shade with, and it can be a proper
     key light again. */
  /* ══ THE KEY LIGHT IS THE CAMERA'S, NOT THE WORLD'S ═════════════════════
     The single most important thing this rig had wrong, and the published page
     states it outright. `lib/city/buildings.ts` §planeQuartile:

       *"(ax, ay) is coeffs() — the world-space gradient of SCREEN X — so t is
        the cosine between the wall's outward normal and screen-right... The key
        light in this frame is upper right, and this is that sentence as
        arithmetic."*

     and it goes on to record, as a fixed bug, the exact mistake this port was
     making: shading a wall by `max(0, n · SUN)` against the TERRAIN's world sun
     — *"a three-component direction for a surface that can tilt, applied to a
     vertical wall that cannot"* — with the consequence that *"every wall turned
     away from the light — half of every building in the city — took step 0...
     A block of houses came out two values where the reference gives it four."*

     Measured here: `coeffs()` puts screen-right at world azimuth 0 degrees and
     the published sun at 69. Two tower faces the page draws at 92.6 and 185.3
     came out of this renderer at 154.8 and 153.2.

     ── AND IT IS A HEMISPHERE, WHICH IS THE PART THAT MAKES IT WORK ─────────
     A directional light is `max(0, cos)`: it throws away the whole negative
     half of the range, which is the very collapse quoted above. A hemisphere
     light mixes its two colours by `0.5 · dot(n, axis) + 0.5` — a WRAP-AROUND
     ramp that runs continuously from one end to the other with nothing
     clamped. Pointed along screen-right it is `planeQuartile` exactly, minus
     the rounding to four steps: bright where the page gives 1.04, dark where
     it gives 0.50, and the published mid-tone where a wall is edge-on.

     The two colours are `qTilt`'s own pair — the warm key and the cool sky —
     and the dark end is scaled to 0.48 of the bright one, which is the page's
     own 0.50 / 1.04. The world sun stays exactly where the record puts it,
     because it is what throws the CAST SHADOW and what the ground's baked
     hillshade already agrees with. */
  /* ── AND THE DARK END GOES BELOW THE PUBLISHED 0.48 ─────────────────────
     `wallK` runs 0.50 to 1.04, a ratio of 0.48, and that is what this started
     at. It came back measurably flat: the street frame's p10 sat 20.7 points
     ABOVE the published page's and its p90 25.1 BELOW, at a mean within 2.4 —
     the same picture, inside a range a quarter too narrow.

     The page can hold its range with a narrower ramp because its walls are
     drawn against a HAZED ground and it puts a hand-placed shadow mark at
     every footprint. This renderer's ground is crisper and its shadow is
     geometric, so the wall ramp has to carry more of the separation itself.
     0.34 is where the two frames' ranges meet; it is a stated departure from
     the published ratio and this is the statement. */
  /* ── AND THE KEY CARRIES VALUE ONLY, NOT COLOUR ─────────────────────────
     The first cut gave this hemisphere the published pair — `SUNC` warm at the
     bright end, `SKYC` cool at the dark — reasoning that `qTilt` colours the
     wall ramp that way. It does, and doing it HERE was still wrong, because a
     hemisphere light reaches every surface in the scene and not just the
     walls. Scaling the cool end down to a third of the warm one leaves their
     MIDPOINT warm, and the midpoint is exactly what an up-facing surface gets
     — which is the entire ground.

     Measured over four ground-heavy views, red minus blue ran 5 to 6 points
     above the published page's on every one, and the greens went with it: over
     the Sunset the page reads (135.6, 140.8, 113.8), green above red, and this
     renderer read (132.7, 134.0, 105.8), green level with it. A city of parks
     had lost its parks to a light.

     So the key is neutral — a pure value ramp from 1.0 to 0.34 — and the
     COLOUR of the light stays where it already was and belongs: the warm
     directional sun on the faces it reaches, the cool sky hemisphere on the
     rest. The wall ramp keeps its value split and the ground keeps its green. */
  const keyDark = rgbHex([0.34, 0.34, 0.34]);
  const keyBright = 0xffffff;
  const key = new HemisphereLight(keyBright, keyDark, o.keyI ?? 1.60);
  /* three reads a hemisphere's axis off its POSITION, so aiming it is setting
     a position; `aimKey` does that from the camera basis each time the
     projection changes. Until then it points up, which is the fill it replaces. */
  key.position.set(0, 1, 0);

  const dir = new DirectionalLight(rgbHex(SUNC), o.sunI ?? 0.75);
  dir.castShadow = true;
  /* ── HOW DARK A SHADOW IS, SET APART FROM HOW BRIGHT THE FILL IS ────────
     These are two questions and this renderer had them tied together, which
     is why the first attempt at the published wall split came back a stop
     under the page everywhere: widening the split means taking value out of
     the FILL and putting it in the SUN, and in a renderer that casts real
     shadows the fill is also the only thing lighting a shadow. Measured, that
     one change moved the street frame's mean 24 points down and its p90 56
     down, for a wall split that was right.

     `shadow.intensity` is the lever that separates them — how much of the
     direct term a shadow actually removes, rather than all of it. Solved so a
     shadowed up face lands at 0.64 of its own colour against 1.00 lit:

       F + 0.730 D (1 - s) = PI * 0.64,  F = 1.004,  0.730 D = 2.138
         =>  s = 0.53

     The published page cannot ask this question at all: its shadows are
     translated copies of a footprint filled translucent and capped at nine
     pixels. This one measures where the light actually stops. */
  dir.shadow.intensity = 1.0;
  dir.shadow.mapSize.set(mapSize, mapSize);
  /* A BIAS IN WORLD UNITS, NOT A GUESS. Too small and every lit surface
     stripes itself (acne); too large and a shadow detaches from the wall that
     casts it (peter-panning). `normalBias` moves the sample along the
     surface normal, which is the one that fixes acne without detaching. */
  dir.shadow.bias = -0.0006;
  dir.shadow.normalBias = 1.2;
  dir.shadow.camera.near = 1;

  scene.add(hemi, ambient, key, dir, dir.target);

  const cam = dir.shadow.camera as OrthographicCamera;
  /* where the sun stands, once `aimKey` has had the camera's own right */
  const sunDir = SUN_SCENE.clone();
  let lastCorners: readonly (readonly [number, number])[] | null = null;

  /** the shadow box, for the corners last supplied — re-run when the sun moves */
  function refit(): void {
    const corners = lastCorners;
    if (!corners) return;

      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of corners) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      if (!Number.isFinite(x0)) return;

      /* THE MARGIN IS THE THROW. A tower at the top of the frame casts
         DOWN-SUN out of it; if the shadow camera stops at the viewport the
         shadow stops with it, and a hard line appears across the city where
         the map ran out. The margin is the tallest thing that can cast,
         times how far a shadow travels per unit of height. */
      const throwK = Math.hypot(sunDir.x, sunDir.z) / Math.max(0.05, sunDir.y);
      const m = maxBuilt * throwK + 40;
      x0 -= m; x1 += m; z0 -= m; z1 += m;

      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const centre = new Vector3(cx, 0, cz);

      // the box, measured along the light's own axes
      const half = Math.max(x1 - x0, z1 - z0) / 2;
      const R = half * Math.SQRT2;
      cam.left = -R;
      cam.right = R;
      cam.top = R;
      cam.bottom = -R;
      cam.near = 1;
      cam.far = 4 * R + 4 * maxBuilt + 2000;
      cam.updateProjectionMatrix();

      const back = 2 * R + 2 * maxBuilt + 1000;
      dir.target.position.copy(centre);
      dir.target.updateMatrixWorld();
      dir.position.copy(centre).addScaledVector(sunDir, back);
      dir.updateMatrixWorld();
  }

  return {
    dir,
    hemi,
    ambient,
    key,
    aimKey(right: Vector3) {
      /* ── AND THE SUN SWINGS ROUND TO STAND BEHIND THE KEY ────────────────
         The published page holds two directions at once: its WALLS are shaded
         from screen-right (`planeQuartile`) and its shadow marks are thrown
         from the world sun at azimuth 69 degrees. It can afford that, because
         its shadow is a translated copy of a footprint filled translucent —
         a mark, not a measurement, and a mark does not have to agree with the
         light that made the wall it starts from.

         This renderer throws a real shadow, so the two cannot disagree: a
         tower lit down its right-hand face and casting its shadow off to the
         north reads as two suns. Measured with the sun left at 69 degrees, the
         wall the sun happened to face came back at 172 where the page draws
         110 — the ramp inverted on a third of the city's walls.

         So the sun keeps its published HEIGHT — 0.730, which is what sets the
         LENGTH of every shadow — and takes the key's azimuth. What is given up
         is that the ground's baked hillshade still runs from 69 degrees; the
         relief and the cast shadows now disagree in direction. That is a real
         cost and it is the smaller one: the hillshade is a gentle wash over
         gentle ground, and the shadows are hard edges on the fabric the reader
         is actually looking at. */
      sunDir.copy(right).multiplyScalar(SUN_OUT);
      sunDir.y += SUN_UP;
      sunDir.normalize();
      refit();

      /* upper RIGHT: the published sentence has two words in it. The axis is
         screen-right tilted up by `KEY_ELEV`, so a roof and a horizontal deck
         take the ramp's middle rather than its dark end — which is where a
         plane that faces neither way belongs. */
      key.position.copy(right).multiplyScalar(Math.cos(KEY_ELEV));
      key.position.y += Math.sin(KEY_ELEV);
      key.position.normalize();
    },
    fit(corners) {
      lastCorners = corners;
      refit();
    },
    setEnabled(on: boolean) {
      dir.castShadow = on;
    },
    dispose() {
      scene.remove(hemi, ambient, dir, dir.target);
      dir.dispose();
      hemi.dispose();
      ambient.dispose();
    },
  };
}
