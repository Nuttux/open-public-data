import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BufferAttribute,
  Color,
  FrontSide,
  MeshLambertMaterial,
  SRGBColorSpace,
} from "three";
import { describe, expect, it } from "vitest";

import { CityData } from "@/lib/city/data";
import { DE, RSHADE, roofHeight } from "@/lib/city/roofs";
import { roofPalette, wallPalette } from "@/components/us/city/palette";
import { capForm, shadeRGB, type FormSink } from "../roof-form";
import { roofShadeTable } from "../materials";
import { decodeBldg } from "../bldg";
import { CAP_WBOT, CAP_WTOP, capsLayer } from "./caps";

/**
 * WHAT THIS TEST IS FOR.
 *
 * `roof-form.test.ts` proves that `capForm` builds the solid it says it does.
 * What it cannot prove is that this layer hands it the RIGHT NUMBERS — and
 * every way of getting that wrong produces a mesh that renders without
 * complaining:
 *
 *   · the slot table is keyed on a city-wide gid and the footprints live one
 *     chunk per grid cell, so a join on the ROW INDEX instead of the gid puts
 *     every tower in the city on somebody else's roof;
 *   · `top` is decimetres and `rad` is centimetres in the file, so a missed
 *     unit is a cap ten times too tall or a hundred times too wide;
 *   · a cap whose base is not its host's own measured height floats over the
 *     roof or sinks into it, and at this zoom neither is visible by eye;
 *   · the century scrub is a DRAW RANGE, which is correct only while the
 *     emission order is monotone in the year.
 *
 * So the assertions are run against the real published chunks, read off disk
 * exactly as `lib/city/data.test.ts` reads them, and the geometry is checked
 * against the record the layer claims to be drawing rather than against
 * itself.
 */

const DATA_DIR = path.resolve(__dirname, "../../../../public/data/us/sf/city");
const have = existsSync(path.join(DATA_DIR, "manifest.json"));
const d = have ? describe : describe.skip;

/** Serve the real encoder output off disk, so this exercises the true bytes. */
const diskFetch = (async (url: string) => {
  const rel = String(url).replace(/^.*\/city\/?/, "");
  const p = path.join(DATA_DIR, rel);
  if (!existsSync(p)) return new Response(null, { status: 404 });
  if (p.endsWith(".json")) {
    return new Response(readFileSync(p, "utf8"), {
      headers: { "content-type": "application/json" },
    });
  }
  const b = readFileSync(p);
  return new Response(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}) as unknown as typeof fetch;

/** the ground, flat and NOT zero — a zero field hides an `elev`/`h` mix-up */
const FLAT_ELEV_M = 12.5;

async function loaded(): Promise<CityData> {
  const data = await CityData.load({ fetchImpl: diskFetch });
  await data.loadBase();
  await data.loadTier("bldg");
  return data;
}

function layerOf(data: CityData, extra: Record<string, unknown> = {}) {
  const buildings = data.manifest.buildings as {
    palette: string[];
    hq?: number[][];
    paintFlagBits?: { nosample?: number };
  };
  return capsLayer(data, {
    zexb: 1.6,
    elevAt: () => FLAT_ELEV_M,
    roofPalette: roofPalette(buildings.palette),
    wallPalette: wallPalette(),
    materials: {
      hq: buildings.hq ?? [],
      noSampleBit: buildings.paintFlagBits?.nosample ?? 4,
      year0: 1849,
      fallbackRoof: 1,
      fallbackWall: 1,
    },
    ...extra,
  });
}

/** every host footprint the slot table names, joined the slow honest way */
function hostsOf(data: CityData): Map<number, { baseM: number; year: number }> {
  const out = new Map<number, { baseM: number; year: number }>();
  const form = data.form()!;
  const wanted = new Set<number>();
  for (let s = 0; s < form.n; s++) wanted.add(form.bi[s]);
  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "bldg") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const tb = decodeBldg(chunk);
    for (let i = 0; i < tb.n; i++) {
      if (!wanted.has(tb.gid[i])) continue;
      out.set(tb.gid[i], {
        baseM: roofHeight(tb.h[i], tb.hf[i]),
        // FLAG_NOYEAR is 16; spelled out here so the test does not read the
        // same constant the layer does and agree with itself about a typo
        year: (tb.u[i] & 16) !== 0 ? -1 : 1849 + tb.yr[i],
      });
    }
  }
  return out;
}

