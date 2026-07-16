"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/**
 * Treemap squarified pour la page /fr/national/budget.
 *
 * Hand-rolled (zero-dep) — d3-hierarchy n'est pas dans `package.json` et
 * n'est pas justifié pour ~30 cellules. L'algo suit Bruls/Huijing/van Wijk
 * (2000) "Squarified Treemaps" :
 *   1. trier les valeurs en décroissant
 *   2. accumuler une "rangée" tant que l'aspect ratio max s'améliore
 *   3. layout la rangée + récurser sur le rectangle restant
 *
 * SVG-based : chaque cellule = `<a>` cliquable + `<rect>`. Aria-label
 * détaillé pour la nav clavier.
 */

export type TreemapDatum = {
  /** Identifiant unique stable (clé pour React + analytics). */
  id: string;
  /** Lien drawer (sera ouvert via Next Link, scroll=false → reste sur place). */
  href: string;
  /** Nom court affiché dans la cellule. */
  shortLabel: string;
  /** Libellé complet pour le tooltip / aria-label. */
  fullLabel: string;
  /** Valeur en EUR (utilisée pour la surface). */
  value: number;
  /** Famille d'institution — détermine la couleur de fond. */
  group: "secu" | "etat" | "local";
  /** Libellé du group (Sécu, État, Bloc communal…) — pour le tooltip. */
  groupLabel: string;
  /** Pourcentage du total (0..1) — précalculé pour éviter les recalcs. */
  shareOfTotal: number;
};

type Props = {
  data: TreemapDatum[];
  /** Largeur en pixels — peut être laissée à 100% via `width` props par défaut. */
  height?: number;
  /** Locale — pour formater les montants. */
  locale?: "fr" | "en";
  /** Texte tooltip "share of total". */
  totalLabel?: string;
};

// ─── Squarified algorithm ─────────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number };

function worst(row: TreemapDatum[], w: number): number {
  // Aspect ratio max d'une ligne empilée sur côté de longueur `w`.
  if (row.length === 0) return Number.POSITIVE_INFINITY;
  const sum = row.reduce((s, r) => s + r.value, 0);
  if (sum <= 0 || w <= 0) return Number.POSITIVE_INFINITY;
  const rmax = Math.max(...row.map((r) => r.value));
  const rmin = Math.min(...row.map((r) => r.value));
  const ws2 = w * w;
  const s2 = sum * sum;
  return Math.max((ws2 * rmax) / s2, s2 / (ws2 * rmin));
}

/**
 * Layout une rangée de cellules empilées le long du côté court d'un
 * rectangle. Renvoie la liste de Rect dans l'ordre des items.
 */
function layoutRow(
  row: TreemapDatum[],
  bounds: Rect,
  totalRemaining: number,
): { rects: Rect[]; consumed: Rect; rest: Rect } {
  const sumRow = row.reduce((s, r) => s + r.value, 0);
  const rects: Rect[] = [];
  // Largeur du côté court (= bord le plus court restant).
  const short = Math.min(bounds.w, bounds.h);
  // Longueur du côté long affecté à cette rangée.
  const long = totalRemaining > 0 ? (sumRow / totalRemaining) * Math.max(bounds.w, bounds.h) : 0;
  if (bounds.w <= bounds.h) {
    // Bord horizontal = court → la rangée est horizontale (cellules empilées en X)
    let x = bounds.x;
    const rowH = long;
    for (const r of row) {
      const w = sumRow > 0 ? (r.value / sumRow) * short : 0;
      rects.push({ x, y: bounds.y, w, h: rowH });
      x += w;
    }
    const consumed: Rect = { x: bounds.x, y: bounds.y, w: short, h: rowH };
    const rest: Rect = {
      x: bounds.x,
      y: bounds.y + rowH,
      w: bounds.w,
      h: Math.max(0, bounds.h - rowH),
    };
    return { rects, consumed, rest };
  }
  // Bord vertical = court → la rangée est verticale (cellules empilées en Y)
  let y = bounds.y;
  const rowW = long;
  for (const r of row) {
    const h = sumRow > 0 ? (r.value / sumRow) * short : 0;
    rects.push({ x: bounds.x, y, w: rowW, h });
    y += h;
  }
  const consumed: Rect = { x: bounds.x, y: bounds.y, w: rowW, h: short };
  const rest: Rect = {
    x: bounds.x + rowW,
    y: bounds.y,
    w: Math.max(0, bounds.w - rowW),
    h: bounds.h,
  };
  return { rects, consumed, rest };
}

function squarify(
  items: TreemapDatum[],
  width: number,
  height: number,
): { item: TreemapDatum; rect: Rect }[] {
  const totalValue = items.reduce((s, r) => s + r.value, 0);
  if (totalValue <= 0 || width <= 0 || height <= 0) return [];
  // Travail sur une copie triée décroissante.
  const sorted = [...items].sort((a, b) => b.value - a.value);
  // Échelle des valeurs vers la surface du conteneur.
  const scale = (width * height) / totalValue;
  const scaled = sorted.map((d) => ({ ...d, value: d.value * scale }));

  const out: { item: TreemapDatum; rect: Rect }[] = [];
  let bounds: Rect = { x: 0, y: 0, w: width, h: height };
  let remainingValue = scaled.reduce((s, r) => s + r.value, 0);
  let row: TreemapDatum[] = [];
  let i = 0;
  while (i < scaled.length) {
    const cur = scaled[i];
    const short = Math.min(bounds.w, bounds.h);
    const candidateRow = [...row, cur];
    if (
      row.length === 0 ||
      worst(candidateRow, short) <= worst(row, short)
    ) {
      row = candidateRow;
      i += 1;
    } else {
      // flush la rangée
      const { rects, rest } = layoutRow(row, bounds, remainingValue);
      const sumRow = row.reduce((s, r) => s + r.value, 0);
      remainingValue -= sumRow;
      bounds = rest;
      row.forEach((r, idx) => {
        // Retrouver l'item original par id (les valeurs ont été mises à l'échelle)
        const orig = sorted.find((s) => s.id === r.id);
        if (orig) out.push({ item: orig, rect: rects[idx] });
      });
      row = [];
    }
  }
  // flush dernière rangée
  if (row.length > 0) {
    const { rects } = layoutRow(row, bounds, remainingValue);
    row.forEach((r, idx) => {
      const orig = sorted.find((s) => s.id === r.id);
      if (orig) out.push({ item: orig, rect: rects[idx] });
    });
  }
  return out;
}

