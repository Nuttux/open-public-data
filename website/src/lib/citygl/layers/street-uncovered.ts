/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/street-uncovered.ts — THE ROADS THAT HAVE A NAME AND
   NO ROAD.

   Daniel, looking at the Presidio and Golden Gate Park: *"theres a trace of a
   street but no asphalt nothing, its so freaking weird."* He is looking at a
   real hole in the published data, and it has an exact size.

   ── WHAT IT IS, MEASURED ─────────────────────────────────────────────────
   The city publishes its streets twice and the two files do not agree on how
   many there are:

     centrelines      4,895   `strt-line`, one polyline a street
     rights of way   22,191   `strt`, wall-to-wall polygons
     covered          4,361   centrelines whose own midpoint falls inside a
                              published right of way — `street-misc`'s `cov`
     NOT covered        534

   Those 534 are not a parsing failure and nothing here can recover them from
   the polygon file, because they are not in it. `lib/city/streets.ts` names
   them: *"the park roads, the Great Highway, Sloat, the freeways"* — the
   roads the City's own right-of-way file does not survey, because they are
   federal park land, State highway or grade-separated.

   The port drew each one as a name, a faint centreline, and bare ground.
   Measured over the geometry itself, every one of the 22,191 rights of way
   DOES become triangles — 6 rings out of 44,351 fail to triangulate and 111
   features get no carriageway — so the missing asphalt was never a mesh that
   failed to build. It was a road that was never in the file.

   ── AND THE PUBLISHED PAGE HAS THE SAME HOLE ─────────────────────────────
   Put the two side by side over the Presidio and neither draws a road under
   MORAGA AVE, PRESIDIO BLVD or EL POLIN LOOP. This layer is therefore not a
   parity fix; it is the port doing something the page it came from does not.

   ── THE WIDTH IS MEASURED, NOT PICKED ────────────────────────────────────
   A centreline has no width, so one has to come from somewhere, and the
   honest place is the same city's own rights of way: for each of the five
   published classes, the MEDIAN width of the rights of way that DO carry that
   class. A park road is then drawn at the width the city's own file gives the
   roads it did survey of that class. Where a class has no covered example at
   all the fallback is the network's overall median, and both numbers are
   logged on the layer rather than buried.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
} from "three";

import type { CityData } from "@/lib/city/data";
import { ST_ALPHA, ST_C_ROAD, surfaceW } from "@/lib/city/streets";
import type { CityLayer } from "../engine";

export interface StreetUncoveredOptions {
  elevAt: (x: number, y: number) => number;
  /** the ground's exaggeration — a road is ground, not a built thing */
  zex: number;
}

/** the network's own median right-of-way width, if no class median exists */
const FALLBACK_W_M = 22.3;

/** a ribbon vertex every so many metres, so it follows the hill like the
 *  surfaces do — `layers/streets.ts` splits its triangles at the same 22 m */
const STEP_M = 22;

