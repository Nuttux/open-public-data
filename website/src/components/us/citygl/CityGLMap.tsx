"use client";

/**
 * The GL map's React mount.
 *
 * The same job `components/us/city/CityMap.tsx` does for the Canvas renderer,
 * and deliberately the same shape: a stage, a canvas that fills it, a record
 * margin beside it, and a handle handed back once so a page can drive the
 * camera. What is different is everything under the canvas.
 *
 * `ssr: false` at the call site — a WebGL context cannot be server-rendered,
 * and the page's `<h1>` lives in the page, not here, so the server still
 * sends a document with the title in it.
 */

import { useEffect, useRef, useState } from "react";

import { CityData } from "@/lib/city/data";
import { projection } from "@/lib/city/projection";
import { CityEngine } from "@/lib/citygl/engine";
import type { CityDescriptor } from "@/lib/citygl/descriptor";
import { meshElevAt, terrainLayer } from "@/lib/citygl/layers/terrain";
import { decodeParks } from "@/lib/city/trees";
import { markTerrainCells } from "@/lib/citygl/mark-cells";
import { fireLayer, type FireLayer } from "@/lib/citygl/fire";
import { decodeCoast } from "@/lib/city/water";
import { waterLayer } from "@/lib/citygl/layers/water";
import { surroundLayer } from "@/lib/citygl/layers/surround";
import { buildingsLayer } from "@/lib/citygl/layers/buildings";
import { heroesLayer } from "@/lib/citygl/layers/heroes";
import { capsLayer } from "@/lib/citygl/layers/caps";
import { streetsLayer } from "@/lib/citygl/layers/streets";
import { streetDetailLayer } from "@/lib/citygl/layers/street-detail";
import { streetMarkingsLayer } from "@/lib/citygl/layers/street-markings";
import { blockTintLayer } from "@/lib/citygl/layers/block-tint";
import { streetUncoveredLayer } from "@/lib/citygl/layers/street-uncovered";
import { attachSky } from "@/lib/citygl/sky";
import { saveView } from "@/lib/citygl/export";
import { groundDetailLayer } from "@/lib/citygl/layers/ground-detail";
import { treesLayer } from "@/lib/citygl/layers/trees";
import { CityOverlay } from "@/lib/citygl/overlay";
import { CityHelpRow } from "@/lib/citygl/help-row";
import { useT } from "@/lib/localeContext";
import { attachControls, stepForZ } from "@/lib/citygl/controls";
import { createFilm, resolveFrames, type FilmPlayer } from "@/lib/citygl/film";
import { detectQuality } from "@/lib/citygl/quality";
import { blockPicker } from "@/lib/citygl/pick";
import CityBlockPanel, { type BlockContext } from "@/components/us/city/CityBlockPanel";
import {
  blockPlaceName,
  loadBlockIndex,
  loadBlockRecord,
  type BlockIndex,
  type BlockRecord,
} from "@/components/us/city/block-records";
import { roofPalette, wallPalette } from "@/components/us/city/palette";

/**
 * THE RAIL'S OWN SPAN.
 *
 * ── IT OPENS IN 1906, NOT 1849 ───────────────────────────────────────────
 * 1849 is where the assessor's YEAR BYTE counts from, which is a fact about
 * the encoding and not about the map. The map's own first year is 1906: it is
 * where the burn is full, where the film opens, and where the record this page
 * draws actually begins. Fifty-seven years of rail that change nothing are
 * fifty-seven years of a reader dragging through an empty city wondering what
 * is broken. The year BYTE still counts from 1849 — see the `year0: 1849` the
 * material tables are given — and nothing about that changes.
 *
 * ── AND THE RIGHT-HAND END IS A YEAR, NOT "TODAY" ────────────────────────
 * It used to read "today", which is a claim about the day you are reading on
 * and not about the record. The record runs to 2026 — the Clerk's own volumes
 * carry 109 decisions in 2026 so far — so the rail says 2026 and means it.
 * Internally the far right is still `undefined` rather than a number, because
 * that is what draws a footprint the roll cannot date; the difference is only
 * in what the reader is told.
 */
const YEAR_MIN = 1906;
const YEAR_MAX = 2026;

export interface CityGLMapProps {
  descriptor: CityDescriptor;
  /** rendered in the record margin beside the stage */
  ledger?: React.ReactNode;
  /**
   * THE HANDOVER, and it carries TWO things now.
   *
   * The film is built in here — the engine, the framings and the interrupt
   * binding are all in this file — but the two surfaces that DRIVE it belong
   * to the page: the entry plate, whose primary door is the film, and the
   * film's own chrome, which is prose and has to be in the document rather
   * than painted on a canvas. Both are rendered outside this component
   * because the page is server-rendered and this is not, so the player has to
   * come back out. `null` where the city's descriptor carries no film.
   */
  onReady?: (engine: CityEngine, film: FilmPlayer | null) => void;
}

