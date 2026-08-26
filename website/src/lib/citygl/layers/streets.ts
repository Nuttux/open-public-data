/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/streets.ts — THE STREETS, AS SURFACES.

   22,191 published rights of way and the carriageway inside each. The single
   biggest thing missing from a city drawn only as ground and buildings: the
   grid is what a reader navigates by, and without it every frame reads as
   blocks floating on a field.

   ── TWO POLYGONS A STREET, AND BOTH ARE PUBLISHED ────────────────────────
   The `strt` chunk carries, per feature, the RIGHT OF WAY ring — wall to wall,
   the whole public width — and inside it the ROADWAY ring, the carriageway
   between the kerbs. What is between them is the footway. So the sidewalk is
   not drawn and not invented: it is the part of the right of way the roadway
   does not cover, and it appears because the two are filled in different
   tones, one over the other.

   ── WHY THEY LIE ON THE GROUND AND NOT ABOVE IT ──────────────────────────
   Every vertex is lifted to the terrain's own elevation, so a street runs up
   Nob Hill with the hill. The two fills are then separated in the DEPTH
   BUFFER by `polygonOffset` rather than by a height: lifting the roadway a
   few centimetres would also move it down-screen in an axonometric
   projection, and a carriageway sliding out of its own kerbs is a great deal
   more visible than a z-fight.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
} from "three";

import type { CityData } from "@/lib/city/data";
import { ST_ALPHA, ST_C_FOOT, ST_C_ROAD } from "@/lib/city/streets";
import type { CityLayer } from "../engine";

export interface StreetsLayerOptions {
  elevAt: (x: number, y: number) => number;
  /** the ground's exaggeration — a street is ground, not a built thing */
  zex: number;
}

/** `ringIndex` in `streets.ts`: rings-per-feature + lengths → flat offsets */
function ringIndex(n: number, per: Uint8Array, len: Uint16Array): { off: Uint32Array; fo: Uint32Array } {
  const fo = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) fo[i + 1] = fo[i] + per[i];
  const R = fo[n];
  const off = new Uint32Array(R + 1);
  for (let r = 0; r < R; r++) off[r + 1] = off[r] + len[r];
  return { off, fo };
}

/**
 * One ring → triangles, appended to the running buffers.
 *
 * `ShapeUtils.triangulateShape` is an ear clipper and it wants a SIMPLE
 * polygon; a published right of way is one. Rings after the first are treated
 * as separate polygons rather than as holes — a street's second ring is a
 * separate lobe of the same right of way (a fork, a plaza), not a void, and
 * on the 72 features that have one, filling it is right and cutting it out
 * would leave a hole in the road.
 */
function ringTris(
  x: Float32Array,
  y: Float32Array,
  from: number,
  to: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  pos: number[],
  idx: number[],
): void {
  const m = to - from;
  if (m < 3) return;
  /* REAL `Vector2`s, not plain objects. `triangulateShape` strips duplicate
     end points with `points[l - 1].equals(...)`, so `{ x, y }` throws
     `points[l-1].equals is not a function` — the same shape of mistake the
     tree layer made with a hand-rolled quaternion, and the second time in one
     session that a structurally-typed cast compiled and then failed at
     runtime on a METHOD the value does not have. */
  const contour: Vector2[] = new Array(m);
  for (let k = 0; k < m; k++) contour[k] = new Vector2(x[from + k], y[from + k]);
  const faces = ShapeUtils.triangulateShape(contour, []);
  if (!faces.length) return;
  const base = pos.length / 3;
  for (let k = 0; k < m; k++) {
    const wx = x[from + k];
    const wy = y[from + k];
    pos.push(wx, elevAt(wx, wy) * zex, wy);
  }
  for (const t of faces) idx.push(base + t[0], base + t[1], base + t[2]);
}

