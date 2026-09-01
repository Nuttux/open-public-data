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

   ── AND IT SITS ON SOMETHING ─────────────────────────────────────────────
   The reference's sprite draws the GROUND FIRST — one soft ellipse at
   `alpha 0.2` in `#3b3222` — and the crown on top of it, every tree. This port
   drew the crown alone, and a solid standing on a pavement with nothing saying
   it touches it is what makes a hundred thousand trees look pasted on beside
   buildings that all carry a hard cast shadow. The disc is back, as geometry:
   see `../contact-shadow.ts` for its size, its lean and its depth rung, and
   §AND THE GROUND UNDER EACH OF THEM below for why a crown gets both a disc
   and a real cast shadow when the reference gives it only the first.

   ── EVERY NUMBER IS THE REGISTER'S ───────────────────────────────────────
   Position: `treeWorld(cellKey, pos)` — the published 24 m cell and the
   sixteenth of it the register quantises to. Size: `CROWN_M`, the two crown
   diameters the one published size bit distinguishes. Colour: `TREE_GREENS`,
   indexed by the published family byte. What is NOT published — the trunk's
   length, the crown's profile, the shadow's size — is drawn from the
   reference's own sprite and says so at every point it is used.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Sphere,
  SRGBColorSpace,
  Vector3,
} from "three";

import {
  CROWN_FAMILIES,
  crownJitter,
  crownSet,
  foliageTint,
  setCrownYaw,
} from "../tree-geometry";
import {
  CONTACT_FEATHER,
  CONTACT_R_CROWN,
  CONTACT_SIDES_CROWN,
  contactCentre,
  contactDisc,
  contactMaterial,
} from "../contact-shadow";
import { SUN_SCENE } from "../light";
import { canopyShadowLayer } from "./canopy-shadow";

import type { CityData } from "@/lib/city/data";
import {
  CROWN_M,
  TREE_GREENS,
  TREE_GRID,
  TREE_YEAR_BASE,
  treeWorld,
} from "@/lib/city/trees";
import type { CityLayer } from "../engine";

/**
 * THE REFERENCE'S OWN TWO NUMBERS FOR A CROWN'S SHADOW.
 *
 * `lib/city/trees.ts` §buildSpriteSheet draws the ground under every crown
 * BEFORE it draws the crown: `g.globalAlpha = 0.2; g.fillStyle = "#3b3222";`
 * and one ellipse. A literal rather than an import because that module does
 * not export either — `street-markings.ts` restates `hexMix` from `streets.ts`
 * for the same reason and carries the same warning. If the sprite's tone
 * moves, this moves with it.
 *
 * The alpha is a hundredth under the canopy mass's 0.22 and the reference
 * means the difference: a mass is a whole cell's worth of leaf, a crown is one
 * tree. `contact-shadow.ts` holds the shape, the size and the lean; what is
 * here is the tone, which is a claim about the data and belongs with it.
 */
const CROWN_SHADOW_CSS = "#3b3222";
const CROWN_SHADOW_ALPHA = 0.2;

export interface TreesLayerOptions {
  /** ground elevation at a world point */
  elevAt: (x: number, y: number) => number;
  /** the built height's exaggeration — a crown is a built thing, not ground */
  zexb: number;
  /** cast shadows: true on a desktop, false on the phone tier */
  castShadow?: boolean;
  /** the camera step from which crowns are drawn — the phone tier raises it */
  fromStep?: number;
  /** the camera step from which crowns CAST — see §and they cast again */
  castFromStep?: number;
  /**
   * The camera step from which a crown's CONTACT DISC is drawn.
   *
   * ONE BAND LATER THAN THE CROWN, AND IT IS MEASURED. A disc is 2.3 m across
   * and the district camera is 3.1 m to the pixel, so it lands at three
   * quarters of a pixel — under the `MARK_PX` = 0.7 that `street-markings.ts`
   * calls the width below which a mark *"is not a mark, it is a sub-pixel
   * shimmer"*. What that three quarters of a pixel costs, MEASURED on the real
   * GPU, median of 25 fenced frames at the district camera:
   *
   * ```
   *              desktop        phone
   *   drawn      8.9 ms         8.3 ms      +129 calls, +4.7 M triangles
   *   gated      (below)        (below)
   * ```
   *
   * The crowns themselves stay on `fromStep`, because a 2 px crown is still
   * the green a district reads by; it is the SHADOW under it that is not.
   */
  discFromStep?: number;
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