export default function CityGLMap({ descriptor, ledger, onReady }: CityGLMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setNonce] = useState(0);
  const [year, setYear] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [record, setRecord] = useState<BlockRecord | null>(null);
  const [ctx, setCtx] = useState<BlockContext | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const blockCols = useRef<{
    hood: Uint8Array; hoodNames: readonly string[]; area: Float32Array;
  } | null>(null);
  const idxRef = useRef<BlockIndex | null>(null);
  const engineRef = useRef<CityEngine | null>(null);
  const overlayRef = useRef<CityOverlay | null>(null);
  const filmRef = useRef<FilmPlayer | null>(null);
  const remeasureFilmRef = useRef<(() => void) | null>(null);
  const [filmOn, setFilmOn] = useState(false);
  const [saving, setSaving] = useState(false);
  /** the year a drag is currently on, and its one coalesced frame */
  const scrubRef = useRef<number | undefined>(undefined);
  const scrubRaf = useRef(0);
  const t = useT();
  const stopsRef = useRef<{ label: string; go: () => void; i: number }[]>([]);
  /* camera scale per named zoom stop, largest view first */
  const stopScalesRef = useRef<number[]>([]);
  /* which stop the reader was nearest when they clicked — 0 whole city, up to
     the closest stop. `-1` while unknown. */
  const [zoomStop, setZoomStop] = useState(-1);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let disposed = false;
    let engine: CityEngine | null = null;
    let ro: ResizeObserver | null = null;
    let detachControls: (() => void) | null = null;

    void (async () => {
      let data: CityData;
      try {
        data = await CityData.load({ baseUrl: descriptor.dataBaseUrl });
      } catch (e) {
        if (!disposed) setFailed(e instanceof Error ? e.message : String(e));
        return;
      }
      if (disposed) return;

      /* THE PROJECTION IS CONFIGURED FROM THE MANIFEST, exactly as the Canvas
         path configures it — same call, same numbers, so the two renderers
         cannot drift apart in the one place where drifting would make every
         comparison meaningless. */
      const p = data.manifest.proj as unknown as {
        X0: number; Y0: number; s: number; N: number;
      };
      projection.setBand(0);

      /* THE BASE TIER, BEFORE THE FIRST FRAME. `CityData.load` fetches the
         manifest and nothing else; the ground, the blocks and the coast are
         `loadBase()`, which is the same call the Canvas page makes and the
         same fifteen chunks. */
      await data.loadBase();
      if (disposed) return;

      /* ── WEBGL 2 BY DEFAULT, WEBGPU BEHIND `?gpu=1` — AND THE REASON IS
         THE ACCUMULATION ─────────────────────────────────────────────────
         WebGPU works now. The thing that had it pinned off for months was one
         vertex attribute: the ink outlines carried a THREE-byte colour, and
         WebGPU requires a vertex buffer's `arrayStride` to be a multiple of
         four, so `CreateRenderPipeline` failed and an invalid pipeline takes
         the whole command buffer with it — the backend drew bare terrain with
         every building, street and tree missing. `layers/buildings.ts` §FOUR
         BYTES A VERTEX pads it, and the two backends now agree to within half
         a level of 255 on every channel at three cameras.

         It is still not the default, and the reason is `temporal.ts`. That
         pass is what takes the last of the shimmer out — 0.41 % of a drag
         step not lining up against 0.00 % — and it works by copying the
         drawing buffer and mixing it into the next frame. On WebGPU that
         buffer is `rgba16float` and the mix comes back WRONG, in a way that
         is stable rather than obvious: MEASURED over ten real drags, the
         frame settles at 81.5 of 255 where it should sit at 155. Daniel saw
         it as an overcast over the whole city, twice.

         Both readings of that buffer have been tried and both are wrong —
         converted as encoded it darkens, sampled raw it blows out — so the
         format is doing something this file does not yet understand, and
         guessing again is how the veil shipped the first time.

         So the backend that ships is the one where the city does not shimmer
         AND is the right colour. `?gpu=1` opts into WebGPU for anyone working
         on it; the accumulation is the thing to fix there, and the check is a
         SOAK — ten drags with the exposure sampled throughout, because a
         feedback error compounds and a two-second capture cannot see it. */
      const q = typeof location !== "undefined" ? location.search : "";
      const forceWebGL = !/(?:\?|&)gpu=1/.test(q);
      const quality = detectQuality(q);
      engine = new CityEngine({ canvas, descriptor, forceWebGL, quality });
      /* the backend's device request is asynchronous — nothing may be added
         or drawn until it is up. See `CityEngine.init`. */
      await engine.init();
      if (disposed) return;

      const spanM = (p.N - 1) / p.s;

      /* ── THE REGIONAL SHORELINE, BEFORE THE GROUND IS BUILT ─────────
         `surroundCoast()` carries two things the ground cannot do without:
         `cityOffshoreBits`, the per-cell bit saying which of the CITY's own
         DEM cells are offshore, and the rings the far shore is cut at. The
         first has to be in hand before `terrainLayer` walks the mask, which
         is why it is fetched here rather than beside the surround it also
         serves. */
      const surroundCoast = await data.surroundCoast().catch(() => null);
      if (disposed) return;
      /* ── AND THE GROUND IS CUT AT THE PUBLISHED LINE, SUB-CELL ──────
         Two earlier attempts cut whole CELLS and both deleted real land — the
         second removed 2,172 of 37,754, a 3.44 km2 strip of Ocean Beach,
         1.15 km2 of Crissy Field, Treasure Island and the pier field, on the
         strength of an export note that turned out to be about a different
         grid. Neither failure was the ring's fault: the DEM's land mask
         deliberately overhangs the published shore by a 300 m pad so a finer
         register can decide it, and nothing downstream ever did.

         `layers/coast-mask.ts` now decides it. It scan-converts the rings at
         six sub-cells to the cell, keeps a wholly-inside cell whole, rebuilds
         a crossed cell as sub-quads with bilinear elevation and colour, and
         drops only what is wholly outside. Tread 53.8 m to 8.97 m — 5.1 px to
         0.85 px at the whole-city camera — and the land COUNT is unchanged at
         37,754, which the layer re-asserts through `coastStats()`.

         The rings are the UNION of both registers, and that is load-bearing:
         inside the city outline 35,627 cells, inside the regional hydrography
         35,582, inside either 35,678. Either one alone deletes a piece of the
         city. */
      const cityCoast = surroundCoast?.rings ?? null;

      const terrain = terrainLayer(
        data,
        descriptor.look.zexByStep,
        (t) => {
          /* ── THE CITY DEM REACHES PAST THE CITY, AND SOMETHING HAS TO SAY SO ──
             The published DEM is a 13.9 km square and San Francisco is not
             square: its north-west corner takes in the Marin shore across the
             Golden Gate, and its own land bit calls those cells land, because
             they are. Drawn with the city's own ground colours — which are
             built for a photographed, tinted, park-marked city and not for a
             headland with none of that — they came out CLIPPED WHITE, and a
             bleached blocky mass sat across the Gate in every whole-city
             frame. Bisecting the scene one mesh at a time put it on this one:
             hide the city terrain and the white goes; hide the surround, the
             water, or anything else and it stays.

             `cityOffshoreBits` is the published answer and `maskAt` already
             honours it — it is simply never set. `scene.ts` §bandFor sets it
             in one line, as the first thing it does to the field. */
          t.coastFix = surroundCoast?.cityOffshoreBits ?? null;

          /* the measured ground tint, the one thing the field needs that its
             own chunk does not carry — `scene.ts` §bandFor does the same */
          const tint = data.get("base/canopy-tint");
          if (tint) t.canopyFrac = tint.fields.demFrac as Uint8Array;

          /* ── AND THE PARK CELLS, WITHOUT WHICH NOTHING IS GREEN ────────
             `terrainRGB` has TWO rows: ordinary ground, and park. Which one a
             node reads is `cellPark`, and `cellPark` is filled by walking the
             published park rings — `scene.ts` §bandFor does it in one line
             and this did not do it at all. The consequence was on screen and
             Daniel named it: Jefferson Square, Golden Gate Park and every
             other published park were the same bleached cream as the street
             beside them. The greens were never missing from the palette; the
             terrain was simply never told which cells were park. */
          const parksChunk = data.get("base/parks");
          if (parksChunk) {
            const pk = decodeParks(parksChunk);
            markTerrainCells(t, pk.parks, t.cellPark);
          }
        },
        cityCoast,
      );
      engine.scene.add(terrain.mesh);
      engine.add(terrain);
      /* the ground every later layer asks for its elevation — declared here,
         with the layer that owns it, because three of them need it before the
         fabric is built */
      const field = terrain.fieldFor(0);

      /* ── THE BURNED DISTRICT ────────────────────────────────────────
         `base/coast` ships two registers and this port was reading one: the
         shoreline, and the boundary of the 1906 burn. `TerrainField` has a
         `cellBurn` byte and `terrainRGB` a burn row, and with nothing filling
         the first the second has never been on screen on either renderer.
         `lib/citygl/fire.ts` fills it, carries the ground to ash on that
         ramp, and strokes the boundary.

         The register ships SEVEN rings — one outer and six holes, pockets of
         82,195 m2 that did not burn — so the fill is even-odd and not a union,
         which spares 27 cells the union would have blackened.

         The two years are the CITY's: the ash is full at 1906 and the
         reference renderer's own `burnPhase` clears it by 1913, over the seven
         years the permits say the city put more back than it lost. The engine
         is told the numbers and never the date. */
      const coastForBurn = data.get("base/coast");
      let fire: FireLayer | null = null;
      if (coastForBurn) {
        const burnRings = decodeCoast(coastForBurn).burn;
        if (burnRings.length) {
          fire = fireLayer({
            ground: terrain.mesh,
            fieldFor: terrain.fieldFor,
            rings: burnRings,
            proj: (x, y, z) => projection.proj(x, y, z),
          });
          fire.setYearFade({ full: 1906, clear: 1913 });
          engine.scene.add(fire.mesh);
          engine.add(fire);
          if (process.env.NODE_ENV !== "production") {
            (globalThis as { __cityGLFire?: unknown }).__cityGLFire = fire;
          }
        }
      }

      /* the land that is not the subject, at its own coarser grid */
      /* the far shore, cut at the same published rings */
      const surround = surroundLayer(
        data,
        terrain.fieldFor(0),
        descriptor.look.zexByStep,
        surroundCoast?.rings ?? null,
      );
      if (surround) {
        engine.scene.add(surround.mesh);
        engine.add(surround);
      }

      /* the bay, under the ground and under everything — the fade's centre is
         the city's own downtown, which its manifest publishes */
      const downtown = (data.manifest.proj as unknown as {
        downtown: [number, number];
      }).downtown;
      try {
        const water = waterLayer(data, { anchor: downtown });
        engine.scene.add(water.mesh);
        engine.add(water);
      } catch (e) {
        // a city with no bathymetry is a city with no bay layer, not a failure
        console.warn("citygl: no water layer —", e);
      }

      /* ── THE AIR THE FAR SHORE RECEDES INTO ─────────────────────────
         There is no sky under this camera — the projection is linear, so the
         ground plane's image covers the WHOLE screen at every zoom and there
         is no vanishing line to put one above. What the frame needs is not sky
         behind the city but AIR IN FRONT OF IT: the published haze ramp
         carried past the cap where it stops.

         `WA.hazecap` is 0.45, so beyond 10,150 m from the anchor the far field
         stops receding altogether — and measured, three of the four ground
         corners of the opening frame are already out there (6,793 / 10,404 /
         11,783 / 14,176 m). One world-baked quad pays the rest of the ramp out
         to the paper, converging on `HAZE` exactly, which is the renderer's own
         clear colour: the picture ends IN the sheet rather than at an edge.
         `?sky=0` for the A/B. See `lib/citygl/sky.ts`. */
      attachSky(engine, { anchor: downtown });

      /* the whole city, centred on the DEM's own middle */
      const midX = p.X0 + spanM / 2;
      const midY = p.Y0 + spanM / 2;
      const centre = projection.proj(midX, midY, 0);
      const rect = host.getBoundingClientRect();
      const across = projection.proj(p.X0 + spanM, midY, 0)[0] - projection.proj(p.X0, midY, 0)[0];
      engine.setCamera({
        cx: centre[0],
        cy: centre[1],
        scale: (rect.width * 0.92) / Math.max(1, across),
      });
      engine.resize(rect.width, rect.height, window.devicePixelRatio || 1);

      ro = new ResizeObserver(() => {
        const r = host.getBoundingClientRect();
        const d = Math.min(engine?.quality.maxDpr ?? 2, window.devicePixelRatio || 1);
        engine?.resize(r.width, r.height, d);
        overlayRef.current?.resize(r.width, r.height, d);
        /* the framings are FRACTIONS of the viewport, so a resize invalidates
           every one of them — two dot products and a terrain sample a shot */
        remeasureFilmRef.current?.();
        engine?.invalidate();
      });
      ro.observe(host);

      /* DEV-ONLY, the `__cityWA` idiom: the parity harness needs to put BOTH
         renderers on the same camera, and the camera is expressed in plane
         units that only the projection can produce. Exposing the projection
         and the city's own centre is what lets the harness compute one camera
         and hand it to both pages. */
      if (process.env.NODE_ENV !== "production") {
        (globalThis as { __cityGLField?: unknown }).__cityGLField = field;
        (globalThis as { __cityGLData?: unknown }).__cityGLData = data;
        (globalThis as { __cityGLSurround?: unknown }).__cityGLSurround = data.surround();
        (globalThis as { __cityGLProj?: unknown }).__cityGLProj = {
          proj: (x: number, y: number, z = 0) => projection.proj(x, y, z),
          centre: [p.X0 + spanM / 2, p.Y0 + spanM / 2],
          spanM,
        };
      }

      /* ── WHERE THE GROUND IS, FOR EVERYTHING THAT SITS ON IT ────────
         `field.elevM` rounds to the nearest DEM node: it is a 53.815 m
         staircase, and it used to place every one of the layers below. The
         ground mesh interpolates, so a thing on the staircase and the ground
         under it agree once a cell and nowhere else. `layers/terrain.ts`
         §WHERE THE GROUND ACTUALLY IS has the measurement — 9.54 % of street
         triangles were under the ground they lie on, all of them by more than
         a drawn metre — and `meshElevAt` samples the mesh's own triangles. */
      const groundAt = meshElevAt(
        field,
        data.manifest.proj as unknown as Parameters<typeof meshElevAt>[1],
      );

      /* ── THE LANDMARKS, BEFORE THE FABRIC ───────────────────────────
         `landmarks()` is async, and the fabric has to know which footprints
         NOT to draw before it bakes its buffers — a hero and its own prism
         in the same place is one building wearing two shapes. So the table is
         awaited here and the skip set is read straight off it; the layer that
         draws them fills its meshes in `onBuilt`, which is why they are added
         to the scene from inside the callback and not from `.meshes`. */
      const lmTable = await data.landmarks().catch(() => null);
      if (disposed || !engine) return;
      const heroSkip = new Set<number>((lmTable?.heroes ?? []).map((h) => h.bi));

      const heroes = heroesLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
        zexb: descriptor.look.zexb,
        onBuilt: () => {
          const e = engineRef.current ?? engine;
          if (!e || !heroes) return;
          for (const m of heroes.meshes) e.scene.add(m);
          e.invalidate();
        },
      });
      if (heroes) engine.add(heroes);

      /* ── THE CITY ITSELF ────────────────────────────────────────────
         The whole footprint tier, up front. The Canvas path streams it by
         view because it repaints what it holds; this uploads it once and
         then every camera is free. */
      /* ── AND THE FACADE COLUMNS WITH THEM ───────────────────────────
         `face/<cell>` mirrors `bldg/<cell>` row for row: the use class, the
         supplementary storey count, the shop bit, and the ROLE of every ring
         edge — front, back or a measured party wall. It is what turns 166,166
         identical extrusions into a city with fronts and backs, and it is
         fetched in parallel with the footprints because neither blocks the
         other. */
      await Promise.all([data.loadTier("bldg"), data.loadTier("face")]);
      if (disposed || !engine) return;
      const buildings = buildingsLayer(data, {
        zexb: descriptor.look.zexb,
        elevAt: groundAt,
        roofPalette: roofPalette(
          (data.manifest.buildings as { palette: string[] }).palette,
        ),
        wallPalette: wallPalette(),
        skipGids: heroSkip,
        materials: {
          hq: (data.manifest.buildings as { hq?: number[][] }).hq ?? [],
          noSampleBit:
            (data.manifest.buildings as { paintFlagBits?: { nosample?: number } })
              .paintFlagBits?.nosample ?? 4,
          year0: 1849,
          fallbackRoof: 1,
          fallbackWall: 1,
        },
      });
      for (const m of buildings.meshes) engine.scene.add(m);
      engine.add(buildings);

      /* ── AND THE SECOND SOLID ON TOP OF THEM ────────────────────────
         512 published slots — a step, a mast, a spire — standing on the roof
         plane the fabric just drew. Without these, downtown is the median
         height of every tower and reads as a field of boxes. Same palettes,
         same material config and the same hero skip as the fabric: a cap must
         be the same colour as the roof it stands on, and a hero that models
         its own drum must not get a second one. */
      const caps = capsLayer(data, {
        zexb: descriptor.look.zexb,
        elevAt: groundAt,
        roofPalette: roofPalette(
          (data.manifest.buildings as { palette: string[] }).palette,
        ),
        wallPalette: wallPalette(),
        skipGids: heroSkip,
        materials: {
          hq: (data.manifest.buildings as { hq?: number[][] }).hq ?? [],
          noSampleBit:
            (data.manifest.buildings as { paintFlagBits?: { nosample?: number } })
              .paintFlagBits?.nosample ?? 4,
          year0: 1849,
          fallbackRoof: 1,
          fallbackWall: 1,
        },
      });
      if (caps) {
        for (const m of caps.meshes) engine.scene.add(m);
        engine.add(caps);
      }

      /* ── THE GROUND'S OWN DETAIL ────────────────────────────────────
         The published park rings, the inland water bodies, the coastline as a
         drawn edge with a pale rim under it, and the canopy masses. The coast
         especially: without it the shore is the DEM mask's own staircase, and
         at the whole-city camera that blocky edge is the first thing a reader
         sees. The canopy chunk is its own tier. */
      await data.loadTier("canopy");
      if (disposed || !engine) return;
      const ground = groundDetailLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (ground) {
        for (const m of ground.meshes) engine.scene.add(m);
        engine.add(ground);
      }

      /* ── THE GROUND HAS A GRID ──────────────────────────────────────
         The published assessor block rings, filled warm and translucent under
         the streets. It is the layer this port was missing, and it is why the
         ground read sandy and the streets stopped reading: without a value
         step between a block's interior and the street outside it, the only
         thing saying "block" is the buildings standing on it. See
         `layers/block-tint.ts` for the measurement. */
      const blockTint = blockTintLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (blockTint) {
        engine.scene.add(blockTint.mesh);
        engine.add(blockTint);
      }

      /* ── THE STREETS ────────────────────────────────────────────────
         The published right of way and the carriageway inside it, as two
         filled surfaces on the ground. What shows between them is the
         footway. */
      await data.loadTier("strt");
      if (disposed || !engine) return;
      const streets = streetsLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      for (const m of streets.meshes) engine.scene.add(m);
      engine.add(streets);

      /* ── AND THE 534 ROADS THE RIGHT-OF-WAY FILE DOES NOT SURVEY ────
         The park roads, the Great Highway, Sloat and the freeways have a
         published centreline and no published polygon, so they came out as a
         name and a faint line over bare ground. Drawn here at the median
         width of the city's own surveyed roads of the same class. */
      const uncovered = streetUncoveredLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (uncovered) {
        engine.scene.add(uncovered.mesh);
        engine.add(uncovered);
      }

      /* the kerbs, the traffic islands, the stairs and the spine centrelines
         — everything the surface layer leaves out, and all of it published */
      const detail = streetDetailLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      for (const m of detail.meshes) engine.scene.add(m);
      engine.add(detail);

      /* the crossings, the centre lines, the 1,944 spans the Board had not
         paved yet, and the tonal pass that sinks the whole right of way below
         every land tone so a street reads as a street at every slope */
      const marks = streetMarkingsLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (marks) {
        for (const m of marks.meshes) engine.scene.add(m);
        engine.add(marks);
      }

      /* ── THE CANOPY ─────────────────────────────────────────────────
         125,234 published street trees, instanced. Fetched whole like the
         footprints: the cost is the upload, not the draw. */
      await data.loadTier("tree");
      if (disposed || !engine) return;
      const trees = treesLayer(data, {
        elevAt: groundAt,
        zexb: descriptor.look.zexb,
        fromStep: engine.quality.canopyFromStep,
        /* the crowns cast again. The 991 ms that switched this off was the
           shadow BOX, not the trees — it was 3,484 m across at a 1,400 m
           camera and caught nearly every chunk. Re-measured on the fitted
           box, 195,310 crowns casting against not casting is no signal at
           all: 16.5/16.7, 16.7/16.6, 16.8/17.5 ms over three paired runs. */
        castShadow: engine.quality.treeShadow,
      });
      for (const m of trees.meshes) engine.scene.add(m);
      engine.add(trees);

      /* ── THE WRITING, AND THE CONTROLS ──────────────────────────────
         A second canvas over the first for the type, and a pointer/keyboard
         controller on the stage. Both read the same camera the GPU does. */
      const overlay = new CityOverlay({
        data,
        field: terrain.fieldFor(0),
        dataBaseUrl: descriptor.dataBaseUrl,
      });
      host.appendChild(overlay.canvas);
      overlayRef.current = overlay;
      overlay.resize(
        rect.width,
        rect.height,
        Math.min(engine.quality.maxDpr, window.devicePixelRatio || 1),
      );
      engine.onAfterFrame = (c, s) => overlay.draw(c, s);
      void overlay.load().then(() => engine?.invalidate());

      /* ── CLICKING A BLOCK ───────────────────────────────────────────
         A click is a pointerup that did not travel: a drag ends on a
         pointerup too, and treating that as a pick means every pan selects
         whatever it happens to stop over. Four pixels is the threshold. */
      /* the two columns the record panel needs beside the record itself: the
         published neighbourhood a block sits in, and its published area. The
         hood is joined on the INDEX and never on the name — `build_hood_facts`
         rolls up over the same u8 field, and a string comparison would be a
         second membership able to disagree with the first. */
      {
        const bc = data.get("base/blocks");
        const be = data.manifest.chunks.find((c) => c.k === "base/blocks") as
          | { hoodNames?: string[] }
          | undefined;
        if (bc && be?.hoodNames) {
          blockCols.current = {
            hood: bc.fields.hood as Uint8Array,
            hoodNames: be.hoodNames,
            area: bc.fields.a as Float32Array,
          };
        }
      }

      const picker = blockPicker(data, { elevAt: groundAt });
      if (picker) {
        let downX = 0;
        let downY = 0;
        canvas.addEventListener("pointerdown", (e) => {
          downX = e.clientX;
          downY = e.clientY;
        });
        canvas.addEventListener("pointerup", (e) => {
          if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return;
          const r = canvas.getBoundingClientRect();
          const eng = engineRef.current;
          if (!eng) return;
          const v = eng.viewport;
          const b = picker.at(e.clientX - r.left, e.clientY - r.top, eng.getCamera(), v.W, v.H);
          const ov = overlayRef.current;
          if (ov) {
            ov.highlight = b === null ? null : picker.ringOf(b);
            /* the division scrim and the pin both key on the PICKED block, not
               on the ring: the scrim punches the division that block belongs
               to, and the pin writes the name handed to it */
            ov.pick = b;
            /* cleared here and refilled by the record effect. Otherwise the
               new ring wears the previous block's name for a frame, which is
               the one thing a pin must never do. */
            ov.pickLabel = null;
            eng.invalidate();
          }
          /* Classify the click against the named stops: the reader who is on
             top of one street means something different by a click than the
             reader looking at the whole city. */
          const sc = eng.getCamera().scale;
          const scales = stopScalesRef.current;
          if (scales.length) {
            let best = 0;
            for (let i = 1; i < scales.length; i += 1) {
              if (Math.abs(Math.log(sc / scales[i])) <
                  Math.abs(Math.log(sc / scales[best]))) best = i;
            }
            setZoomStop(best);
          }
          setPicked(b);
        });
      }

      const base = engine.getCamera().scale;
      detachControls = attachControls(canvas, engine, {
        base,
        onChange: () => setNonce((n) => n + 1),
      });
      canvas.tabIndex = 0;

      /* ── THE FILM ────────────────────────────────────────────────────
         The shot list is the CITY's — eleven framings in its own world metres
         and eleven years out of its own record — so it arrives on the
         descriptor and `lib/citygl/film.ts` never learns where any of it
         points. */
      if (descriptor.film) {
        const eng = engine;
        const script = descriptor.film;
        const measure = () =>
          resolveFrames(script, {
            fit: { base, bx: centre[0], by: centre[1] },
            W: eng.viewport.W,
            H: eng.viewport.H,
            /* AT ZERO ELEVATION, on purpose: `frameOf` carries the elevation
               term apart from the plane centre, because the exaggeration is a
               property of the camera STEP and a framing baked at one step
               would be wrong at the next. */
            proj: (x, y) => projection.proj(x, y, 0),
            elev: groundAt,
          });

        const film = createFilm(eng, script, {
          frames: measure(),
          /* the canvas is where `attachControls` binds, so this is the same
             element the reader reaches for when they want the map back */
          interruptOn: canvas,
          onState: (st) => {
            /* THE WRITING IS ON THE CLOCK TOO. The overlay gates its labels on
               its own year, and without this the city un-builds to 1906 with
               1970's street names still standing on it. */
            const iy = Math.floor(st.yearOut);
            const ov = overlayRef.current;
            if (ov && ov.year !== iy) ov.year = iy;
            /* ── AND THE FIRE IS ON THE CLOCK TOO ────────────────────
               The opening shot is the burned district and its two acts are the
               two halves of it: `build/burnLine` is the boundary drawing
               itself, `fire` is the ground going to ash inside it. Every other
               frame of the film hands both back to the year, which is what
               carries the ash across the match cut and lets it fade out under
               the rebuild. */
            if (fire) {
              const a = st.act;
              if (a?.k === "build" && a.what === "burnLine") {
                fire.setLine(st.u);
                fire.setProgress(0);
              } else if (st.kind === "fire") {
                fire.setLine(1);
                fire.setProgress(st.u);
              } else if (st.shot === "burn") {
                fire.setLine(1);
                fire.setProgress(1);
              } else {
                fire.setLine(null);
                fire.setProgress(null);
              }
            }
          },
          onStop: (reason, st) => {
            setFilmOn(false);
            /* THE RAIL HAS TO AGREE WITH THE SCREEN. An interrupt leaves the
               city standing on the year it stopped on, so the rail says that
               year; the end card releases it back to the settled present,
               which is the map the reader came for. */
            const y = reason === "end" ? null : Math.floor(st.yearOut);
            setYear(y);
            eng.setYear(y ?? undefined);
            if (overlayRef.current) overlayRef.current.year = y ?? undefined;
            eng.invalidate();
          },
        });
        filmRef.current = film;
        remeasureFilmRef.current = () => film.setFrames(measure());
        /* DEV ONLY, the `__cityGL*` idiom: a harness cannot ask the film what
           it thinks it is doing without a handle on it. */
        if (process.env.NODE_ENV !== "production") {
          (globalThis as { __cityGLFilm?: unknown }).__cityGLFilm = film;
        }
      }

      /* ── HOW CLOSE THE READER IS, IN THE MAP'S OWN WORDS ─────────────────
         The panel decides what a click means — the neighbourhood, a street,
         a building — and it needs to know how far in the reader is. The stops
         already convert metres-across into a camera scale; keeping those
         scales lets a pick be classified against them without the panel
         knowing anything about projections. */
      const stopScales: number[] = [];
      stopsRef.current = descriptor.stops.map((s, i) => {
        const at0 = s.at ?? [p.X0 + spanM / 2, p.Y0 + spanM / 2];
        const across0 =
          projection.proj(at0[0] + s.spanM, at0[1], 0)[0] -
          projection.proj(at0[0], at0[1], 0)[0];
        stopScales[i] = (engine!.viewport.W * 0.94) / Math.max(1e-6, Math.abs(across0));
        return {
        label: s.label,
        go: () => {
          const e = engine;
          if (!e) return;
          const at = s.at ?? [p.X0 + spanM / 2, p.Y0 + spanM / 2];
          const c = projection.proj(at[0], at[1], 0);
          const across =
            projection.proj(at[0] + s.spanM, at[1], 0)[0] - projection.proj(at[0], at[1], 0)[0];
          const scale = (e.viewport.W * 0.94) / Math.max(1e-6, Math.abs(across));
          e.setStep(stepForZ(scale / base));
          e.setCamera({ cx: c[0], cy: c[1], scale });
          setNonce((n) => n + 1);
        },
        i,
        };
      });
      stopScalesRef.current = stopScales;

      engineRef.current = engine;
      setLoading(false);
      readyRef.current?.(engine, filmRef.current);
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      detachControls?.();
      filmRef.current?.dispose();
      filmRef.current = null;
      remeasureFilmRef.current = null;
      overlayRef.current?.dispose();
      overlayRef.current = null;
      engine?.dispose();
    };
  }, [descriptor]);

  /* ── THE RECORD BEHIND THE PICK ────────────────────────────────────────
     `block-records` memoises the index and every shard for the session, so a
     second pick on the same shard is free and a reader clicking around the
     Mission fetches one file. The panel is the PUBLISHED page's own
     `CityBlockPanel`, unchanged — the port has no business rewriting the
     surface a reader actually reads the record on. */
  useEffect(() => {
    if (picked === null) {
      setRecord(null);
      setCtx(null);
      return;
    }
    let dead = false;
    setRecLoading(true);
    void (async () => {
      try {
        const index = idxRef.current ?? (await loadBlockIndex());
        idxRef.current = index;
        if (dead) return;
        const cols = blockCols.current;
        const id = index.b[picked] ?? "—";
        const hoodName = cols ? (cols.hoodNames[cols.hood[picked]] ?? "") : "";
        setCtx({
          id,
          hood: hoodName,
          hoodIndex: cols ? (cols.hood[picked] ?? -1) : -1,
          areaM2: cols ? (cols.area[picked] ?? 0) : 0,
          streetDecisions: index.ns[picked] ?? 0,
          zoomStop,
        });
        /* ── WHAT THE PIN SAYS, IN TWO STEPS ──────────────────────────
           The badge beside the ring used to write `3538`. It writes where you
           are instead, and the two halves of that arrive at different times:
           the neighbourhood is a column already in memory, so it can be on
           screen in the same frame as the ring; the streets need the shard.
           Setting the coarse answer first and refining it is what stops the
           pin appearing empty and then filling — the reader watches
           "Castro/Upper Market" become "Church · 16th St · Market", never
           nothing become something. */
        const ov = overlayRef.current;
        if (ov) {
          ov.pickLabel = hoodName || null;
          engineRef.current?.invalidate();
        }
        const r = await loadBlockRecord(index, picked);
        if (!dead) {
          setRecord(r);
          const ov2 = overlayRef.current;
          if (ov2) {
            ov2.pickLabel =
              (r ? blockPlaceName(r.streets) : null) || hoodName || null;
            engineRef.current?.invalidate();
          }
        }
      } catch {
        if (!dead) setRecord(null);
      } finally {
        if (!dead) setRecLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [picked, zoomStop]);

  return (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
        <div className="fx-city-stage" ref={hostRef}>
          <canvas ref={canvasRef} className="fx-city-canvas" />
          {!loading && stopsRef.current.length ? (
            <div
              role="group"
              aria-label={t("us.sf.thecity.map.view")}
              className="fx-city-controls"
            >
              {/* ── THE CAP IS `fx-city-controls-cap`, NOT AN INVENTED CLASS ──
                  This said `fx-city-zoom-label`, which is not in the
                  stylesheet — so the word took no padding, no size and no
                  colour from the sheet, and sat clipped against the group's
                  own border. The published page's cap class is the one the
                  sheet actually styles, and its copy is an existing key rather
                  than the literal "ZOOM" typed here.

                  `aria-pressed` and `data-near` come with it: the four stops
                  read as four labels floating over the map until something
                  says which one you are at, and `data-near` is how the sheet
                  marks the stop you are nearest when you are between two. */}
              <span className="fx-city-controls-cap" aria-hidden="true">
                {t("us.sf.thecity.map.view_cap")}
              </span>
              {stopsRef.current.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  className="fx-city-preset"
                  aria-pressed={zoomStop === i}
                  data-near={zoomStop < 0 && i === 0 ? "true" : undefined}
                  onClick={s.go}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
          {failed ? (
            <div className="fx-city-overlay">
              <p className="fx-city-loading">The map could not be loaded. {failed}</p>
            </div>
          ) : loading ? (
            <div className="fx-city-overlay">
              <p className="fx-city-loading">Drawing the city…</p>
            </div>
          ) : null}
        </div>
        <div className="fx-city-ledger">
          {picked !== null ? (
            <CityBlockPanel
              record={record}
              context={ctx}
              loading={recLoading}
              onClose={() => {
                setPicked(null);
                const ov = overlayRef.current;
                if (ov) {
                  ov.highlight = null;
                  ov.pickLabel = null;
                }
                engineRef.current?.invalidate();
              }}
            />
          ) : (
            ledger ?? (
              <div style={{ padding: "16px 18px" }}>
                <p
                  style={{
                    font: "600 11px/1.4 var(--f-mono, ui-monospace, monospace)",
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--muted, #6b6355)",
                    margin: "0 0 8px",
                  }}
                >
                  The record
                </p>
                <p style={{ font: "13px/1.5 var(--f-sans, system-ui)", margin: 0 }}>
                  Click anywhere on the map to read what the city decided
                  there. Drag to pan, scroll to zoom, and drag the year bar
                  below to move through the century.
                </p>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── THE CENTURY RAIL ────────────────────────────────────────────
          Every layer is emitted in year order, so moving this is a draw
          range and an instance count — no rebuild, no upload. Dragging it
          is as cheap as standing still, which is the whole reason the
          scrub can be a slider rather than a stepper. */}
      {!loading ? (
        <div className="fx-city-transport">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 18px",
              borderTop: "1px solid var(--rule, #e4e6ea)",
            }}
          >
            <span
              className="tnum"
              style={{
                font: "600 15px/1 var(--f-mono, ui-monospace, monospace)",
                minWidth: 74,
                letterSpacing: ".02em",
              }}
            >
              {year ?? YEAR_MAX}
            </span>
            <input
              type="range"
              min={YEAR_MIN}
              max={YEAR_MAX}
              step={1}
              value={year ?? YEAR_MAX}
              aria-label="Year"
              style={{ flex: 1 }}
              /* ── THE SCRUB IS DRIVEN IMPERATIVELY, AND THAT IS THE FIX ────
                 This was a controlled input whose `onChange` did the whole job:
                 set React state, re-gate 139 chunks of geometry, move the rise
                 uniforms, re-clock the overlay. React then re-rendered and put
                 `value` back from state — and a drag that outruns a render has
                 its thumb snapped backwards under the cursor. Daniel: *"i cant
                 go back in forth with like a movement motion of my mouse only
                 with clicks."* He was fighting a render loop.

                 So the two jobs are separated. `onInput` fires on every pixel
                 of a drag and does the CHEAP, imperative half immediately —
                 the engine and the overlay, neither of which is React — and
                 the frame is coalesced to one per animation frame so a
                 trackpad flick cannot queue forty. React state is committed
                 once, on `change`, which for a range input is the release.
                 The thumb is then never contradicted mid-gesture. */
              onInput={(e) => {
                const v = Number(e.currentTarget.value);
                const next = v >= YEAR_MAX ? undefined : v;
                scrubRef.current = next;
                if (scrubRaf.current) return;
                scrubRaf.current = requestAnimationFrame(() => {
                  scrubRaf.current = 0;
                  const y = scrubRef.current;
                  engineRef.current?.setYear(y);
                  /* the WRITING is on the clock too — both label gates read
                     the year, so without this the map un-builds to 1906 with
                     1970's street names still on it */
                  if (overlayRef.current) overlayRef.current.year = y;
                });
              }}
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                setYear(v >= YEAR_MAX ? null : v);
              }}
            />
            {/* ── THE VIEW, AT PRINT SIZE ────────────────────────────────
                A city drawn from a public record is worth showing to people
                who will never open the page, and the way a picture travels is
                that somebody saves it. At the window's own pixel count this is
                a screenshot; at four times it is something you can print and
                read the street names on. Same camera, same year, same
                everything the reader chose — only the sampling gets finer. */}
            <button
              type="button"
              className="fx-city-preset"
              disabled={saving}
              onClick={() => {
                const eng = engineRef.current;
                if (!eng || saving) return;
                setSaving(true);
                void saveView(eng, {
                  scale: 4,
                  overlay: overlayRef.current?.canvas ?? null,
                  resizeOverlay: (w, h, d) => overlayRef.current?.resize(w, h, d),
                  filename: "city.png",
                }).finally(() => setSaving(false));
              }}
            >
              {saving ? "Saving…" : "Save image"}
            </button>
            {filmRef.current ? (
              <button
                type="button"
                className="fx-city-preset"
                onClick={() => {
                  const f = filmRef.current;
                  if (!f) return;
                  if (f.running) {
                    f.stop();
                  } else {
                    setFilmOn(true);
                    f.play(0);
                  }
                }}
              >
                {filmOn ? "Stop" : "Play the film"}
              </button>
            ) : null}
            {/* THE WAY BACK, AND ONLY WHEN THERE IS ONE. It used to read
                "today", which was wrong twice over: the map is built from a
                record that ends in a stated year, not from this morning, and
                a label that means a different city each day cannot be checked
                against anything. It reads the year instead. But once it reads
                the year, it is the same number as the readout at the other
                end of the rail — so it is only offered when the reader has
                actually moved away from it, which is the only time it does
                anything. */}
            {year !== null ? (
              <button
                type="button"
                className="fx-city-preset"
                onClick={() => {
                  setYear(null);
                  engineRef.current?.setYear(undefined);
                  if (overlayRef.current) overlayRef.current.year = undefined;
                }}
              >
                {YEAR_MAX}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── THE ROW THAT SAYS HOW TO MOVE ────────────────────────────────
          Prose, in the DOM, under the frame — not painted on the overlay
          canvas. It is the one piece of the page a reader may want to select
          or hear read aloud, and it sits outside the stage the two canvases
          fill, so there is no pixel of it reachable from there anyway. Same
          markup and the same three i18n keys as the published page. */}
      <CityHelpRow
        move={t("us.sf.thecity.map.help")}
        years={t("us.sf.thecity.map.help_years")}
        keys={t("us.sf.thecity.map.help_keys")}
      />
    </div>
  );
}
