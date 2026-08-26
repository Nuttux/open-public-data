/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/trees.ts — THE STREET TREES, AS OBJECTS.

   125,234 published street trees, each at the point the city's own register
   puts it, each at the crown diameter the register's size bit gives it, each
   in the green of the family its species belongs to.

   ── A SPRITE BECOMES A SOLID, AND THAT IS THE WHOLE CHANGE ───────────────
   The Canvas renderer draws every tree as one blit from a sprite sheet: a
   drawn crown, flat, always facing the reader, at a size in screen pixels.
   That is the right answer when a tree costs a `drawImage` and there are a
   hundred thousand of them.

   Here each is a low-polygon crown in the world. It has a top and a side, so
   the sun lights it; it has a position in depth, so a building in front of it
   is in front of it; and it CASTS, which is the mark a street tree actually
   leaves on a pavement. Twenty triangles each, one instanced draw per chunk,
   and the city's whole canopy costs less than a millisecond.

   ── EVERY NUMBER IS THE REGISTER'S ───────────────────────────────────────
   Position: `treeWorld(cellKey, pos)` — the published 24 m cell and the
   sixteenth of it the register quantises to. Size: `CROWN_M`, the two crown
   diameters the one published size bit distinguishes. Colour: `TREE_GREENS`,
   indexed by the published family byte. The trunk is NOT published and is not
   drawn; what is drawn is a crown standing where the crown is.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";

import { CROWN_FAMILIES, crownSet, setCrownYaw } from "../tree-geometry";

import type { CityData } from "@/lib/city/data";
import {
  CROWN_M,
  TREE_GREENS,
  TREE_GRID,
  TREE_YEAR_BASE,
  treeWorld,
} from "@/lib/city/trees";
import type { CityLayer } from "../engine";

export interface TreesLayerOptions {
  /** ground elevation at a world point */
  elevAt: (x: number, y: number) => number;
  /** the built height's exaggeration — a crown is a built thing, not ground */
  zexb: number;
  /** cast shadows: true on a desktop, false on the phone tier */
  castShadow?: boolean;
  /** the camera step from which crowns are drawn — the phone tier raises it */
  fromStep?: number;
}

