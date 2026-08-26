"use client";

/**
 * THE REACT SHELL.
 *
 * React at the edges only: mount, resize, teardown, and the block record. The
 * render loop is `CityRenderer` and it is imperative — **no frame goes through
 * React state**. The one bridge is `onState`, which is throttled to the
 * browser's own animation frame and only ever feeds text, never the canvas.
 *
 * ── WHAT IS ON THE MAP, AND WHAT IS UNDER IT ─────────────────────────────
 * On the stage: the canvas, the four camera stops, and whatever the caller
 * puts in `hud`. Under it: whatever the caller puts in `transport`. Those two
 * slots and `onReady` are the whole seam the film needs — see PAGE.md.
 *
 * The map paints as its data arrives rather than after all of it has: the
 * ground first, then the bay, then the blocks, then the landmarks, and the
 * closer the camera goes the more it asks for. The margin says the city is
 * still drawing and stops saying it once the first pass is complete. It is
 * not a spinner over a blank frame — the frame under it is already drawable.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CityData } from "@/lib/city/data";
import { proj, projection, screenToPlane, SX, SY, type Plane } from "@/lib/city/projection";
import { LEDGER_W, NARROW_W } from "@/lib/city/camera";

/**
 * `base/blocks`'s `z` is the ring's ground elevation, quantised u16. The
 * encoder names the field and not its step, so it was measured off the shipped
 * chunk against ground whose elevation the city publishes: Lake Merced's block
 * reads 76, Twin Peaks' reads 2362, and the file's maximum is 2667 against a
 * 282 m high point. Ten units to the metre.
 */
const BLOCK_Z_PER_M = 10;
import type { PlaceLabel } from "@/lib/city/labels";
import { CityScene, parseLayers } from "./scene";
import { CityRenderer, type RendererState } from "./renderer";
import CityBlockPanel, { type BlockContext } from "./CityBlockPanel";
import { useT } from "@/lib/localeContext";
import {
  assertJoin,
  loadBlockIndex,
  loadBlockRecord,
  type BlockIndex,
  type BlockRecord,
} from "./block-records";

const nfInt = new Intl.NumberFormat("en-US");

/* ── prefers-reduced-motion, read at the press ────────────────────────────
   Read when the button is pressed and not at mount, so a reader who changes
   the setting with the page open gets the map they have just asked for. The
   film reads it the same way, once a frame — see `CityFilm`. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** the four camera stops of `camera.ts`, named for a reader */
const PRESET_KEYS = [
  "us.sf.thecity.map.view_city",
  "us.sf.thecity.map.view_district",
  "us.sf.thecity.map.view_block",
  "us.sf.thecity.map.view_street",
];

/**
 * THE 41 DIVISIONS, as `build_hood_facts.py --build` writes them.
 *
 * Per neighbourhood, the UNION OF ITS OWN BLOCKS' published rings, closed
 * across the street right-of-way (dilate 18 m, erode 18 m) and simplified at
 * 10 m. Not the published `ajp5-b2md` outline: that runs down the middle of
 * the street, and the blocks are what a reader can click — so the union is the
 * region that would actually answer with this neighbourhood.
 *
 * 111 parts and 3,417 vertices over all 41, which is why every one of them can
 * be reprojected on every render rather than cached against the camera.
 */
interface HoodRingsFile {
  names: string[];
  /** per hood, per part, flat [x, y, z, ...] in world metres */
  parts: number[][][];
  /** per hood, a point INSIDE its largest part — not a centroid */
  labels: number[][];
}

import type { PlaceKind } from "@/lib/city/place-kinds.generated";

interface MarksFile {
  n: number;
  t: string[];
  x: string;
  y: string;
  s: string;
  b: string;
  yr: string;
  /** `yr`'s closing bracket: first year the name is no longer drawn, 0 = never */
  yt?: string;
  d: string;
  src: string;
  /** the SIXTH column: 0 = no published kind, else 1 + index into `KIND` */
  k?: string;
  KIND?: string[];
}