  /* scratch for `foliageTint`: this loop runs 195,310 times a rebuild */
  const tint = new Color();

  const greens = TREE_GREENS.map((hex) => {
    const c = new Color();
    c.setStyle(hex, SRGBColorSpace);
    return c;
  });

  /* ── AND THE GROUND UNDER EACH OF THEM ──────────────────────────────────
     The reference draws the shadow FIRST and the crown on top of it, every
     tree, every frame. This port drew the crown alone, so a street tree at the
     block camera is a green solid standing on a pavement with nothing saying
     it touches it — the buildings beside it all carry a hard cast shadow,
     which is what makes the trees look pasted on.

     A crown DOES cast a real shadow here from the block camera up (see §and
     they cast again), and that is a different mark: a cast shadow runs
     sqrt(2) of the crown's height away from the trunk and lands on whatever is
     over there. The contact disc is the other half — the ground the canopy
     itself is occluding, which no shadow map at this texel size resolves under
     a 6.6 m crown. The reference draws only the second; this draws both, and
     what they add up to is a tree that sits.

     One geometry and one material for all 195,310 of them: `contact-shadow.ts`
     §the header has the size, the lean and the depth rung. */
  const discGeom = contactDisc({ sides: CONTACT_SIDES_CROWN });
  const discMat = contactMaterial(CROWN_SHADOW_CSS, CROWN_SHADOW_ALPHA);
  /* the sun's own ground bearing — `light.ts` §SUN_SCENE points FROM the scene
     TOWARD the sun, and `contactCentre` leans the disc along its negative */
  const sunX = SUN_SCENE.x;
  const sunZ = SUN_SCENE.z;
  const discCentre: [number, number] = [0, 0];

  /** every mesh the layer owns, which is what the caller adds to the scene */
  const meshes: InstancedMesh[] = [];
  /** the crowns and their discs — the band gate below is theirs, and the
   *  canopy masses' discs are on a different one */
  const treeMeshes: InstancedMesh[] = [];
  /** the crowns' discs alone: they come in a band later — see `discFromStep` */
  const discMeshes: InstancedMesh[] = [];
  /** the crowns alone — the cast-shadow toggle is theirs and not the discs' */
  const crownMeshes: InstancedMesh[] = [];
  const counters: { mesh: InstancedMesh; countFor: (y: number | undefined) => number; full: number }[] = [];
  const placers: ((zex: number, zexb: number) => void)[] = [];
  let count = 0;