// ─── Color helpers ────────────────────────────────────────────────────────

function fillFor(group: TreemapDatum["group"], value: number, max: number): string {
  // Variantes par groupe : on pose une teinte de base puis on assombrit
  // proportionnellement à la valeur (les plus grosses cellules sont les
  // plus saturées). Reste très lisible avec texte blanc.
  const ratio = max > 0 ? value / max : 0;
  // Saturation entre 0.55 et 1.0 selon la valeur — plus c'est gros, plus c'est foncé.
  const sat = 0.55 + ratio * 0.45;
  if (group === "secu") {
    // Bleu fusion (#2a3680 = rgb 42,54,128) — assombri/clarifié.
    const r = Math.round(42 * sat);
    const g = Math.round(54 * sat);
    const b = Math.round(128 * sat);
    return `rgb(${r},${g},${b})`;
  }
  if (group === "etat") {
    // Charbon (#1a1d26 = rgb 26,29,38) — toujours sombre.
    const r = Math.round(26 + (1 - sat) * 30);
    const g = Math.round(29 + (1 - sat) * 30);
    const b = Math.round(38 + (1 - sat) * 30);
    return `rgb(${r},${g},${b})`;
  }
  // local — rouge fusion (#c12323 = rgb 193,35,35)
  const r = Math.round(193 * sat);
  const g = Math.round(35 * sat);
  const b = Math.round(35 * sat);
  return `rgb(${r},${g},${b})`;
}

function fmtBnEur(amountEur: number, locale: "fr" | "en"): string {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return "—";
  const md = amountEur / 1e9;
  const rounded = md >= 100 ? md.toFixed(0) : md.toFixed(1);
  const display =
    locale === "fr"
      ? `${rounded.replace(".", ",")} Md€`
      : `€${rounded} bn`;
  return display;
}

function fmtPctOfTotal(share: number, locale: "fr" | "en"): string {
  const v = share * 100;
  const r = v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return locale === "fr" ? `${r.replace(".", ",")} %` : `${r}%`;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function BudgetTreemap({
  data,
  height = 640,
  locale = "fr",
  totalLabel,
}: Props) {
  // SVG viewBox basé sur 1000×height. Le conteneur applique width=100%.
  const viewW = 1000;
  const viewH = height;
  const tiles = useMemo(
    () => squarify(data, viewW, viewH),
    [data, viewW, viewH],
  );
  const maxValue = useMemo(
    () => Math.max(...data.map((d) => d.value), 0),
    [data],
  );
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
        aria-label={
          locale === "fr"
            ? "Carte proportionnelle des dépenses publiques françaises"
            : "Proportional map of French public expenditure"
        }
        style={{ display: "block" }}
      >
        {tiles.map(({ item, rect }) => {
          // Un padding interne pour les bordures blanches "stack" feel.
          const pad = 1;
          const x = rect.x + pad;
          const y = rect.y + pad;
          const w = Math.max(0, rect.w - pad * 2);
          const h = Math.max(0, rect.h - pad * 2);
          const fill = fillFor(item.group, item.value, maxValue);
          const showLabel = w >= 60 && h >= 30;
          const showValue = w >= 80 && h >= 50;
          const tooltip =
            `${item.fullLabel} · ${fmtBnEur(item.value, locale)} · ` +
            `${fmtPctOfTotal(item.shareOfTotal, locale)}` +
            (totalLabel ? ` ${totalLabel}` : "");
          return (
            <Link
              key={item.id}
              href={item.href}
              scroll={false}
              aria-label={tooltip}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId((prev) => (prev === item.id ? null : prev))}
              onFocus={() => setHoverId(item.id)}
              onBlur={() => setHoverId((prev) => (prev === item.id ? null : prev))}
            >
              <g>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={fill}
                  stroke="#fafaf7"
                  strokeWidth={2}
                  style={{ cursor: "pointer" }}
                />
                {showLabel && (
                  <text
                    x={x + 10}
                    y={y + 22}
                    fill="#fff"
                    fontSize={13}
                    fontWeight={600}
                    style={{
                      pointerEvents: "none",
                      fontFamily: "'Inter Tight', Inter, sans-serif",
                    }}
                  >
                    {/* Tronquer label si la cellule est trop étroite */}
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
                    style={{
                      pointerEvents: "none",
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    }}
                  >
                    {fmtBnEur(item.value, locale)} ·{" "}
                    {fmtPctOfTotal(item.shareOfTotal, locale)}
                  </text>
                )}
              </g>
            </Link>
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
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {hovered.item.fullLabel}
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              opacity: 0.85,
            }}
          >
            {fmtBnEur(hovered.item.value, locale)} ·{" "}
            {fmtPctOfTotal(hovered.item.shareOfTotal, locale)}
            {totalLabel ? ` ${totalLabel}` : ""}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            {hovered.item.groupLabel}
          </div>
        </div>
      )}
    </div>
  );
}
