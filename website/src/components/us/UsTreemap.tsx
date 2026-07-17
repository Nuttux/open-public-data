"use client";

import { useMemo, useState } from "react";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";

/**
 * USD treemap for US pages — forked from fusion/BudgetTreemap (same
 * squarified algorithm and visual language), because the shared primitive
 * hardwires (a) EUR formatting ("1,2 Md€" / "€1.2 bn") and (b) a 3-value
 * French-institution `group` enum driving its colors. SF's top altitude is
 * 7 organization groups → single-ink ramp shaded by value, en-US dollars.
 * Cells are informational (no fiche exists at org-group altitude) — no
 * links, tooltip + aria only. Genuine "primitive can't express it" fork,
 * same precedent as UsDebtChart (see docs/us/LEARNINGS.md).
 */

export type UsTreemapDatum = {
  id: string;
  shortLabel: string;
  fullLabel: string;
  /** Value in USD (drives area). Must be > 0 — never feed negatives. */
  value: number;
  /** Share of side total (0..1), precomputed by the pipeline. */
  shareOfTotal: number;
  /** Extra tooltip line (e.g. "8 departments"). */
  subLabel?: string;
};

type Props = {
  data: UsTreemapDatum[];
  height?: number;
  /** Suffix after the share in tooltips (e.g. "of spending"). */
  totalLabel?: string;
  ariaLabel: string;
};

type Rect = { x: number; y: number; w: number; h: number };

function worst(row: UsTreemapDatum[], w: number): number {
  if (row.length === 0) return Number.POSITIVE_INFINITY;
  const sum = row.reduce((s, r) => s + r.value, 0);
  if (sum <= 0 || w <= 0) return Number.POSITIVE_INFINITY;
  const rmax = Math.max(...row.map((r) => r.value));
  const rmin = Math.min(...row.map((r) => r.value));
  const ws2 = w * w;
  const s2 = sum * sum;
  return Math.max((ws2 * rmax) / s2, s2 / (ws2 * rmin));
}

function layoutRow(
  row: UsTreemapDatum[],
  bounds: Rect,
  totalRemaining: number,
): { rects: Rect[]; rest: Rect } {
  const sumRow = row.reduce((s, r) => s + r.value, 0);
  const rects: Rect[] = [];
  const short = Math.min(bounds.w, bounds.h);
  const long = totalRemaining > 0 ? (sumRow / totalRemaining) * Math.max(bounds.w, bounds.h) : 0;
  if (bounds.w <= bounds.h) {
    let x = bounds.x;
    for (const r of row) {
      const w = sumRow > 0 ? (r.value / sumRow) * short : 0;
      rects.push({ x, y: bounds.y, w, h: long });
      x += w;
    }
    return {
      rects,
      rest: { x: bounds.x, y: bounds.y + long, w: bounds.w, h: Math.max(0, bounds.h - long) },
    };
  }
  let y = bounds.y;
  for (const r of row) {
    const h = sumRow > 0 ? (r.value / sumRow) * short : 0;
    rects.push({ x: bounds.x, y, w: long, h });
    y += h;
  }
  return {
    rects,
    rest: { x: bounds.x + long, y: bounds.y, w: Math.max(0, bounds.w - long), h: bounds.h },
  };
}

function squarify(
  items: UsTreemapDatum[],
  width: number,
  height: number,
): { item: UsTreemapDatum; rect: Rect }[] {
  const totalValue = items.reduce((s, r) => s + r.value, 0);
  if (totalValue <= 0 || width <= 0 || height <= 0) return [];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const scale = (width * height) / totalValue;
  const scaled = sorted.map((d) => ({ ...d, value: d.value * scale }));

  const out: { item: UsTreemapDatum; rect: Rect }[] = [];
  let bounds: Rect = { x: 0, y: 0, w: width, h: height };
  let remainingValue = scaled.reduce((s, r) => s + r.value, 0);
  let row: UsTreemapDatum[] = [];
  let i = 0;
  while (i < scaled.length) {
    const cur = scaled[i];
    const short = Math.min(bounds.w, bounds.h);
    const candidate = [...row, cur];
    if (row.length === 0 || worst(candidate, short) <= worst(row, short)) {
      row = candidate;
      i += 1;
    } else {
      const { rects, rest } = layoutRow(row, bounds, remainingValue);
      remainingValue -= row.reduce((s, r) => s + r.value, 0);
      bounds = rest;
      row.forEach((r, idx) => {
        const orig = sorted.find((s) => s.id === r.id);
        if (orig) out.push({ item: orig, rect: rects[idx] });
      });
      row = [];
    }
  }
  if (row.length > 0) {
    const { rects } = layoutRow(row, bounds, remainingValue);
    row.forEach((r, idx) => {
      const orig = sorted.find((s) => s.id === r.id);
      if (orig) out.push({ item: orig, rect: rects[idx] });
    });
  }
  return out;
}

