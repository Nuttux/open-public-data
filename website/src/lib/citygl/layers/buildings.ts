/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/buildings.ts — THE CITY, EXTRUDED.

   166,166 published footprints, each raised to the height the LIDAR measured
   over it. One mesh per loaded chunk, uploaded once, drawn for nothing.

   ── WHAT THIS DOES THAT PAINTER'S ORDER CANNOT ────────────────────────────
   The Canvas renderer sorts every footprint back to front on every
   rasterisation and still approximates every overlap — `scene.ts` spends a
   counting sort, 128 depth bands and a per-band batch flush on it, and a
   tower crown behind a nearer roof still comes out wrong, because painter's
   order is a per-OBJECT answer to a per-PIXEL question. Here the depth
   buffer answers it per pixel and the sort does not exist.

   ── TWO VERTICES A CORNER, AND FLAT FACES ANYWAY ─────────────────────────
   A prism drawn with flat-shaded walls normally needs four vertices per wall
   quad, because a corner shared by two walls needs two normals. That would be
   five million vertices for this city. Instead each footprint ships TWO rings
   — its own corners at ground level and the same corners at roof level, 2n
   vertices — and the face normal is recovered per FRAGMENT from the screen
   derivatives of the world position. Same crisp faces, 40 % of the memory,
   and it is the normal the geometry actually has rather than one averaged
   across a corner.

   ── THE VERTICAL EXAGGERATION IS BAKED, AND THAT IS A DECISION ───────────
   The ground and the built height are exaggerated by DIFFERENT factors
   (`zex` and `zexb`), which a single mesh scale cannot express. The first cut
   put both in a custom vertex shader as uniforms — elegant, and it made a
   camera step cost two numbers.

   It also made the geometry INVISIBLE to three.js. Every pass that overrides
   the material — the shadow map's depth pass, a normal pass for ambient
   occlusion, any post-process — re-renders with ITS material and ITS vertex
   shader, which knows nothing about `aElev` and `aH`. Shadows would have been
   cast by a city lying flat at the origin.

   So the position is baked, and a step change rewrites the Y component of the
   position buffer: one pass over the array, three times in a session, against
   a whole renderer's worth of machinery that then works for free — real
   lights, a real shadow map, flat shading, and whatever post-processing comes
   later. `elev` and `h` are kept as attributes anyway, because rewriting Y
   needs them.
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
import { roofHeight } from "@/lib/city/roofs";
import { WA } from "@/lib/city/terrain";
import { decodeBldg, type BldgTable } from "../bldg";
import {
  FLAG_HEIGHT_STALE,
  FLAG_NOYEAR,
  USE_MASK,
  isPitched,
} from "@/components/us/city/palette";
import { COVER_GAIN } from "@/lib/city/buildings";
import { ROLE_FRONT, derivedBands, faEra, faGlassy, storeysOf } from "@/lib/city/facades";
import {
  FACADE_TILES,
  facadeAtlas,
  facadeGroundTile,
  facadeModuleM,
  facadeTile,
  wallTint,
  type FacadeAtlas,
  type FacadeKey,
} from "../facade";
import { hipForm, hipPlan, trayForm, type FormSink } from "../roof-form";
import { bldgMaterials, roofShadeTable, type MaterialConfig } from "../materials";
import type { CityLayer } from "../engine";

export interface BuildingsLayerOptions {
  /** how tall the built height is drawn, relative to the ground's own scale */
  zexb: number;
  /** ground elevation at a world point — the terrain field's own */
  elevAt: (x: number, y: number) => number;
  /** the measured aerial roof palette, from the city's manifest */
  roofPalette: readonly string[];
  /** the wall palette, from the renderer's own material table */
  wallPalette: readonly string[];
  /** the facade atlas, shared across every chunk */
  atlas?: FacadeAtlas | null;
  /** the published facade columns for this chunk, when it has them */
  face?: { ty: Uint8Array; st2: Uint8Array; shop: Uint8Array; role: Uint8Array } | null;
  /** footprints a hand-modelled landmark already stands on — never drawn twice */
  skipGids?: ReadonlySet<number>;
  /** what decides which entry of each a footprint gets */
  materials: MaterialConfig;
}


/** the Canvas renderer's own wall grade — `terrain.ts` §WA.wtop / WA.wbot */
const WTOP = WA.wtop;
const WBOT = WA.wbot;

