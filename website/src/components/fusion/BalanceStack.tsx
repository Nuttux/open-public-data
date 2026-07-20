"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/lib/localeContext";

export type BalanceSegment = {
  key: string;
  label: ReactNode;
  value: number;
  display: ReactNode;
  /** If provided, clicking navigates (drawer route) — preferred over onClick. */
  href?: string;
  /** If provided (and no href), clicking runs a local callback. */
  onClick?: () => void;
  /** Darker fill with white text. Default for high-rank segments. */
  filled?: boolean;
  /** Small row (auto-applied under 4 %). */
  tiny?: boolean;
};

type ColumnProps = {
  side: "actif" | "passif";
  headLeft: ReactNode;
  headRight: ReactNode;
  total: number;
  segments: BalanceSegment[];
  legend?: ReactNode;
};

function Column({ side, headLeft, headRight, total, segments, legend }: ColumnProps) {
  const t = useT();
  const clickable = segments.some((s) => s.href || s.onClick);
  return (
    <div className="fx-balance-col">
      <div className="fx-bc-head">
        <span>{headLeft}</span>
        <span className="fx-bc-total tnum">{headRight}</span>
      </div>
      {clickable && <div className="fx-bc-hint">{t("fx.bb.click_hint")}</div>}
      <div className="fx-bc-stack" aria-label={t(side === "actif" ? "fx.bb.actif_aria" : "fx.bb.passif_aria")}>
        {segments.map((s, i) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const isTiny = s.tiny || (pct > 0 && pct < 4);
          const cls = [
            "fx-bc-seg",
            s.filled === false ? "light" : "",
            isTiny ? "tiny" : "",
            s.href || s.onClick ? "clickable" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const alpha = s.filled === false
            ? undefined
            : Math.max(0.34, 0.85 - i * 0.1);
          const style: React.CSSProperties = isTiny
            ? { flex: "0 0 auto" }
            : { flex: `${s.value} 1 0` };
          if (alpha !== undefined) {
            style.background = `rgba(10,10,10,${alpha.toFixed(2)})`;
          }
          const content = (
            <>
              <span className="fx-bc-seg-l">{s.label}</span>
              <span className="fx-bc-seg-v tnum">{s.display}</span>
            </>
          );
          return s.href ? (
            <Link
              key={s.key}
              href={s.href}
              scroll={false}
              className={cls}
              style={style}
              aria-label={typeof s.label === "string" ? s.label : undefined}
            >
              {content}
            </Link>
          ) : s.onClick ? (
            <button
              key={s.key}
              type="button"
              className={cls}
              style={style}
              onClick={s.onClick}
              aria-label={typeof s.label === "string" ? s.label : undefined}
            >
              {content}
            </button>
          ) : (
            <div key={s.key} className={cls} style={style}>
              {content}
            </div>
          );
        })}
      </div>
      {legend && <div className="fx-bc-legend">{legend}</div>}
    </div>
  );
}

type Props = {
  actif: Omit<ColumnProps, "side">;
  passif: Omit<ColumnProps, "side">;
};

export default function BalanceStack({ actif, passif }: Props) {
  return (
    <div className="fx-balance-grid">
      <Column side="actif" {...actif} />
      <Column side="passif" {...passif} />
    </div>
  );
}
