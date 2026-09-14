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

/**
 * The scene as one picture: the year's euros cut into tiles, area = amount,
 * one hue from dark (largest) to light, label and amount written on tiles
 * big enough to carry them. Tiles with an href open a fiche (link role
 * `tile`). Slivers under 2.5 % fold into one « Autres » tile.
 */
export default function Mosaic({ rows, otherLabel, format }: { rows: BarRow[]; otherLabel: string; format: (n: number) => string }) {
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
  const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0);
  const sorted = rows.filter((r) => r.value > 0).slice().sort((a, b) => b.value - a.value);
  const big = sorted.filter((r) => r.value / total >= 0.025);
  const rest = sorted.filter((r) => r.value / total < 0.025);
  const items: (BarRow & { other?: boolean })[] = rest.length > 1
    ? [...big, { key: "__other", label: otherLabel, value: rest.reduce((a, r) => a + r.value, 0), text: "", other: true }].sort((a, b) => b.value - a.value)
    : sorted;
  const W = size.w || 400;
  const H = size.h || 300;
  const rects = squarify(items.map((it) => it.value), W, H);
  return (
    <div className="fx-mosaic" ref={ref}>
      {items.map((it, i) => {
        const r = rects[i];
        const p = Math.max(28, 100 - i * 11);
        const small = r.w < 84 || r.h < 40;
        const cls = `fx-mosaic-tile ${p >= 55 ? "dark" : "light"}${small ? " small" : ""}`;
        const style = {
          left: `calc(${(r.x / W) * 100}% + 1px)`,
          top: `calc(${(r.y / H) * 100}% + 1px)`,
          width: `calc(${(r.w / W) * 100}% - 2px)`,
          height: `calc(${(r.h / H) * 100}% - 2px)`,
          background: `color-mix(in srgb, var(--bleu) ${p}%, #fff)`,
        };
        const body = (
          <>
            <span className="t">{it.label}</span>
            <span className="v tnum">{format(it.value)}</span>
          </>
        );
        return it.href && !it.other ? (
          <Link key={it.key} href={it.href} scroll={false} className={cls} style={style}>{body}</Link>
        ) : (
          <div key={it.key} className={cls} style={style}>{body}</div>
        );
      })}
    </div>
  );
}
