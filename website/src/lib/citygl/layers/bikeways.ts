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

/* ── AND THE DIAGRAM IS NOT PAINTED, SO IT IS NOT PAINT-COLOURED ───────────
   The greens above are right for the lane: they are roughly what the city
   actually paints. They are wrong for the DIAGRAM, and the frame proved it —
   the ribbons drew, at 20 m, out of depth order, and were still hard to pick
   out, because San Francisco's own ground in this renderer is made of green:
   park, canopy, the Presidio, Golden Gate Park, Mount Sutro. A green line over
   green ground is a line you have to hunt for.

   So the two objects are coloured for their two jobs. The lane on the default
   map keeps the paint. The diagram takes a violet ladder, which is the one
   strong hue nothing else on this map uses — no roof material, no terrain
   ramp entry, no water tone and no district capital — so it cannot be confused
   with a thing the city is made of. The class ladder is preserved exactly:
   separated strongest, path bluer because it is away from traffic, painted
   lane the middle, shared lane the palest because it is a marking. */
const D_BY_CLASS: Record<number, number> = {
  1: 0x5b3fc4,
  2: 0x9333c4,
  3: 0xb87ad0,
  4: 0x7a1fa8,
};

/** a shared lane is a MARKING: drawn as dashes, not as a continuous lane */
const DASH_ON_M = 6;
const DASH_OFF_M = 7;

/* ── §AND AT ANY CAMERA A PAINTED LANE IS TOO NARROW TO FIND ───────────────
   Every width above is the real one: a painted lane is 2.4 m and a shared lane
   is a 1.6 m marking. At the district camera that is under half a pixel, and
   under a street tree it is nothing at all. Driven the way a reader drives it
   — click BIKE NETWORK — the frame came back with 85.2 % of its pixels changed
   by the mute and **no bike network anywhere in it**. Daniel: *"bike lanes
   buildings i dont even get shit"*.

   `rail.ts` had already solved this for the track and the answer transfers
   whole: the system control draws a DIAGRAM of the network over the city, in
   the register's own class colours, and the real painted widths stay for the
   default view. Two buffers rather than a scale, because a ribbon's width
   cannot be scaled independently of its length, and the camera picks.

   These are narrower than the track's on purpose: a bike lane sits IN a
   street beside the traffic, and drawing it as wide as a streetcar right of
   way would say something about the city that is not true. But they are still
   wider than a street — see `rail.ts` §AND A DIAGRAM THE WIDTH OF A STREET IS
   ANOTHER STREET — because a line the same width as the grid it is drawn over
   joins the grid. */
/* ── AND THE DIAGRAM UNDID THE ONE DISTINCTION THIS FILE EXISTS TO MAKE ───
   The header above says it: *"A map that draws all four alike says San
   Francisco has 720 km of bike lane."* The real ribbons obey that. The
   DIAGRAM did not — all four classes went out at one width, with only a tone
   and a dash to tell them apart — and at the district camera a dash closes up.

   So the diagram said the city has 720 km of bike network. MEASURED against
   the same centreline file the bikeways are resolved onto: San Francisco has
   **2,154 km of street**, and

       382 km  a path, a painted lane or a separated way   17.7 % of streets
       338 km  a SHARED LANE — a road with a bicycle
               painted on it and no lane at all            15.7 % of streets

   Drawn alike that is a third of every street in the city lit up, which is
   why Daniel could not tell the bike view from the street view: *"i feel liek
   between the three views its just making more prominent in each some
   arteries but the base network is the same"*. He was reading the picture
   correctly. The picture was wrong.

   Width now carries the class, so the diagram shows what the register
   actually holds: a real network with a thinner web of markings around it. */
