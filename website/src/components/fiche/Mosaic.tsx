"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/LocalizedLink";
import type { BarRow } from "./Bars";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Squarified treemap (Bruls, Huizing, van Wijk 2000): tiles whose area is
 * the value, laid in strips along the shorter side so they stay close to
 * squares. `values` sorted descending, in the unit of `w × h`.
 */
export function squarify(values: number[], w: number, h: number): Rect[] {
  const out: Rect[] = new Array(values.length);
  const total = values.reduce((a, b) => a + b, 0);
  if (values.length === 0 || total <= 0 || w <= 0 || h <= 0) return out.fill({ x: 0, y: 0, w: 0, h: 0 });
  const areas = values.map((v) => (v / total) * w * h);
  let i = 0;
  let rx = 0, ry = 0, rw = w, rh = h;
  while (i < areas.length) {
    const vertical = rw >= rh; // a strip stands along the shorter side
    const side = vertical ? rh : rw;
    let row: number[] = [];
    let worst = Infinity;
    let j = i;
    while (j < areas.length) {
      const cand = [...row, areas[j]];
      const s = cand.reduce((a, b) => a + b, 0);
      const mx = Math.max(...cand);
      const mn = Math.min(...cand);
      const ratio = Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
      if (ratio <= worst) { row = cand; worst = ratio; j++; } else break;
    }
    if (row.length === 0) { row = [areas[i]]; j = i + 1; }
    const s = row.reduce((a, b) => a + b, 0);
    const thick = side > 0 ? s / side : 0;
    let off = 0;
    for (let k = 0; k < row.length; k++) {
      const len = thick > 0 ? row[k] / thick : 0;
      out[i + k] = vertical ? { x: rx, y: ry + off, w: thick, h: len } : { x: rx + off, y: ry, w: len, h: thick };
      off += len;
    }
    if (vertical) { rx += thick; rw -= thick; } else { ry += thick; rh -= thick; }
    i = j;
  }
  return out;
}

type Tile = BarRow & { merged?: number };

/** Does the label fit the tile? Estimated from the font: 13 px text is about
 *  7 px per character, 16 px per line; the amount takes 18 px; padding 14. */
function labelFits(label: string, w: number, h: number): boolean {
  const perLine = Math.max(1, Math.floor((w - 18) / 7.2));
  const words = label.split(/\s+/);
  // A word longer than the line would break mid-word: no label at all then.
  if (words.some((word) => word.length + 2 > perLine)) return false;
  const lines = words.reduce((acc, word) => {
    const cur = acc[acc.length - 1];
    if (cur !== undefined && cur + 1 + word.length <= perLine) acc[acc.length - 1] = cur + 1 + word.length;
    else acc.push(Math.min(word.length, perLine));
    return acc;
  }, [] as number[]).length;
  return lines * 16 + 18 + 14 <= h;
}

/**
 * The scene as one picture: the year's euros cut into tiles, area = amount,
 * one hue from dark (largest) to light, label and amount written on tiles
 * big enough to carry them, the others say it on hover. Tiles with an href
 * open a fiche (link role `tile`). At most `maxTiles` named tiles: the rest
 * folds into the « other » tile — the soft row the caller passes (« 679
 * autres entreprises ») when there is one, else a tile named by `otherLabel`.
 */
export default function Mosaic({ rows, otherLabel, format, maxTiles = 7 }: {
  rows: BarRow[];
  /** Name of the merged tile, given how many rows it absorbed. */
  otherLabel: (merged: number) => string;
  format: (n: number) => string;
  maxTiles?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const positive = rows.filter((r) => r.value > 0);
  const total = positive.reduce((a, r) => a + r.value, 0);
  const ranked = positive.filter((r) => r.tone !== "soft").sort((a, b) => b.value - a.value);
  const soft = positive.filter((r) => r.tone === "soft");
  // A tile under 1.5 % of the whole cannot carry a word: it joins the rest.
  const keep = ranked.filter((r, i) => r.value / total >= 0.015 && i < maxTiles - 1);
  const rest = ranked.filter((r) => !keep.includes(r));
  const restSum = rest.reduce((a, r) => a + r.value, 0);
  let items: Tile[] = [...keep];
  if (soft.length > 0) {
    // The caller's remainder absorbs the small named rows; its label says how many.
    const base = soft[0];
    items.push({ ...base, value: base.value + restSum, merged: rest.length, label: rest.length > 0 ? otherLabel(rest.length) : base.label, href: null });
    items.push(...soft.slice(1));
  } else if (rest.length > 0) {
    items.push({ key: "__other", label: otherLabel(rest.length), value: restSum, text: "", tone: "soft", merged: rest.length, href: null });
  }
  items = items.sort((a, b) => b.value - a.value);

  const W = size.w || 400;
  const H = size.h || 300;
  const rects = squarify(items.map((it) => it.value), W, H);
  let rank = 0;
  return (
    <div className="fx-mosaic" ref={ref}>
      {items.map((it, i) => {
        const r = rects[i];
        const isSoft = it.tone === "soft";
        const p = isSoft ? 22 : Math.max(30, 100 - rank++ * 11);
        const label = typeof it.label === "string" ? it.label : "";
        const amount = format(it.value);
        const showAmount = r.w >= 64 && r.h >= 36;
        const showLabel = showAmount && labelFits(label, r.w, r.h);
        const cls = `fx-mosaic-tile ${isSoft ? "soft" : p >= 55 ? "dark" : "light"}${showAmount ? "" : " small"}${showLabel ? "" : " no-label"}`;
        const style = {
          left: `calc(${(r.x / W) * 100}% + 1px)`,
          top: `calc(${(r.y / H) * 100}% + 1px)`,
          width: `calc(${(r.w / W) * 100}% - 2px)`,
          height: `calc(${(r.h / H) * 100}% - 2px)`,
          background: `color-mix(in srgb, var(--bleu) ${p}%, #fff)`,
        };
        const title = `${label} · ${amount}`;
        const body = (
          <>
            <span className="t">{it.label}</span>
            <span className="v tnum">{amount}</span>
          </>
        );
        return it.href ? (
          <Link key={it.key} href={it.href} scroll={false} className={cls} style={style} title={title}>{body}</Link>
        ) : (
          <div key={it.key} className={cls} style={style} title={title}>{body}</div>
        );
      })}
    </div>
  );
}