function mesh(
  pos: number[],
  idx: number[],
  colour: string,
  offset: number,
  order: number,
): Mesh | null {
  if (!idx.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  /* FLAT UP, like the ground: a street's own slope is already in its
     vertices, and a Lambert term computed from a triangulated road surface
     would shade each ear-clipped triangle differently — a road that flickers
     facet to facet down a hill. */
  const n = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) n[v * 3 + 1] = 1;
  g.setAttribute("normal", new BufferAttribute(n, 3));
  g.computeBoundingSphere();

  const c = new Color();
  c.setStyle(colour, SRGBColorSpace);
  /* ── A STREET IS A WASH, NOT A FILL, AND THIS IS THE WHOLE LOOK ────────
     `drawStreetSurface` paints at `ST_ALPHA` — 0.8 — over ground it does not
     replace, so the terrain's own colour, its hillshade and its park tint all
     read THROUGH the roadway and the footway. Drawn opaque, as this layer
     first did, every right of way becomes a flat sheet of one cream and the
     city loses the ground it stands on: Daniel, looking at a block frame,
     *"it still looks awful."* He was looking at 22,191 opaque polygons.

     `depthWrite` is off because these are coplanar with each other and with
     the ground; the order between them is stated by `renderOrder` — footway,
     then carriageway over it — rather than left to a depth test that has
     nothing to separate. */
  const m = new MeshLambertMaterial({
    color: c,
    side: DoubleSide,
    transparent: true,
    opacity: ST_ALPHA,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
  const out = new Mesh(g, m);
  out.receiveShadow = true;
  out.castShadow = false;
  out.renderOrder = order;
  return out;
}

export function streetsLayer(
  data: CityData,
  o: StreetsLayerOptions,
): CityLayer & { meshes: Mesh[]; features: number } {
  const meshes: Mesh[] = [];
  const gates: {
    g: BufferGeometry;
    marks: number[];
    upTo: (y: number | undefined) => number;
    full: number;
  }[] = [];
  let features = 0;

  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "strt") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const c = chunk.fields as unknown as {
      cls: Uint8Array;
      yr: Uint16Array;
      rwN: Uint8Array; rwLen: Uint16Array; rwX: Float32Array; rwY: Float32Array;
      rdN: Uint8Array; rdLen: Uint16Array; rdX: Float32Array; rdY: Float32Array;
    };
    const n = c.cls.length;
    if (!n) continue;

    const rw = ringIndex(n, c.rwN, c.rwLen);
    const rd = ringIndex(n, c.rdN, c.rdLen);

    const rowPos: number[] = [];
    const rowIdx: number[] = [];
    const rdPos: number[] = [];
    const rdIdx: number[] = [];

    /* ── EMITTED IN ACCEPTANCE-YEAR ORDER ──────────────────────────────
       Same rule as the footprints and the canopy: a right of way is not
       drawn before the year the Board is recorded accepting it, `yr` 0 means
       the record is silent and a silent street is drawn from the first year
       the map draws. Emitting in that order makes the century scrub a draw
       range rather than a rebuild. */
    const ord = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => (c.yr[a] || 0) - (c.yr[b] || 0) || a - b,
    );
    const emitted: number[] = [];
    const rowMark: number[] = [];
    const rdMark: number[] = [];

    for (const i of ord) {
      for (let r = rw.fo[i]; r < rw.fo[i + 1]; r++) {
        ringTris(c.rwX, c.rwY, rw.off[r], rw.off[r + 1], o.elevAt, o.zex, rowPos, rowIdx);
      }
      for (let r = rd.fo[i]; r < rd.fo[i + 1]; r++) {
        ringTris(c.rdX, c.rdY, rd.off[r], rd.off[r + 1], o.elevAt, o.zex, rdPos, rdIdx);
      }
      emitted.push(c.yr[i] === 0 ? -1 : c.yr[i]);
      rowMark.push(rowIdx.length);
      rdMark.push(rdIdx.length);
      features++;
    }

    /* the right of way first and further back, the carriageway over it — so
       what shows around the roadway is the footway, which is what it is */
    const a = mesh(rowPos, rowIdx, ST_C_FOOT, 4, 1);
    const b = mesh(rdPos, rdIdx, ST_C_ROAD, 2, 2);
    const upTo = (year: number | undefined): number => {
      if (year === undefined) return emitted.length;
      let lo = 0;
      let hi = emitted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (emitted[mid] <= year) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    if (a) {
      meshes.push(a);
      gates.push({ g: a.geometry, marks: rowMark, upTo, full: rowIdx.length });
    }
    if (b) {
      meshes.push(b);
      gates.push({ g: b.geometry, marks: rdMark, upTo, full: rdIdx.length });
    }
  }

  return {
    name: "streets",
    meshes,
    features,
    /* ── THE SURFACE IS NOT DRAWN AT EVERY CAMERA, AND THIS WAS A REAL BUG ──
       The Canvas renderer gates the right-of-way SURFACE on `streetsResolve`:
       below about two projected pixels of width the tier is not dispatched at
       all and the street network is carried by centrelines alone. That is not
       an optimisation — it is what the picture needs. Drawn at full opacity at
       the whole-city camera, the footway tone (`ST_C_FOOT`, a pale cream)
       covers most of the Sunset, the Richmond and the Excelsior, and the
       result is a bleached sheet with the terrain and the fabric buried under
       it. Daniel: *"the terrain barely shows."* He was looking at this.

       Gated to the district camera and closer, the ground gets its colour back
       and the streets still read, because at that zoom they are wide enough to
       be a surface rather than a wash. */
    onYear(year: number | undefined) {
      for (const gt of gates) {
        const k = gt.upTo(year);
        gt.g.setDrawRange(0, k ? gt.marks[k - 1] : 0);
      }
    },
    onStep(step: number, zex: number) {
      /* ── THE SURFACE IS NOT DRAWN AT EVERY CAMERA, AND THIS WAS A REAL BUG ──
         The Canvas renderer gates the right-of-way SURFACE on
         `streetsResolve`: below about two projected pixels of width the tier
         is not dispatched at all and the network is carried by centrelines
         alone. That is not an optimisation, it is what the picture needs.
         Drawn at full opacity at the whole-city camera the footway tone
         (`ST_C_FOOT`, a pale cream) covers most of the Sunset, the Richmond
         and the Excelsior, and the frame comes back as a bleached sheet with
         the terrain and the fabric buried under it. Daniel: *"the terrain
         barely shows."* He was looking at this. */
      for (const m of meshes) m.visible = step >= 1;

      /* the ground's exaggeration moved, so every street vertex moves with it
         — one pass over Y, the same trick the footprints use */
      for (const m of meshes) {
        const p = m.geometry.getAttribute("position") as BufferAttribute;
        const arr = p.array as Float32Array;
        const k = zex / o.zex;
        for (let v = 0; v < arr.length; v += 3) arr[v + 1] *= k;
        p.needsUpdate = true;
        m.geometry.computeBoundingSphere();
      }
      o.zex = zex;
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshLambertMaterial).dispose();
      }
      meshes.length = 0;
    },
  };
}
