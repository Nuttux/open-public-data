/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/bldg.ts — READING A FOOTPRINT CHUNK.

   The published `bldg` chunk stores every footprint as a stream of ONE-BYTE
   DELTAS against a running accumulator, with an escape list for the rare
   vertex that will not fit in a byte. That encoding is `bldg/build_bldg.py`'s
   and it is what makes 166,166 polygons weigh 3.6 MB.

   `components/us/city/scene.ts` has a decoder for it (`decodeBld`) that also
   builds the six colour indices the Canvas painter wants. This one decodes
   the GEOMETRY and the published columns and stops there: a GPU renderer
   wants vertices in a buffer and does its colour with a light.

   ── THE ONE THING THAT MUST NOT DRIFT ─────────────────────────────────────
   The accumulator is GLOBAL across the whole chunk, not per building, and the
   escapes are consumed BEFORE the building's own vertices. Get either wrong
   and the city comes out as a diagonal smear rather than an error.
   `bldg.test.ts` locks the walk against a hand-built fixture.
   ═══════════════════════════════════════════════════════════════════════ */

import type { Chunk } from "@/lib/city/data";

/** `BLDG.q` — the published 1 m vertex quantiser */
export const BLDG_Q = 1.0;

export interface BldgTable {
  /** how many footprints */
  readonly n: number;
  /** the city-wide id of each */
  readonly gid: Uint32Array;
  /** `off[i]..off[i+1]` indexes `vx`/`vy` for footprint i */
  readonly off: Uint32Array;
  /** vertex world x / y, metres */
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** centroid, metres */
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  /** the height byte and its quarter-level, for `roofHeight` */
  readonly h: Uint16Array;
  readonly hf: Uint8Array;
  /** years since 1849, and the use/flag byte */
  readonly yr: Uint8Array;
  readonly u: Uint8Array;
  /** published storey count */
  readonly st: Uint8Array;
  /** the measured aerial roof palette index, and its sample-quality bits */
  readonly paintIdx: Uint8Array;
  readonly paintFlag: Uint8Array;
}

export function decodeBldg(chunk: Chunk): BldgTable {
  const f = chunk.fields;
  const gid = f.gid as Uint32Array;
  const cnt = f.cnt as Uint8Array;
  const dx = f.vx as Int8Array;
  const dy = f.vy as Int8Array;
  const xi = f.xi as Uint32Array;
  const xn = f.xn as Uint16Array;
  const n = cnt.length;

  /* how many EXTRA deltas sit in front of building i's own vertices. The
     escape list is (index, count) pairs and a building may appear twice. */
  const esc = new Uint32Array(n);
  for (let k = 0; k < xi.length; k++) esc[xi[k]] += xn[k];

  const off = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + cnt[i];
  const nv = off[n];

  const vx = new Float32Array(nv);
  const vy = new Float32Array(nv);
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);

  let ax = 0;
  let ay = 0;
  let p = 0;
  for (let i = 0; i < n; i++) {
    for (let e = 0; e < esc[i]; e++) {
      ax += dx[p];
      ay += dy[p];
      p++;
    }
    let sx = 0;
    let sy = 0;
    const o = off[i];
    const c = cnt[i];
    for (let k = 0; k < c; k++) {
      ax += dx[p];
      ay += dy[p];
      p++;
      const wx = ax * BLDG_Q;
      const wy = ay * BLDG_Q;
      vx[o + k] = wx;
      vy[o + k] = wy;
      sx += wx;
      sy += wy;
    }
    cx[i] = c ? sx / c : 0;
    cy[i] = c ? sy / c : 0;
  }

  return {
    n,
    gid,
    off,
    vx,
    vy,
    cx,
    cy,
    h: f.h as Uint16Array,
    hf: f.hf as Uint8Array,
    yr: f.yr as Uint8Array,
    u: f.u as Uint8Array,
    st: f.st as Uint8Array,
    paintIdx: f.paintIdx as Uint8Array,
    paintFlag: f.paintFlag as Uint8Array,
  };
}
