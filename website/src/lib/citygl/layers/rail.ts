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

   **It is TODAY'S network.** This map runs from 1849 and San Francisco's rail
   was at its largest around 1920, so drawing these eight lines in 1900 would
   be a lie. The layer therefore shows nothing before the dataset's own
   `asOf`, and the historic network stays an open problem rather than an
   invented one.
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
const RAIL_W = 0.45;

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
const GAUGE_M = 2.2;

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

/** the ballast strip, world metres — wide enough to survive the district camera */
const BALLAST_W = 4.2;
/** its tone: the grey-brown of stone chippings, darker than the carriageway */
const BALLAST_C = 0x6b6459;
/** a sleeper's length across the track, and its width along it */
const SLEEPER_LEN_M = 3.2;
const SLEEPER_W_M = 0.55;
/** how far apart the sleepers are laid, world metres */
const SLEEPER_STEP_M = 2.4;
/** creosoted timber, warmer and darker than the ballast it sits in */
const SLEEPER_C = 0x4a4038;
/** the steel itself */
const RAIL_C = 0xc6ccd2;

export interface RailLayerOptions {
  scene: Scene;
  elevAt: (x: number, y: number) => number;
  /** vertical exaggeration of the ground, by camera step */
  zex: number;
}

interface RailFile {
  asOf: string;
  segs: [number, number, number, number, string][];
  trackKm: number;
  lines: string[];
}

export async function railLayer(
  data: CityData,
  o: RailLayerOptions,
): Promise<(CityLayer & { trackKm: number }) | null> {
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
     `9exe-acju` is the CURRENT network. It carries no opening dates and no
     retirements, so it describes exactly one moment: now. San Francisco's rail
     was at its largest around 1920 and has shrunk since, so drawing these ten
     lines in 1950 would be a straightforward lie.

     This used to compare the scrub's year against the file's `asOf` YEAR, and
     that was wrong even though it looked right. `asOf` is a PUBLICATION
     timestamp — 2026-04-08 on the shipped file — so the test read
     `year >= 2026`. It produced present-only behaviour by accident, because no
     year the scrub can select reaches 2026, and it would have started drawing
     track across the whole century the moment somebody rebuilt the file from
     an older extract. A gate whose correctness depends on a build date is not
     a gate.

     So the rule is stated instead of inferred: this layer draws at the PRESENT
     and nowhere else. `onYear(undefined)` is the present — `CityGLMap.tsx`
     turns the scrub's own maximum into `undefined` — and any chosen year, 1906
     or 2025 alike, gets nothing. The historic network stays an open problem
     rather than an invented one. */
  const asOf = String(file.asOf).slice(0, 10);

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
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
  const quad = (
    ax: number, ay: number, bx: number, by: number,
    nx: number, ny: number, w: number, hex: number,
  ): void => {
    const h = w / 2;
    const az = o.elevAt(ax, ay);
    const bz = o.elevAt(bx, by);
    const i = pos.length / 3;
    pos.push(
      ax + nx * h, az, ay + ny * h,
      ax - nx * h, az, ay - ny * h,
      bx - nx * h, bz, by - ny * h,
      bx + nx * h, bz, by + ny * h,
    );
    c.setHex(hex, SRGBColorSpace);
    for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };

  for (const [x0, y0, x1, y1] of file.segs) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    if (!(L > 1e-6)) continue;
    const nx = -dy / L;
    const ny = dx / L;
    const ux = dx / L;
    const uy = dy / L;

    /* the bed, one strip the length of the segment */
    quad(x0, y0, x1, y1, nx, ny, BALLAST_W, BALLAST_C);

    /* the sleepers, across it. Stepped in world metres so the rhythm is the
       same on a long segment and a short one, and offset from the segment's
       own start so two segments meeting at a corner do not double up. */
    for (let t = SLEEPER_STEP_M * 0.5; t < L; t += SLEEPER_STEP_M) {
      const cx = x0 + ux * t;
      const cy = y0 + uy * t;
      const sh = SLEEPER_W_M / 2;
      quad(
        cx - ux * sh, cy - uy * sh,
        cx + ux * sh, cy + uy * sh,
        ux, uy, SLEEPER_LEN_M, SLEEPER_C,
      );
    }

    /* and the steel, one ribbon each side of the centreline */
    for (const sgn of [-off, off]) {
      quad(
        x0 + nx * sgn, y0 + ny * sgn,
        x1 + nx * sgn, y1 + ny * sgn,
        nx, ny, RAIL_W, RAIL_C,
      );
    }
  }

  const g = new BufferGeometry();
  const posArr = new Float32Array(pos);
  g.setAttribute("position", new Float32BufferAttribute(posArr, 3));
  g.setAttribute("color", new Float32BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  /* ── STEEL, AND IT IS NOT FULLY METAL — THE FIRST CUT GOT THAT WRONG ──
     This is the one surface in the fabric meant to be specular; everything
     around it is matte by intent, so the sky environment `engine.ts` builds
     lands here and nowhere else on the ground.

     Shipped at metalness 0.95 and the track came out nearly BLACK. That is
     correct PBR and a bad picture: a metal has no diffuse term at all, it
     shows only what it reflects, and the environment here is a 32x16
     procedural sky at half intensity. Give a mirror nothing to mirror and it
     returns nothing.

     Half metal keeps a diffuse floor, so the rail is a bright line in sun and
     a grey one in shade instead of a black one in both — which is what steel
     in a street actually looks like from above. */
  const m = new MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.45,
    roughness: 0.32,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: RAIL_OFFSET,
    polygonOffsetUnits: RAIL_OFFSET,
  });

  const mesh = new Mesh(g, m);
  mesh.scale.y = zex;
  /* the ladder's own convention: the order is read straight off the offset */
  mesh.renderOrder = -RAIL_OFFSET;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  o.scene.add(mesh);

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
  g.computeBoundingSphere();

  return {
    name: "rail",
    trackKm: file.trackKm,
    onStep(_step: number, z: number): void {
      zex = z;
      mesh.scale.y = zex;
    },
    onYear(year: number | undefined): void {
      /* the present, and only the present — see §WHAT YEAR THIS LAYER CAN
         HONESTLY SPEAK FOR. `asOf` is kept for the provenance panel, not as
         a test. */
      void asOf;
      mesh.visible = year === undefined;
    },
    dispose(): void {
      o.scene.remove(mesh);
      g.dispose();
      m.dispose();
    },
  };
}