const DIAGRAM_BY_CLASS: Record<number, number> = {
  1: 30,   // a path away from traffic
  2: 22,   // a painted lane
  3: 9,    // a marking on a road, and drawn as one
  4: 34,   // physically separated — the strongest thing the register claims
};
const DIAGRAM_NARROW_BY_CLASS: Record<number, number> = {
  1: 9, 2: 7, 3: 3, 4: 10,
};

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
  /* the two diagram widths — see §AND AT ANY CAMERA A PAINTED LANE IS TOO
     NARROW TO FIND */
  const wPos: number[] = []; const wCol: number[] = []; const wIdx: number[] = [];
  const nPos: number[] = []; const nCol: number[] = []; const nIdx: number[] = [];
  const c = new Color();
  let zex = o.zex;
  let km = 0;

  type Buf = { pos: number[]; col: number[]; idx: number[] };
  const real: Buf = { pos, col, idx };
  const wide: Buf = { pos: wPos, col: wCol, idx: wIdx };
  const narrow: Buf = { pos: nPos, col: nCol, idx: nIdx };

  /** one flat ribbon from a to b, into whichever buffer is named */
  const quadInto = (
    b: Buf,
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
    const i = b.pos.length / 3;
    b.pos.push(
      ax + nx * h, az, ay + ny * h,
      ax - nx * h, az, ay - ny * h,
      bx - nx * h, bz, by - ny * h,
      bx + nx * h, bz, by + ny * h,
    );
    c.setHex(hex, SRGBColorSpace);
    for (let k = 0; k < 4; k++) b.col.push(c.r, c.g, c.b);
    b.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };

  /** the lane at its real painted width and paint colour, and the same piece
   *  as a diagram at a diagram's width and colour */
  const quad = (
    ax: number, ay: number, bx: number, by: number,
    w: number, hex: number, dhex: number, cls: number,
  ): void => {
    quadInto(real, ax, ay, bx, by, w, hex);
    quadInto(wide, ax, ay, bx, by, DIAGRAM_BY_CLASS[cls] ?? 22, dhex);
    quadInto(narrow, ax, ay, bx, by, DIAGRAM_NARROW_BY_CLASS[cls] ?? 7, dhex);
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
    const dhex = D_BY_CLASS[s.c] ?? D_BY_CLASS[3];
    for (let k = 0; k + 1 < s.p.length; k++) {
      const [ax, ay] = s.p[k];
      const [bx, by] = s.p[k + 1];
      const L = Math.hypot(bx - ax, by - ay);
      km += L / 1000;
      if (s.c !== 3) {
        quad(ax, ay, bx, by, w, hex, dhex, s.c);
        continue;
      }
      /* the shared lane, dashed along its own length so the rhythm is the
         same on a long block and a short one */
      const ux = (bx - ax) / L;
      const uy = (by - ay) / L;
      for (let t = 0; t < L; t += DASH_ON_M + DASH_OFF_M) {
        const t1 = Math.min(L, t + DASH_ON_M);
        quad(ax + ux * t, ay + uy * t, ax + ux * t1, ay + uy * t1, w, hex, dhex, s.c);
      }
    }
  }
  if (lastYear >= 0) marks.push({ year: lastYear, upto: idx.length });
  if (!idx.length) return null;

  const build = (b: Buf, material: MeshStandardMaterial, rung: number): Mesh => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(b.pos), 3));
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(b.col), 3));
    g.setIndex(b.idx);
    g.computeVertexNormals();
    const m = new Mesh(g, material);
    m.scale.y = zex;
    m.renderOrder = rung;
    m.userData.wash = true;
    m.userData.washM = BIKE_SEAT_M;
    m.castShadow = false;
    m.receiveShadow = false;
    o.scene.add(m);
    return m;
  };

  const mat = new MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
  });
  /* the diagram carries its own matte material, out of depth order, so the
     network lies over the city the way `rail.ts`'s does */
  const diagramMat = new MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
    depthTest: false, depthWrite: false,
  });
  const mesh = build(real, mat, BIKE_RUNG);
  const diagrams = [
    build(wide, diagramMat, BIKE_RUNG + 0.2),
    build(narrow, diagramMat, BIKE_RUNG + 0.2),
  ];
  for (let i = 0; i < diagrams.length; i++) {
    const d = diagrams[i];
    d.userData.layer = "bikeway-overlay";
    /* off until a reader asks for the bike system; `systems.ts` switches any
       mesh that declares this flag, so the layer opts in rather than being
       named there */
    d.userData.systemLit = false;
    d.userData.stepOK = i === 0;
    d.visible = false;
  }

  return {
    name: "bikeways",
    km: Math.round(km * 10) / 10,
    onStep(step: number, z: number): void {
      zex = z;
      mesh.scale.y = zex;
      const wideNow = step < 2;
      for (let i = 0; i < diagrams.length; i++) {
        const d = diagrams[i];
        d.scale.y = zex;
        const u = d.userData as { systemLit?: boolean; stepOK?: boolean };
        u.stepOK = i === 0 ? wideNow : !wideNow;
        d.visible = d.geometry.drawRange.count > 0
          && u.systemLit === true && u.stepOK;
      }
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
      /* the three buffers were filled in lockstep, one quad each per piece of
         lane, so ONE mark serves all three and they cannot drift out of step */
      mesh.geometry.setDrawRange(0, upto);
      mesh.visible = upto > 0;
      for (const d of diagrams) {
        d.geometry.setDrawRange(0, upto);
        const u = d.userData as { systemLit?: boolean; stepOK?: boolean };
        d.visible = upto > 0 && u.systemLit === true && u.stepOK !== false;
      }
    },
    dispose(): void {
      o.scene.remove(mesh);
      mesh.geometry.dispose();
      for (const d of diagrams) {
        o.scene.remove(d);
        d.geometry.dispose();
      }
      mat.dispose();
      diagramMat.dispose();
    },
  };
}
