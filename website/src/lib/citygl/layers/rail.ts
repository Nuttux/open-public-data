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
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
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

/** how far the steel sits over the carriageway, metres — clear of z-fighting */
const RAIL_LIFT_M = 0.12;

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

  /* the year the DATASET describes, not a year anybody chose: it is a current
     network file, so it speaks for its own `asOf` and for nothing earlier */
  const fromYear = Number(String(file.asOf).slice(0, 4)) || 0;

  const pos: number[] = [];
  const idx: number[] = [];
  const half = RAIL_W / 2;
  const off = GAUGE_M / 2;
  let zex = o.zex;

  /* each segment is two ribbons — one rail each side of the centreline. The
     ground is sampled at both ends so track climbs a hill with it. */
  for (const [x0, y0, x1, y1] of file.segs) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    if (!(L > 1e-6)) continue;
    const nx = -dy / L;
    const ny = dx / L;
    for (const s of [-off, off]) {
      const ax = x0 + nx * s;
      const ay = y0 + ny * s;
      const bx = x1 + nx * s;
      const by = y1 + ny * s;
      const az = o.elevAt(ax, ay);
      const bz = o.elevAt(bx, by);
      const i = pos.length / 3;
      pos.push(
        ax + nx * half, az, ay + ny * half,
        ax - nx * half, az, ay - ny * half,
        bx - nx * half, bz, by - ny * half,
        bx + nx * half, bz, by + ny * half,
      );
      idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
  }

  const g = new BufferGeometry();
  const posArr = new Float32Array(pos);
  g.setAttribute("position", new Float32BufferAttribute(posArr, 3));
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
    color: 0xc6ccd2,
    metalness: 0.45,
    roughness: 0.32,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const mesh = new Mesh(g, m);
  mesh.renderOrder = 3;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  o.scene.add(mesh);

  /** lift the steel off the road, on the band's own exaggeration */
  const applyZ = (): void => {
    const p = g.getAttribute("position") as Float32BufferAttribute;
    const a = p.array as Float32Array;
    for (let v = 0; v < a.length; v += 3) a[v + 1] = base[v / 3] * zex + RAIL_LIFT_M;
    p.needsUpdate = true;
    g.computeBoundingSphere();
  };
  /** the un-exaggerated ground height per vertex, kept so a band change is
   *  one multiply rather than a re-sample of the terrain */
  const base = new Float32Array(posArr.length / 3);
  for (let v = 0; v < base.length; v++) base[v] = posArr[v * 3 + 1];
  applyZ();

  return {
    name: "rail",
    trackKm: file.trackKm,
    onStep(_step: number, z: number): void {
      zex = z;
      applyZ();
    },
    onYear(year: number | undefined): void {
      mesh.visible = year === undefined || year >= fromYear;
    },
    dispose(): void {
      o.scene.remove(mesh);
      g.dispose();
      m.dispose();
    },
  };
}
