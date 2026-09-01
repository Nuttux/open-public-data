import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BufferAttribute, DoubleSide, Mesh, MeshLambertMaterial } from "three";
import { describe, expect, it } from "vitest";

import { CityData } from "@/lib/city/data";
import { heroesLayer } from "./heroes";

/**
 * WHAT THIS TEST IS FOR.
 *
 * The regression this layer was rewritten to close was SILENT: nine `arcade`
 * parts and three `rib` parts were skipped, the meshes still built, the page
 * still rendered, and what was gone was the Ferry Building's clock faces, the
 * Old Mint's every window and the twenty gilt ribs off City Hall's dome. A
 * count nobody was holding is a count that can go missing again, so the first
 * assertion here is the one that would have caught it: EVERY published part
 * of every hero becomes geometry, by kind.
 *
 * The rest are the properties the drawing rests on and that a render cannot
 * show you:
 *
 *   · the paint lies IN the surface it is painted on, so it is separated in
 *     the depth buffer and never by a height — in an axonometric projection a
 *     Y offset is also a screen offset;
 *   · the record's own detail gate is a PREFIX, which is correct only while
 *     the emission order is monotone in the scale each part needs;
 *   · a hero's footprint is handed to the fabric to skip whether or not its
 *     parts produced anything, or a building wears two shapes;
 *   · nothing is drawn outside the published ring — the containment the
 *     authoring gate proved has to be the containment that gets drawn.
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
  return new Response(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  );
}) as unknown as typeof fetch;

/** flat and NOT zero — a zero field hides a ground/built mix-up */
const FLAT_ELEV_M = 9.25;

async function loaded(): Promise<CityData> {
  const data = await CityData.load({ fetchImpl: diskFetch });
  await data.loadBase();
  return data;
}

/** the layer, plus the `onBuilt` the async build fires when it has filled */
function built(data: CityData) {
  let resolve!: () => void;
  const done = new Promise<void>((r) => { resolve = r; });
  const layer = heroesLayer(data, {
    elevAt: () => FLAT_ELEV_M,
    zex: 3.3,
    zexb: 1.6,
    onBuilt: () => resolve(),
  });
  return { layer, done };
}

