/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/bikeways.ts — WHERE THE CITY PAINTED A BICYCLE.

   `build_bikeways.py` ships 5,287 pieces of bikeway, 720 km of it, each
   carrying the year the city installed it. DataSF's own register dates 81 %
   of them without any inference at all, which makes this one of the few
   layers on the map whose clock needs no argument at all.

   61 dated segments were in place by 1980. 1,355 by 2005. 4,306 today.

   ── THE FOUR CLASSES ARE NOT THE SAME CLAIM ──────────────────────────────
   A map that draws all four alike says San Francisco has 720 km of bike
   lane. It has 214 km of painted lane, 90 km physically separated, 78 km of
   path away from traffic — and 338 km of SHARED LANE, which is a road with a
   picture of a bicycle on it and no lane at all. Drawing that as a lane
   would be the map telling the reader something the register does not say.

   So the separated and painted classes get a solid ribbon, and the shared
   lane is drawn dashed and thinner: a marking, which is what it is.

   ── IT SITS ON THE ROAD, IN FRONT OF IT ──────────────────────────────────
   `engine.ts` §A LAYER MAY STATE ITS OWN SEAT. Paint is on top of the
   carriageway, so this seats ahead of the whole road stack for exactly the
   reason `rail.ts` does, and seating is depth along the view axis — it costs
   nothing on screen.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Scene,
} from "three";
import type { CityData } from "@/lib/city/data";
import type { CityLayer } from "../engine";

export interface BikewayLayerOptions {
  scene: Scene;
  elevAt: (x: number, y: number) => number;
  zex: number;
}

interface BikeFile {
  segs: { y: number; c: number; p: [number, number][] }[];
  classes?: Record<string, string>;
}

/** widths in world metres — a drawing convention, not a measurement */
const W_BY_CLASS: Record<number, number> = { 1: 3.0, 2: 2.4, 3: 1.6, 4: 2.8 };

/* SF paints its bike lanes green, and the register's own classes are held
   apart by tone as well as by width: the separated lane is the strongest
   green, the shared lane the weakest thing on the road. */
const C_BY_CLASS: Record<number, number> = {
  1: 0x3f7d4a,
  2: 0x4f9256,
  3: 0x6f7f63,
  4: 0x2f6f42,
};

/** a shared lane is a MARKING: drawn as dashes, not as a continuous lane */
const DASH_ON_M = 6;
const DASH_OFF_M = 7;

const BIKE_RUNG = 6.8;
/** ahead of the road stack, like the track — see `systems.ts` and `rail.ts` */
const BIKE_SEAT_M = 10.5;
const LIFT_M = 0.18;

export async function bikewayLayer(
  data: CityData,
  o: BikewayLayerOptions,
): Promise<(CityLayer & { km: number }) | null> {
  let file: BikeFile;
  try {
    const res = await fetch(`${data.assetBase}/base/bikeways.json`);
    if (!res.ok) return null;
    file = (await res.json()) as BikeFile;
  } catch {
    /* a city with no bikeway file draws none, which is not an error */
    return null;
  }
  if (!file.segs?.length) return null;

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new Color();
  let zex = o.zex;
  let km = 0;

  /** one flat ribbon from a to b */
  const quad = (
    ax: number, ay: number, bx: number, by: number, w: number, hex: number,
  ): void => {
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy);
    if (!(L > 1e-6)) return;
    const nx = -dy / L;
    const ny = dx / L;
    const h = w / 2;
    const az = o.elevAt(ax, ay) + LIFT_M;
    const bz = o.elevAt(bx, by) + LIFT_M;
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

  /* the file arrives in year order, so the century scrub is a draw range */
  const marks: { year: number; upto: number }[] = [];
  let lastYear = -1;
  for (const s of file.segs) {
    const yr = s.y || 0;
    if (yr !== lastYear) {
      if (lastYear >= 0) marks.push({ year: lastYear, upto: idx.length });
      lastYear = yr;
    }
    const w = W_BY_CLASS[s.c] ?? 2;
    const hex = C_BY_CLASS[s.c] ?? C_BY_CLASS[3];
    for (let k = 0; k + 1 < s.p.length; k++) {
      const [ax, ay] = s.p[k];
      const [bx, by] = s.p[k + 1];
      const L = Math.hypot(bx - ax, by - ay);
      km += L / 1000;
      if (s.c !== 3) {
        quad(ax, ay, bx, by, w, hex);
        continue;
      }
      /* the shared lane, dashed along its own length so the rhythm is the
         same on a long block and a short one */
      const ux = (bx - ax) / L;
      const uy = (by - ay) / L;
      for (let t = 0; t < L; t += DASH_ON_M + DASH_OFF_M) {
        const t1 = Math.min(L, t + DASH_ON_M);
        quad(ax + ux * t, ay + uy * t, ax + ux * t1, ay + uy * t1, w, hex);
      }
    }
  }
  if (lastYear >= 0) marks.push({ year: lastYear, upto: idx.length });
  if (!idx.length) return null;

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new Float32BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
  });
  const mesh = new Mesh(g, mat);
  mesh.scale.y = zex;
  mesh.renderOrder = BIKE_RUNG;
  mesh.userData.wash = true;
  mesh.userData.washM = BIKE_SEAT_M;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  o.scene.add(mesh);

  return {
    name: "bikeways",
    km: Math.round(km * 10) / 10,
    onStep(_step: number, z: number): void {
      zex = z;
      mesh.scale.y = zex;
    },
    onYear(year: number | undefined): void {
      let upto = idx.length;
      if (year !== undefined) {
        upto = 0;
        for (const m of marks) {
          if (m.year > year) break;
          upto = m.upto;
        }
      }
      g.setDrawRange(0, upto);
      mesh.visible = upto > 0;
    },
    dispose(): void {
      o.scene.remove(mesh);
      g.dispose();
      mat.dispose();
    },
  };
}
