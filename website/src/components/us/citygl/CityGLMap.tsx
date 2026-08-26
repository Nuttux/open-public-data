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
import { terrainLayer } from "@/lib/citygl/layers/terrain";
import { decodeParks } from "@/lib/city/trees";
import { markTerrainCells } from "@/lib/citygl/mark-cells";
import { waterLayer } from "@/lib/citygl/layers/water";
import { surroundLayer } from "@/lib/citygl/layers/surround";
import { buildingsLayer } from "@/lib/citygl/layers/buildings";
import { heroesLayer } from "@/lib/citygl/layers/heroes";
import { capsLayer } from "@/lib/citygl/layers/caps";
import { streetsLayer } from "@/lib/citygl/layers/streets";
import { streetDetailLayer } from "@/lib/citygl/layers/street-detail";
import { streetMarkingsLayer } from "@/lib/citygl/layers/street-markings";
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
  loadBlockIndex,
  loadBlockRecord,
  type BlockIndex,
  type BlockRecord,
} from "@/components/us/city/block-records";
import { roofPalette, wallPalette } from "@/components/us/city/palette";

/**
 * THE RAIL'S OWN SPAN.
 *
 * It opens in 1849 because that is what the assessor's year byte counts from,
 * and it ends at the present because the present is what the roll describes.
 * The right-hand end is not a year at all — it is TODAY, the settled state a
 * reader who has never touched the rail is looking at, and it is `undefined`
 * rather than a number so that a footprint the roll cannot date is drawn
 * there too.
 */
const YEAR_MIN = 1849;
const YEAR_MAX = 2025;

export interface CityGLMapProps {
  descriptor: CityDescriptor;
  /** rendered in the record margin beside the stage */
  ledger?: React.ReactNode;
  onReady?: (engine: CityEngine) => void;
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
  const t = useT();
  const stopsRef = useRef<{ label: string; go: () => void; i: number }[]>([]);
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

