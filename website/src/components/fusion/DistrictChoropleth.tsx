"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

import { CHOROPLETH_PALETTE as PALETTE } from "./choropleth-palette";
import { useT, useLocale } from "@/lib/localeContext";
import { numLocale } from "@/lib/fmt";
import { useTrack } from "@/lib/analyticsContext";
import { getClickCoords } from "@/lib/analytics-helpers";

const sufFr = (n: number) => (n === 1 ? "er" : "ᵉ");
const sufEn = (n: number) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

const fmtEurLocale = (n: number, locStr: string, mdLabel: string, mLabel: string) => {
  const sep = locStr === "en-GB" ? "." : ",";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", sep)} ${mdLabel}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", sep)} ${mLabel}`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString(locStr)} k €`;
  return `${Math.round(n).toLocaleString(locStr)} €`;
};

export type DistrictItem = { arr: number; amount: number; count: number };

type Props = {
  items: DistrictItem[];
  /** SVG geometry: one path per index, parallel to `regionByIndex`. */
  paths: string[];
  /** index -> district id (or null to skip). Several indices may share an id
   *  (a district drawn as several polygons). */
  regionByIndex: (number | null)[];
  /** SVG viewBox for the geometry. */
  viewBox: string;
  /** Map a data item's `arr` to a district id — e.g. Paris merges arr 1-4 into
   *  a single "Centre" district (id 0). Defaults to identity. */
  regionForArr?: (arr: number) => number;
  /** District id treated as a merged "centre" for labelling + ranking. */
  centreRegionId?: number;
  /** Localised label for the centre district (e.g. "Paris Centre (1-4ᵉ)"). */
  centreLabel?: (locale: "fr" | "en") => string;
  height?: number;
  /** Formats the main value shown in tooltip, ranking and legend bounds.
   *  Defaults to euro formatting. */
  formatValue?: (v: number) => string;
  /** Label used after the count in the tooltip ("projets", "logements"…).
   *  Defaults to fx.choro.projets_loc. */
  unitLabel?: string;
  /** Builds the click-through href from a district id. Return null to make
   *  tiles non-clickable. Defaults to no href (non-clickable unless a city
   *  wrapper or `onTileClick` provides interactivity). */
  hrefFor?: (arr: number) => string | null;
  /** When provided, overrides href navigation with a local callback —
   *  useful for opening a drawer with in-page state rather than routing. */
  onTileClick?: (arr: number) => void;
  /** Show the top-5 ranking list in the sidebar. Defaults to true. */
  showRanking?: boolean;
};

/**
 * Generic district choropleth (map + ranking sidebar).
 *
 * This is the universalised Paris map: any city passes its own SVG geometry
 * (`paths` + `regionByIndex` + `viewBox`) and optional per-city rules (the
 * arr→district merge, a merged "centre" district). Paris keeps its exact
 * behaviour via the thin ParisChoropleth wrapper; other cities reuse this
 * directly instead of hand-forking a whole component.
 */