function b64(s: string): ArrayBuffer {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * The place names, out of `base/marks.json`.
 *
 * `x`/`y` are decimetres (the mock multiplies by 0.1), `s` is the span in
 * metres, and **`d & 1` is the designation bit** — `part3.html` §6933 reads it
 * as `des = (MKFL[k] & 1) !== 0`, and that is what splits `designated` from
 * `named` in the ink budget. Nothing here decides which places are important;
 * three published registers do.
 */
function decodeMarks(m: MarksFile): PlaceLabel[] {
  const x = new Int32Array(b64(m.x));
  const y = new Int32Array(b64(m.y));
  const s = new Uint16Array(b64(m.s));
  const yr = new Uint16Array(b64(m.yr));
  // Optional for the same reason `k` is: a file written before this column
  // existed still decodes, it just has no name that ever stops.
  const yt = m.yt ? new Uint16Array(b64(m.yt)) : null;
  const d = new Uint8Array(b64(m.d));
  // WHAT KIND OF THING THIS IS, joined from six registers' own category fields
  // by pipeline/scripts/us_sf_places/place_kinds.py and reaching 1,342 of the
  // 2,199 rows. 0 means the record publishes no kind, and that is 857 rows —
  // NOT the 684 this comment used to give, which is the Article 10 + Article 11
  // count and explains only four fifths of them. The other 173 come from
  // registers that do publish a category and are a gap worth chasing; see
  // `labels.ts` §the kind field. A diamond and a glyph never appear on the same
  // place. A reader that does not know this key ignores it, which is why
  // shipping it ahead of this line broke nothing. BUGS.md §33.
  const kind = m.k ? new Uint8Array(b64(m.k)) : null;
  const KIND = m.KIND ?? [];
  const out: PlaceLabel[] = [];
  for (let k = 0; k < m.n; k++) {
    out.push({
      name: m.t[k],
      wx: x[k] * 0.1,
      wy: y[k] * 0.1,
      spanM: s[k],
      cls: (d[k] & 1) !== 0 ? "designated" : "named",
      ...(yr[k] ? { year: yr[k] } : {}),
      ...(yt && yt[k] ? { until: yt[k] } : {}),
      ...(kind && kind[k] ? { kind: KIND[kind[k] - 1] as PlaceKind } : {}),
    });
  }
  return out;
}

/** What `onReady` hands back: the camera, and a way to focus the map. */
export interface CityMapHandle {
  /** put keyboard focus on the map surface */
  focus(): void;
  /** the imperative half — `setYear`, `goToPreset`, `home`, `invalidate` */
  renderer: CityRenderer;
}

export interface CityMapProps {
  /** drawn over the canvas: the film's year and its beat card go here */
  hud?: ReactNode;
  /** drawn under the stage, full width: the film's play button and axis */
  transport?: ReactNode;
  /** replaces the idle content of the record margin (not the block record) */
  ledger?: ReactNode;
  /** what the margin says about the record while nothing is selected */
  record?: { blocks: number; withRecord: number; decisions: number; span: string };
  /** called once, when the renderer exists */
  onReady?: (handle: CityMapHandle) => void;
}

export default function CityMap({ hud, transport, ledger, record, onReady }: CityMapProps) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const indexRef = useRef<BlockIndex | null>(null);

  const [state, setState] = useState<RendererState | null>(null);
  const [baseDone, setBaseDone] = useState(0);
  const [baseTotal, setBaseTotal] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [joinNote, setJoinNote] = useState<string | null>(null);
  const [blockRecord, setBlockRecord] = useState<BlockRecord | null>(null);
  const [blockCtx, setBlockCtx] = useState<BlockContext | null>(null);
  const [picking, setPicking] = useState(false);
  /** the last click resolved to no block — see `onPick` */
  const [missed, setMissed] = useState(false);
  /* WHERE THE READER PUT THE PIN. The pick returns an index and no position,
     so the mark is anchored on the point that was clicked, converted to the
     projection PLANE — a similarity transform away from the screen at any
     camera, so the pin stays on the spot through every pan and zoom instead
     of being recomputed from a centroid the block table would have to be
     asked for. See `projection.ts` §plane → screen. */
  const [mark, setMark] = useState<Plane | null>(null);
  /* WHICH block, not just where the reader clicked. `onPick` hands over an
     index into the block table and the pin threw it away, so the panel could
     say "block 3724" and the map could not draw 3724's own edge. */
  const [markIdx, setMarkIdx] = useState<number>(-1);
  /* THE DIVISIONS. 46 KB, fetched once beside `marks.json`, and null until it
     lands — the map draws exactly what it drew before in that state. */
  const [hoodRings, setHoodRings] = useState<HoodRingsFile | null>(null);

  /* THE INDEX IS A REF, so nothing re-renders when it lands, and the restore
     below has to know that it has. */
  const [indexReady, setIndexReady] = useState(false);
  /** the deep link is honoured once, on the first frame that can honour it */
  const restoredRef = useRef(false);

  const ptrRef = useRef<{ x: number; y: number; at: number } | null>(null);

  // `onReady` is read through a ref: a caller that passes an inline arrow
  // must not be able to tear the renderer down and rebuild it on a re-render.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  /**
   * ── A BLOCK A READER OPENED IS A LINK THEY CAN SEND ──────────────────
   *
   * `?block=3752`, written with `replaceState` and never `pushState`: a reader
   * moving around the map is not navigating, and twenty picks that each cost a
   * press of Back would make the button useless for leaving the page. The
   * trade is stated rather than hidden — Back leaves, it does not deselect,
   * and Escape and the panel's own × are what close a block.
   */
  const writeBlockParam = useCallback((id: string | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("block", id);
    else url.searchParams.delete("block");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  /**
   * Everything a pick does once the block is known, shared by the two ways a
   * block can become the selected one: a reader clicking it, and a URL saying
   * so. `at` is where the pin goes — the point that was clicked, or, for a
   * link, the block's own published centroid, which is the better answer for a
   * block nobody pointed at.
   */
  const selectBlock = useCallback(
    (blockIndex: number, at: Plane | null) => {
      const scene = sceneRef.current;
      const index = indexRef.current;
      setMissed(false);
      setMarkIdx(blockIndex);
      setMark(at);
      const bt = scene?.blockTable;
      if (!bt || !index) return;
      const id = index.b[blockIndex] ?? "—";
      setBlockCtx({
        id,
        hood: bt.hoodNames[bt.hood[blockIndex]] ?? "San Francisco",
        /* THE INDEX, not the name. `build_hood_facts.py` rolls the block files
           up over this same u8 field, so the panel joins on array position and
           never on a string — a name comparison would be a SECOND membership,
           and two memberships is how a guard passes on a bad row. */
        hoodIndex: bt.hood[blockIndex] ?? -1,
        areaM2: bt.area[blockIndex] ?? 0,
        // `ns[i]` has been in the T0 index all along and the fiche was never
        // handed it, so a block whose whole record is on its streets could not
        // say so until the reader opened a fold. FICHE.md §4 asked for this.
        streetDecisions: index.ns[blockIndex] ?? 0,
      });
      writeBlockParam(id);
      setPicking(true);
      void loadBlockRecord(index, blockIndex)
        .then((r) => setBlockRecord(r))
        .catch(() => setBlockRecord(null))
        .finally(() => setPicking(false));
    },
    [writeBlockParam],
  );

  const onPick = useCallback(
    (blockIndex: number) => {
      /* ── A CLICK THAT FINDS NOTHING IS NOT A CLICK THAT SAYS "CLOSE THIS" ──
         `scene.pick()` resolves the point under the pointer against the TERRAIN
         and buildings are not in that march, so a click on a roof lands on the
         ground behind it and often in the roadway, where no block ring matches.
         Measured on this build with `.parity/b5pickmap.py`: at the street stop
         only 38 % of the stage answers with a block, at the block stop 46 %.

         That used to wipe the record the reader had open. So three clicks out of
         four on a built-up frame threw away a century of decisions and put back
         the idle panel, with nothing said. The record now stays until the reader
         closes it, and the margin says a click found nothing. */
      if (blockIndex < 0) {
        setMissed(true);
        return;
      }
      /* The pointer is recorded in the CAPTURE phase on the stage, which runs
         before the canvas's own listener, so the position that produced this
         pick is already here when the renderer calls back. A pick from the
         keyboard (`Enter` picks the middle of the frame) leaves it stale, and
         the fallback is that same middle. */
      const rr = rendererRef.current;
      let at: Plane | null = null;
      if (rr) {
        const v = rr.viewport;
        const p = ptrRef.current;
        const fresh = p && performance.now() - p.at < 1500;
        at = screenToPlane(
          fresh && p ? p.x : v.W / 2,
          fresh && p ? p.y : v.H / 2,
          v.W,
          v.H,
          rr.cam,
        );
      }
      selectBlock(blockIndex, at);
    },
    [selectBlock],
  );

  /**
   * ── THE LINK, HONOURED ───────────────────────────────────────────────
   *
   * `?block=3752` opens that block's record on arrival. It runs once, on the
   * first render where BOTH halves it needs are in hand — the record index,
   * which resolves the id, and the block table, which carries the geometry —
   * so it is keyed on `indexReady` and on the base chunks having landed rather
   * than on a timer.
   *
   * **THE PIN IS THE BLOCK'S OWN CENTROID, NOT A CLICK.** A pick anchors the
   * pin where the reader pointed; a link has no such point, and `cx`/`cy` are
   * already in the block table — the published ring's centre, the same numbers
   * the massing pass extrudes from. For a block nobody pointed at, the centre
   * is the better answer, and it means "Find it on the map" works on arrival
   * instead of being greyed out.
   *
   * The camera is moved to it, because a reader who followed a link to one
   * block should not have to hunt for it on a fitted view of the whole city.
   * It CUTS rather than glides, for the reason `locate` cuts: a jump to a
   * place you asked to be taken to reads as an arrival.
   *
   * An id the index does not hold does nothing at all — no throw, no message,
   * the idle map. A stale link is not an error a reader can act on.
   */
  useEffect(() => {
    if (restoredRef.current || !indexReady) return;
    const index = indexRef.current;
    const bt = sceneRef.current?.blockTable;
    const rr = rendererRef.current;
    if (!index || !bt || !rr) return;
    restoredRef.current = true;
    const want = new URLSearchParams(window.location.search).get("block");
    if (!want) return;
    const i = index.b.indexOf(want);
    if (i < 0) return;
    const at = proj(bt.cx[i], bt.cy[i], bt.z[i] / BLOCK_Z_PER_M);
    selectBlock(i, at);
    const v = rr.viewport;
    const lw =
      hostRef.current && hostRef.current.clientWidth < NARROW_W ? 0 : LEDGER_W;
    rr.cam.cutTo(Math.max(rr.cam.scale, rr.cam.presetScale(2)), v.W, v.H, lw);
    rr.cam.centreOn(at, v.W, v.H, lw);
    rr.cam.follow = false;
    rr.invalidate();
  }, [indexReady, baseDone, baseTotal, selectBlock]);

  /* ── ON A PHONE THE RECORD IS NOT BESIDE THE MAP, IT IS UNDER IT ──────
     Under NARROW_W the margin stacks below the stage, and the stage is 66 vh,
     so a block picked at the top of the screen answers off the bottom of it:
     the reader clicks, the map does nothing they can see, and the record they
     asked for is a scroll away. The panel is brought to the reader instead.
     `block: "nearest"` so the map above it is not thrown off screen, and the
     jump is instant under `prefers-reduced-motion`. */
  useEffect(() => {
    const host = hostRef.current;
    const el = ledgerRef.current;
    if (!blockCtx || !el || !host || host.clientWidth >= NARROW_W) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
    });
  }, [blockCtx]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let disposed = false;
    let renderer: CityRenderer | null = null;
    let ro: ResizeObserver | null = null;
    let cleanupKeys: (() => void) | null = null;

    void (async () => {
      let data: CityData;
      try {
        data = await CityData.load();
      } catch (e) {
        if (!disposed) setFailed(e instanceof Error ? e.message : String(e));
        return;
      }
      if (disposed) return;

      const scene = new CityScene(data, projection);
      // ?layers=-water — the ablation switches, so a screenshot can isolate
      // one pass. See `SceneLayers`.
      scene.layers = parseLayers(
        new URLSearchParams(window.location.search).get("layers"),
      );
      sceneRef.current = scene;
      renderer = new CityRenderer(canvas, data, scene, {
        onPick,
        ledgerW: host.clientWidth < NARROW_W ? 0 : LEDGER_W,
        onState: (s) => {
          if (!disposed) setState(s);
        },
      });
      rendererRef.current = renderer;
      onReadyRef.current?.({
        focus: () => canvasRef.current?.focus(),
        renderer,
      });

      const nBase = data.manifest.chunks.filter((c) => c.tier === "base").length;
      setBaseTotal(nBase);
      const off = data.onChunk(() => {
        if (disposed) return;
        setBaseDone(
          data.manifest.chunks.filter((c) => c.tier === "base" && data.has(c.k)).length,
        );
      });

      /* ── HOME IS THE LARGEST FLIGHT ON THE PAGE ─────────────────────
         The renderer's own key handler glides `home()` over 620 ms, and
         from the Street stop on a phone that is a hundredfold zoom-out
         across the whole frame — the clearest case of the motion
         `prefers-reduced-motion` asks us to remove. Everything else the
         keyboard does (arrows, + and −, Enter) is already instant.
         Captured on the STAGE, which is an ancestor of the canvas, so it
         runs before the renderer's listener rather than after it. */
      const onHomeKey = (e: KeyboardEvent): void => {
        if (e.key !== "Home" || !prefersReducedMotion()) return;
        const rr = rendererRef.current;
        if (!rr || rr.filmOn) return;
        e.preventDefault();
        e.stopPropagation();
        const v = rr.viewport;
        rr.cam.home(v.W, v.H, host.clientWidth < NARROW_W ? 0 : LEDGER_W);
        rr.cam.thawBand();
        rr.invalidate();
      };
      host.addEventListener("keydown", onHomeKey, true);

      /* ── THE PIN NEEDS THE POINT, AND THE PICK ONLY CARRIES AN INDEX ────
         Recorded on the STAGE in the capture phase, which runs before the
         canvas's own pointer listener, so by the time the renderer calls
         `onPick` the position that caused it is already in hand. */
      const onPtr = (e: PointerEvent): void => {
        const rect = canvas.getBoundingClientRect();
        ptrRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          at: performance.now(),
        };
      };
      host.addEventListener("pointerup", onPtr, true);
      cleanupKeys = () => {
        host.removeEventListener("keydown", onHomeKey, true);
        host.removeEventListener("pointerup", onPtr, true);
      };

      ro = new ResizeObserver(() => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        renderer?.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
      });
      ro.observe(host);
      renderer.resize(
        host.clientWidth,
        host.clientHeight,
        Math.min(2, window.devicePixelRatio || 1),
      );

      // The base tier is NOT awaited before the first paint: each chunk repaints
      // as it lands, so the ground is on screen well before the last of the
      // twelve arrives.
      void data.loadBase().then(async () => {
        if (disposed) return;
        await scene.loadLandmarks();
        scene.build();
        scene.warmBands();
        renderer?.refit();
        renderer?.invalidate();
      });

      void fetch("/data/us/sf/city/base/hood-rings.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((h: HoodRingsFile | null) => {
          if (!h || disposed) return;
          setHoodRings(h);
          renderer?.invalidate();
        })
        .catch(() => undefined);

      void fetch("/data/us/sf/city/base/marks.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((m: MarksFile | null) => {
          if (!m || disposed) return;
          scene.setPlaces(decodeMarks(m));
          renderer?.invalidate();
        })
        .catch(() => undefined);

      void Promise.all([
        loadBlockIndex(),
        fetch("/data/us/sf/city/base/blocks-id.json").then((r) =>
          r.ok ? (r.json() as Promise<{ id: string[] }>) : null,
        ),
      ]).then(([idx, ids]) => {
        if (disposed) return;
        indexRef.current = idx;
        setIndexReady(true);
        if (ids) {
          // THE JOIN IS ASSERTED. Two separately-built id arrays that disagree
          // would attach every decision to the wrong block, silently.
          const j = assertJoin(idx, ids.id);
          if (!j.ok) {
            setJoinNote(
              `Block records are not being shown: the record index and the map's own block ids disagree at position ${j.firstMismatch}.`,
            );
            indexRef.current = null;
            setIndexReady(false);
          }
        }
      });

      return () => off();
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      cleanupKeys?.();
      renderer?.destroy();
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, [onPick]);

  const r = rendererRef.current;
  const z = state?.z ?? 1;
  const drawing = baseTotal > 0 && baseDone < baseTotal;

  /* ── THE FOUR STOPS ───────────────────────────────────────────────────
     `Camera.pressedPreset()` answers which stop the camera is standing on,
     on the ABSOLUTE scale. The test that shipped here was `z > 11.5` for the
     fourth button — MAXZ, from before the ceiling became absolute — and at
     390 x 844 the ceiling is z 100.2, so STREET read pressed from z 11.5 up,
     eight times short of the stop it names.

     Under `prefers-reduced-motion` the press CUTS. The glide is 520 ms of
     large-field zoom — 4x on a desktop, 14x on a phone, because the ceiling
     is fixed and the fit is not — and that is the vestibular motion the
     setting asks us to remove. The stop it lands on is the same one. */
  const pressed = r ? r.cam.pressedPreset() : 0;

  /* ── AND WHICH STOP THE READER IS NEAREST ─────────────────────────────
     `pressedPreset()` answers −1 anywhere between two stops, which is where
     a wheel, a pinch and every window resize leave the camera — so the four
     buttons spent most of their life with none of them marked, and the one
     control that says how close the view is said nothing. `aria-pressed`
     stays exact, because standing on a stop and being nearest to one are not
     the same claim; the nearest stop is marked visually, which is what the
     eye is asking. */
  const near = ((): number => {
    if (!r) return 0;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < r.cam.presetCount(); i++) {
      const sc = r.cam.presetScale(i);
      if (sc <= 0) continue;
      const d = Math.abs(Math.log(r.cam.scale / sc));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  })();

  /* the pin, in canvas pixels, or null when it is off the frame or the film
     has the camera */
  const markPos = ((): { x: number; y: number } | null => {
    if (!mark || !r || !blockCtx || r.filmOn) return null;
    const v = r.viewport;
    const x = SX(mark, v.W, r.cam);
    const y = SY(mark, v.H, r.cam);
    /* The stage runs the FULL width and the record margin is an opaque panel
       laid on its right — the same fact the camera's own clamp is built on.
       A pin drawn past the strip's edge would be sitting under the margin, on
       a part of the city the reader cannot see, so it is not drawn. */
    const lw = hostRef.current && hostRef.current.clientWidth < NARROW_W ? 0 : LEDGER_W;
    if (x < -40 || y < -40 || x > v.W - lw || y > v.H + 40) return null;
    return { x, y };
  })();

  /* ── THE BLOCK'S OWN EDGE ─────────────────────────────────────────────
     A pin says WHERE the reader clicked. It does not say what "this block"
     means, and the whole margin is a claim about one — its residents, its
     roll, its century of decisions. Two blocks can be forty metres apart and
     a point between them belongs to neither in a reader's eye.

     So the block's PUBLISHED RING is drawn on the ground. Nothing here is
     invented: `rx`/`ry` are the vertices `base/blocks` ships, the same ones
     the hit test walks to decide the click landed here at all — so the shape
     drawn IS the shape that answered.

     Projected with the same `proj()` the renderer uses, at ONE elevation for
     the whole ring, which is the convention the massing pass already sets:
     its prism is "the block's published ring, extruded over the elevation at
     its centroid". A city block is about 120 m and its own rise is small
     against the error of pretending it is flat.

     Recomputed on every render, like `markPos`, because `onState` fires as
     the camera moves — so the outline is glued to the ground through every
     pan and zoom rather than being redrawn on a timer. */
  const outline = ((): string | null => {
    if (markIdx < 0 || !r || r.filmOn) return null;
    const bt = sceneRef.current?.blockTable;
    if (!bt) return null;
    const o = bt.off[markIdx];
    const m = bt.off[markIdx + 1] - o;
    if (m < 3) return null;
    const v = r.viewport;
    const lw = hostRef.current && hostRef.current.clientWidth < NARROW_W ? 0 : LEDGER_W;
    const zc = bt.z[markIdx] / BLOCK_Z_PER_M;
    const pts: string[] = [];
    let seen = false;
    for (let a = 0; a < m; a++) {
      const pl = proj(bt.rx[o + a], bt.ry[o + a], zc);
      const x = SX(pl, v.W, r.cam);
      const y = SY(pl, v.H, r.cam);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (x > -200 && y > -200 && x < v.W - lw + 200 && y < v.H + 200) seen = true;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    /* Every vertex off the visible strip means the block is behind the record
       margin or off frame; the pin takes itself down in that case and so does
       this, rather than painting an edge over a city the reader cannot see. */
    return seen ? pts.join(" ") : null;
  })();

  /* ── THE 41 DIVISIONS, AND HOW THEY GIVE WAY ──────────────────────────
     Daniel: *"when you're totally unzoomed at city level there's like the
     division of the city into those divisions."* He is answering a real
     problem another agent measured — at whole-city the median building is far
     under a pixel and nothing the building layer draws survives, so the widest
     shot is carried by a flat massing plate and has nothing to be ABOUT.
     Forty-one named divisions give it something.

     THREE RULES THIS LAYER IS WRITTEN UNDER.

     1. **No tint of an invented metric.** All 41 draw in ONE ink. The selected
        one gets a fill, and that is a selection state, not an encoding — there
        is no quantity on this layer, so there is nothing to mislead about.
     2. **It must not pop.** `wide` is linear in LOG scale between the
        whole-city stop and the block stop, then smoothstepped, so its
        derivative is zero at both ends: the divisions fade in as the streets
        and blocks fade out rather than switching at a threshold.
        **A pixel floor is a step in the derivative** and it is the cause of
        every lurch bug on this project.
     3. **The boundary is the blocks'.** `hood-rings.json` is the union of each
        neighbourhood's own published block rings, closed across the street —
        so what is outlined is exactly the set of blocks that would answer with
        that name. Every vertex carries the ground elevation of the nearest of
        those blocks, so the line lies ON the city rather than at sea level
        under Twin Peaks.

     The SELECTED neighbourhood keeps a floor, because it is the subject of the
     margin and a reader who has just clicked must be able to see what the
     fiche is about; the other forty are gone by the block stop. */
  const hoodLayer = ((): {
    sel: string | null;
    wide: number;
  } => {
    const none = { sel: null, wide: 0 };
    if (!r || r.filmOn || !hoodRings) return none;
    const cityScale = r.cam.presetScale(0);
    const blockScale = r.cam.presetScale(2);
    if (!(cityScale > 0) || !(blockScale > cityScale)) return none;
    const raw = Math.log(blockScale / r.cam.scale) / Math.log(blockScale / cityScale);
    const w = Math.min(1, Math.max(0, raw));
    const wide = w * w * (3 - 2 * w);

    const selIdx = markIdx >= 0
      ? (sceneRef.current?.blockTable?.hood[markIdx] ?? -1)
      : -1;
    /* Nothing to draw with no neighbourhood picked, and nothing to draw once
       the ramp has run out — the scrim IS the layer now. */
    if (selIdx < 0 || wide <= 0.002) return none;

    const v = r.viewport;
    const lw = hostRef.current && hostRef.current.clientWidth < NARROW_W ? 0 : LEDGER_W;
    const path = (hi: number): string => {
      let d = "";
      for (const flat of hoodRings.parts[hi] ?? []) {
        let sub = "";
        let seen = false;
        for (let k = 0; k + 2 < flat.length; k += 3) {
          const pl = proj(flat[k], flat[k + 1], flat[k + 2]);
          const x = SX(pl, v.W, r.cam);
          const y = SY(pl, v.H, r.cam);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
          if (x > -400 && y > -400 && x < v.W - lw + 400 && y < v.H + 400) seen = true;
          sub += `${k === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        }
        /* A part entirely off the visible strip is behind the record margin or
           off frame. Skipping it is not a cull for correctness — the browser
           would clip it — it is what keeps the path string short enough to be
           rebuilt on every camera frame. */
        if (seen) d += `${sub}Z`;
      }
      return d;
    };

    /* ONLY THE SELECTED ONE IS BUILT. The other forty were drawn and then
       removed — see the render below — and building their path anyway would
       be 19,816 characters of string per render for nobody. */
    const sel = selIdx >= 0 ? path(selIdx) : "";

    /* NO LABELS HERE. Looked at the wide shot and every neighbourhood name
       was drawn TWICE — "TENDERLOIN TENDERLOIN", "RUSSIAN HILL RUSSIAN HILL".
       `labels.ts` §the neighbourhood capitals has been drawing them all along,
       out of this same `hood` byte, anchored on an AREA-WEIGHTED centre and
       inside a shared ink budget with the streets and the marks. A second set
       of names in an SVG over the canvas cannot see that budget and would
       fight it at every zoom. What this layer adds is the one thing that was
       missing: the BOUNDARY. */
    return { sel: sel || null, wide };
  })();

  const goToStop = (i: number): void => {
    const rr = rendererRef.current;
    const host = hostRef.current;
    if (!rr) return;
    if (prefersReducedMotion()) {
      const v = rr.viewport;
      const lw = host && host.clientWidth < NARROW_W ? 0 : LEDGER_W;
      rr.cam.cutTo(rr.cam.presetScale(i), v.W, v.H, lw);
      rr.invalidate();
    } else {
      rr.goToPreset(i);
    }
  };

  /* ── TAKE ME BACK TO IT ───────────────────────────────────────────────
     The record is open in the margin and the block it belongs to can be
     three screens away after one drag, or under the pointer and 30 metres
     wide at the whole-city stop. The pin is a plane point, which is what
     `centreOn` takes.

     THE ORDER IS THE WHOLE OF IT, and the first version had it backwards.
     `clamp()` is scale-dependent — at the whole-city stop the camera cannot
     roam at all, because the city is fitted — so centring first and zooming
     after left the block wherever the zoom happened to carry it, off to one
     side of the frame. The scale is set first and the centre second, so the
     clamp and the frame bias both do their arithmetic at the scale the
     reader is going to be looking at.

     It CUTS. A 520 ms flight would be the better answer if the position
     could fly with it, and `glideTo` interpolates the centre it is given at
     the scale it starts from; a jump-cut to the block a reader has asked to
     be taken to reads as an arrival, and it is the same move
     `prefers-reduced-motion` would get anyway. */
  const locate = (): void => {
    const rr = rendererRef.current;
    const host = hostRef.current;
    if (!rr || !mark) return;
    const v = rr.viewport;
    const lw = host && host.clientWidth < NARROW_W ? 0 : LEDGER_W;
    rr.cam.cutTo(Math.max(rr.cam.scale, rr.cam.presetScale(2)), v.W, v.H, lw);
    rr.cam.centreOn(mark, v.W, v.H, lw);
    rr.cam.follow = false;
    rr.invalidate();
    /* On a phone the record is UNDER the map, so "find it on the map" moved a
       camera the reader could not see. The stage is brought back to them, the
       same way a pick brings the record to them. */
    if (host && host.clientWidth < NARROW_W)
      host.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
  };

  return (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
        <div ref={hostRef} className="fx-city-stage">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="img"
            aria-label={[
              t("us.sf.thecity.map.alt").replace("{z}", z.toFixed(1)),
              state
                ? t("us.sf.thecity.map.alt_drawn")
                    .replace("{buildings}", nfInt.format(state.scene.buildings))
                    .replace("{blocks}", nfInt.format(state.scene.massed))
                : t("us.sf.thecity.map.drawing"),
              t("us.sf.thecity.map.keys"),
            ].join(" ")}
            className="fx-city-canvas"
          />

          {hud}

          {/* THE NEIGHBOURHOOD, AND THE BLOCK INSIDE IT. The pin says where
              the reader clicked; the pale region says what the fiche in the
              margin is about; the sharp ring says which block answered.
              `pointer-events: none` so neither eats a click meant for the map,
              and `aria-hidden` because the panel says both in words. */}
          {outline || hoodLayer.sel ? (
            <svg
              className="fx-city-outline"
              width="100%"
              height="100%"
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                overflow: "visible",
              }}
            >
              {/* The neighbourhood first, so the block's own edge lands on
                  top of it. A wash and a hairline: at the district stop this
                  is two hundred blocks, and anything heavier stops being a
                  region and becomes a stain over the city. */}
              {/* ── THE NEIGHBOURHOOD IS SHOWN BY FOCUS, NOT BY A FENCE ───
                  Daniel: *"can you remove the blue borders from the districts
                  it's weird?"* Right, and the reason is nameable: a saturated
                  `--bleu` hairline was the only thing on this frame that is
                  not in the map's own ink. Every other line here — street,
                  kerb, coast, block edge — is a tone of the ground it sits on,
                  so a UI blue over them read as a debug overlay laid on the
                  drawing rather than as part of it.

                  Taken off FIRST and looked at before anything replaced it,
                  which turned two questions into one answer:

                  1. **The other forty are gone.** With no stroke they were a
                     5 % ink wash that could not be seen at any zoom, and they
                     cost 19,816 characters of path on every render to draw it.
                     They are not missed, because `labels.ts` has been drawing
                     all 41 NAMES at this zoom all along, in the map's own type
                     and inside its own ink budget. The names are the division.
                  2. **The selected one is shown by focus.** Not a wash over it
                     — that reads as a stain — but a paper scrim over everything
                     ELSE, punched through by the hood's own outline with
                     `evenodd`. It says *this is the ground the margin is
                     talking about* using the one move a paper map already
                     makes, and there is no line anywhere in it.

                  The scrim rides the same `wide` ramp, so it is strongest at
                  the whole-city stop where a neighbourhood is a shape, and gone
                  by the block stop where the block's own ring takes over. */}
              {hoodLayer.sel && r ? (
                <path
                  d={`M0,0H${r.viewport.W}V${r.viewport.H}H0Z${hoodLayer.sel}`}
                  fillRule="evenodd"
                  fill="var(--bg, #fff)"
                  fillOpacity={0.42 * hoodLayer.wide}
                  stroke="none"
                />
              ) : null}

              {/* Drawn twice: a wide soft casing so the edge holds against a
                  pale roof or a bright park, then the line itself. One stroke
                  in one colour disappears over half the city. */}
              {outline ? (
                <>
                  <polygon
                    points={outline}
                    fill="none"
                    stroke="var(--bg, #fff)"
                    strokeOpacity={0.55}
                    strokeWidth={5}
                    strokeLinejoin="round"
                  />
                  <polygon
                    points={outline}
                    fill="var(--bleu)"
                    fillOpacity={0.1}
                    stroke="var(--bleu)"
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                  />
                </>
              ) : null}
            </svg>
          ) : null}

          {/* THE BLOCK THE RECORD IN THE MARGIN BELONGS TO. Without it the
              reader clicked a block, the margin filled with a century of
              decisions, and nothing on the map said which of the 5,404
              blocks under the pointer had answered. */}
          {markPos ? (
            <div
              className="fx-city-pin"
              style={{ left: `${markPos.x}px`, top: `${markPos.y}px` }}
              aria-hidden="true"
            >
              <span className="fx-city-pin-ring" />
              <span className="fx-city-pin-id">{blockCtx?.id}</span>
            </div>
          ) : null}

          <div
            role="group"
            aria-label={t("us.sf.thecity.map.view")}
            className="fx-city-controls"
          >
            {/* The four stops read as four labels floating over the map until
                something says they are a control. The group already carries
                the accessible name; this is the same thing for the eye. */}
            <span className="fx-city-controls-cap" aria-hidden="true">
              {t("us.sf.thecity.map.view_cap")}
            </span>
            {PRESET_KEYS.map((key, i) => (
              <button
                key={key}
                type="button"
                className="fx-city-preset"
                aria-pressed={pressed === i}
                data-near={pressed < 0 && near === i ? "true" : undefined}
                onClick={() => goToStop(i)}
              >
                {t(key)}
              </button>
            ))}
          </div>

          {failed ? (
            <div className="fx-city-overlay" role="status">
              <p className="fx-fiche-note">
                {t("us.sf.thecity.map.failed")} {failed}
              </p>
            </div>
          ) : null}
        </div>

        {/* THE RECORD MARGIN IS AN OPAQUE PANEL ON THE CANVAS, which is why
            the camera fits and clamps to the visible STRIP and not to the
            canvas: clamping to the canvas would let a third of San Francisco
            slide underneath it and still count as on screen. Under NARROW_W
            it stacks below instead, and `ledgerW` is passed as 0 so the strip
            IS the canvas. */}
        <div ref={ledgerRef} className="fx-city-ledger">
          {/* WHAT HAPPENED WHEN NOTHING HAPPENED. Without this the reader
              clicks a building, the map does not move, the margin does not
              change, and there is no way to tell a miss from a dead page. */}
          {missed ? (
            <p className="fx-city-miss" role="status" aria-live="polite">
              {t("us.sf.thecity.map.no_block")}
            </p>
          ) : null}
          {blockCtx ? (
            <CityBlockPanel
              record={blockRecord}
              context={blockCtx}
              city={record ? { blocks: record.blocks, withRecord: record.withRecord } : undefined}
              loading={picking}
              onLocate={mark ? locate : undefined}
              onClose={() => {
                setBlockCtx(null);
                setBlockRecord(null);
                setMark(null);
                setMarkIdx(-1);
                setMissed(false);
                writeBlockParam(null);
              }}
            />
          ) : (
            <>
              <div className="fx-city-ledger-head">
                {t("us.sf.thecity.margin.head")}
              </div>
              <p className="fx-city-ledger-lede">
                {t("us.sf.thecity.margin.lede")}
              </p>

              {ledger ?? (record ? (
                <dl className="fx-city-ledger-facts">
                  <div className="fx-city-fact-row">
                    <dt>{t("us.sf.thecity.margin.decisions")}</dt>
                    <dd className="tnum">{nfInt.format(record.decisions)}</dd>
                  </div>
                  <div className="fx-city-fact-row">
                    <dt>{t("us.sf.thecity.margin.years")}</dt>
                    <dd className="tnum">{record.span}</dd>
                  </div>
                  <div className="fx-city-fact-row">
                    <dt>{t("us.sf.thecity.margin.blocks")}</dt>
                    <dd className="tnum">
                      {nfInt.format(record.withRecord)} / {nfInt.format(record.blocks)}
                    </dd>
                  </div>
                </dl>
              ) : null)}

              {drawing ? (
                <p className="fx-city-loading" role="status" aria-live="polite">
                  {t("us.sf.thecity.map.drawing")}
                </p>
              ) : null}

              {joinNote ? <p className="fx-fiche-note">{joinNote}</p> : null}
            </>
          )}
        </div>
      </div>

      {transport ? <div className="fx-city-transport">{transport}</div> : null}

      <div className="fx-wrap">
        <div className="fx-city-help">
          <span>{t("us.sf.thecity.map.help")}</span>
          {transport ? <span>{t("us.sf.thecity.map.help_years")}</span> : null}
          <span className="fx-city-help-keys">{t("us.sf.thecity.map.help_keys")}</span>
        </div>
      </div>
    </div>
  );
}
