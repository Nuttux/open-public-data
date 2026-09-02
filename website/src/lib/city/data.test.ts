import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import {
  CityData,
  crc32,
  decodeChunk,
  type CityManifest,
  type CityView,
} from "./data";

const DATA_DIR = path.resolve(__dirname, "../../../public/data/us/sf/city");
const have = existsSync(path.join(DATA_DIR, "manifest.json"));
const d = have ? describe : describe.skip;

const readChunk = (key: string): ArrayBuffer => {
  const b = readFileSync(path.join(DATA_DIR, `${key}.qc`));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** a tier bundle off disk, for the stubs that serve their chunks by hand */
const readBundle = (url: string): ArrayBuffer => {
  const rel = url.replace(/^.*\/data\/us\/sf\/city\/?/, "");
  const b = readFileSync(path.join(DATA_DIR, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const manifest = (): CityManifest =>
  JSON.parse(readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8")) as CityManifest;

describe("crc32", () => {
  it("agrees with the reference vector zlib.crc32 produces", () => {
    // "123456789" -> 0xCBF43926 is the CRC-32/IEEE check value. If this ever
    // fails, the encoder and the decoder are computing different numbers and
    // every chunk in the record will be rejected.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

d("decodeChunk guards", () => {
  it("refuses an HTML error page served under a chunk name", () => {
    // The failure this project actually had: a cache holding HTML error pages
    // under a `.gz` name, which decoded to nothing and was noticed much later.
    const html = new TextEncoder().encode("<!DOCTYPE html>\n<html><body>502</body></html>");
    const buf = new ArrayBuffer(html.byteLength);
    new Uint8Array(buf).set(html);
    expect(() => decodeChunk(buf)).toThrow(/not a chunk/);
  });

  it("refuses a truncated body", () => {
    const full = readChunk("base/terrain");
    expect(() => decodeChunk(full.slice(0, full.byteLength - 1))).toThrow(/chunk length/);
  });

  it("refuses one flipped byte", () => {
    const full = readChunk("base/terrain");
    const bad = full.slice(0);
    const u = new Uint8Array(bad);
    u[u.length - 1] ^= 0xff;
    expect(() => decodeChunk(bad)).toThrow(/crc/);
  });

  it("refuses a valid chunk served under the wrong name", () => {
    expect(() => decodeChunk(readChunk("base/terrain"), "base/blocks"))
      .toThrow(/chunk identity/);
  });
});

d("the manifest and the chunks agree", () => {
  it("every chunk on disk decodes, matches its manifest entry, and is 8-byte aligned", () => {
    const m = manifest();
    expect(m.format).toBe("qc/1");
    expect(m.chunks.length).toBeGreaterThan(500);
    let checked = 0;
    for (const e of m.chunks) {
      const buf = readChunk(e.k);
      expect(buf.byteLength, e.k).toBe(e.b);
      const c = decodeChunk(buf, e.k);
      expect(c.kind, e.k).toBe(e.kind);
      const schema = m.kinds[e.kind];
      expect(schema, e.kind).toBeDefined();
      expect(Object.keys(c.fields).sort()).toEqual(
        schema.fields.map((f) => f.n).sort(),
      );
      for (const f of schema.fields) {
        const arr = c.fields[f.n];
        expect(arr, `${e.k}.${f.n}`).toBeDefined();
        // zero-copy: the view must sit inside the fetched buffer
        expect(arr.buffer).toBe(buf);
        expect(arr.byteOffset % arr.BYTES_PER_ELEMENT).toBe(0);
      }
      checked++;
    }
    expect(checked).toBe(m.chunks.length);
  });

  it("every field of every kind names a source that exists", () => {
    const m = manifest();
    for (const [kind, schema] of Object.entries(m.kinds)) {
      for (const f of schema.fields) {
        const key = schema.provenance[f.n];
        expect(key, `${kind}.${f.n} has no provenance`).toBeDefined();
        expect(m.sources[key], `${kind}.${f.n} -> ${key}`).toBeDefined();
      }
    }
  });

  it("no building appears in two chunks, and every one appears in one", () => {
    const m = manifest();
    const n = (m.buildings as { n: number }).n;
    const seen = new Uint8Array(n);
    for (const e of m.chunks) {
      if (e.kind !== "bldg") continue;
      const gid = decodeChunk(readChunk(e.k), e.k).fields.gid as Uint32Array;
      for (const g of gid) {
        expect(seen[g], `building ${g} is in more than one chunk`).toBe(0);
        seen[g] = 1;
      }
    }
    expect(seen.every((v) => v === 1)).toBe(true);
  });
});

d("the tiling does what the zoom ladder asks of it", () => {
  // The view is a DIAMOND in world space: at the 315 deg bearing the screen axes
  // are the world axes rotated 45 degrees, so a screen rect of W x H px bounds
  // (x - y) to W / (1.2247 * cam.scale) and (x + y) to H / (0.7071 * cam.scale).
  // `across` and `down` are those two spans, straight out of lod/BLOCK-L.md.
  const diamond = (cx: number, cy: number, across: number, down: number): CityView["quad"] => {
    const corner = (u: number, v: number): [number, number] =>
      [cx + (u + v) / 2, cy + (v - u) / 2];
    const a = across / 2;
    const d = down / 2;
    return [corner(a, d), corner(a, -d), corner(-a, -d), corner(-a, d)];
  };

  const bytesFor = (m: CityManifest, view: CityView): { raw: number; gz: number; n: number } => {
    let raw = 0, gz = 0, n = 0;
    const cd = new CityDataStub(m);
    for (const k of cd.keysFor(view)) {
      const e = m.chunks.find((c) => c.k === k);
      if (!e) continue;
      raw += e.b; gz += e.gz; n++;
    }
    return { raw, gz, n };
  };

  class CityDataStub {
    constructor(private readonly m: CityManifest) {}
    keysFor(view: CityView): string[] {
      // exercise the real implementation through a CityData built on the manifest
      return realKeysFor(this.m, view);
    }
  }

  let realKeysFor: (m: CityManifest, v: CityView) => string[];

  it("wires up", async () => {
    const m = manifest();
    const cd = await CityData.load({
      fetchImpl: (async () =>
        new Response(JSON.stringify(m), { headers: { "content-type": "application/json" } })
      ) as unknown as typeof fetch,
    });
    realKeysFor = (_m, v) => cd.keysFor(v);
    expect(cd.manifest.chunks.length).toBe(m.chunks.length);
  });

  it("the whole-city frame asks for the base tier and nothing per-cell", () => {
    const m = manifest();
    // z = 1: below LOD_Z0 = 1.55, so no footprints, no facades, no streets.
    const view: CityView = { z: 1, quad: diamond(0, 0, 21128, 23888) };
    const keys = realKeysFor(m, view);
    for (const k of keys) {
      const e = m.chunks.find((c) => c.k === k);
      expect(e?.tier, `${k} should not be needed at whole-city zoom`).toBe("base");
    }
    const b = bytesFor(m, view);
    expect(b.n).toBe(m.chunks.filter((c) => c.tier === "base").length);
    /*
     * THIS CEILING MOVED IN BLOCK P1b, AND IT MOVED BECAUSE THE FRAME GREW.
     *
     * P1 asserted 600 KB, against a measured 573,704 gzipped over 8 chunks.
     * P1b added four: the surround raster (59,923 gz) — Marin, the East Bay,
     * the peninsula and the islands, which were BLANK PAPER before — and the
     * eleven authored heroes, the 68 shaped caps and the Golden Gate deck
     * (15,425 gz together). All four are drawn AT THE WHOLE-CITY FRAME, so by
     * the rule this layer is built to — *nothing is fetched before the camera
     * can show it* — they belong in the base tier and nowhere else.
     *
     * The claim being defended is not a constant, it is a ratio: the first
     * paint is a small fraction of the 6,588,120 gzipped bytes the mock parses
     * before its first frame. At 649,052 for the tier and 681,661 including
     * the manifest and the hero sidecar, that is still 9.7x less. The ceiling
     * is set so a careless addition still trips it.
     *
     * AND IT MOVED AGAIN ON 2026-08-24, for a measured reason rather than a
     * careless one. `h` went from u8 to u16 because 255 m is below the top of
     * this city — the Transamerica Pyramid is 260.0 m and drew at 255, and
     * Salesforce Tower is 326.1. `base/solo` carries a height for each of the
     * 15,265 solo buildings, so the widening costs **+2,185 gzipped bytes
     * there**; `base/massing` moved +3,752 because the block rollup reads the
     * heights that changed. +5,695 in total, against a tier that was already
     * within 7 KB of the old ceiling.
     *
     * The ratio is what to watch, and it is the assertion two lines down. It
     * is now 9.17x and it was 9.7x — the next addition to this tier should
     * make that number the argument, not this one.
     */
    expect(b.gz).toBeLessThan(740 * 1024);
    expect(b.gz).toBeGreaterThan(600 * 1024); // if this falls, something was dropped
    const mock = 6_588_120;
    expect(mock / b.gz).toBeGreaterThan(9);
  });

  it("the block frame asks for a handful of cells, not the city", () => {
    const m = manifest();
    const view: CityView = { z: 7.2, quad: diamond(1000, 0, 2935, 3318) };
    const keys = realKeysFor(m, view);
    const cells = keys.filter((k) => k.startsWith("bldg/"));
    expect(cells.length).toBeGreaterThan(0);
    // MEASURED, not chosen: the block frame's diamond is 4.87 km2 and its
    // axis-aligned bound is 3,127 m, so it spans 4 x 4 cells of which the
    // separating-axis test rejects some corners. Swept over 406 view centres at
    // 500 m spacing across the built city, the count is 9 median and 14 worst.
    // Raising this number means the cull got looser; say why in the diff.
    expect(cells.length).toBeLessThanOrEqual(14);
    const total = m.chunks.filter((c) => c.kind === "bldg" && c.k.startsWith("bldg/")).length;
    expect(cells.length).toBeLessThan(total / 9);
  });

  it("a chunk below the camera's zoom is never asked for", () => {
    const m = manifest();
    const view: CityView = { z: 1.2, quad: diamond(0, 0, 17607, 19907) };
    for (const k of realKeysFor(m, view)) {
      const e = m.chunks.find((c) => c.k === k);
      expect(e!.minZ).toBeLessThanOrEqual(1.2);
    }
  });
});

d("the request policy cancels what the camera has left behind", () => {
  // a square view, half-side `s` — the shape does not matter here, only that the
  // two views are disjoint
  const diamond = (cx: number, cy: number, s: number): CityView["quad"] =>
    [[cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s], [cx - s, cy - s]];

  it("aborts an in-flight chunk the new view cannot show", async () => {
    const m = manifest();
    const started: string[] = [];
    const aborted: string[] = [];
    const pending = new Map<string, () => void>();

    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("manifest.json")) {
        return new Response(JSON.stringify(m), {
          headers: { "content-type": "application/json" },
        });
      }
      /* the base tier arrives as one bundle now — `data.ts` §ONE FILE A TIER —
         so serve it off disk and let this test go on watching what happens to
         the PER-CHUNK requests behind it, which is what it is about */
      if (u.endsWith(".qcb")) return new Response(readBundle(u));
      const key = u.slice(u.indexOf("/city/") + 6, -3);
      started.push(key);
      return await new Promise<Response>((resolve, reject) => {
        pending.set(key, () => resolve(new Response(readChunk(key))));
        init?.signal?.addEventListener("abort", () => {
          aborted.push(key);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const cd = await CityData.load({ fetchImpl, concurrency: 4 });
    // the base tier is fetched first and pinned — it IS the first paint — so let
    // it land before testing what happens to the detail requests behind it
    const baseKeys = m.chunks.filter((c) => c.tier === "base").map((c) => c.k);
    const basePromise = cd.loadBase();
    for (const k of baseKeys) pending.get(k)?.();
    await basePromise;
    started.length = 0;

    // look at the far west at street zoom, then jump to the far east
    cd.setView({ z: 7.2, quad: diamond(-5000, -3000, 1500) });
    const west = started.filter((k) => k.startsWith("bldg/"));
    expect(west.length).toBeGreaterThan(0);

    cd.setView({ z: 7.2, quad: diamond(5000, 2000, 1500) });
    await Promise.resolve();
    await Promise.resolve();
    expect(aborted.length, "the westward requests should have been cancelled")
      .toBeGreaterThan(0);
    for (const k of aborted) expect(west).toContain(k);
    expect(cd.stats().cancelled).toBe(aborted.length);
    for (const [, resolve] of pending) resolve();
  });

  it("holds the base tier across a pan and never re-requests it", async () => {
    const m = manifest();
    const asked = new Map<string, number>();
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("manifest.json")) {
        return new Response(JSON.stringify(m), {
          headers: { "content-type": "application/json" },
        });
      }
      if (u.endsWith(".qcb")) {
        asked.set(u.slice(u.indexOf("/city/") + 6), (asked.get(u.slice(u.indexOf("/city/") + 6)) ?? 0) + 1);
        return new Response(readBundle(u));
      }
      const key = u.slice(u.indexOf("/city/") + 6, -3);
      asked.set(key, (asked.get(key) ?? 0) + 1);
      return new Response(readChunk(key));
    }) as unknown as typeof fetch;

    const cd = await CityData.load({ fetchImpl, concurrency: 32 });
    await cd.loadBase();
    for (const e of m.chunks) {
      if (e.tier === "base") expect(cd.has(e.k), e.k).toBe(true);
    }
    cd.setView({ z: 7.2, quad: diamond(-4000, -2000, 1200) });
    cd.setView({ z: 7.2, quad: diamond(4000, 2000, 1200) });
    /* ── AND IT IS ONE REQUEST, NOT SIXTEEN ────────────────────────────────
       The claim has not changed — the base tier is fetched once and survives
       every pan — but what "once" looks like on the wire has: `data.ts`
       §ONE FILE A TIER, NOT SEVEN HUNDRED fetches the tier as a single
       bundle. So the count is asserted against whichever the city ships, and
       the point of the test is the same either way: nothing is asked for
       twice, and no base chunk is asked for again after a pan. */
    const bundle = m.bundles?.base;
    if (bundle) {
      expect(asked.get(bundle.file), bundle.file).toBe(1);
      for (const e of m.chunks) {
        if (e.tier === "base") expect(asked.has(e.k), e.k).toBe(false);
      }
    } else {
      for (const e of m.chunks) {
        if (e.tier === "base") expect(asked.get(e.k), e.k).toBe(1);
      }
    }
  });

  it("the bundle and the per-chunk path decode to the same bytes", async () => {
    /* THE ONE THING THE BUNDLE COULD GET WRONG is an offset, and an offset
       that is wrong by any amount at all fails `decodeChunk`'s magic, its
       length check or its CRC. This loads the base tier both ways off the
       same disk and compares every field of every chunk. */
    const m = manifest();
    if (!m.bundles?.base) return;
    const noBundles = { ...m, bundles: undefined } as unknown as CityManifest;
    const serve = (mf: CityManifest) =>
      (async (url: string | URL) => {
        const u = String(url);
        if (u.endsWith("manifest.json")) {
          return new Response(JSON.stringify(mf), {
            headers: { "content-type": "application/json" },
          });
        }
        if (u.endsWith(".qcb")) return new Response(readBundle(u));
        return new Response(readChunk(u.slice(u.indexOf("/city/") + 6, -3)));
      }) as unknown as typeof fetch;

    const viaBundle = await CityData.load({ fetchImpl: serve(m) });
    await viaBundle.loadBase();
    const viaChunks = await CityData.load({ fetchImpl: serve(noBundles) });
    await viaChunks.loadBase();

    const baseKeys = m.chunks.filter((c) => c.tier === "base").map((c) => c.k);
    expect(baseKeys.length).toBeGreaterThan(0);
    for (const k of baseKeys) {
      const a = viaBundle.get(k);
      const b = viaChunks.get(k);
      expect(a, k).toBeTruthy();
      expect(b, k).toBeTruthy();
      expect(a!.bytes, k).toBe(b!.bytes);
      expect(Object.keys(a!.fields).sort(), k).toEqual(Object.keys(b!.fields).sort());
      for (const f of Object.keys(a!.fields)) {
        const av = a!.fields[f] as ArrayLike<number>;
        const bv = b!.fields[f] as ArrayLike<number>;
        expect(av.length, `${k}.${f}`).toBe(bv.length);
        for (let i = 0; i < av.length; i++) {
          if (av[i] !== bv[i]) {
            throw new Error(`${k}.${f}[${i}]: bundle ${av[i]} vs chunk ${bv[i]}`);
          }
        }
      }
    }
  });
});

d("provenance survives the move", () => {
  it("every building field can name the dataset it came from", async () => {
    const m = manifest();
    const cd = await CityData.load({
      fetchImpl: (async () => new Response(JSON.stringify(m))) as unknown as typeof fetch,
    });
    expect(cd.provenanceOf("bldg", "h")?.dataset).toBe("ynuv-fyni");
    expect(cd.provenanceOf("bldg", "yr")?.dataset).toBe("wv5m-vpq2");
    expect(cd.provenanceOf("blocks", "vx")?.dataset).toBe("acdm-wktn");
    expect(cd.provenanceOf("water", "dep")?.publisher).toBe("NOAA NCEI");
  });

  it("the tree grid's fold is recorded as fixed, not quietly dropped", () => {
    const m = manifest();
    // DATA.md §5. If this ever stops being true because world-data.js was
    // regenerated with a wider grid, DELETE this test and the flag together —
    // do not loosen it.
    expect(m.sources.tree.defect).toMatch(/FIXED 2026-08-23/);
    expect(m.sources.tree.defect).toMatch(/GW is now 600/);
    expect(m.sources.canopy.defect).toMatch(/FIXED 2026-08-23/);
  });
});

// ── Block P1b ───────────────────────────────────────────────────────────────

/** Serve the real encoder output off disk, so these exercise the true bytes. */
const diskFetch = (async (url: string) => {
  const rel = String(url).replace(/^.*\/data\/us\/sf\/city\/?/, "");
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

const loaded = async () => {
  const cd = await CityData.load({ fetchImpl: diskFetch });
  await cd.loadBase();
  return cd;
};

d("the surround raster", () => {
  it("decodes, and its cell is the 110.01 x 139.15 m the hillshade needs", async () => {
    const cd = await loaded();
    const s = cd.surround();
    expect(s).not.toBeNull();
    // THE NUMBER THE UNITS BUG WAS ABOUT. The shipped hillshade divided by 1.8
    // against this cell, over-reading slope 61x across and 77x down. It is in
    // the manifest so nothing downstream has to derive it from the bbox.
    expect(s!.cellW).toBeCloseTo(110.0096, 3);
    expect(s!.cellH).toBeCloseTo(139.15, 3);
    expect(s!.XW).toBe(416);
    expect(s!.XH).toBe(280);
  });

  it("the node lattice is XW+1 by XH+1 and spans the published frame", async () => {
    const cd = await loaded();
    const s = cd.surround()!;
    expect(s.mx.length).toBe(s.XW + 1);
    expect(s.my.length).toBe(s.XH + 1);
    // the extent gen_context.py's own bbox maps to, and the frame the
    // bathymetry shares: it reaches well outside the 1024 m city grid.
    expect(s.mx[0]).toBeCloseTo(-16017.4, 0);
    expect(s.mx[s.XW]).toBeCloseTo(29746.6, 0);
    expect(s.my[0]).toBeCloseTo(-17811.2, 0);
    expect(s.my[s.XH]).toBeCloseTo(21150.8, 0);
    for (let i = 1; i <= s.XW; i++) expect(s.mx[i] - s.mx[i - 1]).toBeCloseTo(s.cellW, 6);
  });

  it("the land bitset is read MSB first and counts what the encoder counted", async () => {
    const cd = await loaded();
    const s = cd.surround()!;
    // A bitset read the other way round decodes silently and wrongly, which is
    // the whole reason §1 has a magic and a CRC. Count, do not assume.
    let land = 0;
    let own = 0;
    for (let j = 0; j < s.XH; j++) {
      for (let i = 0; i < s.XW; i++) {
        if (s.isLand(i, j)) land++;
        if (s.isOwn(i, j)) own++;
      }
    }
    expect(land).toBe(s.landCells);
    expect(own).toBe(s.ownCells);
    expect(land).toBe(63352);
    expect(own).toBe(56330);
  });

  it("every `own` cell is a `land` cell — the paint list cannot invent land", async () => {
    const cd = await loaded();
    const s = cd.surround()!;
    for (let j = 0; j < s.XH; j++) {
      for (let i = 0; i < s.XW; i++) {
        if (s.isOwn(i, j)) expect(s.isLand(i, j)).toBe(true);
      }
    }
  });

  it("elevation is zero on water and reaches the Marin and East Bay hills", async () => {
    const cd = await loaded();
    const s = cd.surround()!;
    let maxZ = 0;
    let wetNonZero = 0;
    for (let j = 0; j < s.XH; j++) {
      for (let i = 0; i < s.XW; i++) {
        const z = s.z(i, j);
        if (z > maxZ) maxZ = z;
        if (!s.isLand(i, j) && z > 0) wetNonZero++;
      }
    }
    // gen_context.py zeroes elevation wherever the hydrography says water.
    expect(wetNonZero).toBe(0);
    expect(maxZ).toBeGreaterThan(400);
    expect(maxZ).toBeLessThanOrEqual(s.zmax);
  });

  it("surroundOrder is far-to-near over the `own` cells and no others", async () => {
    const cd = await loaded();
    const s = cd.surround()!;
    // drawSurround walks `order` and applies NO land test of its own, so this
    // list IS the rule "do not draw a second, coarser copy of San Francisco".
    const depth = (x: number, y: number) => x + y;
    const ord = s.surroundOrder(depth);
    expect(ord.length).toBe(s.ownCells);
    let prev = Infinity;
    for (let n = 0; n < ord.length; n++) {
      const k = ord[n];
      const i = k % s.XW;
      const j = (k / s.XW) | 0;
      expect(s.isOwn(i, j)).toBe(true);
      const [cx, cy] = s.centre(i, j);
      const dd = depth(cx, cy);
      expect(dd).toBeLessThanOrEqual(prev + 1e-6);
      prev = dd;
    }
  });

  it("names a public-domain federal source for every field", async () => {
    const cd = await loaded();
    for (const f of ["dem", "land", "own", "segs"]) {
      const p = cd.provenanceOf("surround", f);
      expect(p).toBeDefined();
      expect(String(p!.licence)).toMatch(/public domain/i);
    }
    expect(cd.provenanceOf("surround", "dem")!.publisher).toBe("USGS");
    expect(cd.provenanceOf("surround", "land")!.publisher).toBe("US Census Bureau");
  });

  it("the shoreline segments name nodes that exist", async () => {
    const cd = await loaded();
    const s = cd.surround()!;
    expect(s.segs.length % 4).toBe(0);
    expect(s.segs.length / 4).toBe(2919);
    for (let k = 0; k < s.segs.length; k += 4) {
      expect(s.segs[k]).toBeLessThanOrEqual(s.XW);
      expect(s.segs[k + 2]).toBeLessThanOrEqual(s.XW);
      expect(s.segs[k + 1]).toBeLessThanOrEqual(s.XH);
      expect(s.segs[k + 3]).toBeLessThanOrEqual(s.XH);
    }
  });
});

d("the authored landmarks", () => {
  it("gives thirteen heroes, 134 parts and 3,421 ring vertices", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    expect(t).not.toBeNull();
    /* ELEVEN OF THESE COME OUT OF THE MOCK and three do not — the third is
       `internetarchive`, whose eleven parts (four bands, a portico and six
       `g:"col"` shafts) are `build_temple`'s, DRAW.md §44.2. `emit_heroes.py`
       merges the register authored in `pipeline/scripts/us_sf_places/` on top
       of the eleven `encode_city_chunks.py` moves out of
       `wonder/hero-data.js`, and it proves the eleven survive a read/re-encode
       round trip byte for byte before it adds anything. So this assertion is a
       statement about the MERGED register and the manifest's own
       `landmarks.authoredHere` says which rows are whose. DRAW.md §21.9. */
    expect(t!.heroes.length).toBe(14);
    /* 145 -> 147 when the Transamerica grew its two wing shafts */
    expect(t!.heroes.reduce((a, h) => a + h.parts.length, 0)).toBe(147);
    expect(t!.heroes.reduce(
      (a, h) => a + h.parts.reduce((b, p) => b + p.rx.length, 0), 0)).toBe(3549);
  });

  it("nothing stands above the MEASURED top — the gate's own ceiling", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    // landmarks.ts: "Every generated vertex of every part falls inside the
    // MEASURED footprint, and nothing stands above the MEASURED top." The
    // second half is checkable against the table alone, so it is checked here.
    for (const h of t!.heroes) {
      for (const p of h.parts) {
        expect(p.z1).toBeLessThanOrEqual(h.top + 1e-9);
        expect(p.z0).toBeLessThanOrEqual(p.z1 + 1e-9);
      }
    }
  });

  it("the centimetre store round-trips every authored height exactly", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    // Heights are stored as i32 centimetres, not f32, because 117.6 m is not
    // an f32 and 106 of the 127 z1 values are not either. Exactness is the
    // whole point of that choice, so it is asserted.
    for (const h of t!.heroes) {
      for (const p of h.parts) {
        expect(Math.abs(p.z0 * 100 - Math.round(p.z0 * 100))).toBeLessThan(1e-6);
        expect(Math.abs(p.z1 * 100 - Math.round(p.z1 * 100))).toBeLessThan(1e-6);
      }
    }
    const ch = t!.heroes.find((h) => h.key === "cityhall")!;
    expect(ch.top).toBe(88);
    expect(ch.zr).toBe(26);
  });

  it("City Hall's footprint is the DRAWN ring's area, and says so", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    const ch = t!.heroes.find((h) => h.key === "cityhall")!;
    // The published DataSF ynuv-fyni ring is 11,205.92 m2; after the mock's own
    // 1 m vertex quantiser (BLDG.q = 1.0) it is 11,251.5, and the containment
    // gate is stated against the ring the page draws. So this field is the
    // quantised one, on purpose. 11,177 m2 — in an older write-up — is neither.
    expect(ch.ms.a).toBe(11251.5);
    expect(ch.ms.nv).toBe(26);
    const note = String(
      (cd.manifest.landmarks as Record<string, unknown>).msAreaNote ?? "");
    expect(note).toMatch(/11,205\.92/);
    expect(note).toMatch(/11,251\.5/);
  });

  it("Sutro Tower alone is granted the convex-hull reference, with its reason", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    const hulled = t!.heroes.filter((h) => h.hull);
    expect(hulled.map((h) => h.key)).toEqual(["sutro"]);
    // The relaxation travels with the reason or it is just an exception.
    expect(hulled[0].hullReason).toMatch(/three open steel legs/);
  });

  it("carries the anchor for the three heroes that are not solos", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    // part3.html takes the anchor from UX[bi] — the footprint's vertex mean —
    // but the Conservatory, the Dutch Windmill and the Peace Pagoda are not in
    // base/solo, so their rings do not arrive until z >= 1.55. The anchor ships
    // on the hero instead, and every hero has a finite one at first paint.
    expect(cd.manifest.landmarks).toBeDefined();
    const notSolo = (cd.manifest.landmarks as Record<string, unknown>).notSolo as string[];
    expect(notSolo.sort()).toEqual(["conservatory", "dutchmill", "pagoda"]);
    for (const h of t!.heroes) {
      expect(Number.isFinite(h.ax)).toBe(true);
      expect(Number.isFinite(h.ay)).toBe(true);
    }
  });

  it("says a hero is not to scale, in the file's own words", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    expect(t!.note).toMatch(/EMPHASIS, not to scale/);
    const p = cd.provenanceOf("hero", "rx");
    expect(String(p!.not_measured)).toMatch(/NOT TO SCALE/);
    // and the measured record travels on every hero, which is what the page states
    for (const h of t!.heroes) {
      expect(h.measured).toMatch(/Footprint/);
      expect(h.anchor.length).toBeGreaterThan(10);
      expect(h.yearSource.length).toBeGreaterThan(4);
    }
  });

  it("the pitch sentinel means one opening, not a pitch of minus one", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    const pitches = t!.heroes.flatMap((h) => h.parts.map((p) => p.pitch));
    // the file writes 1e9; it decodes to Infinity, never to a negative metre
    expect(pitches.filter((p) => p === Infinity).length).toBe(3);
    for (const p of pitches) expect(p).toBeGreaterThanOrEqual(0);
  });

  it("gives the shaped caps whose form slot survived, none of them the identity profile", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    // render-data.js authors 68. A cap is a profile swept around its building's
    // SECOND SOLID, and nine of those slots were derived from a LiDAR median
    // that the Tall Building Inventory's published height_ft has replaced — a
    // step at 106.9 m inside a building now drawn 260.0 m tall is a step the
    // Transamerica Pyramid does not have. Those slots are dropped and the
    // eight caps sitting on them go with them: they gain their published
    // height and lose a shaped top. The manifest carries both counts.
    const dropped = (cd.manifest as unknown as {
      form: { droppedStaleStep?: number };
    }).form.droppedStaleStep ?? 0;
    // TEN since the height byte was widened to u16: the Transamerica Pyramid
    // stopped drawing at the old 255 m ceiling and went to its published
    // 260.0, which put one more derived step underneath its own roof.
    expect(dropped).toBe(10);
    expect(t!.caps.length).toBe(59);
    // profile 0 is `prism` — the identity — and a cap that is a prism is not a cap
    expect(t!.caps.every((c) => c.profile !== 0)).toBe(true);
    expect(new Set(t!.caps.map((c) => c.profileName))).toEqual(
      new Set(["dome", "spire", "campanile", "crown", "arcade"]));
    for (const p of t!.capProfiles) {
      for (let i = 1; i < p.pts.length; i++) {
        expect(p.pts[i].u).toBeGreaterThanOrEqual(p.pts[i - 1].u);
      }
      for (const q of p.pts) expect(q.s).toBeGreaterThanOrEqual(0);
    }
  });

  it("the Golden Gate deck is dated 1937, the year it existed", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    const b = t!.bridge!;
    // 1933 is when construction BEGAN — rzic-39gi's `yearbuilt`. 1937 is the
    // NBI's completion and opening, and a map showing where a bridge IS wants
    // the year it existed. landmarks.ts GGB.year is 1937 and stays 1937.
    expect(b.year).toBe(1937);
    expect(b.yearLandmark).toBe(1933);
    expect(b.ring.length).toBe(5);
    expect(b.towers.length).toBe(2);
  });

  it("both towers fall on the published deck, inside the file's own precision", async () => {
    const cd = await loaded();
    const t = await cd.landmarks();
    const b = t!.bridge!;
    // GGB_TOWER_TOL_M = 31.0 in landmarks.ts: the FAA file gives its
    // coordinates to the whole arc-second, which is 31 m of latitude here.
    const seg = (p: readonly [number, number],
                 a: readonly [number, number], c: readonly [number, number]) => {
      const vx = c[0] - a[0], vy = c[1] - a[1];
      const L = vx * vx + vy * vy;
      const u = L === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L));
      return Math.hypot(p[0] - (a[0] + vx * u), p[1] - (a[1] + vy * u));
    };
    for (const tw of b.towers) {
      let best = Infinity;
      for (let k = 0; k + 1 < b.ring.length; k++) {
        best = Math.min(best, seg(tw, b.ring[k], b.ring[k + 1]));
      }
      expect(best).toBeLessThanOrEqual(31.0);
    }
    expect(Math.hypot(b.towers[0][0] - b.towers[1][0],
                      b.towers[0][1] - b.towers[1][1])).toBeCloseTo(1304.4, 0);
  });

  it("the deck carries no money and says why", async () => {
    const cd = await loaded();
    const p = cd.provenanceOf("bridge", "rx");
    // The corpus decision `golden-gate-bridge` has geometry_source NOT IN
    // RECORD, so nothing may imply this line is that decision's position.
    expect(String(p!.not_measured)).toMatch(/NOT IN RECORD/);
    expect(String(p!.not_measured)).toMatch(/no money/);
  });

  it("the federal sources carry their URL, retrieval date and SHA-256", async () => {
    const cd = await loaded();
    for (const f of ["tx", "ty"]) {
      const p = cd.provenanceOf("bridge", f)!;
      expect(p.url).toMatch(/^https:\/\//);
      expect(String(p.sha256)).toMatch(/^[0-9a-f]{64}$/);
      expect(String(p.retrieved)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

d("the street centrelines, the names and the coverage mask", () => {
  /** the whole network, once every tier that carries it is held */
  const withStreets = async () => {
    const cd = await loaded();
    for (const c of cd.manifest.chunks) {
      if (c.kind === "strt-line" || c.kind === "strt-label" || c.k === "base/street-misc") {
        await (cd as unknown as {
          fetchChunk(k: string): Promise<unknown>;
        }).fetchChunk(c.k);
      }
    }
    return cd;
  };

  it("THE WIDE SHOT'S OWN CLASSES ARE IN THE BASE TIER, and the rest is not", async () => {
    const cd = await loaded();
    // ST_CLS_MAX[0] = 2: the whole-city frame strokes classes 0-2 and nothing
    // else, so those 999 lines are the only ones the first paint can show.
    const cells = cd.streetLines();
    expect(cells.length).toBe(1);
    expect(cells[0].key).toBe("base/street-lines");
    expect(cells[0].cls.every((c) => c <= 2)).toBe(true);
    expect(cells[0].fid.length).toBe(999);
    // and it is a real network, not a stub: 3,262 vertices over 999 features
    let v = 0;
    for (const n of cells[0].len) v += n;
    expect(cells[0].x.length).toBe(v);
    expect(cells[0].y.length).toBe(v);
  });

  it("the second chunk cannot be asked for below the band that draws it", () => {
    const m = manifest();
    const e = m.chunks.find((c) => c.k === "strt/street-lines-2")!;
    // BANDS[0] = sqrt(ZSTEPS[0] * ZSTEPS[1]) = 1.7029 is the first zoom at which
    // ST_CLS_MAX admits class 3 at all.
    expect(e.tier).toBe("strt");
    expect(e.minZ).toBeGreaterThan(1.5);
    expect(e.minZ).toBeLessThan(Math.sqrt(1 * 2.9));
  });

  it("every centreline is in exactly one chunk and carries a published class", async () => {
    const cd = await withStreets();
    const cells = cd.streetLines();
    // THREE chunks of this kind, and only two of them are keyed on G.streets.
    // `strt/street-unimplied` is the 846 published centrelines no assessor
    // block implies — the reason the Hunters Point shipyard had buildings and
    // no streets — and it is a SEPARATE array with its own dense index, so it
    // is excluded here by key and checked on its own terms below.
    const UNIMPL = "strt/street-unimplied";
    const keyed = cells.filter((c) => c.key !== UNIMPL);
    expect(keyed.length).toBe(2);
    const seen = new Set<number>();
    for (const c of keyed) for (const f of c.fid) seen.add(f);
    expect(seen.size).toBe(4895);
    for (let i = 0; i < 4895; i++) expect(seen.has(i)).toBe(true);
    for (const c of keyed) expect(c.cls.every((v) => v <= 4)).toBe(true);
  });

  it("the streets no block implies are a separate array, in the classes G.streets drops", async () => {
    const cd = await withStreets();
    const u = cd.streetLines().find((c) => c.key === "strt/street-unimplied");
    expect(u).toBeDefined();
    expect(u!.fid.length).toBe(846);
    // its own dense index, NOT a position in G.streets
    for (let i = 0; i < u!.fid.length; i++) expect(u!.fid[i]).toBe(i);
    // classes 5, 6 and 7 only — 7 being "no published classcode at all", which
    // the pipeline used to read as 5, the one class it drops
    expect(u!.cls.every((v) => v >= 5 && v <= 7)).toBe(true);
    // `cov` is zero for every one, and that is a measurement: h8n7-e4ns is the
    // PUBLIC right of way and none of these has a polygon in it
    let set = 0;
    for (let i = 0; i < u!.fid.length; i++) {
      if (((u!.cov[i >> 3] >> (i & 7)) & 1) === 1) set++;
    }
    expect(set).toBe(0);
    // 741 of 846 carry no year from either source and are drawn in every year
    let undated = 0;
    for (const v of u!.yr) if (v === 0) undated++;
    expect(undated).toBe(741);
    // every one of them carries a published street name
    for (const v of u!.nm) expect(v).not.toBe(0xffff);
  });

  it("`cov` in the line chunks IS `base/street-misc`'s mask, bit for bit", async () => {
    const cd = await withStreets();
    const misc = cd.streetMisc();
    expect(misc).not.toBeNull();
    expect(misc!.covN).toBe(4895);
    // `streetLines()` throws on a disagreement, so reaching here is the proof;
    // this re-counts it so the number is on the record too.
    let set = 0;
    for (const c of cd.streetLines()) {
      if (c.key === "strt/street-unimplied") continue; // its own index, all zero
      for (let i = 0; i < c.fid.length; i++) {
        if (((c.cov[i >> 3] >> (i & 7)) & 1) === 1) set++;
      }
    }
    // 4,361 of 4,895 have a published right of way; the other 534 are the park
    // roads, the Great Highway, Sloat and the freeways, and they never fade.
    expect(set).toBe(4361);
  });

  it("`base/street-misc` also carries 1,120 islands and 268 stairs", async () => {
    const cd = await withStreets();
    const m = cd.streetMisc()!;
    expect(m.islandLen.length).toBe(1120);
    expect(m.stairLen.length).toBe(268);
    expect(m.stairNames.length).toBe(268);
    let iv = 0;
    for (const n of m.islandLen) iv += n;
    expect(m.islandX.length).toBe(iv);
    // decoded to world metres, so they land on the city and not at the origin
    expect(Math.min(...m.islandX)).toBeGreaterThan(-9000);
    expect(Math.max(...m.islandX)).toBeLessThan(9000);
  });

  it("THE STREET NAMES EXIST NOW, and every centreline has one", async () => {
    const cd = await withStreets();
    const names = cd.streetNames();
    // 2,397 for the 4,895 keyed centrelines, plus 76 the 846 unimplied lines
    // bring in — most of theirs are names the city already carries, which is
    // why 846 lines add only 76 entries.
    expect(names.length).toBe(2473);
    let unnamed = 0;
    for (const c of cd.streetLines()) {
      for (const v of c.nm) {
        if (v === 0xffff) unnamed++;
        else expect(names[v]).toBeTruthy();
      }
    }
    // 3psu-pn9h publishes a streetname for all 4,895, and for all 846 of the
    // unimplied lines too
    expect(unnamed).toBe(0);
  });

  it("the label table is rank-ordered by band, and base carries 0-1", async () => {
    const cd = await loaded();
    const t = cd.streetLabels();
    expect(t).not.toBeNull();
    // part3.html L7025: rankMax is 0 at whole city, 1 at district, 2 at block.
    expect(t!.rank.every((r) => r <= 1)).toBe(true);
    expect(t!.n).toBe(337);
    const full = await withStreets();
    expect(full.streetLabels()!.n).toBe(2786);
  });

  it("a label's direction round-trips the published unit vector", async () => {
    const cd = await loaded();
    const t = cd.streetLabels()!;
    for (let i = 0; i < t.n; i++) {
      expect(Math.hypot(t.dx[i], t.dy[i])).toBeCloseTo(1, 3);
      expect(t.name(i).length).toBeGreaterThan(0);
    }
    // the longest rank-0 stretch in San Francisco, read off the data
    let best = -1, bi = -1;
    for (let i = 0; i < t.n; i++) {
      if (t.rank[i] === 0 && t.lengthM[i] > best) { best = t.lengthM[i]; bi = i; }
    }
    expect(t.name(bi)).toBe("GEARY BLVD");
  });

  it("every field of both kinds names a source in the manifest", async () => {
    const cd = await loaded();
    for (const kind of ["strt-line", "strt-label"]) {
      const schema = cd.manifest.kinds[kind];
      expect(schema, kind).toBeTruthy();
      for (const f of schema.fields) {
        const p = cd.provenanceOf(kind, f.n);
        expect(p, `${kind}.${f.n}`).toBeTruthy();
        expect(String(p!.what).length).toBeGreaterThan(20);
      }
    }
  });
});