export default function DistrictChoropleth({
  items,
  paths,
  regionByIndex,
  viewBox,
  regionForArr = (arr) => arr,
  centreRegionId,
  centreLabel,
  height = 420,
  formatValue,
  unitLabel,
  hrefFor,
  onTileClick,
  showRanking = true,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = numLocale(locale);
  const suf = locale === "en" ? sufEn : sufFr;
  const mdLabel = t("fx.s.md_eur");
  const mLabel = t("fx.s.m_eur");
  const fmtEur =
    formatValue ?? ((n: number) => fmtEurLocale(n, locStr, mdLabel, mLabel));
  const unit = unitLabel ?? t("fx.choro.projets_loc");

  const labelFor = (id: number): string => {
    if (centreRegionId != null && id === centreRegionId && centreLabel) {
      return centreLabel(locale === "en" ? "en" : "fr");
    }
    return locale === "en" ? `${id}${suf(id)} district` : `${id}${suf(id)} arrondissement`;
  };

  const router = useRouter();
  const track = useTrack();
  const pathname = usePathname();

  // Consolidate item data into districts (Paris merges arr 1-4 → centre).
  const byCar = new Map<number, DistrictItem>();
  for (const it of items) {
    const key = regionForArr(it.arr);
    const cur = byCar.get(key) ?? { arr: key, amount: 0, count: 0 };
    cur.amount += it.amount;
    cur.count += it.count;
    byCar.set(key, cur);
  }

  const resolveHref = hrefFor ?? (() => null);
  const openArr = (cAr: number, source: "map" | "ranking", ev?: React.MouseEvent) => {
    const it = byCar.get(cAr);
    track("choropleth_click", {
      page: pathname,
      arr: cAr,
      amount: it?.amount ?? 0,
      count: it?.count ?? 0,
      source,
      ...(ev ? getClickCoords(ev) : {}),
    });
    if (onTileClick) {
      onTileClick(cAr);
      return;
    }
    const href = resolveHref(cAr);
    if (href) router.push(href, { scroll: false });
  };
  const isInteractive = (cAr: number) => Boolean(onTileClick) || Boolean(resolveHref(cAr));

  const amounts = [...byCar.values()].map((v) => v.amount).sort((a, b) => a - b);
  const quantiles: number[] = [];
  for (let i = 1; i < PALETTE.length; i++) {
    const idx = Math.floor((i / PALETTE.length) * amounts.length);
    quantiles.push(amounts[idx] ?? 0);
  }
  const colorFor = (amount: number): string => {
    for (let i = 0; i < quantiles.length; i++) {
      if (amount <= quantiles[i]) return PALETTE[i];
    }
    return PALETTE[PALETTE.length - 1];
  };

  const [hovered, setHovered] = useState<number | null>(null);
  const hoveredItem = hovered != null ? byCar.get(hovered) : null;

  return (
    <div className="fx-choropleth">
      <div className="fx-choropleth-map" style={{ height }}>
        <div className="fx-choropleth-hint-mobile">
          {t("fx.choro.mobile_hint")}
        </div>
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-label={t("fx.choro.aria")}>
          <g>
            {paths.map((d, i) => {
              const cAr = regionByIndex[i];
              if (cAr == null) return null;
              const it = byCar.get(cAr);
              const amount = it?.amount ?? 0;
              const color = it ? colorFor(amount) : "#e9e6dc";
              const isHover = hovered === cAr;
              return (
                <path
                  key={`${cAr}-${i}`}
                  d={d}
                  fill={color}
                  stroke={isHover ? "#0a0a0a" : "#faf9f5"}
                  strokeWidth={isHover ? 0.8 : 0.5}
                  style={{
                    cursor: isInteractive(cAr) ? "pointer" : "default",
                    transition: "fill 120ms ease, stroke 120ms ease, stroke-width 120ms ease",
                    opacity: hovered != null && !isHover ? 0.75 : 1,
                  }}
                  onMouseEnter={() => setHovered(cAr)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => openArr(cAr, "map", e)}
                >
                  <title>{`${labelFor(cAr)} · ${fmtEur(amount)} · ${it?.count ?? 0} ${unit} — ${t("fx.choro.click_open")}`}</title>
                </path>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="fx-choropleth-sidebar">
        <div className="fx-choropleth-tooltip">
          {hoveredItem ? (
            <>
              <div className="fx-choropleth-arr">{labelFor(hoveredItem.arr)}</div>
              <div className="fx-choropleth-amount">{fmtEur(hoveredItem.amount)}</div>
              <div className="fx-choropleth-count">{hoveredItem.count} {unit}</div>
            </>
          ) : (
            <>
              <div className="fx-choropleth-hint">{t("fx.choro.hover")}</div>
              <div className="fx-choropleth-total">
                {fmtEur([...byCar.values()].reduce((s, i) => s + i.amount, 0))} {t("fx.choro.total")}
              </div>
            </>
          )}
        </div>

        <div className="fx-choropleth-legend">
          <div className="fx-choropleth-legend-label">{t("fx.choro.legend_label")}</div>
          <div className="fx-choropleth-legend-scale">
            {PALETTE.map((c, i) => (
              <div key={i} className="fx-choropleth-legend-step" style={{ background: c }}>
                <span>
                  {i === 0
                    ? t("fx.choro.legend_low")
                    : i === PALETTE.length - 1
                      ? t("fx.choro.legend_high")
                      : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="fx-choropleth-legend-bounds">
            <span>{fmtEur(amounts[0] ?? 0)}</span>
            <span>{fmtEur(amounts[amounts.length - 1] ?? 0)}</span>
          </div>
        </div>

        {showRanking && (
        <ol className="fx-choropleth-ranking">
          {(() => {
            const sorted = [...byCar.values()].sort((a, b) => b.amount - a.amount);
            const top5 = sorted.slice(0, 5);
            const centre = centreRegionId != null
              ? sorted.find((it) => it.arr === centreRegionId)
              : undefined;
            // Always surface the merged centre district so users who don't know
            // it's been merged can still find it.
            const shown = centreRegionId == null || top5.some((it) => it.arr === centreRegionId) || !centre
              ? top5
              : [...top5.slice(0, 4), centre];
            return shown.map((it, i) => (
              <li
                key={it.arr}
                onMouseEnter={() => setHovered(it.arr)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => openArr(it.arr, "ranking", e)}
                className={hovered === it.arr ? "is-hover" : ""}
              >
                <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="arr">
                  {centreRegionId != null && it.arr === centreRegionId
                    ? t("fx.choro.centre_short")
                    : `${it.arr}${suf(it.arr)}`}
                </span>
                <span className="amt">{fmtEur(it.amount)}</span>
              </li>
            ));
          })()}
        </ol>
        )}
      </div>
    </div>
  );
}