  /* ── §THE SPHERE IS PER BAND, AND THERE ARE THREE BANDS ─────────────────
     `InstancedMesh.computeBoundingSphere` walks every instance — it reads each
     matrix back and unions a transformed copy of the geometry's own sphere —
     so on this layer it is 125,234 of those per band change, and MEASURED it
     is where nearly all of the layer's 33.9 ms went. Writing the matrices
     faster barely moved it: 33.9 to 30.6.

     It does not have to be walked at all after the first time. The ladder has
     three rungs, `zexb` is a constant of the descriptor, and the answer is a
     pure function of the rung — so it is computed once per rung and kept. With
     `engine.ts` §THE BANDS ARE WARMED walking the ladder at boot, all three
     are in hand before the reader's first zoom and every crossing after that
     is a map lookup.

     AND IT IS COMPUTED OVER EVERY INSTANCE, not over `mesh.count`. That count
     is the YEAR gate — three's own loop stops at it — so the sphere this used
     to leave behind was the one the last band change happened to catch, and
     scrubbing forward to a year with more trees in it left them bounded by a
     sphere that did not contain them. Taking the full set is both stable and
     conservative, which is the safe direction for a cull. */
  const seatSphere = (
    mesh: InstancedMesh,
    full: number,
    cache: Map<number, Sphere>,
    zex: number,
  ): void => {
    const hit = cache.get(zex);
    if (hit) {
      mesh.boundingSphere = hit;
      return;
    }
    const keep = mesh.count;
    mesh.count = full;
    mesh.computeBoundingSphere();
    mesh.count = keep;
    const s = (mesh.boundingSphere as Sphere).clone();
    cache.set(zex, s);
    mesh.boundingSphere = s;
  };

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
    /* ── THE DISCS ARE ONE MESH PER CHUNK, NOT ONE PER FAMILY ────────────
       A crown's silhouette is its family's and a crown's SHADOW is not: the
       reference draws the same ellipse under all four, at the same alpha,
       scaled by the same published crown radius. So there is nothing to split
       on, and a chunk's discs go in one instanced draw in `order` — which
       makes the century scrub the same prefix the crowns use, over the same
       list, so a tree and its shadow can never arrive in different years. */
    {
      const mesh = new InstancedMesh(discGeom, discMat, order.length);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      /* so a harness can ablate every contact disc in the scene without
         knowing which chunk it came from — and tell a crown's from a mass's,
         which is the whole instrument the canopy question is measured with */
      mesh.userData.canopyShadow = "crown";
      discMeshes.push(mesh);
      /* AFTER EVERY WASH THAT LIES ON THE GROUND, and the reason is that half
         of them write no depth: `layers/canopy-shadow.ts` §THE RENDER ORDER IS
         A SECOND LADDER has the whole stack. Painted earlier, the
         carriageway's own 0.8 of cream is laid back over the shadow and it
         disappears from exactly the streets it was drawn for. */
      mesh.renderOrder = 3;

      const emitted = new Int32Array(order.length);
      const dw = new Float32Array(order.length * 2);
      const de = new Float32Array(order.length);
      const dr = new Float32Array(order.length);
      let dn = 0;
      for (const j of order) {
        const ci = cellOfTree[j];
        const w = treeWorld(cellKey[ci], tpos[j], TREE_GRID);
        /* the published crown DIAMETER over two is the radius the crown is
           drawn at, and `CONTACT_R_CROWN` is the reference's own fraction of
           exactly that — so the disc and the crown cannot drift apart */
        const rM = (CROWN_M[big[j] !== 0 ? 1 : 0] / 2) * CONTACT_R_CROWN;
        contactCentre(w.x, w.y, rM, sunX, sunZ, discCentre);
        /* ── SEATED ON THE HIGHEST GROUND THE DISC COVERS ────────────────
           A disc is FLAT and the ground under it is not, and a flat plane
           seated on the one sample at its own centre has its uphill half
           INSIDE the hill. That is not a z-fight a polygon offset can settle:
           on a 5 % slope a 2.3 m disc is 0.12 m under the terrain at its
           uphill rim, which the exaggeration turns into a quarter of a scene
           unit, and MEASURED at the street camera it cost two thirds of every
           disc in the frame — the discs came back covering 0.70 % of the
           pixels against 2.32 % with the offset opened far enough to hide the
           fault (§the offset sweep in `contact-shadow.ts`).
           Five published samples over the disc's own footprint and the
           highest wins. `ground-detail.ts` seats a canopy MASS the same way
           and for the same reason. What it costs is that downhill the disc
           stands slightly proud of the ground — on a 5 % slope, 0.23 m, which
           at the street camera is 1.7 px of slide. What it buys is a shadow
           that does not vanish on a hill. */
        const pr = rM * (1 + CONTACT_FEATHER);
        const gz = Math.max(
          o.elevAt(discCentre[0], discCentre[1]),
          o.elevAt(discCentre[0] + pr, discCentre[1]),
          o.elevAt(discCentre[0] - pr, discCentre[1]),
          o.elevAt(discCentre[0], discCentre[1] + pr),
          o.elevAt(discCentre[0], discCentre[1] - pr),
        );
        dw[dn * 2] = discCentre[0];
        dw[dn * 2 + 1] = discCentre[1];
        de[dn] = gz;
        dr[dn] = rM;
        pos.set(discCentre[0], gz * 3.3, discCentre[1]);
        /* the core ring is at r = 1, so the scale IS the disc's ground radius.
           Y is 1: a flat thing takes no exaggeration in the one direction it
           has no extent in, and unlike the crown above it there is nothing
           here for `zexb` to stretch. */
        scl.set(rM, 1, rM);
        rot.set(0, 0, 0, 1);
        m4.compose(pos, rot, scl);
        mesh.setMatrixAt(dn, m4);
        emitted[dn] = key(j);
        dn++;
      }
      mesh.count = dn;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();

      const countFor = (year: number | undefined): number => {
        if (year === undefined) return dn;
        let lo = 0;
        let hi = dn;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (emitted[mid] <= year) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      };
      counters.push({ mesh, countFor, full: dn });
      /* ONE number, on this one — see §ONLY TWO NUMBERS IN THE MATRIX CAN MOVE
         on the crowns. A contact disc has no rotation and its Y scale is a
         fixed 1 (a flat thing takes no exaggeration in the direction it has no
         extent in), so the band moves its foot and nothing else. */
      const discSpheres = new Map<number, Sphere>();
      placers.push((zex: number) => {
        const m = mesh.instanceMatrix.array as Float32Array;
        for (let k = 0; k < dn; k++) m[k * 16 + 13] = de[k] * zex;
        mesh.instanceMatrix.needsUpdate = true;
        seatSphere(mesh, dn, discSpheres, zex);
      });
      meshes.push(mesh);
      treeMeshes.push(mesh);
    }