/* ── AND WHAT A PHYSICAL LIGHT DOES TO THAT GRADE ───────────────────────────
   `WA.wtop`/`WA.wbot` are what a wall LOOKS LIKE on the published page: 1.14
   of its own colour at the head, 0.76 at the street, on BOTH visible faces,
   because that renderer paints rather than lights. Handed to a lit material
   the same two numbers land somewhere else entirely, because the light then
   multiplies them again — and for a VERTICAL surface that multiplier is small.

   Worked from `light.ts`'s own rig, in linear luminance, with the published
   sun `(0.2435, 0.73, 0.6346)` in scene axes:

     face            n·L      (ambient + hemisphere + sun) / PI
     ─────────────────────────────────────────────────────────
     up (a roof)     0.730    1.01
     wall, +y        0.635    0.90
     wall, +x        0.244    0.66
     wall, shadowed  0        0.51

   The ground is fine — its normals point straight up, so it takes the 1.01
   row, and the two wide cameras measure within 3 points of the Canvas page.
   The two WALL rows are the problem, and at the block and street cameras the
   frame is mostly wall: measured over the paired captures the port sat 11 and
   15 points of mean luminance under the page, with its p90 — the LIT
   surfaces — 24 and 38 points under. That is this table and nothing else.

   So the material carries the reciprocal of the wall rows' average, and the
   light supplies the difference BETWEEN them. A wall lands at 1.15 of its
   colour on the face turned to the sun and 0.85 on the face turned away,
   centred on the value the published page gives it, with the cast shadow
   dropping it to 0.66 — which is a shadow the Canvas renderer cannot draw at
   all. Lifting the LIGHTS instead would have moved the ground with them, and
   the ground already matches. */
const WALL_LIGHT_COMP = 1.50;

/** `face/<cell>` mirrors `bldg/<cell>` row for row; the solo table's is named
 *  once. A WRONG face chunk reads as a plausible building and a missing one
 *  reads as fewer openings, so this returns null rather than guessing. */
function faceKeyFor(key: string): string | null {
  if (key === "base/solo") return "base/solo-face";
  if (key.startsWith("bldg/")) return "face/" + key.slice(5);
  return null;
}

/** how wide a bay is, in metres, when the record does not say */
const BAY_M = 4.6;
/** and how tall a storey is, when the roll gives no count */
const STOREY_M = 3.4;