export function streetUncoveredLayer(
  data: CityData,
  o: StreetUncoveredOptions,
): (CityLayer & { mesh: Mesh; drawn: number; classWidths: number[] }) | null {
  const cells = data.streetLines();
  if (!cells.length) return null;

  /* ── THE CLASS WIDTHS, OFF THE CITY'S OWN SURVEYED ROADS ────────────────
     One pass over the rights of way, bucketed by class, median per bucket.
     The width of a right of way is the SHORTER side of its ring's bounding
     box: a street is long and thin, so the short side is across it. */
  const byClass: number[][] = [[], [], [], [], [], []];
  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "strt") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const c = chunk.fields as unknown as {
      cls: Uint8Array;
      rwN: Uint8Array;
      rwLen: Uint16Array;
      rwX: Float32Array;
      rwY: Float32Array;
    };
    const n = c.cls.length;
    let ring = 0;
    let vert = 0;
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let r = 0; r < c.rwN[i]; r++) {
        const m = c.rwLen[ring];
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let k = 0; k < m; k++) {
          const x = c.rwX[vert + k];
          const y = c.rwY[vert + k];
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        if (Number.isFinite(x0)) w = Math.max(w, Math.min(x1 - x0, y1 - y0));
        vert += m;
        ring++;
      }
      const k = Math.min(5, c.cls[i]);
      if (w > 0) byClass[k].push(w);
    }
  }
  const classWidths = byClass.map((a) => {
    if (!a.length) return FALLBACK_W_M;
    a.sort((p, q) => p - q);
    return a[a.length >> 1];
  });

  const pos: number[] = [];
  const idx: number[] = [];
  const marks: number[] = [];
  const years: number[] = [];
  let drawn = 0;

  /* every uncovered centreline, widest first, so the year gate below can be a
     draw range over an order that is monotone in year */
  interface Job {
    cls: number;
    yr: number;
    x: Float32Array;
    y: Float32Array;
    from: number;
    to: number;
  }
  const jobs: Job[] = [];
  for (const cell of cells) {
    let at = 0;
    for (let i = 0; i < cell.len.length; i++) {
      const m = cell.len[i];
      const covered = (cell.cov[i >> 3] >> (i & 7)) & 1;
      if (!covered && m >= 2) {
        jobs.push({
          cls: Math.min(5, cell.cls[i]),
          yr: cell.yr[i],
          x: cell.x,
          y: cell.y,
          from: at,
          to: at + m,
        });
      }
      at += m;
    }
  }
  jobs.sort((a, b) => (a.yr || 0) - (b.yr || 0));

  for (const j of jobs) {
    const half = (classWidths[j.cls] ?? FALLBACK_W_M) / 2;

    /* ── ONE JOINED RIBBON, NOT A PILE OF LOOSE QUADS ────────────────────
       The first cut emitted an independent quad per segment. At a bend that
       leaves a wedge of bare ground on the outside of the corner and a doubled
       overlap on the inside, and a park road is nothing but bends — Lombard,
       El Polin Loop, the Presidio's whole network. At 26 m wide the gap is
       wider than a lane.

       So the two edges are walked as a strip and each interior vertex is
       MITRED: its offset runs along the bisector of the two segments meeting
       there, lengthened by `1 / sin(theta/2)` so the outer edge stays the full
       half-width away from the centreline through the corner. The miter is
       capped at four half-widths, which is the standard guard — below about
       29 degrees the exact miter runs away to infinity and a bevel is the
       honest answer. */
    const pts: [number, number][] = [];
    for (let k = j.from; k < j.to; k++) {
      const x = j.x[k];
      const y = j.y[k];
      const last = pts[pts.length - 1];
      /* drop the duplicate vertices the published lines carry, or the
         direction at that joint is the zero vector */
      if (!last || Math.hypot(x - last[0], y - last[1]) > 0.05) pts.push([x, y]);
    }
    if (pts.length < 2) continue;

    /* the unit direction of each segment, and the miter at each vertex */
    const dir: [number, number][] = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const dx = pts[k + 1][0] - pts[k][0];
      const dy = pts[k + 1][1] - pts[k][1];
      const L = Math.hypot(dx, dy) || 1;
      dir.push([dx / L, dy / L]);
    }

    const left: number[] = [];
    const right: number[] = [];
    for (let k = 0; k < pts.length; k++) {
      const a = dir[Math.max(0, k - 1)];
      const b = dir[Math.min(dir.length - 1, k)];
      /* the bisector of the two edge normals; its length is cos(theta/2), so
         dividing by it is the miter lengthening */
      const sx = -(a[1] + b[1]);
      const sy = a[0] + b[0];
      const ml = Math.hypot(sx, sy);
      let mx: number;
      let my: number;
      if (ml < 1e-6) {
        /* a hairpin: the two segments double back and the bisector vanishes.
           Fall back to the incoming edge's own normal — a square end is wrong
           by half a width for one vertex and is bounded, which the exact
           miter is not. */
        mx = -a[1];
        my = a[0];
      } else {
        /* `ml / 2` is cos(theta/2), so `2 / ml` is the miter lengthening that
           keeps the outer edge a full half-width from the centreline. Capped
           at 4: below about 29 degrees the exact miter runs to infinity. */
        const k2 = Math.min(4, 2 / ml);
        mx = (sx / ml) * k2;
        my = (sy / ml) * k2;
      }
      const px2 = pts[k][0];
      const py2 = pts[k][1];
      left.push(px2 + mx * half, py2 + my * half);
      right.push(px2 - mx * half, py2 - my * half);
    }

    /* walked in `STEP_M` steps along each segment so a long straight follows
       the hill rather than spanning it with one flat quad */
    let prevL = -1;
    let prevR = -1;
    for (let k = 0; k + 1 < pts.length; k++) {
      const L = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
      const steps = Math.max(1, Math.ceil(L / STEP_M));
      for (let sIdx = 0; sIdx <= steps; sIdx++) {
        if (sIdx === 0 && prevL >= 0) continue;
        const t = sIdx / steps;
        const lx = left[k * 2] + (left[(k + 1) * 2] - left[k * 2]) * t;
        const ly = left[k * 2 + 1] + (left[(k + 1) * 2 + 1] - left[k * 2 + 1]) * t;
        const rx = right[k * 2] + (right[(k + 1) * 2] - right[k * 2]) * t;
        const ry = right[k * 2 + 1] + (right[(k + 1) * 2 + 1] - right[k * 2 + 1]) * t;
        const li = pos.length / 3;
        pos.push(lx, o.elevAt(lx, ly) * o.zex, ly);
        const ri = pos.length / 3;
        pos.push(rx, o.elevAt(rx, ry) * o.zex, ry);
        if (prevL >= 0) {
          idx.push(prevL, prevR, ri, prevL, ri, li);
        }
        prevL = li;
        prevR = ri;
      }
    }
    drawn++;
    marks.push(idx.length);
    years.push(j.yr === 0 ? -1 : j.yr);
  }

  if (!idx.length) return null;

  const g = new BufferGeometry();
  const posArr = new Float32Array(pos);
  g.setAttribute("position", new BufferAttribute(posArr, 3));
  /* FLAT UP, like the ground: the road's own slope is already in its
     vertices, and a Lambert term off a ribbon would shade each quad
     differently — a road that flickers panel to panel down a hill. */
  const nrm = new Float32Array(posArr.length);
  for (let v = 0; v < posArr.length / 3; v++) nrm[v * 3 + 1] = 1;
  g.setAttribute("normal", new BufferAttribute(nrm, 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();

  const c = new Color();
  c.setStyle(ST_C_ROAD, SRGBColorSpace);
  const mat = new MeshLambertMaterial({
    color: c,
    side: DoubleSide,
    transparent: true,
    opacity: ST_ALPHA,
    depthWrite: false,
    polygonOffset: true,
    /* THE SLOPE HALF, for the reason `streets.ts` gives at length: these run
       through Golden Gate Park and over the Presidio's hills, and a constant
       bias alone lets the ground swallow them wherever the grade is steep. */
    polygonOffsetFactor: -3.5,
    /* ── NOT -3: THAT IS THE ORDINARY CARRIAGEWAY'S RUNG ────────────────
       These park roads overlap real streets wherever one meets the other, and
       at the same offset AND the same render order two coplanar transparent
       surfaces have nothing left to separate them — so which one wins flips
       from frame to frame as the camera moves. Daniel, watching a pan: *"its
       also some streets independently"* — and it was these, the 534, and not
       the network. Half a rung down puts them under the carriageway they meet
       and settles it. */
    polygonOffsetUnits: -3.5,
  });
  const mesh = new Mesh(g, mat);
  mesh.receiveShadow = true;
  /* with the carriageway, which is what it is */
  mesh.renderOrder = 2.5;
  /* seated on its rung by `engine.ts` §THE DEPTH LADDER HAD TO BECOME
     GEOMETRY — the bias this material asks for never arrives here */
  mesh.userData.wash = true;

  const upTo = (year: number | undefined): number => {
    if (year === undefined) return years.length;
    let lo = 0;
    let hi = years.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (years[mid] <= year) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  return {
    name: "street-uncovered",
    mesh,
    drawn,
    classWidths,
    onFrame(cam: { scale: number }) {
      /* the same continuous ramp the surfaces use, keyed on this layer's own
         median width — these roads arrive and leave with the rest */
      const w = surfaceW(FALLBACK_W_M, cam.scale);
      mesh.visible = w > 0.004;
      mat.opacity = ST_ALPHA * w;
    },
    onYear(year: number | undefined) {
      const k = upTo(year);
      g.setDrawRange(0, k ? marks[k - 1] : 0);
    },
    onStep(_step: number, zex: number) {
      if (zex === o.zex) return;
      const k = zex / o.zex;
      for (let v = 0; v < posArr.length; v += 3) posArr[v + 1] *= k;
      (g.getAttribute("position") as BufferAttribute).needsUpdate = true;
      g.computeBoundingSphere();
      o.zex = zex;
    },
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
}