d("capsLayer, against the published chunks", () => {
  it("draws one cap per published slot, less the refusals it can name", async () => {
    const data = await loaded();
    const form = data.form();
    expect(form).not.toBeNull();
    const layer = layerOf(data);
    expect(layer).not.toBeNull();

    /* THE COUNT IS NOT A ROUND NUMBER AND MUST NOT BE ASSERTED AS ONE. The
       merged table is 518 slots — 478 published steps plus 40 masts, and the
       two streams are disjoint. Every slot that is refused is refused by a
       rule this test can restate: `capForm` takes no cap without lift over
       the roof plane the page already drew. */
    const hosts = hostsOf(data);
    let expected = 0;
    for (let s = 0; s < form!.n; s++) {
      const h = hosts.get(form!.bi[s]);
      if (!h) continue;
      if (form!.top[s] > h.baseM) expected++;
    }
    expect(layer!.count).toBe(expected);
    // and the refusals are a handful, not a silent majority
    expect(layer!.count).toBeGreaterThan(form!.n - 20);
  });

  it("drops the footprints an authored model already stands on", async () => {
    const data = await loaded();
    const form = data.form()!;
    const all = layerOf(data)!;
    /* one gid the record really does carry a slot for, so the assertion is
       about the skip and not about a gid nothing would have drawn anyway */
    const skip = new Set<number>([form.bi[0], form.bi[1], form.bi[2]]);
    const some = layerOf(data, { skipGids: skip })!;
    expect(all.count - some.count).toBe(3);
    all.dispose();
    some.dispose();
  });

  it("puts no NaN in any buffer", async () => {
    const data = await loaded();
    const layer = layerOf(data)!;
    const g = layer.meshes[0].geometry;
    for (const name of ["position", "aElev", "aH", "color"]) {
      const a = g.getAttribute(name) as BufferAttribute;
      const arr = a.array as Float32Array;
      let bad = -1;
      for (let i = 0; i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) { bad = i; break; }
      }
      expect(bad, `${name}[${bad}] is not finite`).toBe(-1);
    }
    const ix = g.getIndex() as BufferAttribute;
    const n = (g.getAttribute("position") as BufferAttribute).count;
    let out = -1;
    const ia = ix.array as Uint32Array;
    for (let i = 0; i < ia.length; i++) {
      if (ia[i] >= n) { out = i; break; }
    }
    expect(out, "an index points past the vertex array").toBe(-1);
    layer.dispose();
  });

  it("stands every cap ON its host's roof and never above its measured top", async () => {
    const data = await loaded();
    const form = data.form()!;
    const hosts = hostsOf(data);
    const layer = layerOf(data)!;
    const g = layer.meshes[0].geometry;
    const aH = (g.getAttribute("aH") as BufferAttribute).array as Float32Array;
    const aE = (g.getAttribute("aElev") as BufferAttribute).array as Float32Array;

    /* the floor and the ceiling of the WHOLE layer, taken off the record:
       no vertex may sit under the lowest roof plane that carries a slot, and
       none may sit over the tallest published top. A join on the wrong row
       breaks the ceiling first — a downtown tower's `top` over a two-storey
       roof — and a unit slip breaks both. */
    let loBase = Infinity;
    let hiTop = -Infinity;
    for (let s = 0; s < form.n; s++) {
      const h = hosts.get(form.bi[s]);
      if (!h || !(form.top[s] > h.baseM)) continue;
      loBase = Math.min(loBase, h.baseM);
      hiTop = Math.max(hiTop, form.top[s]);
    }
    expect(loBase).toBeLessThan(hiTop);

    let minH = Infinity;
    let maxH = -Infinity;
    for (let v = 0; v < aH.length; v++) {
      minH = Math.min(minH, aH[v]);
      maxH = Math.max(maxH, aH[v]);
      // the ground is a separate attribute and every vertex carries the same
      // flat field, so a height that leaked into `elev` shows up here
      expect(aE[v]).toBe(FLAT_ELEV_M);
    }
    /* the tray on a cap's top plate drops the deck by the declared parapet,
       so the ceiling is exact but the floor may sit a parapet under the
       lowest base — nothing may go further down than that */
    expect(minH).toBeGreaterThanOrEqual(loBase - 0.9);
    expect(maxH).toBeLessThanOrEqual(hiTop + 1e-3);
    layer.dispose();
  });

  it("emits in a monotone year order inside every camera bucket", async () => {
    const data = await loaded();
    const layer = layerOf(data)!;
    const g = layer.meshes[0].geometry;
    const full = (g.getIndex() as BufferAttribute).count;
    /* the camera gate is a SECOND axis now, so the year is exercised with
       every bucket open — see `caps.ts` §THE GATE IS THE RECORD'S OWN */
    const wide = () => layer.onFrame?.({ cx: 0, cy: 0, scale: 1e6 }, 2);
    const drawn = (): number => {
      let n = 0;
      for (const grp of g.groups) n += grp.count;
      return n;
    };

    /* THE PROPERTY THE GROUPS REST ON, checked as a property: the count drawn
       in year Y must never fall as Y rises, must be 0 before the first cap's
       host exists and must be everything at the settled present. */
    wide();
    layer.onYear?.(undefined);
    wide();
    expect(drawn()).toBe(full);

    let prev = 0;
    for (let y = 1800; y <= 2030; y += 5) {
      layer.onYear?.(y);
      wide();
      const c = drawn();
      expect(c).toBeGreaterThanOrEqual(prev);
      expect(c).toBeLessThanOrEqual(full);
      prev = c;
    }
    expect(prev).toBe(full);

    /* and an undated host is drawn in EVERY year — the roll does not date it,
       so refusing it before some cut-off would be inventing a date */
    layer.onYear?.(-1);
    wide();
    const undated = drawn();
    layer.onYear?.(1000);
    wide();
    expect(drawn()).toBe(undated);
    /* every group is a real, non-overlapping run of the one index buffer */
    let end = 0;
    for (const grp of g.groups) {
      expect(grp.start).toBeGreaterThanOrEqual(end);
      end = grp.start + grp.count;
      expect(end).toBeLessThanOrEqual(full);
    }
    layer.dispose();
  });

  it("gates per cap on the record's own pixel floors, and rewrites Y", async () => {
    const data = await loaded();
    const layer = layerOf(data)!;
    const mesh = layer.meshes[0];
    const g = mesh.geometry;
    const pos = (g.getAttribute("position") as BufferAttribute)
      .array as Float32Array;
    const aH = (g.getAttribute("aH") as BufferAttribute).array as Float32Array;
    const drawn = (): number => {
      let n = 0;
      for (const grp of g.groups) n += grp.count;
      return n;
    };

    layer.onStep?.(0, 3.3, 1.6);
    expect(pos[1]).toBeCloseTo(FLAT_ELEV_M * 3.3 + aH[0] * 1.6, 5);
    layer.onStep?.(2, 2.0, 1.6);
    expect(pos[1]).toBeCloseTo(FLAT_ELEV_M * 2.0 + aH[0] * 1.6, 5);
    // the two exaggerations are DIFFERENT dials, so a single scale cannot fit
    expect(FLAT_ELEV_M * 2.0 + aH[0] * 1.6).not.toBeCloseTo(
      (FLAT_ELEV_M + aH[0]) * 2.0, 5,
    );

    /* THE GATE IS MONOTONE IN THE CAMERA and it is not all-or-nothing: a
       vanishing scale draws nothing, a huge one draws everything, and in
       between the count only ever rises. That is the whole difference from
       the layer-wide step floor this replaced, which had exactly two
       states. */
    const at = (scale: number): number => {
      layer.onFrame?.({ cx: 0, cy: 0, scale }, 2);
      return drawn();
    };
    expect(at(1e-9)).toBe(0);
    const full = at(1e6);
    expect(full).toBeGreaterThan(0);
    let prev = 0;
    let states = 0;
    for (let e = -6; e <= 6; e += 0.25) {
      const c = at(Math.pow(10, e));
      expect(c).toBeGreaterThanOrEqual(prev);
      if (c !== prev) states++;
      prev = c;
    }
    expect(prev).toBe(full);
    expect(states).toBeGreaterThan(2);

    /* AND THE QUANTISATION IS BOUNDED. A bucket opens at its own lowest
       `need`, so a cap can be drawn below its floor by at most the bucket's
       internal spread — never above it. The bound is reported rather than
       assumed, so a change in the record cannot widen it quietly. */
    expect(layer.gateSpread).toBeGreaterThanOrEqual(1);
    expect(layer.gateSpread).toBeLessThan(2);

    /* and the buckets are a dial: one bucket is the old all-or-nothing gate */
    const one = layerOf(data, { gateBuckets: 1 })!;
    expect(one.meshes[0].geometry.groups.length).toBe(1);
    expect(layer.gateSpread).toBeLessThanOrEqual(one.gateSpread);
    layer.dispose();
    one.dispose();
  });

  it("paints every vertex a colour the two published tables can produce", async () => {
    const data = await loaded();
    const buildings = data.manifest.buildings as { palette: string[] };
    const layer = layerOf(data)!;
    const g = layer.meshes[0].geometry;
    const col = (g.getAttribute("color") as BufferAttribute).array as Float32Array;

    /* THE WHOLE COLOUR SURFACE OF THIS LAYER, ENUMERATED. A cap takes its
       sides from the WALL table and its top plate from its own ROOF entry,
       and the plate is a tray, so the roof entry appears three times over —
       raw on the coping, at `DE.innerv` on the parapet's inner face and at
       `DE.deckv` on the deck. Nothing else may appear. That is a stronger
       claim than "the colours look plausible": it fails on a channel swap, on
       a missing sRGB->linear conversion, on a shade index read with the wrong
       stride, and on any colour this layer invented rather than looked up. */
    /* AND THE KEY IS ROUNDED TO FLOAT32, WHICH IS NOT A FUDGE FACTOR.

       The colour attribute is a `Float32Array` — that is what the GPU takes —
       so the number this test reads back has been through a float32 round
       trip, while `Color.setStyle` computes in float64. Keying the two sides
       against each other at six decimals therefore fails whenever a channel
       lands near a rounding boundary, and on this record exactly two of the
       374 distinct colours do: `#e3e1dc` raw, off by 2.7e-8, and `#a3a199` at
       `DE.innerv`, off by 6.4e-9. Both are ~150,000x smaller than one 8-bit
       code (1/255 = 3.9e-3), so they are float noise and nothing else — the
       first run of this test flagged them as "a colour the layer invented".

       `Math.fround` puts BOTH sides in the space the buffer actually stores,
       which keeps the assertion exact rather than loosening it to a
       tolerance: a real channel swap or a missing sRGB->linear conversion is
       still a hard fail, because those move a channel by whole codes. */
    const key = (r: number, gr: number, b: number): string =>
      `${Math.fround(r).toFixed(6)},${Math.fround(gr).toFixed(6)},${Math.fround(b).toFixed(6)}`;
    const c3 = new Color();
    const lin = (hex: string): [number, number, number] => {
      c3.setStyle(hex, SRGBColorSpace);
      return [c3.r, c3.g, c3.b];
    };
    const allowed = new Set<string>();
    const wallKeys = new Set<string>();
    for (const hex of wallPalette()) {
      const k = key(...lin(hex));
      allowed.add(k);
      wallKeys.add(k);
    }
    const deckKeys = new Set<string>();
    for (const hex of roofShadeTable(roofPalette(buildings.palette))) {
      const rgb = lin(hex);
      allowed.add(key(...rgb));
      for (const v of [DE.innerv, DE.deckv]) {
        const k = key(...shadeRGB(rgb, v));
        allowed.add(k);
        if (v === DE.deckv) deckKeys.add(k);
      }
    }

    /* ── AND A SHAFT IS A GRADED WALL, SO ITS COLOURS ARE A SEGMENT ────
       The shaft used to take a wall entry RAW, so every cap colour was an
       exact table key and this test matched exact keys. It no longer is: a
       shaft is graded from `CAP_WBOT` at its foot to `CAP_WTOP` at its head,
       the same grade every wall in the city carries and at the same light
       compensation the fabric applies — which is the whole point, because a
       raw entry made the shaft a DIFFERENT VALUE from the wall under it.

       So the rule generalises rather than loosens. A side vertex must still
       be a published wall entry and nothing else; what it may now be is that
       entry times ONE factor, the SAME on all three channels, inside the
       declared grade. A channel swap breaks the equal-ratio test, a wrong
       entry has no factor that fits, and a missing sRGB conversion lands far
       outside the range — every failure this test was written to catch is
       still a hard failure. */
    const wallLin = wallPalette().map(lin);
    const gradedWall = (r: number, g: number, b: number): boolean => {
      for (const e of wallLin) {
        const m = Math.max(e[0], e[1], e[2]);
        if (!(m > 0)) continue;
        const k = (m === e[0] ? r : m === e[1] ? g : b) / m;
        if (!(k >= CAP_WBOT - 1e-6 && k <= CAP_WTOP + 1e-6)) continue;
        if (
          Math.abs(e[0] * k - r) < 1e-5 &&
          Math.abs(e[1] * k - g) < 1e-5 &&
          Math.abs(e[2] * k - b) < 1e-5
        ) {
          return true;
        }
      }
      return false;
    };

    let sawWall = 0;
    let sawDeck = 0;
    let stray = "";
    for (let v = 0; v < col.length; v += 3) {
      const k = key(col[v], col[v + 1], col[v + 2]);
      if (!allowed.has(k) && !gradedWall(col[v], col[v + 1], col[v + 2])) {
        stray = k;
        break;
      }
      if (wallKeys.has(k) || gradedWall(col[v], col[v + 1], col[v + 2])) sawWall++;
      if (deckKeys.has(k)) sawDeck++;
    }
    expect(stray, "a vertex colour neither table can produce").toBe("");
    // and both halves are really used: a cap that is all wall has no plate,
    // and a cap that is all roof is a stub in the wrong material
    expect(sawWall).toBeGreaterThan(0);
    expect(sawDeck).toBeGreaterThan(0);
    expect(RSHADE.length).toBe(4);
    layer.dispose();
  });

  it("wears a one-sided material, and every published curve earns it", async () => {
    const data = await loaded();
    const layer = layerOf(data)!;

    /* THE MATERIAL IS THE CLAIM, so it is asserted rather than described.
       `FrontSide` is three's default and this layer asks for nothing, which
       is only correct while every face `capForm` emits is wound outward —
       `roof-form.test.ts` §winding proves that for the shape FAMILIES, and
       this proves it for the curves THIS RECORD ACTUALLY PUBLISHES, so a
       seventh profile appearing in a future encode cannot slip a backwards
       band past a material that will not draw it. */
    /* one material, repeated once per camera bucket — see `caps.ts` §ONE
       MATERIAL, `NB` TIMES OVER */
    const mats = layer.meshes[0].material as MeshLambertMaterial[];
    expect(Array.isArray(mats)).toBe(true);
    for (const m of mats) expect(m).toBe(mats[0]);
    const mat = mats[0];
    expect(mat.side).toBe(FrontSide);
    expect(mat.vertexColors).toBe(true);
    expect(mat.flatShading).toBe(true);

    const form = data.form()!;
    // the file's profile 0 is `prism`, the identity, and no cap row uses it
    expect(form.profiles.length).toBeGreaterThan(1);
    for (let pi = 0; pi < form.profiles.length; pi++) {
      const V: number[][] = [];
      const T: number[][] = [];
      const sink: FormSink = {
        vertex(x, y, e, h) { V.push([x, h, y]); return V.length - 1; },
        tri(a, b, c) { T.push([a, b, c]); },
      };
      // one cap on the axis, at a lift and radius inside the published range
      // (measured: radius 4.53 m to 48.31 m, lift 0.07 m to 166.32 m)
      const built = capForm(
        sink,
        { cx: 0, cy: 0, baseM: 0, topM: 30, rad: 8, ang: 0, n: form.octN,
          profile: pi > 0 ? form.profiles[pi] : null },
        0, [0.5, 0.5, 0.5],
      );
      expect(built, `profile ${pi} built nothing`).toBe(true);
      let down = 0;
      for (const [a, b, c] of T) {
        const A = V[a], B = V[b], C = V[c];
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const n = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        const len = Math.hypot(n[0], n[1], n[2]);
        // a band that has closed to a point has no area and no normal
        if (len < 1e-9) continue;
        const ny = n[1] / len;
        const cx = (A[0] + B[0] + C[0]) / 3;
        const cz = (A[2] + B[2] + C[2]) / 3;
        const rl = Math.hypot(cx, cz) || 1;
        const radial = (n[0] * cx + n[2] * cz) / (len * rl);
        // a cap has no underside: nothing may face straight down, and nothing
        // that is not the parapet's inner ring may face the axis
        if (ny < -0.999) down++;
        else if (radial < 0 && Math.abs(ny) <= 0.999) {
          // the inner ring lives on the top plate, under the coping — any
          // inward face lower than that is a band wound backwards
          const hs = [A[1], B[1], C[1]];
          expect(Math.min(...hs), `profile ${pi}: an inward face below the plate`)
            .toBeGreaterThan(30 - 1 - DE.parapet);
        }
      }
      expect(down, `profile ${pi} faces downward`).toBe(0);
    }
    layer.dispose();
  });

  it("returns null where the record holds no slot table", async () => {
    /* a city whose manifest carries no `form` chunk is not an error — the
       caller draws the prisms alone, which is what the page did before this
       chunk existed */
    const bare = (async (url: string) => {
      const s = String(url);
      if (s.endsWith("manifest.json")) {
        const m = JSON.parse(readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8"));
        m.chunks = m.chunks.filter(
          (c: { kind: string }) => c.kind !== "form" && c.kind !== "cap",
        );
        return new Response(JSON.stringify(m), {
          headers: { "content-type": "application/json" },
        });
      }
      return diskFetch(url as unknown as string);
    }) as unknown as typeof fetch;
    const data = await CityData.load({ fetchImpl: bare });
    await data.loadBase();
    expect(layerOf(data)).toBeNull();
  });
});