const _c = new Color();
function toRGB(hex: string): [number, number, number] {
  /* the palette entries are sRGB hex; three.js wants the working (linear)
     space — see `terrain.ts` §sRGB IN, LINEAR OUT */
  _c.setStyle(hex, SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}

/**
 * One mesh for one chunk of footprints.
 *
 * Returns null when the chunk has nothing drawable, so a caller can walk every
 * chunk without a special case.
 */
export function buildingsMesh(
  tb: BldgTable,
  o: BuildingsLayerOptions,
): {
  meshes: Mesh[];
  setStep: (zex: number, zexb: number) => void;
  setYear: (year: number | undefined) => void;
  materials: MeshLambertMaterial[];
} | null {
  const n = tb.n;
  if (!n) return null;

  const nv = tb.off[n];
  /* ── THREE RINGS, NOT TWO, AND THE THIRD IS WHY WALLS READ AS WALLS ─────
     The first cut shared the roof ring between the roof fan and the tops of
     the walls, which is one ring fewer and looks like a saving. It is not:
     a wall then interpolates from its own colour at the foot to the ROOF's
     colour at the top, so every wall in the city is a gradient INTO the tar
     of its own roof and the whole frame goes grey-brown. The third ring sits
     at the same height as the roof ring and carries the WALL's colour, lifted
     — `WA.wtop` — while the foot carries it dropped — `WA.wbot`. That pair is
     the Canvas renderer's own `wallGrad`, and it is what makes a wall look
     lit from the sky rather than stained from above. */
  const V = nv * 3;
  const aXZ = new Float32Array(V * 2);
  const aElev = new Float32Array(V);
  const aH = new Float32Array(V);
  const aCol = new Float32Array(V * 3);
  /* the facade's own coordinates: u counts BAYS along the wall, v counts
     STOREYS up it. Both are the building's, not the texture's. */
  const aUV = new Float32Array(V * 2);

  /* ── THE FORM GEOMETRY GROWS; THE THREE RINGS DO NOT ────────────────────
     A tray and a hip add vertices this loop cannot count in advance — a deck
     ring, a ridge, a slope. They go into growable arrays that are appended
     AFTER the fixed three-ring block, so the ring indices stay exactly where
     the wall loop expects them and the form's own indices simply start at V.
     One concatenation at the end, no reallocation per building. */
  const exXZ: number[] = [];
  const exElev: number[] = [];
  const exH: number[] = [];
  const exCol: number[] = [];
  /* the form vertices carry a facade coordinate too now — a shopfront band's
     head is a WALL vertex and has to tile with the body above it. Everything
     the roof builders make still takes (0, 0), which is the tile leaving it
     alone. */
  const exUV: number[] = [];
  const pushVert = (
    x: number, y: number, elevM: number, hM2: number,
    r: number, g: number, b: number, u: number, v: number,
  ): number => {
    exXZ.push(x, y);
    exElev.push(elevM);
    exH.push(hM2);
    exCol.push(r, g, b);
    exUV.push(u, v);
    return V + exElev.length - 1;
  };
  const sink: FormSink & {
    vertexUV: (
      x: number, y: number, elevM: number, hM2: number,
      r: number, g: number, b: number, u: number, v: number,
    ) => number;
  } = {
    vertex(x, y, elevM, hM2, r, g, b) {
      return pushVert(x, y, elevM, hM2, r, g, b, 0, 0);
    },
    vertexUV: pushVert,
    tri(a, b, c2) {
      idxRoof.push(a, b, c2);
    },
  };
  /** the shopfront band's head ring for the footprint being emitted, -1 where
   *  no edge has asked for one yet. Reset at the end of each building. */
  let maxRing = 3;
  for (let i = 0; i < n; i++) maxRing = Math.max(maxRing, tb.off[i + 1] - tb.off[i]);
  const gndRing = new Int32Array(maxRing).fill(-1);

  // roofs are (c-2) triangles, walls are 2c — one index buffer for both
  let triCount = 0;
  for (let i = 0; i < n; i++) {
    const c = tb.off[i + 1] - tb.off[i];
    if (c >= 3) triCount += c - 2 + 2 * c;
  }
  /* ROOFS AND WALLS ARE TWO INDEX BUFFERS OVER ONE SET OF VERTICES. They
     need different materials — only a wall carries a facade — and three.js
     binds one material per geometry. Sharing the ATTRIBUTES and splitting only
     the indices costs nothing: the vertex data is uploaded once. */
  const idxRoof: number[] = [];
  /* ── ONE WALL BUFFER PER VOCABULARY ────────────────────────────────────
     Eight facades — a punched masonry wall, a glass curtain wall, a
     shopfront, an industrial shed, a parking deck, a sash wall, a plain
     unclassed wall and a blank party edge — and each is a different TEXTURE,
     which three.js binds per material and therefore per geometry. So the
     walls split into eight index buffers over the one set of vertices; the
     vertex data is still uploaded once and the split costs nothing but the
     draw call.

     Which one a building gets is `facadeTile`, and every branch of it is a
     published column: the roll's use class, its era, whether the era makes it
     glassy, whether the ground floor is a shop, and whether the wall is a
     party edge the record says takes no openings at all. */
  const idxWall: number[][] = FACADE_TILES.map(() => []);
  void triCount;

  /* ── THE YEAR IS A DRAW RANGE, AND THAT IS THE WHOLE TRICK ──────────────
     A century scrub has to answer, sixty times a second, *which buildings
     exist yet*. Rebuilding an index buffer per year is a pass over 166,166
     footprints; testing a year per vertex needs a custom shader, which this
     port gave up on purpose (it is what broke the shadow pass).

     Instead the buildings are EMITTED IN YEAR ORDER — undated first, because
     a footprint the roll does not date is drawn in every year, then by the
     roll's own year ascending. The set that exists in year Y is then a
     PREFIX of the index buffer, and the gate is `setDrawRange(0, n)`: one
     number, no upload, no rebuild, correct at any frame rate. */
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const yearOf = (i: number): number =>
    (tb.u[i] & FLAG_NOYEAR) !== 0 ? -1 : 1849 + tb.yr[i];
  const ord = Array.from(order).sort((a, b) => yearOf(a) - yearOf(b) || a - b);
  /** for each emitted building, the year it starts existing (-1 = always) */
  const emittedYear: number[] = [];
  /** index-buffer length after each emitted building */
  const roofMark: number[] = [];
  const wallMark: number[][] = FACADE_TILES.map(() => []);

  /* the roof palette with its four height shades already applied, so the
     lookup below is one index rather than a colour computation per footprint */
  const roofRGB = roofShadeTable(o.roofPalette).map(toRGB);
  const wallRGB = o.wallPalette.map(toRGB);
  const mat = bldgMaterials(tb, o.materials);

  /* DEV-ONLY, the `__cityWA` idiom: which palette bucket the city actually
     lands in. Written because the first cut came out near-black and the
     candidates — a colour space, a shade table, the nosample bit — could not
     be told apart by looking at the frame. */
  if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
    const g = globalThis as { __cityGLMat?: { roof: number[]; nosample: number; n: number } };
    const acc = (g.__cityGLMat ??= { roof: new Array(64).fill(0), nosample: 0, n: 0 });
    for (let i = 0; i < tb.n; i++) {
      acc.roof[Math.min(63, mat.roof[i])]++;
      if ((tb.paintFlag[i] & o.materials.noSampleBit) !== 0) acc.nosample++;
      acc.n++;
    }
  }

  for (const i of ord) {
    const s = tb.off[i];
    const c = tb.off[i + 1] - s;
    if (c < 3) continue;
    /* A HERO STANDS HERE, so the fabric does not: one building wearing two
       shapes is worse than either. See `heroesLayer`'s `skipGids`. */
    if (o.skipGids?.has(tb.gid[i])) continue;

    const hM = roofHeight(tb.h[i], tb.hf[i]);
    const elev = o.elevAt(tb.cx[i], tb.cy[i]);

    /* ── WHICH ROOF THIS FOOTPRINT GETS, AND THE POPULATION IS PUBLISHED ──
       `isPitched` is the roll's own rule and is not widened here: the
       pre-1907 wood-frame DWELLING, single or multi family, 14,555
       footprints. Everything else is flat behind a parapet, which in this
       city is not a stylisation — it is what the stock is.

       A hip eats into the wall: its eave sits `halfRise` BELOW the measured
       top, because the measured top is the RIDGE. So the plan is asked for
       before the rings are written, and the wall's top ring goes to the eave.
       In 2D the hip is painted over the flat roof and the wall never has to
       know; on a mesh a full-height wall would push through the slopes. */
    const ring = { x: tb.vx, y: tb.vy, off: s, n: c };
    const pitched = isPitched(
      tb.u[i] & USE_MASK,
      1849 + tb.yr[i],
      (tb.u[i] & FLAG_NOYEAR) !== 0,
    );
    const plan = pitched ? hipPlan(ring) : null;
    const wallH = plan ? Math.max(0, hM - plan.halfRiseM) : hM;

    /* THE MEASURED ROOF COLOUR, and the wall a step under it. Block 3 makes
       both of these a material under a real sun; for now the roof is what the
       aerial photograph measured over that footprint and the wall is the
       renderer's own table entry, which is what the Canvas path also does at
       `ri` / `wi`. */
    const rc = roofRGB[mat.roof[i] * 4 + mat.shade[i]] ?? [0.6, 0.58, 0.54];
    const wc = wallRGB[mat.wall[i]] ?? [0.78, 0.72, 0.62];
    /* ── WHICH FACADE, AND A NUDGE SO NEIGHBOURS ARE NOT ONE GREY ────────
       `wallJitter` is bounded to +/-3.5 % — deliberately under the 8.3 %
       smallest step of `RSHADE`, the renderer's own declared difference
       between two objects of the same material. So it breaks up a block
       without ever opening a gap the material table means something by. */
    const ty = o.face ? (o.face.ty[i] ?? 0) : 0;
    const st2 = o.face ? (o.face.st2[i] ?? 0) : 0;
    const shop = o.face ? (o.face.shop[i] ?? 0) === 1 : false;
    const noYr = (tb.u[i] & FLAG_NOYEAR) !== 0;
    const era = noYr ? -1 : faEra(1849 + tb.yr[i]);
    /* ── THE 14,532 THE ROLL DOES NOT COUNT ─────────────────────────────
       Where no storey column reaches a footprint, `derivedBands` reads a
       rhythm off the MEASURED height instead — the Canvas path's own
       fallback, calibrated at 70.3 % exact and 96.3 % within one band over
       151,379 footprints. Without it 8.75 % of the city keeps a flat blank
       wall in every year at every zoom, which is most of what a reader means
       by *"all buildings look kind of the same"*. `FLAG_HEIGHT_STALE` still
       gets the flat wall, because its height is not its own. */
    const storeysPub = storeysOf(tb.st[i], st2);
    const bands =
      storeysPub > 0
        ? storeysPub
        : derivedBands(hM, (tb.u[i] & FLAG_HEIGHT_STALE) !== 0);
    const keyOf = (role: number): FacadeKey => ({
      type: ty,
      era,
      storeys: bands,
      shop,
      role,
      glassy: era >= 0 && faGlassy(ty, era),
    });
    /* the roles this ring actually carries, so the tile is looked up at most
       three times a building rather than once an edge */
    const roles = o.face ? o.face.role : null;
    const tileFor: number[] = [];
    const gndFor: number[] = [];
    for (let r = 0; r < 3; r++) {
      tileFor.push(facadeTile(keyOf(r)));
      gndFor.push(facadeGroundTile(keyOf(r)));
    }
    /* ── THE BAY IS THE BUILDING'S, NOT A NOMINAL 4.6 m ──────────────────
       `facadeModuleM` is `faVocab().mod` — 3.1 m for a 1900s apartment
       house, 8.0 m for a modern shed. One divisor, and a row house gets
       twice the openings of the warehouse behind it at the same wall length,
       which is the rhythm the two actually have. */
    const bayM = facadeModuleM(keyOf(ROLE_FRONT)) || BAY_M;

    /* ── AND A NUDGE SO NEIGHBOURS ARE NOT ONE GREY ─────────────────────
       `wallTint` moves a building on TWO axes — value, and a small warm/cool
       swing — bounded so the widest separation it can open between two walls
       (0.070 of their shared colour) is still narrower than 0.083, the
       smallest step of `RSHADE`, which is the renderer's own declared
       difference between two objects of the SAME material. The material table
       stays what the frame reads; this is only what separates two walls
       inside one entry of it. Unclassed footprints take half the spread,
       because a row the record does not classify should not be the most
       varied thing on the block. */
    const tint = wallTint(keyOf(ROLE_FRONT), tb.gid[i]);
    const wBot: [number, number, number] = [
      wc[0] * WBOT * WALL_LIGHT_COMP * tint.r,
      wc[1] * WBOT * WALL_LIGHT_COMP * tint.g,
      wc[2] * WBOT * WALL_LIGHT_COMP * tint.b,
    ];
    const wTop: [number, number, number] = [
      wc[0] * WTOP * WALL_LIGHT_COMP * tint.r,
      wc[1] * WTOP * WALL_LIGHT_COMP * tint.g,
      wc[2] * WTOP * WALL_LIGHT_COMP * tint.b,
    ];

    /* ── HOW MANY STOREYS, AND HOW MANY BAYS ────────────────────────────
       The roll publishes a storey count for most footprints; where it does
       not, the measured height over a nominal storey is the honest stand-in
       and is rounded to at least one. Bays are not published anywhere, so
       they come from a nominal width — which is why `BAY_M` is named and
       stated rather than folded into a magic number. */
    const storeys = Math.max(1, storeysPub > 0 ? storeysPub : Math.round(hM / STOREY_M));

    const foot = s * 3;
    const wallTop = s * 3 + c;
    const roof = s * 3 + c * 2;
    /** the shopfront band's head at ring vertex k, built the first time an
     *  edge asks for it and reused by the edge on the other side of it */
    const groundVert = (k: number, hGnd: number): number => {
      const had = gndRing[k];
      if (had >= 0) return had;
      const t = Math.min(1, hGnd / Math.max(1e-3, wallH));
      const made = sink.vertexUV(
        tb.vx[s + k],
        tb.vy[s + k],
        elev,
        hGnd,
        wBot[0] + (wTop[0] - wBot[0]) * t,
        wBot[1] + (wTop[1] - wBot[1]) * t,
        wBot[2] + (wTop[2] - wBot[2]) * t,
        aUV[(foot + k) * 2],
        1,
      );
      gndRing[k] = made;
      return made;
    };
    let run = 0;
    for (let k = 0; k < c; k++) {
      const x = tb.vx[s + k];
      const y = tb.vy[s + k];
      if (k > 0) {
        run += Math.hypot(x - tb.vx[s + k - 1], y - tb.vy[s + k - 1]);
      }
      const u = run / bayM;
      aUV[(foot + k) * 2] = u;
      aUV[(foot + k) * 2 + 1] = 0;
      aUV[(wallTop + k) * 2] = u;
      aUV[(wallTop + k) * 2 + 1] = storeys;
      aUV[(roof + k) * 2] = u;
      aUV[(roof + k) * 2 + 1] = storeys;
      for (const [base, hh, col] of [
        [foot + k, 0, wBot],
        [wallTop + k, wallH, wTop],
        [roof + k, wallH, rc],
      ] as const) {
        aXZ[base * 2] = x;
        aXZ[base * 2 + 1] = y;
        aElev[base] = elev;
        aH[base] = hh;
        aCol[base * 3] = col[0];
        aCol[base * 3 + 1] = col[1];
        aCol[base * 3 + 2] = col[2];
      }
    }

    /* THE ROOF, AS A FAN — and it is allowed to be a fan here in a way the
       Canvas path's fill is not. A fan over a non-convex ring lays triangles
       outside the polygon, which a 2D fill would show; on the GPU those
       triangles are coplanar with the roof, at the same height, in the same
       colour, and the depth buffer resolves them into exactly the roof. What
       a fan cannot do is put roof colour where there is no roof — a fan's
       triangles all share vertex 0 and stay inside the ring's convex hull —
       so the error is bounded by the hull, and Block 6 replaces it with a
       real triangulation when roofs get their own form. */
    /* ── THE ROOF: A HIP, A TRAY, OR THE FLAT FAN AS A FALLBACK ─────────
       Each builder decides for itself and returns false when the ring will
       not take the treatment — a plan too complicated for a hip, an inset
       that inverts, a parapet taller than the building. A refusal leaves the
       flat fan standing, which is what the page drew before either existed. */
    let roofed = false;
    if (plan) roofed = hipForm(sink, ring, elev, hM, rc);
    if (!roofed) roofed = trayForm(sink, ring, elev, wallH, rc);
    if (!roofed) {
      for (let k = 1; k + 1 < c; k++) {
        idxRoof.push(roof, roof + k, roof + k + 1);
      }
    }
    /* ── THE WALL, EDGE BY EDGE ─────────────────────────────────────────
       The role is published PER RING VERTEX, not per building: 163,536
       measured edges saying whether this side of this footprint is a front, a
       back or a party edge against its neighbour. Reading one role for the
       whole building — as the first cut did — gives an inner-block party wall
       the same windows as the street frontage, and takes the shopfront off
       every corner shop whose first vertex happens to sit on the side street.
       So the tile is chosen here, inside the loop, and the eight index
       buffers sort the edges out. */
    const storeyM = wallH / Math.max(1, bands);
    for (let k = 0; k < c; k++) {
      const k1 = (k + 1) % c;
      const role = roles ? (roles[s + k] ?? ROLE_FRONT) : ROLE_FRONT;
      const tile = tileFor[role] ?? tileFor[ROLE_FRONT];
      const gnd = gndFor[role] ?? -1;

      /* ── AND WHERE THE RECORD SAYS SHOP, THE GROUND FLOOR IS A SHOP ────
         A shopfront is not a smaller window: it is the whole frontage in
         glass, to a different height, and it is the single most legible thing
         about a street at the street camera. It gets its own band of
         geometry — two triangles an edge, on the frontages that have one —
         rather than being averaged into the tile above it.

         The band's top ring is built lazily into the form arrays, so a city
         of houses pays nothing for it. `v` runs 0 at the foot and 1 at the
         band's head, which puts exactly ONE repeat of the shopfront tile in
         the band, and the body above it then runs 1..storeys — so the two
         together tile the wall continuously with no seam to correct. */
      if (gnd >= 0 && wallH > storeyM * 1.2) {
        const a0 = groundVert(k, storeyM);
        const a1 = groundVert(k1, storeyM);
        idxWall[gnd].push(foot + k, foot + k1, a1, foot + k, a1, a0);
        idxWall[tile].push(a0, a1, wallTop + k1, a0, wallTop + k1, wallTop + k);
      } else {
        idxWall[tile].push(
          foot + k, foot + k1, wallTop + k1, foot + k, wallTop + k1, wallTop + k,
        );
      }
    }
    gndRing.fill(-1, 0, c);
    emittedYear.push(yearOf(i));
    roofMark.push(idxRoof.length);
    for (let tI = 0; tI < idxWall.length; tI++) wallMark[tI].push(idxWall[tI].length);
  }

  /* the fixed rings and the form geometry, as one buffer each */
  const EX = exElev.length;
  const VT = V + EX;
  const fXZ = new Float32Array(VT * 2);
  const fElev = new Float32Array(VT);
  const fH = new Float32Array(VT);
  const fCol = new Float32Array(VT * 3);
  const fUV = new Float32Array(VT * 2);
  fXZ.set(aXZ);
  fElev.set(aElev);
  fH.set(aH);
  fCol.set(aCol);
  fUV.set(aUV);
  for (let k = 0; k < EX; k++) {
    fXZ[(V + k) * 2] = exXZ[k * 2];
    fXZ[(V + k) * 2 + 1] = exXZ[k * 2 + 1];
    fElev[V + k] = exElev[k];
    fH[V + k] = exH[k];
    fCol[(V + k) * 3] = exCol[k * 3];
    fCol[(V + k) * 3 + 1] = exCol[k * 3 + 1];
    fCol[(V + k) * 3 + 2] = exCol[k * 3 + 2];
    /* form vertices take v = 0 so the facade tile leaves them alone: a
       parapet and a roof slope are not a wall and carry no windows */
    fUV[(V + k) * 2] = exUV[k * 2];
    fUV[(V + k) * 2 + 1] = exUV[k * 2 + 1];
  }

  const attrs = {
    aElev: new BufferAttribute(fElev, 1),
    aH: new BufferAttribute(fH, 1),
    color: new BufferAttribute(fCol, 3),
    uv: new BufferAttribute(fUV, 2),
  };

  /* THE POSITION, BAKED — see the header. `setStep` rewrites Y in place when
     the camera's band moves, which is the only thing that can change it. */
  const pos = new Float32Array(VT * 3);
  for (let v = 0; v < VT; v++) {
    pos[v * 3] = fXZ[v * 2];
    pos[v * 3 + 2] = fXZ[v * 2 + 1];
  }
  const posAttr = new BufferAttribute(pos, 3);

  const make = (indices: number[]): BufferGeometry => {
    const g = new BufferGeometry();
    g.setAttribute("position", posAttr);
    g.setAttribute("aElev", attrs.aElev);
    g.setAttribute("aH", attrs.aH);
    g.setAttribute("color", attrs.color);
    g.setAttribute("uv", attrs.uv);
    g.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
    return g;
  };
  const gRoof = make(idxRoof);
  /* one wall geometry per vocabulary, and the empty ones are never built */
  const wallOf: { tile: number; g: BufferGeometry }[] = [];
  for (let t = 0; t < idxWall.length; t++) {
    if (idxWall[t].length) wallOf.push({ tile: t, g: make(idxWall[t]) });
  }

  /**
   * How much of each index buffer exists in a given year — a binary search
   * over the emitted order, which is sorted by year by construction.
   */
  const upTo = (year: number | undefined): number => {
    if (year === undefined) return emittedYear.length;
    let lo = 0;
    let hi = emittedYear.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (emittedYear[mid] <= year) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const setYear = (year: number | undefined): void => {
    const k = upTo(year);
    gRoof.setDrawRange(0, k ? roofMark[k - 1] : 0);
    for (const w of wallOf) w.g.setDrawRange(0, k ? wallMark[w.tile][k - 1] : 0);
  };

  const setStep = (zex: number, zexb: number): void => {
    for (let v = 0; v < VT; v++) pos[v * 3 + 1] = fElev[v] * zex + fH[v] * zexb;
    posAttr.needsUpdate = true;
    gRoof.computeBoundingSphere();
    for (const w of wallOf) w.g.computeBoundingSphere();
  };
  setStep(3.3, o.zexb);

  /* ── FLAT SHADING, WHICH IS WHY THREE RINGS ARE ENOUGH ──────────────────
     `flatShading` makes three.js derive the face normal in the fragment
     shader from the derivatives of the view position, so a wall quad gets ONE
     normal across its face without its own copies of the two corners it
     shares.

     LAMBERT AND NOT STANDARD: this city is painted, not photographed. A
     physically based material wants roughness and metalness maps nobody
     published, and would spend its budget on specular highlights that do not
     belong in the register. Lambert is a diffuse surface under a sun and a
     sky, which is what a gouache city is. */
  const mRoof = new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: DoubleSide,
  });

  const materials: MeshLambertMaterial[] = [mRoof];
  const meshes: Mesh[] = [];
  const addMesh = (g: BufferGeometry, m: MeshLambertMaterial): void => {
    const mesh = new Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  };
  addMesh(gRoof, mRoof);
  for (const w of wallOf) {
    /* ── THE TILE COMES OFF THE ATLAS AS ITS OWN TEXTURE ──────────────────
       Not a sub-rectangle of the sheet. This layer's uv is `(run / BAY_M,
       storeys)` — metres along the wall and floors up it — so BOTH
       coordinates run well past 1 and the tile has to repeat by wrapping.
       An atlas cell cannot wrap: sampling past its edge walks into the
       neighbouring vocabulary. `facadeAtlas` therefore hands back the eight
       tiles as separate textures as well as the sheet, and this is the side
       the walls use. */
    const m = new MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: DoubleSide,
      map: o.atlas ? (o.atlas.tiles[w.tile] ?? null) : null,
    });
    materials.push(m);
    addMesh(w.g, m);
  }

  return { meshes, setStep, setYear, materials };
}