export function treesLayer(
  data: CityData,
  o: TreesLayerOptions,
): CityLayer & { meshes: InstancedMesh[]; count: number } {
  /* ── FOUR SILHOUETTES, NOT ONE BLOB ────────────────────────────────────
     An icosahedron reads as a green rock, which is what it is. `crownSet`
     gives one low-polygon crown per PUBLISHED species family — a broad
     rounded canopy, a conifer, a spreading palm on a bare stem, a narrow
     upright ovoid — each reaching exactly radius 1 at its widest ring so the
     caller's scale is still the register's own `CROWN_M`, and each carrying a
     per-vertex ramp that gives one instance a shaded underside and a lit top
     in ONE draw call.

     THE CONVENTIONS CHANGED WITH IT AND THEY FAIL SILENTLY: local y = 0 is
     the GROUND (no trunk lift here any more) and the geometry is unit
     RADIUS, not the icosahedron's 0.5. Passing the old pair plants every
     crown half a tree underground at twice its published width. */
  const crowns = crownSet();
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const greens = TREE_GREENS.map((hex) => {
    const c = new Color();
    c.setStyle(hex, SRGBColorSpace);
    return c;
  });

  const meshes: InstancedMesh[] = [];
  const counters: { mesh: InstancedMesh; countFor: (y: number | undefined) => number; full: number }[] = [];
  const placers: ((zex: number, zexb: number) => void)[] = [];
  let count = 0;

  const m4 = new Matrix4();
  const pos = new Vector3();
  const scl = new Vector3();
  /* ── A REAL QUATERNION, AND THAT IS NOT PEDANTRY ────────────────────────
     `Matrix4.compose` reads a quaternion's PRIVATE fields — `_x`, `_y`, `_z`,
     `_w` — so `{ x: 0, y: 0, z: 0, w: 1 }` cast to the type compiles, runs,
     and writes NaN into all nine rotation-and-scale components of every
     instance. 195,310 trees at a valid position with a NaN size: nothing is
     drawn, nothing errors, and the probe that caught it had to print the
     matrix. */
  const rot = new Quaternion();

  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "tree") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const f = chunk.fields;
    const cellKey = f.cellKey as Uint32Array;
    const cellCnt = f.cellCnt as Uint16Array;
    const tpos = f.pos as Uint8Array;
    const form = f.form as Uint8Array;
    const big = f.big as Uint8Array;
    const yr = f.yr as Uint8Array;
    /* THE UNDATED TREE'S GATE, and it is a street's year and not a tree's.
       Present on all 129 shipped tree chunks; typed optional so a chunk
       written before the field existed still draws. */
    const syr = f.syr as Uint8Array | undefined;

    let total = 0;
    for (let ci = 0; ci < cellCnt.length; ci++) total += cellCnt[ci];
    if (!total) continue;

    /* ── AN UNDATED TREE IS DRAWN FROM ITS OWN STREET'S YEAR ─────────────
       This emitted every undated crown AT `TREE_EARLIEST` = 1955, on the rule
       that `tkzw-k3nq`'s earliest planting date is 1955 so the file has
       nothing to say about a tree standing in 1919, and on the claim that
       "the Canvas renderer takes that literally and so does this".

       **THE CANVAS RENDERER STOPPED TAKING IT LITERALLY ON 2026-08-24** —
       `time.ts` §THE UNDATED TREES, `trees.ts:1061` — and this file was not
       told, so the fix landed in one renderer and not the other. What it
       drew here until now: 1954 with **zero** street trees and 1955 with
       **125,234**, and San Francisco's oldest street trees drawn as its
       newest, because the undated cohort is the thick-trunked one (8,833 of
       the 9,703 trees over 24 in DBH carry no plant date).

       The rule, and it is `trees.ts`'s exactly: **an undated tree is drawn
       from the first year its own right of way is drawn; where that right of
       way is undated too, it keeps drawing in every year.** A street tree
       stands in a right of way by definition and cannot be more certain than
       the right of way it stands in. Nothing is invented and no tree is given
       a date — `syr` is the Board's own acceptance year for the street a
       metre away, on the same `TREE_YEAR_BASE` offset as `yr`.

       MEASURED over the 129 shipped chunks: of 125,234 undated trees,
       **59,446 carry `syr > 0`** and wait for their street; **65,788** have a
       right of way the record does not date either and draw in every year.

       `ALWAYS` is 0 rather than `TREE_EARLIEST` because `countFor` below is a
       binary search over `emitted[] <= year`: a key of 0 is inside the prefix
       at every year the scrub can ask for, which is what "drawn in every
       year" has to mean to a prefix counter. */
    const ALWAYS = 0;
    const key = (j: number): number =>
      yr[j] !== 0
        ? TREE_YEAR_BASE + yr[j]
        : syr && syr[j] !== 0
          ? TREE_YEAR_BASE + syr[j]
          : ALWAYS;

    /* the flat tree index → the cell it belongs to */
    const cellOfTree = new Uint32Array(total);
    {
      let jj = 0;
      for (let ci = 0; ci < cellKey.length; ci++) {
        for (let i = 0; i < cellCnt[ci]; i++, jj++) cellOfTree[jj] = ci;
      }
    }

    /* emitted in planting-year order, so the century scrub is a prefix and
       an `InstancedMesh` gate is one assignment to `count` */
    const order: number[] = [];
    for (let jj = 0; jj < total; jj++) order.push(jj);
    order.sort((a, b) => key(a) - key(b) || a - b);

    /* ── ONE MESH PER CHUNK PER FAMILY ─────────────────────────────────
       Instancing draws one GEOMETRY many times, so four silhouettes mean four
       meshes. Kept per CHUNK rather than four city-wide meshes on purpose:
       a chunk-sized mesh is frustum-culled, and at the street camera that
       takes the canopy from 195,310 instances to the handful actually in
       frame. Four city-wide meshes would never cull and would pay for the
       whole city at every zoom. */
    const byFam: number[][] = Array.from({ length: CROWN_FAMILIES }, () => []);
    for (const j of order) byFam[form[j] & (CROWN_FAMILIES - 1)].push(j);

    for (let fam = 0; fam < CROWN_FAMILIES; fam++) {
      const list = byFam[fam];
      if (!list.length) continue;
      const mesh = new InstancedMesh(crowns.geometries[fam], material, list.length);
      mesh.castShadow = o.castShadow ?? true;
      mesh.receiveShadow = false;

      const emitted = new Int32Array(list.length);
      /* ── THE GROUND MOVES WITH THE BAND, AND THE CROWNS HAVE TO MOVE WITH
         IT ────────────────────────────────────────────────────────────────
         A camera step changes `zex`, the ground's vertical exaggeration. The
         footprints rewrite their Y for it; the crowns were BAKED at 3.3 and
         never told. On a hill at 60 m that is 198 units of lift against the
         buildings' 120 — the canopy floats seventy-eight units up and lands
         on the roofs, which is exactly what it looked like. So each crown
         keeps its own four numbers and `onStep` recomposes the matrix. */
      const iw = new Float32Array(list.length * 2);
      const ie = new Float32Array(list.length);
      const ir = new Float32Array(list.length);
      let n = 0;
      for (const j of list) {
        const ci = cellOfTree[j];
        const w = treeWorld(cellKey[ci], tpos[j], TREE_GRID);
        const isBig = big[j] !== 0;
        /* the published crown DIAMETER; the geometry is unit RADIUS */
        const rM = CROWN_M[isBig ? 1 : 0] / 2;
        const gz = o.elevAt(w.x, w.y);
        iw[n * 2] = w.x;
        iw[n * 2 + 1] = w.y;
        ie[n] = gz;
        ir[n] = rM;
        pos.set(w.x, gz * 3.3, w.y);
        /* the crown is a built thing standing on the ground: its own width in
           world metres, its height on the built exaggeration */
        scl.set(rM, rM * o.zexb, rM);
        setCrownYaw(n, rot);
        m4.compose(pos, rot, scl);
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n, greens[form[j] & 3] ?? greens[0]);
        emitted[n] = key(j);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();

      const countFor = (year: number | undefined): number => {
        if (year === undefined) return n;
        let lo = 0;
        let hi = n;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (emitted[mid] <= year) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      };
      counters.push({ mesh, countFor, full: n });
      placers.push((zex: number, zexb: number) => {
        for (let k = 0; k < n; k++) {
          pos.set(iw[k * 2], ie[k] * zex, iw[k * 2 + 1]);
          scl.set(ir[k], ir[k] * zexb, ir[k]);
          setCrownYaw(k, rot);
          m4.compose(pos, rot, scl);
          mesh.setMatrixAt(k, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      });
      meshes.push(mesh);
      count += n;
    }

  }

  return {
    name: "trees",
    meshes,
    count,
    /* ── THE CANOPY IS NOT DRAWN AT EVERY CAMERA, AND THE RULE IS THE
       CANVAS RENDERER'S OWN ────────────────────────────────────────────
       `trees.ts` §VZ_C0: no street tree is drawn below z = 1.55, and at the
       district camera the weight is still zero — the canopy blobs carry the
       green there instead. Ported here as a visibility gate, and it is not a
       nicety: with 195,310 instanced crowns visible AND casting, the
       whole-city frame measured **4,358 ms**. Gated, the same frame is back
       under a millisecond, because the cost was never the triangles — it was
       195,310 shadow casters re-rendered into a 2,048 map every frame.

       AND THEY DO NOT CAST AT ALL, WHICH IS MEASURED AND NOT ASSUMED. Gated
       to the closest two cameras the whole-city frame came back to 1.9 ms and
       the district to 2.4 — but the BLOCK camera sat at **991 ms**, an
       outlier next to 11 ms at street, because that frustum catches the most
       tree chunks and an `InstancedMesh` has no per-instance culling: every
       crown in a chunk is re-rendered into the shadow map whether it is on
       screen or not. What that bought was a metre of dapple on a pavement.
       Buildings still cast, which is the shadow anybody looks at. */
    onYear(year: number | undefined) {
      for (const c of counters) c.mesh.count = c.countFor(year);
    },
    onStep(step: number, zex: number, zexb: number) {
      for (const f of placers) f(zex, zexb);
      const show = step >= (o.fromStep ?? 1);
      const cast = false;
      for (const m of meshes) {
        m.visible = show;
        m.castShadow = cast;
      }
    },
    dispose() {
      for (const m of meshes) m.dispose();
      crowns.dispose();
      material.dispose();
      meshes.length = 0;
      counters.length = 0;
      placers.length = 0;
    },
  };
}
