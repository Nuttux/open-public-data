/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/rail-history.ts — THE TRACK THAT IS NO LONGER THERE.

   `layers/rail.ts` draws today's ten lines, dated. It cannot draw a line that
   was torn up, because its geometry is DataSF's CURRENT route file, and San
   Francisco's system peaked around 1920 at roughly four times what survived.
   So the century scrub showed a network that only ever grew, which is a
   picture of the record's shape and not of the city's.

   `build_rail_history.py` resolves routes from the Board's own words onto
   street centrelines that are still there. This draws them.

   ── AND THIS IS THE FIRST LAYER THAT CAN TAKE SOMETHING AWAY ─────────────
   A route may carry `ended`: the year the Board authorised the tracks to be
   LIFTED. Ordinance No. 15.0918 of 1935 is the shape of it — *"Authorizing
   Market Street Railway Company to abandon and discontinue street car service
   and remove its street railway tracks from Bryant Street from Second Street
   to Sterling Street"*. Every other layer on this map is a prefix of a sorted
   buffer; this one is a per-route test, because a route that ENDS is not a
   prefix of anything.

   The cost is one draw range per route rather than one for the layer, which
   is six calls today and would be a few dozen at full coverage — nothing
   beside the 995 the buildings already issue.

   ── WHAT `year` 0 MEANS HERE, AND IT IS NOT THE SAME AS ELSEWHERE ────────
   An abandonment ordinance proves the track EXISTED by the year it was
   removed and says nothing about when it was laid. So `year` 0 is a floor —
   drawn from the first frame, `streets.ts`'s convention for a silent record —
   and not a claim that the track dates from 1906.

   ── IT IS DRAWN AS THE HISTORIC HAND, NOT AS TODAY'S STEEL ───────────────
   A vanished line drawn identically to a running one would say the city still
   has it. It gets its own tone and no sleepers: this is a line the map knows
   the ROUTE of, from a sentence, and not the ballast and gauge of.
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

export interface RailHistoryOptions {
  scene: Scene;
  elevAt: (x: number, y: number) => number;
  zex: number;
}

interface HistRoute {
  name: string;
  year: number;
  ended?: number | null;
  kind: string;
  lines: [number, number][][];
}

interface HistFile {
  routes: HistRoute[];
}

/** wide enough to read at the district camera, like the transit diagram —
 *  this is a route the map knows from a sentence, not a track it has surveyed */
const W_M = 22;
/** a colder, older tone than the running network's steel */
const C_HIST = 0x8c5a3c;
const RUNG = 6.7;
const SEAT_M = 10.2;
const LIFT_M = 0.22;

export async function railHistoryLayer(
  data: CityData,
  o: RailHistoryOptions,
): Promise<(CityLayer & { routes: number; km: number }) | null> {
  let file: HistFile;
  try {
    const res = await fetch(`${data.assetBase}/base/rail-history.json`);
    if (!res.ok) return null;
    file = (await res.json()) as HistFile;
  } catch {
    return null;
  }
  if (!file.routes?.length) return null;

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new Color();
  c.setHex(C_HIST, SRGBColorSpace);
  let zex = o.zex;
  let km = 0;

  /* one geometry GROUP per route, so a route can be switched on and off on
     its own — a line that ends is not a prefix of the buffer */
  const spans: { start: number; count: number; from: number; to: number }[] = [];
  const g = new BufferGeometry();

  for (const r of file.routes) {
    const start = idx.length;
    for (const line of r.lines) {
      for (let k = 0; k + 1 < line.length; k++) {
        const [ax, ay] = line[k];
        const [bx, by] = line[k + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy);
        if (!(L > 1e-6)) continue;
        km += L / 1000;
        const nx = -dy / L;
        const ny = dx / L;
        const h = W_M / 2;
        const az = o.elevAt(ax, ay) + LIFT_M;
        const bz = o.elevAt(bx, by) + LIFT_M;
        const i = pos.length / 3;
        pos.push(
          ax + nx * h, az, ay + ny * h,
          ax - nx * h, az, ay - ny * h,
          bx - nx * h, bz, by - ny * h,
          bx + nx * h, bz, by + ny * h,
        );
        for (let q = 0; q < 4; q++) col.push(c.r, c.g, c.b);
        idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      }
    }
    spans.push({
      start,
      count: idx.length - start,
      from: r.year || 0,
      to: r.ended ?? Infinity,
    });
  }
  if (!idx.length) return null;

  g.setAttribute("position", new Float32BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new Float32BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  for (const s of spans) g.addGroup(s.start, s.count, 0);

  const mat = new MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
    depthTest: false, depthWrite: false,
  });
  const mesh = new Mesh(g, mat);
  mesh.scale.y = zex;
  mesh.renderOrder = RUNG;
  mesh.userData.wash = true;
  mesh.userData.washM = SEAT_M;
  mesh.userData.systemLit = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  /* off until a reader asks for the transport system — this is a claim about
     what is GONE and it does not belong in the default view of the city */
  mesh.visible = false;
  o.scene.add(mesh);

  let yearNow: number | undefined;
  /* ── AT THE PRESENT THIS LAYER STANDS DOWN ─────────────────────────────
     First written to draw, at the present, every route with no `ended`. That
     put the Geary Street Municipal Railway on today's map, and Geary has had
     no rail since the 1950s — the map asserting a line that is gone, on the
     grounds that the Board never wrote down when it went. Searched for: the
     1955 and 1956 volumes carry no abandonment for it, so the record does not
     settle it and nothing here may guess.

     The rule instead: this layer answers "what did the record say was here in
     YEAR Y". The PRESENT is not a question about the record — `rail.ts` is
     the authority on it, out of a register of what runs today. So at the
     present the historic layer draws nothing at all, and it cannot assert the
     survival of anything. */
  const apply = (): void => {
    const y = yearNow;
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      const on = y !== undefined && y >= s.from && y < s.to;
      g.groups[i].count = on ? s.count : 0;
    }
  };
  apply();

  return {
    name: "rail-history",
    routes: file.routes.length,
    km: Math.round(km * 10) / 10,
    onStep(_step: number, z: number): void {
      zex = z;
      mesh.scale.y = zex;
    },
    onYear(year: number | undefined): void {
      yearNow = year;
      apply();
    },
    dispose(): void {
      o.scene.remove(mesh);
      g.dispose();
      mat.dispose();
    },
  };
}
