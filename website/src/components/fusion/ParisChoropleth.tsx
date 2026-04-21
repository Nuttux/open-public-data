"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ARRONDISSEMENT_PATHS, C_AR_BY_INDEX } from "./paris-arrondissements";
import { useT, useLocale } from "@/lib/localeContext";

const sufFr = (n: number) => (n === 1 ? "er" : "ᵉ");
const sufEn = (n: number) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

// Central arrondissements 1-4 fusionnés en secteur "Paris Centre" (c_ar=0).
const CENTRAL_ARRS = [1, 2, 3, 4];

const fmtEurLocale = (n: number, locStr: string, mdLabel: string, mLabel: string) => {
  const sep = locStr === "en-GB" ? "." : ",";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", sep)} ${mdLabel}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", sep)} ${mLabel}`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString(locStr)} k €`;
  return `${Math.round(n).toLocaleString(locStr)} €`;
};

/** Palette 5 paliers : pale ocre → ink. */
const PALETTE = ["#f0e3c9", "#d8b88a", "#b88856", "#6d4a1c", "#2b1a08"];

type Item = { arr: number; amount: number; count: number };

type Props = {
  items: Item[];
  height?: number;
};

export default function ParisChoropleth({ items, height = 420 }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const suf = locale === "en" ? sufEn : sufFr;
  const mdLabel = t("fx.s.md_eur");
  const mLabel = t("fx.s.m_eur");
  const fmtEur = (n: number) => fmtEurLocale(n, locStr, mdLabel, mLabel);

  const labelFor = (cAr: number): string => {
    if (cAr === 0) return locale === "en" ? "Paris Centre (1-4th)" : "Paris Centre (1-4ᵉ)";
    return locale === "en" ? `${cAr}${suf(cAr)} district` : `${cAr}${suf(cAr)} arrondissement`;
  };

  const router = useRouter();

  // Consolide les données arr 1→20 en c_ar 0/5-20 (arr 1-4 → Paris Centre).
  const byCar = new Map<number, Item>();
  for (const it of items) {
    const key = CENTRAL_ARRS.includes(it.arr) ? 0 : it.arr;
    const cur = byCar.get(key) ?? { arr: key, amount: 0, count: 0 };
    cur.amount += it.amount;
    cur.count += it.count;
    byCar.set(key, cur);
  }

  const openArr = (cAr: number) => {
    // For Paris Centre, link to the first central arrondissement (arr=1) — the
    // per-arrondissement fiche will still aggregate. Otherwise use c_ar as-is.
    const target = cAr === 0 ? 1 : cAr;
    router.push(`/investissements/arrondissement/${target}`, { scroll: false });
  };

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
        <svg viewBox="0 0 200 140" preserveAspectRatio="xMidYMid meet" aria-label={t("fx.choro.aria")}>
          <g>
            {ARRONDISSEMENT_PATHS.map((d, i) => {
              const cAr = C_AR_BY_INDEX[i];
              if (cAr == null) return null;
              const it = byCar.get(cAr);
              const amount = it?.amount ?? 0;
              const color = it ? colorFor(amount) : "#e9e6dc";
              const isHover = hovered === cAr;
              return (
                <path
                  key={cAr}
                  d={d}
                  fill={color}
                  stroke={isHover ? "#0a0a0a" : "#faf9f5"}
                  strokeWidth={isHover ? 0.8 : 0.5}
                  style={{
                    cursor: "pointer",
                    transition: "fill 120ms ease, stroke 120ms ease, stroke-width 120ms ease",
                    opacity: hovered != null && !isHover ? 0.75 : 1,
                  }}
                  onMouseEnter={() => setHovered(cAr)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => openArr(cAr)}
                >
                  <title>
                    {labelFor(cAr)} · {fmtEur(amount)} · {it?.count ?? 0} {locale === "en" ? "projects" : "projets"} — {t("fx.choro.click_open")}
                  </title>
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
              <div className="fx-choropleth-count">{hoveredItem.count} {t("fx.choro.projets_loc")}</div>
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

        <ol className="fx-choropleth-ranking">
          {(() => {
            const sorted = [...byCar.values()].sort((a, b) => b.amount - a.amount);
            const top5 = sorted.slice(0, 5);
            const centre = sorted.find((it) => it.arr === 0);
            // Always surface Paris Centre so users who don't know it's been
            // merged (arrs 1-4) can still find it here.
            const shown = top5.some((it) => it.arr === 0) || !centre
              ? top5
              : [...top5.slice(0, 4), centre];
            return shown.map((it, i) => (
              <li
                key={it.arr}
                onMouseEnter={() => setHovered(it.arr)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => openArr(it.arr)}
                className={hovered === it.arr ? "is-hover" : ""}
              >
                <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="arr">{it.arr === 0 ? t("fx.choro.centre_short") : `${it.arr}${suf(it.arr)}`}</span>
                <span className="amt">{fmtEur(it.amount)}</span>
              </li>
            ));
          })()}
        </ol>
      </div>
    </div>
  );
}
