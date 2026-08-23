"use client";

/**
 * THE REACT SHELL.
 *
 * React at the edges only: mount, resize, teardown, and the drawer. The render
 * loop is `CityRenderer` and it is imperative — **no frame goes through React
 * state**. The one bridge is `onState`, which is throttled to the browser's own
 * animation frame and only ever feeds the readout strip, never the canvas.
 *
 * ── PROGRESSIVE, AND HONEST ABOUT IT ─────────────────────────────────────
 * The manifest lands first (23 KB gz). The twelve base-tier chunks stream in
 * behind it — 649 KB gz, **682 KB with the manifest** — and the map paints as
 * each one arrives rather than after the last one does: the ground appears,
 * then the bay, then the block massing, then the landmarks. Everything past
 * that is fetched by the camera: footprints at z ≥ 1.55, the refined
 * bathymetry at 3.0, street surfaces and trees at 2.9, facades at 4.0.
 *
 * The loading line says which of those is outstanding and stops saying
 * anything once the base tier is complete. It is not a spinner over a blank
 * frame — the frame under it is already drawable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CityData } from "@/lib/city/data";
import { projection } from "@/lib/city/projection";
import { LEDGER_W, NARROW_W, ZSTEPS } from "@/lib/city/camera";
import type { PlaceLabel } from "@/lib/city/labels";
import { CityScene, parseLayers } from "./scene";
import { CityRenderer, type RendererState } from "./renderer";
import CityBlockPanel, { type BlockContext } from "./CityBlockPanel";
import {
  assertJoin,
  loadBlockIndex,
  loadBlockRecord,
  type BlockIndex,
  type BlockRecord,
} from "./block-records";

const nfInt = new Intl.NumberFormat("en-US");

const PRESET_LABELS = ["Whole city", "District", "Block", "Street"];

interface MarksFile {
  n: number;
  t: string[];
  x: string;
  y: string;
  s: string;
  b: string;
  yr: string;
  d: string;
  src: string;
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
  const d = new Uint8Array(b64(m.d));
  const out: PlaceLabel[] = [];
  for (let k = 0; k < m.n; k++) {
    out.push({
      name: m.t[k],
      wx: x[k] * 0.1,
      wy: y[k] * 0.1,
      spanM: s[k],
      cls: (d[k] & 1) !== 0 ? "designated" : "named",
      ...(yr[k] ? { year: yr[k] } : {}),
    });
  }
  return out;
}

export default function CityMap({
  height = 660,
}: {
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const indexRef = useRef<BlockIndex | null>(null);

  const [state, setState] = useState<RendererState | null>(null);
  const [baseDone, setBaseDone] = useState(0);
  const [baseTotal, setBaseTotal] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [joinNote, setJoinNote] = useState<string | null>(null);
  const [record, setRecord] = useState<BlockRecord | null>(null);
  const [blockCtx, setBlockCtx] = useState<BlockContext | null>(null);
  const [picking, setPicking] = useState(false);

  const onPick = useCallback((blockIndex: number) => {
    const scene = sceneRef.current;
    const index = indexRef.current;
    if (blockIndex < 0) {
      setRecord(null);
      setBlockCtx(null);
      return;
    }
    const bt = scene?.blockTable;
    if (!bt || !index) return;
    setBlockCtx({
      id: index.b[blockIndex] ?? "—",
      hood: bt.hoodNames[bt.hood[blockIndex]] ?? "San Francisco",
      areaM2: bt.area[blockIndex] ?? 0,
    });
    setPicking(true);
    void loadBlockRecord(index, blockIndex)
      .then((r) => setRecord(r))
      .catch(() => setRecord(null))
      .finally(() => setPicking(false));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let disposed = false;
    let renderer: CityRenderer | null = null;
    let ro: ResizeObserver | null = null;

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

      const nBase = data.manifest.chunks.filter((c) => c.tier === "base").length;
      setBaseTotal(nBase);
      const off = data.onChunk(() => {
        if (disposed) return;
        setBaseDone(
          data.manifest.chunks.filter((c) => c.tier === "base" && data.has(c.k)).length,
        );
      });

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
        if (ids) {
          // THE JOIN IS ASSERTED. Two separately-built id arrays that disagree
          // would attach every decision to the wrong block, silently.
          const j = assertJoin(idx, ids.id);
          if (!j.ok) {
            setJoinNote(
              `Block records are not being shown: the record index and the map's own block ids disagree at position ${j.firstMismatch}.`,
            );
            indexRef.current = null;
          }
        }
      });

      return () => off();
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      renderer?.destroy();
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, [onPick]);

  const r = rendererRef.current;
  const z = state?.z ?? 1;
  const loadingBase = baseTotal > 0 && baseDone < baseTotal;

  return (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
      <div
        ref={hostRef}
        className="fx-city-stage"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label={
            `San Francisco drawn from the city's own published record, seen from the south-east at ` +
            `${projection.elevationDeg().toFixed(1)} degrees above the horizon. ` +
            `Zoom ${z.toFixed(1)} times the whole-city fit. ` +
            (state
              ? `${nfInt.format(state.scene.buildings)} buildings and ${nfInt.format(state.scene.massed)} assessor blocks are drawn in this frame.`
              : "Loading.") +
            ` Use the arrow keys to pan, plus and minus to zoom, Home for the whole city, and Enter to open the record for the block at the centre of the frame.`
          }
          className="fx-city-canvas"
        />

        {failed ? (
          <div className="fx-city-overlay" role="status">
            <p className="fx-fiche-note">
              The city&rsquo;s data could not be loaded: {failed}
            </p>
          </div>
        ) : null}

      </div>

      {/* THE LEDGER IS AN OPAQUE PANEL ON THE CANVAS, which is why the camera
          fits and clamps to the visible STRIP and not to the canvas: clamping
          to the canvas would let a third of San Francisco slide underneath it
          and still count as on screen. Under NARROW_W it stacks below instead,
          and `ledgerW` is passed as 0 so the strip IS the canvas. */}
      <div className="fx-city-ledger">
          <div className="fx-city-ledger-head">San Francisco</div>
          <p className="fx-city-ledger-lede">
            Every building, block, street and tree on this map is a published
            record. Click a block to read what the city decided there.
          </p>

          <div role="group" aria-label="Zoom presets" className="fx-city-presets">
            {PRESET_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                className="fx-city-preset"
                aria-pressed={
                  i < ZSTEPS.length
                    ? Math.abs(Math.log(z / ZSTEPS[i])) < 0.05
                    : z > 11.5
                }
                onClick={() => r?.goToPreset(i)}
              >
                {label}
              </button>
            ))}
          </div>

          {loadingBase ? (
            <p className="fx-city-loading" role="status" aria-live="polite">
              Loading the first paint — {baseDone} of {baseTotal} base chunks.
              The map is already drawing what has arrived.
            </p>
          ) : blockCtx ? null : (
            <dl className="fx-city-stats">
              <Stat k="Zoom" v={`${z.toFixed(2)}×`} />
              <Stat k="Buildings drawn" v={nfInt.format(state?.scene.buildings ?? 0)} />
              <Stat k="Blocks massed" v={nfInt.format(state?.scene.massed ?? 0)} />
              <Stat k="Street areas" v={nfInt.format(state?.scene.streets ?? 0)} />
              <Stat k="Trees & canopy" v={nfInt.format(state?.scene.trees ?? 0)} />
              <Stat k="Names placed" v={nfInt.format(state?.scene.labels ?? 0)} />
              <Stat
                k="Data held"
                v={`${((state?.heldBytes ?? 0) / 1048576).toFixed(1)} MB`}
              />
              {state && state.inFlight > 0 ? (
                <Stat k="Fetching" v={`${state.inFlight} chunk${state.inFlight === 1 ? "" : "s"}`} />
              ) : null}
            </dl>
          )}

          {joinNote ? <p className="fx-fiche-note">{joinNote}</p> : null}

          {blockCtx ? (
            <CityBlockPanel
              record={record}
              context={blockCtx}
              loading={picking}
              onClose={() => {
                setBlockCtx(null);
                setRecord(null);
              }}
            />
          ) : null}
      </div>
      </div>

      <p className="fx-doc-source fx-city-help">
        Drag to pan · scroll or pinch to zoom · click a block for its record ·
        keyboard: arrows pan, <kbd>+</kbd>/<kbd>−</kbd> zoom, <kbd>Home</kbd>{" "}
        resets, <kbd>Enter</kbd> opens the block at the centre of the frame.
      </p>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="fx-city-stat">
      <dt>{k}</dt>
      <dd className="tnum">{v}</dd>
    </div>
  );
}