/**
 * Every loaded footprint chunk, as one layer.
 *
 * The tier is fetched whole rather than by view — see `CityData.loadTier`. A
 * GPU renderer's cost is in the upload, not the draw, so the city arrives once
 * and every camera after that is free.
 */
export function buildingsLayer(
  data: CityData,
  o: BuildingsLayerOptions,
): CityLayer & { meshes: Mesh[]; count: number } {
  const meshes: Mesh[] = [];
  const setters: ((zex: number, zexb: number) => void)[] = [];
  const yearSetters: ((year: number | undefined) => void)[] = [];
  const materials: MeshLambertMaterial[] = [];
  /* ONE ATLAS FOR THE CITY. Eight tiles, built once here and shared by every
     chunk — a per-chunk atlas would be 124 copies of the same eight images. */
  const atlas = o.atlas ?? facadeAtlas();
  let count = 0;

  for (const c of data.manifest.chunks) {
    if (c.kind !== "bldg") continue;
    const chunk = data.get(c.k);
    if (!chunk) continue;
    const tb = decodeBldg(chunk);
    const fk = faceKeyFor(c.k);
    const fc = fk ? data.get(fk) : undefined;
    const face = fc
      ? {
          ty: (fc.fields.ty as Uint8Array) ?? new Uint8Array(0),
          st2: (fc.fields.st2 as Uint8Array) ?? new Uint8Array(0),
          shop: (fc.fields.shop as Uint8Array) ?? new Uint8Array(0),
          role: (fc.fields.role as Uint8Array) ?? new Uint8Array(0),
        }
      : null;
    const built = buildingsMesh(tb, { ...o, atlas, face });
    if (!built) continue;
    meshes.push(...built.meshes);
    setters.push(built.setStep);
    yearSetters.push(built.setYear);
    materials.push(...built.materials);
    count += tb.n;
  }

  /* ── SUB-PIXEL COVERAGE, AND WHY THE FABRIC DARKENS AT WIDE ZOOM ───────
     `COVER_GAIN` is `[0.8, 0.9, 1.0]` and it is not a colour decision — it is
     a RENDERING correction the published page states in `lib/city/buildings.ts`
     §SUB-PIXEL COVERAGE. At the whole-city camera a house is about a pixel
     across and a block is roughly 40 % roof against 60 % yard, light well and
     driveway, so every roof pixel is already a BLEND of the roof and the pale
     ground beneath it. Darkening the tables makes the coverage-weighted
     average land where the colour was chosen to land. At the block camera a
     building covers whole pixels and the gain is 1.

     The port was not applying it at all, and it shows in the measurement: over
     the paired captures the GPU frame ran +10.1 (whole city) and +9.9
     (district) points of luminance ABOVE the published page, while the two
     close cameras — where the gain is 1 and nothing should differ — sat within
     3 points. The gap was exactly the two bands that carry a gain.

     ── AND IT IS RAISED TO 2.2, WHICH IS THE WHOLE SUBTLETY ────────────────
     The published `shade(hex, k)` multiplies the sRGB BYTES. three.js works in
     linear light, so the same visual darkening is `k ** 2.2` here, not `k`:
     0.8 of a byte is 0.61 of the light behind it. Passing 0.8 straight through
     would apply about a third of the correction and leave the wide cameras
     bright. */
  const gainAt = (step: number): number => (COVER_GAIN[step] ?? 1) ** 2.2;

  return {
    name: "buildings",
    meshes,
    count,
    onStep(step: number, zex: number, zexb: number) {
      const g = gainAt(step);
      for (const m of materials) m.color.setScalar(g);
      for (const f of setters) f(zex, zexb);
    },
    onYear(year: number | undefined) {
      for (const f of yearSetters) f(year);
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const m of materials) m.dispose();
      atlas?.dispose();
      meshes.length = 0;
      setters.length = 0;
      yearSetters.length = 0;
      materials.length = 0;
    },
  };
}
