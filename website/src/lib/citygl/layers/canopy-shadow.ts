/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/canopy-shadow.ts — THE GROUND UNDER THE CANOPY MASSES.

   `layers/ground-detail.ts` draws 50,897 published canopy cells as domes of
   leaf. They do not cast — its own comment has the number, *"an
   `InstancedMesh` has no per-instance culling … the block camera sat at 991 ms
   for a metre of dapple"* — and so a park in this renderer is a field of green
   solids floating on green ground with nothing marking where they meet it.

   The reference has never had that problem, because the FIRST thing its canopy
   sprite draws is the ground under it: `lib/city/trees.ts` §buildSpriteSheet,
   `globalAlpha 0.22`, `fillStyle "#3b3222"`, one ellipse, then the leaf on top
   of it. Every mass on the published page sits on one.

   This layer is that ellipse, as a disc on the ground, one instanced draw per
   bucket. `contact-shadow.ts` holds the shape and the four ratios it is sized
   and placed by, and its header is where the arithmetic is: how a screen
   ellipse becomes a ground circle, why the up-screen half of the reference's
   offset is dropped and the across-screen half kept, which rung of the ground's
   depth ladder a shadow takes (**-7**, one in front of the closest thing the
   ground draws, because a shadow falls across all of it) and why it blends
   rather than being baked opaque.

   ── WHY THIS IS A LAYER AND NOT FOUR LINES IN `ground-detail.ts` ─────────
   Because the disc is a different KIND of thing from the dome and shares only
   the cell it is placed from: it is unlit where the dome is Lambert, it blends
   where the dome is opaque, it writes no depth where the dome does, and it
   sits seven rungs down a ladder the dome is not on at all. Four materials'
   worth of difference over one shared `treeWorld` call is a layer.

   ── AND IT READS THE SAME CELLS THE SAME WAY ─────────────────────────────
   The decode is `ground-detail.ts`'s, clause for clause, because a shadow that
   disagreed with its own mass about which cells exist would be a shadow with
   nothing standing on it: `assertTreeGrid` off the catalogue rather than a
   constant, the published `BLOB_MIN_M2` = 58.06 floor, `blobRadius(area)`, and
   the same seat on the HIGHEST of five published samples over its own
   footprint. The one thing it does NOT copy is `CANOPY_MASS_SPREAD`: the
   reference draws a mass's silhouette at 1.26 of `blobRadius` and its shadow
   at 1.02, and those are two different numbers in the same unit.
   ═══════════════════════════════════════════════════════════════════════ */

import { InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";

import type { CityData } from "@/lib/city/data";
import {
  assertTreeGrid,
  BLOB_MIN_M2,
  blobRadius,
  treeWorld,
  VZ_C1,
  VZ_T1,
} from "@/lib/city/trees";
import { CANOPY_SHARDS, canopyShards } from "../canopy-shards";
import { stepForZ } from "../controls";
import {
  CONTACT_FEATHER,
  CONTACT_R_MASS,
  CONTACT_SIDES_MASS,
  contactCentre,
  contactDisc,
  contactMaterial,
} from "../contact-shadow";
import { SUN_SCENE } from "../light";
import type { CityLayer } from "../engine";

/**
 * THE REFERENCE'S OWN TWO NUMBERS FOR A MASS'S SHADOW.
 *
 * `lib/city/trees.ts` §buildSpriteSheet's canopy cell, verbatim: `g.globalAlpha
 * = 0.22; g.fillStyle = "#3b3222";`. They live here rather than in
 * `contact-shadow.ts` for the reason `tree-geometry.ts` gives for the greens —
 * *"the greens stay with the caller, which is where the data is"* — and they
 * are a literal rather than an import because that module does not export
 * them; `street-markings.ts` restates `hexMix` from `streets.ts` for the same
 * reason and carries the same warning. If the sprite's tone ever moves, this
 * moves with it.
 */
const MASS_SHADOW_CSS = "#3b3222";
const MASS_SHADOW_ALPHA = 0.22;

/**
 * HOW MANY MESHES THE DISCS ARE SPLIT OVER, ALONG EACH AXIS.
 *
 * `ground-detail.ts` §MASS_BUCKETS argues this in full and lands on 8: an
 * `InstancedMesh` is culled as ONE object, the canopy ships as a single chunk
 * of 50,897 cells, and without bucketing the street camera pays for every cell
 * in the city to look at half a park. The same number is used here on purpose
 * — the disc buckets then have the same bounds as the mass buckets, so the
 * frustum keeps and throws them away together and a shadow can never be culled
 * out from under a dome that is still drawn.
 */
const SHADOW_BUCKETS = 8;

export interface CanopyShadowLayerOptions {
  /** ground elevation at a world point — the disc lies ON the ground */
  elevAt: (x: number, y: number) => number;
  /** the ground's exaggeration; a disc is flat and has no height of its own */
  zex: number;
}

export function canopyShadowLayer(
  data: CityData,
  o: CanopyShadowLayerOptions,
): (CityLayer & { meshes: InstancedMesh[]; count: number }) | null {
  const entries = data.manifest.chunks.filter(
    (c) => c.kind === "canopy" || c.kind === "tree",
  );
  if (!entries.length) return null;

  /* THE VEGETATION GRID IS READ OFF THE CATALOGUE, NOT OFF A CONSTANT.
     `cellKey = row * gw + col` and `gw` moved in the encoder once while a
     renderer's copy of it did not; every cell in the city decoded on the old
     width and landed in open water. `assertTreeGrid` throws if the entries
     disagree, which is the only version of this that cannot drift. */
  const grid = assertTreeGrid(entries);
  const amax = grid.cell * grid.cell;

  const geom = contactDisc({ sides: CONTACT_SIDES_MASS });
  const material = contactMaterial(MASS_SHADOW_CSS, MASS_SHADOW_ALPHA);

  const meshes: InstancedMesh[] = [];
  /* the close-in set — see §AND THE SAME CANOPY, QUARTERED */
  const quartered: InstancedMesh[] = [];
  /** every mesh's per-instance ground sample, so a band change re-seats it */
  const seated: { mesh: InstancedMesh; ground: Float32Array }[] = [];
  let count = 0;
  let zexNow = o.zex;

  /* the sun's own ground bearing — `light.ts` §SUN_SCENE points FROM the scene
     TOWARD the sun, and `contactCentre` leans the disc along its negative */
  const sunX = SUN_SCENE.x;
  const sunZ = SUN_SCENE.z;

  const m4 = new Matrix4();
  const pos = new Vector3();
  const scl = new Vector3();
  /* A REAL QUATERNION. `Matrix4.compose` reads a quaternion's PRIVATE `_x` /
     `_y` / `_z` / `_w`, so `{ x: 0, y: 0, z: 0, w: 1 }` cast to the type
     compiles, runs, throws nothing, and writes NaN into all nine
     rotation-and-scale components of every instance — nothing drawn, nothing
     said. Both the tree layer and the ground layer carry this note because
     both have paid for it. A disc is a circle and needs no yaw, so the
     identity is built once and reused. */
  const rot = new Quaternion();
  const centre: [number, number] = [0, 0];

  for (const entry of entries) {
    if (entry.kind !== "canopy") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const cellKey = chunk.fields.cellKey;
    const cpos = chunk.fields.pos;
    const area = chunk.fields.area;
    if (!cellKey || !cpos || !area || !cellKey.length) continue;

    /* every disc this chunk places, read once into flat arrays before any mesh
       exists — the bucket a disc belongs to is a fact about where it is */
    const N = cellKey.length;
    const wx = new Float32Array(N);
    const wy = new Float32Array(N);
    const wg = new Float32Array(N);
    const wr = new Float32Array(N);
    let kept = 0;
    let lo0 = Infinity;
    let lo1 = Infinity;
    let hi0 = -Infinity;
    let hi1 = -Infinity;
    for (let i = 0; i < N; i++) {
      const areaM2 = (area[i] / 255) * amax;
      /* THE PUBLISHED-AREA FLOOR, and it is `ground-detail.ts`'s own gate:
         `BLOB_MIN_M2` = 58.06 m2 is 25 ft squared and a cell holding less than
         that draws no mass. A shadow under a mass that does not exist is the
         one way this layer could be wrong on its face. */
      if (areaM2 < BLOB_MIN_M2) continue;
      const w = treeWorld(cellKey[i], cpos[i], grid);
      const rM = blobRadius(areaM2) * CONTACT_R_MASS;
      contactCentre(w.x, w.y, rM, sunX, sunZ, centre);
      wx[kept] = centre[0];
      wy[kept] = centre[1];
      wr[kept] = rM;
      /* ── SEATED ON THE HIGHEST GROUND IT COVERS, WHICH IS THE MASS'S OWN
         RULE AND HERE IT IS ALSO THE ONLY SAFE ONE ────────────────────────
         A disc is FLAT and the ground under it is not: the DEM is a 53.8 m
         raster and a full cell's disc is 25 m across, so its footprint
         routinely spans a slope that the terrain has then exaggerated by 3.3.
         Seated on the one sample at its own centre, the uphill half of every
         disc on a hillside is INSIDE the hill and simply does not draw — the
         shadows would vanish on exactly the slopes where the reader can see
         most of the ground.
         Five published samples over its own footprint and the highest wins.
         What that costs is that on a slope the disc stands slightly proud of
         the ground downhill of it, which in this projection is a small slide
         down-screen; what it buys is that no disc is ever half-buried.
         `ground-detail.ts` seats the MASS by the same five-sample maximum, so
         the two agree about which ground they are on. */
      const pr = rM * (1 + CONTACT_FEATHER);
      wg[kept] = Math.max(
        o.elevAt(centre[0], centre[1]),
        o.elevAt(centre[0] + pr, centre[1]),
        o.elevAt(centre[0] - pr, centre[1]),
        o.elevAt(centre[0], centre[1] + pr),
        o.elevAt(centre[0], centre[1] - pr),
      );
      if (centre[0] < lo0) lo0 = centre[0];
      if (centre[0] > hi0) hi0 = centre[0];
      if (centre[1] < lo1) lo1 = centre[1];
      if (centre[1] > hi1) hi1 = centre[1];
      kept++;
    }
    if (!kept) continue;

    const spanX = Math.max(1e-6, hi0 - lo0);
    const spanY = Math.max(1e-6, hi1 - lo1);
    const B = SHADOW_BUCKETS;
    const bucketOf = new Uint16Array(kept);
    const tally = new Uint32Array(B * B);
    for (let i = 0; i < kept; i++) {
      const bi = Math.min(B - 1, Math.floor(((wx[i] - lo0) / spanX) * B));
      const bj = Math.min(B - 1, Math.floor(((wy[i] - lo1) / spanY) * B));
      const b = bj * B + bi;
      bucketOf[i] = b;
      tally[b]++;
    }

    const filled = new Uint32Array(B * B);
    const perBucket: (InstancedMesh | null)[] = new Array(B * B).fill(null);
    const groundOf: (Float32Array | null)[] = new Array(B * B).fill(null);
    for (let b = 0; b < B * B; b++) {
      if (!tally[b]) continue;
      const mesh = new InstancedMesh(geom, material, tally[b]);
      /* A SHADOW NEITHER CASTS NOR RECEIVES. Casting is the joke version of
         this bug; receiving is the real one — a disc that took the shadow map
         would be darkened a second time wherever a building's shadow already
         crosses it, and the two would compound into a black patch on every
         park edge downtown. */
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      /* so a harness can find every disc in the graph without knowing which
         bucket it came from, and tell a mass's from a street tree's — the
         ablation that prices either is `visible = false` over exactly this
         mark, and it has to be able to do one without the other */
      mesh.userData.canopyShadow = "mass";
      /* ── THE RENDER ORDER IS A SECOND LADDER, AND IT IS NOT THE DEPTH ONE
         ──────────────────────────────────────────────────────────────────
         `polygonOffset` settles a depth TEST, and a depth test only settles
         things that WRITE depth. Half this city's ground does not: the
         terrain and the marks are opaque and write, but the street washes,
         the block tint and the far shore are all `transparent` with
         `depthWrite: false`, so what orders THOSE against each other is
         `renderOrder` alone. The stack the engine already keeps —

             -4 the bay   -3 the far shore   -2 the hem and the shore wash
              0 the city and the terrain      0.5 the block tint
              1 the footway   2 the carriageway and the unsurveyed roads
              3 HERE                        100 the sky wash

         A shadow lies on top of every one of those washes: paint it earlier
         and the carriageway's own 0.8 of cream is laid back over it and the
         shadow disappears from exactly the streets it was drawn for. So the
         discs take the first rung after the last wash.
         What still hides the middle of each disc under its own dome is the
         depth TEST against the opaque mass, and what stops a disc occluding
         anything is `depthWrite: false`. Three separate mechanisms, and this
         is the one that decides which WASH wins. */
      mesh.renderOrder = 3;
      perBucket[b] = mesh;
      groundOf[b] = new Float32Array(tally[b]);
    }

    for (let i = 0; i < kept; i++) {
      const b = bucketOf[i];
      const mesh = perBucket[b];
      const gY = groundOf[b];
      if (!mesh || !gY) continue;
      const n = filled[b]++;
      // y = 0 IS THE DISC in `contactDisc`, so the ground point IS the
      // position — no lift, and nothing to undo when the band changes
      pos.set(wx[i], wg[i] * zexNow, wy[i]);
      /* the core ring is at r = 1, so the scale IS the disc's ground radius;
         Y is 1 because a flat thing takes no exaggeration in a direction it
         has no extent in */
      scl.set(wr[i], 1, wr[i]);
      m4.compose(pos, rot, scl);
      mesh.setMatrixAt(n, m4);
      gY[n] = wg[i];
    }

    for (let b = 0; b < B * B; b++) {
      const mesh = perBucket[b];
      const gY = groundOf[b];
      if (!mesh || !gY) continue;
      mesh.count = filled[b];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
      seated.push({ mesh, ground: gY });
      count += filled[b];
    }

    /* ══ AND THE SAME CANOPY, QUARTERED, FOR THE BAND THAT DRAWS IT SO ═════
       `ground-detail.ts` stops drawing one 38 m dome per cell close in and
       draws four half-radius ones instead (`canopy-shards.ts` says why). The
       shadow has to follow it, and when it did not the ground kept a single
       full-size disc under four small trees — MEASURED against the published
       page over the same lawn, 21 to 29 levels of 255 too dark: park-lawn
       -24.8/-21.1/-28.7, sunset-lawn -21.3/-16.5/-17.9. A canopy shadow with
       no canopy over it is just a stain.

       The quarters come from the shared function, so the disc is under the
       tree by construction rather than by two files agreeing. */
    const qShard: (InstancedMesh | null)[] = new Array(B * B).fill(null);
    const qGround: (Float32Array | null)[] = new Array(B * B).fill(null);
    const qFilled = new Int32Array(B * B);
    for (let b = 0; b < B * B; b++) {
      if (!tally[b]) continue;
      const mesh = new InstancedMesh(geom, material, tally[b] * CANOPY_SHARDS);
      mesh.userData.canopyShadow = "mass";
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = perBucket[b]?.renderOrder ?? 0;
      mesh.visible = false;
      qShard[b] = mesh;
      qGround[b] = new Float32Array(tally[b] * CANOPY_SHARDS);
    }
    const quarter = new Float32Array(CANOPY_SHARDS * 3);
    for (let i = 0; i < kept; i++) {
      const b = bucketOf[i];
      const mesh = qShard[b];
      const gY = qGround[b];
      if (!mesh || !gY) continue;
      canopyShards(i, wx[i], wy[i], wr[i], quarter);
      for (let k = 0; k < CANOPY_SHARDS; k++) {
        const n = qFilled[b]++;
        const gx = quarter[k * 3];
        const gz = quarter[k * 3 + 1];
        const r = quarter[k * 3 + 2];
        pos.set(gx, wg[i] * zexNow, gz);
        scl.set(r, 1, r);
        m4.compose(pos, rot, scl);
        mesh.setMatrixAt(n, m4);
        gY[n] = wg[i];
      }
    }
    for (let b = 0; b < B * B; b++) {
      const mesh = qShard[b];
      const gY = qGround[b];
      if (!mesh || !gY) continue;
      mesh.count = qFilled[b];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
      quartered.push(mesh);
      seated.push({ mesh, ground: gY });
    }
  }

  if (!meshes.length) {
    geom.dispose();
    material.dispose();
    return null;
  }

  const m4Step = new Matrix4();

  return {
    name: "canopy-shadow",
    meshes,
    count,
    /* NO `onYear`, for `ground-detail.ts`'s own reason: THE CANOPY CHUNK
       PUBLISHES NO YEAR AT ALL. Gating a draw range on an invented order
       would put a date on 50,897 cells no file gives one to. */
    onStep(step: number, zex: number) {
      /* THE SAME BAND THE MASSES ARE DRAWN IN, and it has to be the same one:
         `ground-detail.ts` shows its domes from `stepForZ(VZ_C1)` — the band
         the reference's own dissolve COMPLETES in — and a shadow one band
         early is a stain on an empty lawn. */
      const show = step >= stepForZ(VZ_C1);
      /* the same fork `ground-detail.ts` makes, and it has to be the same one:
         whole discs where whole domes are drawn, quarters where quarters are */
      const close = step >= stepForZ(VZ_T1);
      for (const m of meshes) m.visible = show && (quartered.includes(m) ? close : !close);

      if (zex === zexNow) return;
      /* A DISC IS NOT SCALED, IT IS RE-SEATED — `ground-detail.ts`'s own rule
         for a mass, and here it is forced: multiplying an instance's Y by the
         band's ratio would work only because the disc's own height is zero,
         and writing it that way would break the first time anything on this
         layer stood above the ground. Only the foot moves. */
      for (const s of seated) {
        for (let i = 0; i < s.mesh.count; i++) {
          s.mesh.getMatrixAt(i, m4Step);
          m4Step.elements[13] = s.ground[i] * zex;
          s.mesh.setMatrixAt(i, m4Step);
        }
        s.mesh.instanceMatrix.needsUpdate = true;
        s.mesh.computeBoundingSphere();
      }
      zexNow = zex;
    },
    dispose() {
      for (const m of meshes) m.dispose();
      geom.dispose();
      material.dispose();
      meshes.length = 0;
      seated.length = 0;
    },
  };
}
