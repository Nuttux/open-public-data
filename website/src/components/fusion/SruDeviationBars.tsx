"use client";
/**
 * La ligne des 25 % — FT-style deviation bars.
 * One row per arrondissement; each bar spans from the SRU legal target
 * (vertical dashed line) to the arrondissement's rate. Red = below the
 * target, blue = above. An optional hollow marker shows where the same
 * arrondissement stood in a past year (the 18-year story in one glyph).
 * Rows are links to the arrondissement fiche.
 */
import Link from "next/link";

export type SruBarRow = {
  arr: number;
  label: string;
  tauxPct: number;
  /** Rate at the start of the published series (e.g. 2001) — hollow marker. */
  tauxPastPct?: number;
  href: string;
  title?: string;
};

export default function SruDeviationBars({
  rows,
  targetPct,
  targetLabel,
  vintageLabel,
  legendBelow,
  legendAbove,
  legendPast,
  maxPct = 45,
}: {
  rows: SruBarRow[];
  targetPct: number;
  targetLabel: string;
  /** e.g. « inventaire SRU · 1ᵉʳ janvier 2019 » — shown inside the chart. */
  vintageLabel?: string;
  legendBelow?: string;
  legendAbove?: string;
  legendPast?: string;
  maxPct?: number;
}) {
  const sorted = rows.slice().sort((a, b) => a.tauxPct - b.tauxPct);
  const pct = (v: number) => `${(v / maxPct) * 100}%`;
  const hasPast = sorted.some((r) => r.tauxPastPct != null);

  return (
    <div style={{ position: "relative" }}>
      {/* legend + vintage — inside the chart surface, always screenshot-safe */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          padding: "2px 0 10px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          {legendBelow && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, background: "var(--rouge)" }} />
              {legendBelow}
            </span>
          )}
          {legendAbove && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, background: "var(--bleu)" }} />
              {legendAbove}
            </span>
          )}
          {hasPast && legendPast && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  border: "1.5px solid var(--muted)",
                  background: "var(--bg)",
                }}
              />
              {legendPast}
            </span>
          )}
        </div>
        {vintageLabel && (
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 10.5,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--ocre)",
            }}
          >
            {vintageLabel}
          </span>
        )}
      </div>

      <div style={{ position: "relative", paddingBottom: 26 }}>
        {/* target line spanning all rows */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `calc(56px + (100% - 56px - 46px) * ${targetPct / maxPct})`,
            top: 0,
            bottom: 22,
            borderLeft: "1.5px dashed var(--ink)",
            zIndex: 1,
          }}
        />
        {sorted.map((r) => {
          const below = r.tauxPct < targetPct;
          const start = Math.min(r.tauxPct, targetPct);
          const end = Math.max(r.tauxPct, targetPct);
          return (
            <Link
              key={r.arr}
              href={r.href}
              scroll={false}
              title={r.title}
              className="fx-sru-row"
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr 46px",
                alignItems: "center",
                gap: 0,
                textDecoration: "none",
                color: "inherit",
                padding: "3.5px 0",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--f-ui)",
                  fontWeight: 700,
                  fontSize: 12.5,
                  color: "var(--ink)",
                }}
              >
                {r.label}
              </span>
              <span style={{ position: "relative", height: 16, display: "block" }}>
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: pct(start),
                    width: `calc(${pct(end)} - ${pct(start)})`,
                    top: 0,
                    bottom: 0,
                    background: below ? "var(--rouge)" : "var(--bleu)",
                    minWidth: 2,
                  }}
                />
                {r.tauxPastPct != null && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `calc(${pct(r.tauxPastPct)} - 4px)`,
                      top: 3,
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      border: "1.5px solid var(--muted)",
                      background: "var(--bg)",
                      boxSizing: "border-box",
                      zIndex: 2,
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 11,
                  color: "var(--muted)",
                  textAlign: "right",
                }}
              >
                {r.tauxPct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
              </span>
            </Link>
          );
        })}
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 0,
            left: `calc(56px + (100% - 56px - 46px) * ${targetPct / maxPct})`,
            transform: "translateX(-50%)",
            fontFamily: "var(--f-mono)",
            fontSize: 10.5,
            color: "var(--ink)",
            whiteSpace: "nowrap",
          }}
        >
          {targetLabel}
        </div>
      </div>
    </div>
  );
}
