/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/terrain.ts — THE GROUND, AS A MESH.

   The Canvas renderer walks the DEM far-to-near and fills 67,081 quads with
   bilinear sub-quads every time anything changes — 226 ms of a 404 ms
   whole-city rasterisation, measured (`terrain.ts` §GROUND_PLATE). The same
   ground here is ONE mesh, uploaded once, drawn in a fraction of a
   millisecond, at any camera, for ever.

   ── THE COLOURS ARE NOT REDERIVED ─────────────────────────────────────────
   Every node takes the colour `TerrainField.node()` gives it — the same
   object the Canvas path reads, so the hillshade, the park tint, the canopy
   tint, the burn and the aerial haze are byte-identical between the two
   renderers. That is deliberate and it is what makes a parity screenshot mean
   something: where the two frames differ, the difference is the RENDERER and
   never the palette.

   ── WHY THE VERTICAL EXAGGERATION IS A SCALE AND NOT A BAKED HEIGHT ───────
   `position.y` is the elevation in real metres and the mesh is scaled on Y by
   the band's `zex`. A band change is then one number, not 67,600 rebuilt
   vertices — where the Canvas renderer has to re-rasterise the world and
   cross-fade the two pictures on the glass.

   The node COLOURS do move with the band (the hillshade reads a slope, and a
   slope is exaggerated), so one colour buffer is built per band, lazily, and
   swapped. Three buffers, built once each, at 67,600 nodes.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
} from "three";

import type { CityData } from "@/lib/city/data";
import { TerrainField, type TerrainProj } from "@/lib/city/terrain";
import type { CityLayer } from "../engine";

export interface TerrainLayer extends CityLayer {
  readonly mesh: Mesh;
  /** the field for a band — the hit test and the overlay read the same one */
  fieldFor(step: number): TerrainField;
}

/**
 * @param zexByStep the descriptor's own exaggeration table
 * @param prepare a hook the caller uses to attach what the field needs that
 *        the chunk does not carry — the canopy tint, the park cells, the
 *        offshore bits. Kept as a callback because every one of those is the
 *        CITY's data and this file may not know a city.
 */
/** the ray-crossing test, on the published rings' own vertices */
function insideCoast(
  rings: readonly (readonly (readonly [number, number])[])[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    if (n < 3) continue;
    for (let k = 0, j = n - 1; k < n; j = k++) {
      const yi = ring[k][1];
      const yj = ring[j][1];
      if (yi > y !== yj > y) {
        const xi = ring[k][0];
        const xj = ring[j][0];
        if (x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) inside = !inside;
      }
    }
  }
  return inside;
}

/* ── THE LAND STOPS WHERE THE PUBLISHED PAGE STOPS IT ──────────────────────
   This file used to run a SECOND test after the DEM's own land bit: an
   even-odd crossing of the cell centre against the published shoreline rings,
   on the reasoning that the raster's 53.8 m staircase is ugly at the
   whole-city camera and a mesh can simply not build the cell.

   IT CUT REAL LAND. Put the two whole-city frames side by side at the
   south-east corner and the published page draws Bayview — streets, blocks,
   parks, the hill — while this one drew its buildings floating on bare paper,
   a bleached void several hundred metres across. Measured over the same crop
   the port's p95 ran (255, 248, 227) against the page's (233, 228, 215): not
   a brighter ground, an ABSENT one.

   The rings are a drawn SHORELINE, not a set of closed land polygons, and an
   even-odd test over open polylines answers confidently and wrongly. The
   Canvas rule is `maskAt(i, j)` and nothing else — so that is the rule here,
   the two renderers cut the coast in the same place, and the published
   shoreline drawn over both lands on the same pixels. The staircase is real
   and it is the page's own; `layers/ground-detail.ts` draws the published
   coastline over it exactly as the Canvas renderer does. */