      /* ── WEBGL 2 BY DEFAULT, WEBGPU BEHIND `?gpu=1` — AND THIS IS A
         VISIBILITY DECISION, NOT A PERFORMANCE ONE ───────────────────────
         MEASURED, same page, same scene, same 809 draw calls and 5,106,310
         triangles on both backends: on WebGPU the renderer draws the city and
         the CANVAS NEVER REACHES THE SCREEN. `canvas.toDataURL()` returns a
         perfect frame; the page shows white with only the 2D label overlay on
         it — which is exactly what Daniel reported seeing. On WebGL 2 the
         same frame composites normally.

         So the backend that presents is the default. Nothing is lost: the
         scene, the materials, the lights and the shadow pass are identical —
         three.js's node renderer compiles the same graph to either — and at
         3 ms a frame the CPU overhead WebGPU saves is not the constraint.
         `?gpu=1` opts in for anyone who wants to test it, and the day the
         compositing works this is one boolean. */
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
      /* ── AND THE GROUND IS NOT CUT AT ANY RING. TWICE NOW ───────────────
         Two attempts, two reverts, and the second one is worth writing down
         because its reasoning READ well and was wrong.

         The DEM's coast is a 53.8 m staircase and it is ugly, so this cut the
         cells back to the published shoreline. First with `base/coast`, which
         opened channels of water through Bayview. Then with
         `surroundCoast().rings`, on the strength of that export's own note —
         *"re-rasterised here at that file's own grid it reproduces the shipped
         land mask on 116,480 of 116,480 cells"*.

         **That note is about a different grid.** 416 x 280 = 116,480 is the
         SURROUND's lattice at 110 x 139 m. The city's DEM is 53.8 m and 260 x
         260, and against THAT the same rings reproduce the mask at 99.95 % —
         which sounds close and is not: measured, the clip cut **2,172 of
         37,754 city land cells, 5.75 %**, and 1,618 of them were INTERIOR
         rather than edge. It deleted a 3.44 km2 strip of Ocean Beach and the
         outer Sunset, 1.15 km2 of Crissy Field, 0.52 km2 of Treasure Island
         and the whole Embarcadero pier field.

         A ring that reproduces a mask at one resolution does not reproduce it
         at four times that resolution, and a percentage that reads like
         agreement can be several square kilometres of city. The staircase is
         the page's own; it stays until something removes it without removing
         land with it. (And for the record the other half of the earlier note
         was also wrong: `base/coast`'s four rings ARE closed — first vertex
         equals last, gap 0.0 m on all four.) */
      const cityCoast = null;

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
        (globalThis as { __cityGLSurround?: unknown }).__cityGLSurround = data.surround();
        (globalThis as { __cityGLProj?: unknown }).__cityGLProj = {
          proj: (x: number, y: number, z = 0) => projection.proj(x, y, z),
          centre: [p.X0 + spanM / 2, p.Y0 + spanM / 2],
          spanM,
        };
      }

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
        elevAt: (x, y) => field.elevM(x, y),
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
        elevAt: (x, y) => field.elevM(x, y),
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
        elevAt: (x, y) => field.elevM(x, y),
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
        elevAt: (x, y) => field.elevM(x, y),
        zex: descriptor.look.zexByStep[0],
      });
      if (ground) {
        for (const m of ground.meshes) engine.scene.add(m);
        engine.add(ground);
      }

      /* ── THE STREETS ────────────────────────────────────────────────
         The published right of way and the carriageway inside it, as two
         filled surfaces on the ground. What shows between them is the
         footway. */
      await data.loadTier("strt");
      if (disposed || !engine) return;
      const streets = streetsLayer(data, {
        elevAt: (x, y) => field.elevM(x, y),
        zex: descriptor.look.zexByStep[0],
      });
      for (const m of streets.meshes) engine.scene.add(m);
      engine.add(streets);

      /* the kerbs, the traffic islands, the stairs and the spine centrelines
         — everything the surface layer leaves out, and all of it published */
      const detail = streetDetailLayer(data, {
        elevAt: (x, y) => field.elevM(x, y),
        zex: descriptor.look.zexByStep[0],
      });
      for (const m of detail.meshes) engine.scene.add(m);
      engine.add(detail);

      /* the crossings, the centre lines, the 1,944 spans the Board had not
         paved yet, and the tonal pass that sinks the whole right of way below
         every land tone so a street reads as a street at every slope */
      const marks = streetMarkingsLayer(data, {
        elevAt: (x, y) => field.elevM(x, y),
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
        elevAt: (x, y) => field.elevM(x, y),
        zexb: descriptor.look.zexb,
        fromStep: engine.quality.canopyFromStep,
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

      const picker = blockPicker(data, { elevAt: (x, y) => field.elevM(x, y) });
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
               to, and the pin writes its published id */
            ov.pick = b;
            eng.invalidate();
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
            elev: (x, y) => field.elevM(x, y),
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
      }

      stopsRef.current = descriptor.stops.map((s, i) => ({
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
      }));

      engineRef.current = engine;
      setLoading(false);
      readyRef.current?.(engine);
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
        setCtx({
          id,
          hood: cols ? (cols.hoodNames[cols.hood[picked]] ?? "") : "",
          hoodIndex: cols ? (cols.hood[picked] ?? -1) : -1,
          areaM2: cols ? (cols.area[picked] ?? 0) : 0,
          streetDecisions: index.ns[picked] ?? 0,
        });
        const r = await loadBlockRecord(index, picked);
        if (!dead) setRecord(r);
      } catch {
        if (!dead) setRecord(null);
      } finally {
        if (!dead) setRecLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [picked]);

  return (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
        <div className="fx-city-stage" ref={hostRef}>
          <canvas ref={canvasRef} className="fx-city-canvas" />
          {!loading && stopsRef.current.length ? (
            <div className="fx-city-controls" role="group" aria-label="Zoom">
              <span className="fx-city-zoom-label">ZOOM</span>
              {stopsRef.current.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="fx-city-preset"
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
                if (ov) ov.highlight = null;
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
                  Click any block to read what the Board of Supervisors decided
                  there. Drag to pan, scroll to zoom, and drag the rail below to
                  move through the century.
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
              {year === null ? "today" : year}
            </span>
            <input
              type="range"
              min={YEAR_MIN}
              max={YEAR_MAX}
              step={1}
              value={year ?? YEAR_MAX}
              aria-label="Year"
              style={{ flex: 1 }}
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                const next = v >= YEAR_MAX ? null : v;
                setYear(next);
                engineRef.current?.setYear(next ?? undefined);
                /* the WRITING is on the clock too — both label gates read the
                   year, so without this the map un-builds to 1906 with 1970's
                   street names still on it */
                if (overlayRef.current) overlayRef.current.year = next ?? undefined;
              }}
            />
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
            <button
              type="button"
              className="fx-city-preset"
              onClick={() => {
                setYear(null);
                engineRef.current?.setYear(undefined);
                if (overlayRef.current) overlayRef.current.year = undefined;
              }}
            >
              Today
            </button>
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
