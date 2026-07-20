"use client";

import Link from "next/link";

import type { ThemeSubventionsFiche } from "@/lib/fusion-data";
import { fmtCompactEur, fmtInt, fmtDec } from "@/lib/fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const THEME_COLORS: Record<string, string> = {
  "Social": "#c12323",
  "Logement": "#546583",
  "Éducation": "#2a3680",
  "Culture": "#a67638",
  "Sport": "#3a8f4a",
  "Environnement": "#6b9c52",
  "Santé": "#b8495d",
  "Transport": "#4a8aa6",
  "Économie": "#8a5a3b",
  "Administration": "#6b6f7a",
  "Sécurité": "#3d4045",
  "International": "#7b6aa3",
};

function colorFor(theme: string): string {
  for (const k of Object.keys(THEME_COLORS)) {
    if (theme.startsWith(k)) return THEME_COLORS[k];
  }
  return "#9099a6";
}

export default function ThemeFiche({ fiche }: { fiche: ThemeSubventionsFiche }) {
  const t = useT();
  const { locale } = useLocale();
  const total = fmtCompactEur(fiche.total);
  const color = colorFor(fiche.theme);
  const maxEvol = Math.max(...fiche.evolution.map((e) => e.amount), 1);

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{fill(t("fx.fiche.theme.kpi.montant"), { year: fiche.year })}</div>
          <div className="fx-fiche-kpi-value tnum">
            {total.value}
            <span className="u">{total.unit}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.theme.kpi.part")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtDec(fiche.shareOfTotalPct, 1)}
            <span className="u">%</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.theme.kpi.benef")}</div>
          <div className="fx-fiche-kpi-value tnum">{fmtInt(fiche.nbBeneficiaires)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.theme.kpi.subv")}</div>
          <div className="fx-fiche-kpi-value tnum">{fmtInt(fiche.nbSubventions)}</div>
        </div>
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{fill(t("fx.fiche.theme.top10"), { year: fiche.year })}</div>
        <div>
          {fiche.topBeneficiaires.map((b, i) => {
            const { value, unit } = fmtCompactEur(b.amount);
            const pct = (b.amount / fiche.total) * 100;
            return (
              <Link
                key={b.name}
                href={`/qui-recoit/association/${encodeURIComponent(b.name)}`}
                scroll={false}
                className="fx-mini-row fx-mini-row-link"
                style={{ gridTemplateColumns: "32px 1fr auto 90px" }}
              >
                <span className="rank">#{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontWeight: 500 }}>
                  {b.name}
                  {b.direction && (
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginLeft: 8 }}>
                      · {b.direction}
                    </span>
                  )}
                </span>
                <span className="muted fx-mini-hide-mobile">{fmtDec(pct, 1)} %</span>
                <span className="num">
                  {value} <span className="muted">{unit}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {fiche.evolution.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{fill(t("fx.fiche.theme.evolution"), { year: fiche.evolution[0].year })}</div>
          <div>
            {fiche.evolution
              .slice()
              .reverse()
              .map((y) => {
                const { value, unit } = fmtCompactEur(y.amount);
                const pct = (y.amount / maxEvol) * 100;
                return (
                  <div
                    key={y.year}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "56px 1fr 100px 80px",
                      gap: 14,
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--rule)",
                      fontFamily: "var(--f-ui)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontFamily: "var(--f-mono)", color: "var(--ocre)" }}>{y.year}</span>
                    <span style={{ position: "relative", height: 8 }}>
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 1,
                          height: 6,
                          width: `${pct}%`,
                          background: color,
                          opacity: 0.85,
                        }}
                      />
                    </span>
                    <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700 }}>
                      {value} <span style={{ fontSize: ".7em", color: "var(--muted)" }}>{unit}</span>
                    </span>
                    <span style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
                      {fill(t("fx.fiche.theme.sub_abbr"), { n: fmtInt(y.count) })}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <p className="fx-fiche-note">{t("fx.fiche.theme.note")}</p>
    </div>
  );
}