/** Single-ink ramp: charbon base, bigger value → deeper cell. */
function fillFor(value: number, max: number): string {
  const ratio = max > 0 ? value / max : 0;
  const light = 30 + (1 - ratio) * 90; // 30 (biggest) → 120 (smallest)
  return `rgb(${Math.round(light * 0.9)},${Math.round(light * 0.95)},${Math.round(light * 1.1)})`;
}

export default function UsTreemap({ data, height = 420, totalLabel, ariaLabel }: Props) {
  const viewW = 1000;
  const viewH = height;
  const tiles = useMemo(() => squarify(data, viewW, viewH), [data, viewH]);
  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value), 0), [data]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hovered = hoverId ? tiles.find((t) => t.item.id === hoverId) : null;

  return (
    <div className="fx-budget-treemap" style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio="none"
        width="100%"
        height={viewH}
        role="group"
        aria-label={ariaLabel}
        style={{ display: "block" }}
      >
        {tiles.map(({ item, rect }) => {
          const pad = 1;
          const x = rect.x + pad;
          const y = rect.y + pad;
          const w = Math.max(0, rect.w - pad * 2);
          const h = Math.max(0, rect.h - pad * 2);
          const showLabel = w >= 70 && h >= 34;
          const showValue = w >= 90 && h >= 56;
          const tooltip =
            `${item.fullLabel} · ${fmtUsdCompact(item.value)} · ` +
            `${fmtShare(item.shareOfTotal)}${totalLabel ? ` ${totalLabel}` : ""}`;
          return (
            <g
              key={item.id}
              tabIndex={0}
              role="img"
              aria-label={tooltip}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId((p) => (p === item.id ? null : p))}
              onFocus={() => setHoverId(item.id)}
              onBlur={() => setHoverId((p) => (p === item.id ? null : p))}
            >
              <rect x={x} y={y} width={w} height={h} fill={fillFor(item.value, maxValue)} stroke="#fafaf7" strokeWidth={2} />
              {showLabel && (
                <text
                  x={x + 10}
                  y={y + 22}
                  fill="#fff"
                  fontSize={13}
                  fontWeight={600}
                  style={{ pointerEvents: "none", fontFamily: "'Inter Tight', Inter, sans-serif" }}
                >
                  {item.shortLabel.length > Math.floor(w / 8)
                    ? item.shortLabel.slice(0, Math.max(3, Math.floor(w / 8) - 1)) + "…"
                    : item.shortLabel}
                </text>
              )}
              {showValue && (
                <text
                  x={x + 10}
                  y={y + 42}
                  fill="rgba(255,255,255,.78)"
                  fontSize={12}
                  style={{ pointerEvents: "none", fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                >
                  {fmtUsdCompact(item.value)} · {fmtShare(item.shareOfTotal)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            background: "rgba(10,10,10,.92)",
            color: "#fafaf7",
            padding: "10px 14px",
            fontSize: 13,
            lineHeight: 1.4,
            fontFamily: "'Inter Tight', Inter, sans-serif",
            pointerEvents: "none",
            maxWidth: 320,
            border: "1px solid rgba(255,255,255,.15)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{hovered.item.fullLabel}</div>
          <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", opacity: 0.85 }}>
            {fmtUsdCompact(hovered.item.value)} · {fmtShare(hovered.item.shareOfTotal)}
            {totalLabel ? ` ${totalLabel}` : ""}
          </div>
          {hovered.item.subLabel && (
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{hovered.item.subLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}