d("heroesLayer, against the published register", () => {
  it("builds every published part, by kind, and skips none", async () => {
    const data = await loaded();
    const lm = (await data.landmarks())!;
    expect(lm).not.toBeNull();

    const per: Record<string, number> = {};
    for (const h of lm.heroes) {
      for (const p of h.parts) per[p.kind] = (per[p.kind] ?? 0) + 1;
    }
    /* the shipped register, as it stands: 14 heroes, 147 parts. The split is
       asserted so that a chunk that grows a kind cannot pass unnoticed — and
       it did its job: it went 145 -> 147 when the Transamerica Pyramid grew
       its two wing shafts, which is the only change since. */
    expect(lm.heroes.length).toBe(14);
    expect(per.solid + (per.arcade ?? 0) + (per.rib ?? 0)).toBe(147);
    expect(per.solid).toBe(135);
    expect(per.arcade).toBe(9);
    expect(per.rib).toBe(3);

    const { layer, done } = built(data);
    expect(layer).not.toBeNull();
    await done;

    /* TWO MESHES A HERO WHERE THERE IS PAINT, ONE WHERE THERE IS NOT — and
       the paint mesh exists for exactly the heroes whose register carries a
       non-solid part. Seven of the fourteen do. */
    const withPaint = lm.heroes.filter((h) =>
      h.parts.some((p) => p.kind !== "solid"),
    ).length;
    expect(withPaint).toBe(7);
    const spans = lm.bridge ? 1 + lm.bridge.more.length : 0;
    expect(layer!.meshes.length).toBe(lm.heroes.length + withPaint + spans);

    /* EVERY MESH CARRIES TRIANGLES. A part that silently produced nothing is
       what the last regression was, and an empty buffer is how it looked. */
    for (const m of layer!.meshes) {
      const idx = m.geometry.getIndex();
      expect(idx).not.toBeNull();
      expect(idx!.count).toBeGreaterThan(0);
    }
    layer!.dispose();
  });

  it("paints in the depth buffer and never by a height", async () => {
    const data = await loaded();
    const { layer, done } = built(data);
    await done;
    let paints = 0;
    for (const m of layer!.meshes) {
      const mat = m.material as MeshLambertMaterial;
      expect(mat.flatShading).toBe(true);
      expect(mat.side).toBe(DoubleSide);
      if (!mat.polygonOffset) continue;
      paints++;
      /* forward, and the same in both terms — `layers/streets.ts` §ONE DEPTH
         LADDER settled the sign for the whole renderer */
      expect(mat.polygonOffsetFactor).toBeLessThan(0);
      expect(mat.polygonOffsetUnits).toBe(mat.polygonOffsetFactor);
      /* AND IT TAKES NO PART IN THE SHADOW MAP, in either direction: a decal
         lying in its host's own surface cannot cast without fighting it and
         cannot receive without acne. Measured as dashes broken out of City
         Hall's ribs; see `heroes.ts`. */
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(false);
    }
    expect(paints).toBe(7);
    layer!.dispose();
  });

  it("gates on the record's own detail floor, as a monotone prefix", async () => {
    const data = await loaded();
    const { layer, done } = built(data);
    await done;
    const gated = layer!.meshes.filter(
      (m) => m.geometry.drawRange.count !== Infinity,
    );
    expect(gated.length).toBeGreaterThan(0);

    const drawn = (): number => {
      let n = 0;
      for (const m of layer!.meshes) {
        const idx = m.geometry.getIndex() as BufferAttribute;
        const r = m.geometry.drawRange;
        n += r.count === Infinity ? idx.count : r.count;
      }
      return n;
    };
    const at = (scale: number): number => {
      layer!.onFrame?.({ cx: 0, cy: 0, scale }, 2);
      return drawn();
    };

    /* THE PROPERTY THE PREFIX RESTS ON: the whole register at a huge camera,
       a strictly smaller set at a vanishing one, and never a step backwards
       in between — with MORE THAN TWO STATES, which is what says the gate is
       per part and not the all-or-nothing layer switch it replaced.

       The floor is NOT zero and must not be. A part the record gives no
       `min` is drawn at every camera — that is what `partVisible` reads a
       missing floor as — and a bridge span carries no detail gate at all,
       so both stand at any scale. */
    const floor = at(1e-9);
    expect(floor).toBeGreaterThan(0);
    const full = at(1e6);
    expect(full).toBeGreaterThan(floor);
    let prev = 0;
    let states = 0;
    for (let e = -4; e <= 4; e += 0.2) {
      const c = at(Math.pow(10, e));
      expect(c).toBeGreaterThanOrEqual(prev);
      if (c !== prev) states++;
      prev = c;
    }
    expect(prev).toBe(full);
    expect(states).toBeGreaterThan(3);

    /* AND THE WHOLE-CITY CAMERA IS NOT THE WHOLE REGISTER. Measured off the
       page's own fit, that camera sits at 0.0790 px per plane unit, and the
       reference drops the colonnades there — see `heroes.ts` §the same gate
       over the 133 solids, which is where a guess of 0.75 was nearly
       shipped. */
    const city = at(0.079);
    expect(city).toBeGreaterThan(0);
    expect(city).toBeLessThan(full);
    layer!.dispose();
  });

  it("hands the fabric every hero's footprint, drawn or not", async () => {
    const data = await loaded();
    const lm = (await data.landmarks())!;
    const { layer, done } = built(data);
    await done;
    expect(layer!.skipGids.size).toBe(lm.heroes.length);
    for (const h of lm.heroes) expect(layer!.skipGids.has(h.bi)).toBe(true);
    layer!.dispose();
  });

  it("draws nothing outside the ring the record publishes", async () => {
    const data = await loaded();
    const lm = (await data.landmarks())!;
    const { layer, done } = built(data);
    await done;

    /* THE CONTAINMENT THE AUTHORING GATE PROVED. Every vertex of every part
       was gated as inside the measured footprint; a profile that scaled a
       ring the wrong way, or a rib strip that stepped OUT of its segment
       instead of in, would put colour on the ground a neighbour stands on.
       Checked per hero against the union of its own parts' rings, with the
       published tilt as the only allowance — a tilt is a lean the record
       states, and it is the one thing that may leave the plan. */
    const heroMesh = new Map<string, Mesh[]>();
    let mi = 0;
    for (const h of lm.heroes) {
      const paint = h.parts.some((p) => p.kind !== "solid");
      heroMesh.set(h.key, layer!.meshes.slice(mi, mi + (paint ? 2 : 1)));
      mi += paint ? 2 : 1;
    }
    for (const h of lm.heroes) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      let tilt = 0;
      for (const p of h.parts) {
        for (let t = 0; t < p.rx.length; t++) {
          x0 = Math.min(x0, p.rx[t]); x1 = Math.max(x1, p.rx[t]);
          y0 = Math.min(y0, p.ry[t]); y1 = Math.max(y1, p.ry[t]);
        }
        tilt = Math.max(tilt, Math.abs(p.tiltX), Math.abs(p.tiltY));
      }
      for (const m of heroMesh.get(h.key) ?? []) {
        const pos = (m.geometry.getAttribute("position") as BufferAttribute)
          .array as Float32Array;
        for (let v = 0; v < pos.length; v += 3) {
          expect(pos[v]).toBeGreaterThanOrEqual(x0 - tilt - 1e-3);
          expect(pos[v]).toBeLessThanOrEqual(x1 + tilt + 1e-3);
          expect(pos[v + 2]).toBeGreaterThanOrEqual(y0 - tilt - 1e-3);
          expect(pos[v + 2]).toBeLessThanOrEqual(y1 + tilt + 1e-3);
        }
      }
    }
    layer!.dispose();
  });

  it("puts the ground on zex and the built height on zexb", async () => {
    const data = await loaded();
    const { layer, done } = built(data);
    await done;
    const m = layer!.meshes[0];
    const y = (): number =>
      ((m.geometry.getAttribute("position") as BufferAttribute)
        .array as Float32Array)[1];
    layer!.onStep?.(0, 3.3, 1.6);
    const a = y();
    layer!.onStep?.(2, 2.0, 1.6);
    const b = y();
    /* the two dials are DIFFERENT, so a single scale cannot fit both — the
       same assertion `caps.test.ts` makes, for the same reason */
    expect(a).not.toBeCloseTo(b, 5);
    expect(a - b).toBeCloseTo(FLAT_ELEV_M * (3.3 - 2.0), 4);
    layer!.dispose();
  });

  it("refuses a hero before the year its own register gives it", async () => {
    const data = await loaded();
    const lm = (await data.landmarks())!;
    const { layer, done } = built(data);
    await done;
    const earliest = Math.min(...lm.heroes.map((h) => h.year));
    layer!.onYear?.(earliest - 1);
    const before = layer!.meshes.filter((m) => m.visible).length;
    layer!.onYear?.(undefined);
    const all = layer!.meshes.filter((m) => m.visible).length;
    expect(before).toBeLessThan(all);
    expect(all).toBe(layer!.meshes.length);
    layer!.dispose();
  });
});
