type Point = {
  year: number;
  value: number;
  type: "execute" | "vote" | "estimate";
};

type Annotation = {
  year: number;
  label: string;
};

type Props = {
  points: Point[];
  /** Currently highlighted year (ink dot + badge; no rouge). */
  activeYear: number;
  /** Vertical dashed-line annotations (COVID, JO, etc). */
  annotations?: Annotation[];
  /** Axis labels — override the computed min/max/mid values in Md €. */
  yTicks?: number[];
  /** Height in px (viewBox is 1200×340 — width is responsive). */
  height?: number;
  /** Format a y-axis tick value. Defaults to `{n} Md` (budget use case). */
  formatYTick?: (v: number) => string;
  /** Replaces the active-year badge text ("2024 exéc."). */
  activeBadge?: string;
  /** Show the status row (EXÉC./VOTÉ/EST.). Defaults to true. */
  showStatus?: boolean;
  /** Override aria-label for accessibility. */
  ariaLabel?: string;
};

/**
 * Évolution du budget — line chart SVG. Solid line for executed
 * years, dashed line for estimate/voted; active year marked with an
 * ink (not rouge) dot + ink badge to avoid editorial red on neutral
 * values like "budget grew".
 */
export default function BudgetTimeline({
  points,
  activeYear,
  annotations = [],
  yTicks,
  height = 340,
  formatYTick,
  activeBadge,
  showStatus = true,
  ariaLabel,
}: Props) {
  // viewBox: 1200x340. Padding: 60 left, 20 right, 40 top, 60 bottom (labels)
  const W = 1200;
  const H = 340;
  const LEFT = 60;
  const RIGHT = 1180;
  const TOP = 40;
  const BOTTOM = 280;

  const sorted = points.slice().sort((a, b) => a.year - b.year);
  const minVal = Math.min(...sorted.map((p) => p.value));
  const maxVal = Math.max(...sorted.map((p) => p.value));
  // Prefer integer ticks (9, 10, 11, 12 Md). Fall back to 0.5 steps if the
  // range is too tight.
  const rawTop = Math.ceil(maxVal + 0.3);
  const rawBottom = Math.max(0, Math.floor(minVal - 0.3));
  const range = rawTop - rawBottom;
  const step = range >= 3 ? 1 : range >= 1.5 ? 0.5 : 0.2;
  const top = Math.ceil(maxVal / step) * step;
  const bottom = Math.floor(minVal / step) * step;
  const computedTicks: number[] = [];
  for (let v = top; v >= bottom - 1e-9; v -= step) computedTicks.push(Number(v.toFixed(2)));
  const ticks = yTicks ?? computedTicks;
  const yMin = ticks[ticks.length - 1];
  const yMax = ticks[0];

  const xFor = (year: number) => {
    const i = sorted.findIndex((p) => p.year === year);
    if (i < 0) return LEFT;
    const t = sorted.length > 1 ? i / (sorted.length - 1) : 0;
    return LEFT + t * (RIGHT - LEFT);
  };
  const yFor = (value: number) => {
    const t = (value - yMin) / (yMax - yMin);
    return BOTTOM - t * (BOTTOM - TOP);
  };

  // Split into solid (execute) + dashed (estimate/vote) segments.
  // Dashed starts at the last execute point so the two segments meet without
  // a gap on the chart.
  const firstNonExecIdx = sorted.findIndex((p) => p.type !== "execute");
  const solidPoints = firstNonExecIdx < 0 ? sorted : sorted.slice(0, firstNonExecIdx);
  const dashedPoints =
    firstNonExecIdx <= 0 ? [] : sorted.slice(Math.max(0, firstNonExecIdx - 1));

  const solidD = solidPoints.map((p) => `${xFor(p.year)},${yFor(p.value)}`).join(" ");
  const dashedD = dashedPoints.map((p) => `${xFor(p.year)},${yFor(p.value)}`).join(" ");

  const active = sorted.find((p) => p.year === activeYear) ?? sorted[sorted.length - 1];

  return (
    <div className="fx-timechart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel ?? `Évolution du budget ${sorted[0]?.year} à ${sorted[sorted.length - 1]?.year}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height }}
      >
        {/* Grid */}
        <g stroke="#e4e6ea" strokeWidth="1">
          {ticks.map((t, i) => (
            <line key={i} x1={LEFT} y1={yFor(t)} x2={RIGHT} y2={yFor(t)} />
          ))}
        </g>
        {/* Y labels */}
        <g fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#5f6672">
          {ticks.map((t, i) => (
            <text key={i} x={LEFT - 10} y={yFor(t) + 4} textAnchor="end">
              {formatYTick
                ? formatYTick(t)
                : `${(Number.isInteger(t) ? t.toString() : t.toFixed(1)).replace(".", ",")} Md`}
            </text>
          ))}
        </g>

        {/* Annotations — rect width & x clamped to stay inside the viewBox */}
        {annotations.map((a, i) => {
          const x = xFor(a.year);
          const annotW = Math.max(60, a.label.length * 6.2 + 16);
          const rectX = Math.max(2, Math.min(W - annotW - 2, x - annotW / 2));
          return (
            <g key={i}>
              <line x1={x} y1={TOP} x2={x} y2={BOTTOM} stroke="#9099a6" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <rect x={rectX} y={16} width={annotW} height="18" fill="#fafaf7" stroke="#9099a6" strokeWidth="0.8" />
              <text x={rectX + annotW / 2} y={29} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#5f6672" letterSpacing="0.5">
                {a.label}
              </text>
            </g>
          );
        })}

        {/* Line — solid for executed */}
        {solidPoints.length > 1 && (
          <polyline points={solidD} fill="none" stroke="#0a0a0a" strokeWidth="2.5" />
        )}
        {/* Line — dashed for estimate/vote */}
        {dashedPoints.length > 1 && (
          <polyline points={dashedD} fill="none" stroke="#0a0a0a" strokeWidth="2" strokeDasharray="6 4" />
        )}

        {/* Dots */}
        {sorted.map((p) => {
          const x = xFor(p.year);
          const y = yFor(p.value);
          if (p.year === activeYear) return null;
          if (p.type === "execute") {
            return <circle key={p.year} cx={x} cy={y} r="4" fill="#0a0a0a" />;
          }
          return <circle key={p.year} cx={x} cy={y} r="4" fill="#fff" stroke="#0a0a0a" strokeWidth="2" />;
        })}

        {/* Active year — ink + badge. Badge width scales with the label so
            custom activeBadge strings ("2024 · 2 657 logements") don't clip;
            the whole badge is shifted left/right when the point is close to
            a viewBox edge so it never overflows. The leader line stays
            anchored to the dot. */}
        {(() => {
          const activeX = xFor(active.year);
          const activeY = yFor(active.value);
          const badgeText =
            activeBadge ??
            `${active.year} ${active.type === "vote" ? "voté" : active.type === "estimate" ? "est." : "exéc."}`;
          const badgeW = Math.max(88, badgeText.length * 7.2 + 20);
          const halfW = badgeW / 2;
          const MARGIN = 4;
          let shift = 0;
          if (activeX + halfW > W - MARGIN) shift = W - MARGIN - (activeX + halfW);
          else if (activeX - halfW < MARGIN) shift = MARGIN - (activeX - halfW);
          return (
            <g>
              <circle cx={activeX} cy={activeY} r="8" fill="#0a0a0a" />
              <circle cx={activeX} cy={activeY} r="3.5" fill="#fafaf7" />
              <g transform={`translate(${activeX}, ${activeY})`}>
                <rect x={-halfW + shift} y="-60" width={badgeW} height="28" fill="#0a0a0a" />
                <text
                  x={shift}
                  y="-40"
                  textAnchor="middle"
                  fontFamily="Inter, sans-serif"
                  fontSize="12"
                  fontWeight="700"
                  fill="#fff"
                >
                  {badgeText}
                </text>
                <line x1="0" y1="-31" x2="0" y2="-10" stroke="#0a0a0a" strokeWidth="1.5" />
              </g>
            </g>
          );
        })()}

        {/* X labels */}
        <g fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#5f6672" textAnchor="middle">
          {sorted.map((p) => (
            <text
              key={p.year}
              x={xFor(p.year)}
              y={310}
              fill={p.year === activeYear ? "#0a0a0a" : "#5f6672"}
              fontWeight={p.year === activeYear ? 700 : 400}
            >
              {p.year}
            </text>
          ))}
        </g>
        {/* Status row */}
        {showStatus && (
          <g fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#9099a6" textAnchor="middle" letterSpacing="1">
            {sorted.map((p) => (
              <text
                key={p.year}
                x={xFor(p.year)}
                y={326}
                fill={p.year === activeYear ? "#0a0a0a" : "#9099a6"}
                fontWeight={p.year === activeYear ? 700 : 400}
              >
                {p.type === "execute" ? "EXÉC." : p.type === "vote" ? "VOTÉ" : "EST."}
              </text>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
