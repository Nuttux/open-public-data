"use client";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import { useT, useLocale } from "@/lib/localeContext";
import type { EvolutionData, EvolutionPoint } from "@/lib/commune-evolution";

type CommuneMeta = { slug: string; nom: string; dep_name: string; reg_name: string; pop: number };

const METRICS: { key: keyof EvolutionPoint; color: string; labelKey: string }[] = [
  { key: "recettes_hab", color: "#1a7f4b", labelKey: "fx.natev.recettes" },
  { key: "depenses_hab", color: "#0a0a0a", labelKey: "fx.natev.depenses" },
  { key: "dette_hab", color: "#c12323", labelKey: "fx.natev.dette" },
];

function TrendChart({ series, labels }: { series: EvolutionPoint[]; labels: Record<string, string> }) {
  const W = 820;
  const H = 300;
  const pad = { t: 16, r: 16, b: 28, l: 52 };
  const years = series.map((s) => s.year);
  const vals: number[] = [];
  for (const s of series) for (const m of METRICS) { const v = s[m.key] as number | null; if (v != null) vals.push(v); }
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const x = (yr: number) =>
    pad.l + ((yr - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = [min, min + (max - min) / 2, max];
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fx-evolchart" role="img">
      {ticks.map((tk, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} stroke="#e6e6e6" />
          <text x={pad.l - 8} y={y(tk) + 4} textAnchor="end" className="fx-evol-axis">{nf.format(tk)}</text>
        </g>
      ))}
      {years.map((yr) => (
        <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fx-evol-axis">{yr}</text>
      ))}
      {METRICS.map((m) => {
        const pts = series
          .filter((s) => s[m.key] != null)
          .map((s) => `${x(s.year)},${y(s[m.key] as number)}`)
          .join(" ");
        return <polyline key={m.key} points={pts} fill="none" stroke={m.color} strokeWidth={2.5} />;
      })}
      {series.map((s) =>
        METRICS.map((m) =>
          s[m.key] != null ? (
            <circle key={`${s.year}-${m.key}`} cx={x(s.year)} cy={y(s[m.key] as number)} r={3} fill={m.color} />
          ) : null,
        ),
      )}
    </svg>
  );
}

export default function CommuneEvolutionClient({
  commune,
  data,
  sourceUrl,
}: {
  commune: CommuneMeta;
  data: EvolutionData;
  sourceUrl: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const nf = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR");
  const labels = Object.fromEntries(METRICS.map((m) => [m.labelKey, t(m.labelKey)]));
  const first = data.series[0];
  const last = data.series[data.series.length - 1];
  const deltaDette =
    first.dette_hab != null && last.dette_hab != null ? last.dette_hab - first.dette_hab : null;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap" style={{ padding: "48px 0" }}>
          <SectionHead
            kind="analyses"
            title={`${commune.nom} — ${t("fx.natev.kicker")}`}
            subtitle={`${commune.dep_name} · ${commune.reg_name} · ${data.years[0]}–${data.years[data.years.length - 1]}`}
          />
          <p className="fx-lede">{t("fx.natev.lede")}</p>

          <div className="fx-evol-legend">
            {METRICS.map((m) => (
              <span key={m.key} className="fx-evol-leg">
                <span className="fx-evol-dot" style={{ background: m.color }} />
                {t(m.labelKey)}
              </span>
            ))}
          </div>
          <div className="fx-sankey-wrap">
            <TrendChart series={data.series} labels={labels} />
          </div>

          {deltaDette != null && (
            <p className="fx-note">
              {t("fx.natev.dette_delta")} {deltaDette >= 0 ? "+" : ""}
              {nf.format(Math.round(deltaDette))} €/hab ({data.years[0]}→{data.years[data.years.length - 1]}).
            </p>
          )}

          <ChartSource source={t("fx.natev.source")} dataHref={sourceUrl} methodAnchor="c-villes" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