export function terrainLayer(
  data: CityData,
  zexByStep: readonly number[],
  prepare?: (t: TerrainField) => void,
  clip?: readonly (readonly (readonly [number, number])[])[] | null,
): TerrainLayer {
  const chunk = data.get("base/terrain");
  if (!chunk) throw new Error("terrain: base/terrain has not landed");
  const proj = data.manifest.proj as unknown as TerrainProj;
  const N = proj.N;
  const step = 1 / proj.s;

  const fields = new Map<number, TerrainField>();
  const colours = new Map<number, Float32Array>();

  function fieldFor(s: number): TerrainField {
    let t = fields.get(s);
    if (!t) {
      t = new TerrainField(chunk!, proj, { zex: zexByStep[s] ?? zexByStep[0] });
      prepare?.(t);
      fields.set(s, t);
    }
    return t;
  }

  // ── positions: one vertex per DEM node, elevation in REAL metres ─────────
  const pos = new Float32Array(N * N * 3);
  const t0 = fieldFor(0);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const o = (i * N + j) * 3;
      pos[o] = proj.X0 + i * step;
      pos[o + 1] = t0.elevAt(i, j);
      pos[o + 2] = proj.Y0 + j * step;
    }
  }

  /* ── INDICES: THE LAND CELLS, AND THE RULE IS THE CANVAS RULE ────────────
     `rasteriseTerrain` draws a cell when `maskAt(i, j)` — the cell's own land
     bit — and skips the last row and column, which have no cell. Same test,
     same skips, so the two renderers cut the coast in the same place and the
     published shoreline that is drawn over both lands on the same pixels. */
  /* ── AND THE CELL'S OWN CENTRE AGAINST THE PUBLISHED LINE ───────────────
     The DEM's land bit is per 53.8 m cell, so its edge is a staircase of that
     amplitude — three or four pixels of cream steps running out into the bay
     at the whole-city camera, and the first thing a reader sees. The published
     page cuts them back with a corridor that repaints the bay inside 1,100 m
     of the shoreline; a mesh does something simpler and more honest, which is
     not to build the cell.

     This was tried once before and REVERTED, because it appeared to be
     deleting Bayview. It was not: that hole was the surround mesh winning the
     depth test over the city, and the bleached mass across the Gate was the
     city's own DEM reaching into Marin with no offshore mask. Both are fixed
     above, and with `coastFix` set the two tests now agree with each other —
     the mask's own meta records that these rings reproduce the shipped land
     mask on 116,480 of 116,480 cells, so what this removes is only the half-
     cell overhang, never a cell the record calls land. Recorded here because a
     revert that was right for the wrong reason is worth not repeating. */
  const rings = clip && clip.length ? clip : null;
  const idx: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < N - 1; j++) {
      if (!t0.maskAt(i, j)) continue;
      if (rings) {
        const cxm = proj.X0 + (i + 0.5) * step;
        const cym = proj.Y0 + (j + 0.5) * step;
        if (!insideCoast(rings, cxm, cym)) continue;
      }
      const a = i * N + j;
      const b = (i + 1) * N + j;
      const c = (i + 1) * N + (j + 1);
      const d = i * N + (j + 1);
      idx.push(a, b, c, a, c, d);
    }
  }

  function coloursFor(s: number): Float32Array {
    let col = colours.get(s);
    if (!col) {
      const t = fieldFor(s);
      col = new Float32Array(N * N * 3);
      const c = new Color();
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const k = t.node(i, j, 0);
          const o = (i * N + j) * 3;
          /* ── sRGB IN, LINEAR OUT, AND THIS IS NOT A DETAIL ──────────────
             `nodeR/G/B` are the bytes the Canvas path writes straight into a
             2D context: sRGB. three.js treats a vertex colour as LINEAR and
             converts it to sRGB on the way out, so handing it sRGB values
             raises everything a second time — the ground came out white-hot
             and the city read as black silhouettes on paper
             (shots/b2-gl-block.png). `setRGB(..., SRGBColorSpace)` converts
             into the working space, and the round trip then returns exactly
             the byte the Canvas renderer would have written. */
          c.setRGB(t.nodeR(k) / 255, t.nodeG(k) / 255, t.nodeB(k) / 255, SRGBColorSpace);
          col[o] = c.r;
          col[o + 1] = c.g;
          col[o + 2] = c.b;
        }
      }
      colours.set(s, col);
    }
    return col;
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(coloursFor(0), 3));
  g.setIndex(idx.length > 65535 ? new BufferAttribute(new Uint32Array(idx), 1)
    : new BufferAttribute(new Uint16Array(idx), 1));
  /* ── THE GROUND'S NORMALS POINT STRAIGHT UP, ON PURPOSE ────────────────
     The vertex colours ALREADY carry a hillshade — a hand-tuned one, off the
     full-resolution DEM, with the project's own sun in it. Give this mesh its
     true normals and a directional light and the frame gets a SECOND
     hillshade over the first: same direction, compounding contrast, and the
     city comes back olive and waxy, like a satellite render.

     With every normal straight up the sun's diffuse term is CONSTANT across
     the ground, so it adds no shading of its own — and the one thing it does
     add is the thing a hillshade cannot: the SHADOW a building or a ridge
     throws across it. That is the whole reason the sun is here. The relief
     you see is still the published DEM's; it is just drawn once instead of
     twice.

     Buildings keep their real normals — they have no baked shading and every
     facet needs its own. */
  const up = new Float32Array(N * N * 3);
  for (let v = 0; v < N * N; v++) up[v * 3 + 1] = 1;
  g.setAttribute("normal", new BufferAttribute(up, 3));
  g.computeBoundingSphere();

  /* BASIC, NOT LAMBERT, AND ON PURPOSE FOR NOW: the hillshade is already IN
     the vertex colours, exactly as the Canvas renderer bakes it. Lighting the
     mesh a second time would light the same ground twice. Block 3 takes the
     shade OUT of the colours and puts a real sun in; until then this is
     parity, and parity is what the block is for. */
  const m = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const mesh = new Mesh(g, m);
  mesh.matrixAutoUpdate = true;
  mesh.renderOrder = 0;
  /* THE GROUND RECEIVES, AND IT ALSO CASTS. A hill puts its own far slope in
     shadow, which no hillshade can do: a hillshade is a function of the
     slope AT a point and knows nothing about the ridge between that point
     and the sun. */
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  let curStep = -1;

  const layer: TerrainLayer = {
    name: "terrain",
    mesh,
    fieldFor,
    onStep(s: number, zex: number) {
      if (s === curStep) return;
      curStep = s;
      mesh.scale.y = zex;
      g.setAttribute("color", new BufferAttribute(coloursFor(s), 3));
      (g.getAttribute("color") as BufferAttribute).needsUpdate = true;
    },
    dispose() {
      g.dispose();
      m.dispose();
      fields.clear();
      colours.clear();
    },
  };
  return layer;
}
