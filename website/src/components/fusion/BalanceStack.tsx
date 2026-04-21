"use client";

import type { ReactNode } from "react";

export type BalanceSegment = {
  key: string;
  label: ReactNode;
  value: number;
  display: ReactNode;
  /** If provided, clicking opens a drawer. */
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
  return (
    <div className="fx-balance-col">
      <div className="fx-bc-head">
        <span>{headLeft}</span>
        <span className="fx-bc-total tnum">{headRight}</span>
      </div>
      <div className="fx-bc-stack" aria-label={`${side} ventilé`}>
        {segments.map((s, i) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const auto = pct > 0 && pct < 4;
          const cls = [
            "fx-bc-seg",
            s.filled === false ? "light" : "",
            s.tiny || auto ? "tiny" : "",
            s.onClick ? "clickable" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const alpha = s.filled === false
            ? undefined
            : Math.max(0.34, 0.85 - i * 0.1);
          const style: React.CSSProperties = {
            flex: `0 0 ${pct}%`,
          };
          if (alpha !== undefined) {
            style.background = `rgba(10,10,10,${alpha.toFixed(2)})`;
          }
          const content = (
            <>
              <span className="fx-bc-seg-l">{s.label}</span>
              <span className="fx-bc-seg-v tnum">{s.display}</span>
            </>
          );
          return s.onClick ? (
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