    const byFam: number[][] = Array.from({ length: CROWN_FAMILIES }, () => []);
    for (const j of order) byFam[form[j] & (CROWN_FAMILIES - 1)].push(j);

    for (let fam = 0; fam < CROWN_FAMILIES; fam++) {
      const list = byFam[fam];
      if (!list.length) continue;
      const mesh = new InstancedMesh(crowns.geometries[fam], material, list.length);
      mesh.castShadow = o.castShadow ?? true;
      mesh.receiveShadow = false;
      /* so a harness can find the canopy in the scene graph without knowing
         which chunk or which silhouette it came from — the tree shadow's whole
         cost has to be priced against the same frame with it off */
      mesh.userData.canopy = true;

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
      /* ── THE JITTER HAS TO LIVE IN THE STORED NUMBERS, NOT THE MATRIX ────
         §the ground moves with the band explains that `onStep` RECOMPOSES
         every crown's matrix from `iw`/`ie`/`ir`, so anything written into the
         matrix at emit time is overwritten the first time a band changes. A
         size jitter set on `scl` here therefore did nothing at all — measured
         at 0.00 % of the frame, and still 0.00 % with the crowns tripled,
         which is what finally showed the matrix was being thrown away rather
         than the effect being weak.
         So the jitter goes into `ir` itself, and its vertical half into a
         parallel array the placer reads. */
      const itl = new Float32Array(list.length);
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
        /* the published size bit still picks the crown; this is a factor
           ON it, so the two populations stay apart — `tree-geometry.ts`
           §HOW FAR A CROWN'S DRAWN SIZE MAY WANDER */
        const cj = crownJitter(key(j));
        ir[n] = rM * cj.wide;
        itl[n] = cj.tall;
        pos.set(w.x, gz * 3.3, w.y);
        /* the crown is a built thing standing on the ground: its own width in
           world metres, its height on the built exaggeration */
        /* the published size bit still picks the crown; this is a factor on
           it, so the two populations stay apart — see `tree-geometry.ts`
           §HOW FAR A CROWN'S DRAWN SIZE MAY WANDER */
        scl.set(ir[n], ir[n] * itl[n] * o.zexb, ir[n]);
        setCrownYaw(n, rot);
        m4.compose(pos, rot, scl);
        mesh.setMatrixAt(n, m4);
        /* the family's published green, jittered per tree on its own
           stable key — `tree-geometry.ts` §ONE GREEN PER FAMILY */
        mesh.setColorAt(
          n,
          foliageTint(greens[form[j] & 3] ?? greens[0], key(j), tint),
        );
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
      /* ── §ONLY TWO NUMBERS IN THE MATRIX CAN MOVE ────────────────────────
         A band change moves the ground under 125,234 crowns, and this used to
         answer it by recomposing every one of their matrices from scratch:
         a quaternion built, a 4x4 multiplied out, and sixteen floats copied
         in and out through `setMatrixAt`. MEASURED, the whole tree layer cost
         33.9 ms of blocked main thread per band change — the largest single
         item left in one after `layers/buildings.ts` §THE GROUND IS A UNIFORM
         went in.

         Almost none of that matrix can change. `setCrownYaw` is a YAW — the
         quaternion is `(0, sin, 0, cos)`, a rotation about Y — so the
         rotation's own Y axis is exactly (0, 1, 0), and composing it with
         `(ir, ir*itl*zexb, ir)` leaves column 1 as `(0, ir*itl*zexb, 0)` with
         two structural zeros in it. The x and z columns carry no `zex` and no
         `zexb` at all.

         So exactly two of the sixteen floats are a function of the band: the
         Y scale at `[5]` and the Y translation at `[13]`, and both are written
         straight into the instance buffer from the four numbers each crown
         already keeps. It is the same idiom `canopy-shadow.ts` uses to
         re-seat a disc, taken one step further by not reading the matrix back
         to write it. Recomputed from `ir`/`itl`/`ie` rather than scaled by a
         ratio, so walking the ladder cannot accumulate drift. */
      const crownSpheres = new Map<number, Sphere>();
      placers.push((zex: number, zexb: number) => {
        const m = mesh.instanceMatrix.array as Float32Array;
        for (let k = 0; k < n; k++) {
          const b = k * 16;
          m[b + 5] = ir[k] * itl[k] * zexb;
          m[b + 13] = ie[k] * zex;
        }
        mesh.instanceMatrix.needsUpdate = true;
        seatSphere(mesh, n, crownSpheres, zex);
      });
      meshes.push(mesh);
      treeMeshes.push(mesh);
      crownMeshes.push(mesh);
      count += n;
    }

  }

  /* ── AND THE 50,897 CANOPY MASSES GET THEIR GROUND HERE TOO ─────────────
     `layers/canopy-shadow.ts` is its own layer with its own header, its own
     decode and its own dispose — it is what the discs under the canopy MASSES
     are, and it wants one line at the mount alongside `groundDetailLayer`.

     It is built here instead, and the reason is a session and not a design:
     the mount file is another workstream's this week and a layer nobody adds
     draws nothing. Everything it needs is already in hand at this point —
     `data` (the canopy tier is fetched before the tree tier, so its chunks are
     decoded by the time this runs) and the same `elevAt`. Lifting it out is
     three lines at the mount and DELETING this block; nothing about the layer
     itself has to change.

     The masses are a `ground-detail` thing and the crowns are this file's, but
     the shadow under either is the same object at the same rung of the same
     ladder, so keeping the two together is not the worst version of this. */
  const massShadow = canopyShadowLayer(data, {
    elevAt: o.elevAt,
    /* the band the layer is BUILT at. `CityEngine.add` calls `onStep` once
       with the live band the moment a layer joins, so whatever is used here is
       corrected before a frame is drawn — this file's crowns rely on the same
       thing and seat themselves at a bare 3.3 above. 1 is the honest form of
       "not known yet", and it is what makes the re-seat unconditional. */
    zex: 1,
  });
  if (massShadow) for (const m of massShadow.meshes) meshes.push(m);

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

       ── AND THEY CAST AGAIN, WHICH IS ALSO MEASURED ──────────────────────
       They were turned off outright after the block camera measured **991 ms**
       with them on. That number was real and its CAUSE was not the trees: the
       shadow camera was fitted in world x/z with a throw margin on all four
       sides, so at the block camera its box was 3,484 m across — two and a
       half times the 1,400 m the reader could see — and it caught nearly every
       tree chunk in the city. An `InstancedMesh` has no per-instance culling,
       so every crown in every caught chunk was re-rendered into the map.

       `light.ts` §the shadow box is fitted in the light's axes replaced that
       box with a tight one: 3,484 m became 2,754 x 1,569 at the block camera
       and 2,009 m became 1,759 x 966 at the street camera, and both are now
       oriented along the LIGHT rather than along world x/z, so a chunk that
       cannot cast into the frame is culled instead of drawn.

       MEASURED again on the same GPU, three runs, median of 21 fenced frames
       each, the 195,310 crowns casting and then not, inside ONE page load so
       nothing else can have moved:

         block    16.5 / 16.7     16.7 / 16.6     16.8 / 17.5  ms
         street   16.6 / 16.7     16.2 / 16.4     16.9 / 16.6  ms

       There is no signal. 991 ms became nothing, and it was never the trees.

       WHAT THEY STILL DO NOT DO is cast at the two WIDE cameras, and that is
       a separate measurement with a different answer — see `onStep` below and
       `ground-detail.ts` §they do not cast, where the same experiment on the
       50,897 canopy MASSES costs a third of the whole-city frame. */
    onYear(year: number | undefined) {
      for (const c of counters) c.mesh.count = c.countFor(year);
    },
    onStep(step: number, zex: number, zexb: number) {
      for (const f of placers) f(zex, zexb);
      const show = step >= (o.fromStep ?? 1);
      /* A crown only casts where it is DRAWN — an invisible caster is a pure
         cost — and only from the camera at which its shadow is bigger than a
         pixel. At the district camera a 7 m crown throws 10 m of shadow onto a
         3.1 m pixel: three pixels, under the canopy's own footprint, for the
         whole city's worth of shadow-map geometry. */
      const cast = show && (o.castShadow ?? true) && step >= (o.castFromStep ?? 2);
      for (const m of treeMeshes) m.visible = show;
      /* and the disc under each of them one band later — a 2.3 m disc at the
         district camera's 3.1 m pixel is three quarters of one, which is the
         width `street-markings.ts` calls a shimmer rather than a mark. See
         `discFromStep` for what the band before it cost. */
      const discs = show && step >= Math.max(o.fromStep ?? 1, o.discFromStep ?? 2);
      for (const m of discMeshes) m.visible = discs;
      /* THE MASSES' DISCS ARE ON THEIR OWN BAND, and it is a LATER one: the
         reference dissolves the canopy masses in over [VZ_C0, VZ_C1] and a
         crown is drawn from the first of those. Handing them this gate would
         put fifty thousand shadows on a lawn a whole band before anything
         stood on it. The layer keeps its own `onStep`, which is the third
         reason it is a layer and not a loop in this one. */
      massShadow?.onStep?.(step, zex, zexb);
      /* THE CAST FLAG IS THE CROWNS' ALONE. A contact disc is already a
         shadow; putting it in the shadow map would darken the ground under it
         a second time, and it would pay the caster cost this layer's whole
         gate exists to avoid. */
      for (const m of crownMeshes) m.castShadow = cast;
    },
    dispose() {
      /* THE MASS DISCS ARE DISPOSED BY THEIR OWN LAYER AND NOT BY THIS LOOP.
         They are in `meshes` because the caller adds `meshes` to the scene, but
         they are OWNED by `canopyShadowLayer` — which disposes them along with
         the geometry and the material they share. Walking `meshes` here as well
         would dispose each of them twice; `InstancedMesh.dispose()` survives
         that, and relying on it surviving is how a double free gets written
         somewhere it does not. `treeMeshes` is this file's own. */
      massShadow?.dispose();
      for (const m of treeMeshes) m.dispose();
      crowns.dispose();
      material.dispose();
      discGeom.dispose();
      discMat.dispose();
      meshes.length = 0;
      treeMeshes.length = 0;
      discMeshes.length = 0;
      crownMeshes.length = 0;
      counters.length = 0;
      placers.length = 0;
    },
  };
}
