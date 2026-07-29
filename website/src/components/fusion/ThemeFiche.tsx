"use client";

import type { ThemeSubventionsFiche } from "@/lib/fusion-data";
import { fill, fmtCompactEur, fmtInt, fmtDec } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";
import { useCity } from "./CityContext";
import { FicheStatHero, FicheBreakdown } from "@/components/fiche";
import FicheKpis from "./FicheKpis";

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
  const { basePath } = useCity();
  const total = fmtCompactEur(fiche.total);
  const color = colorFor(fiche.theme);
  const maxEvol = Math.max(...fiche.evolution.map((e) => e.amount), 1);

  return (
    <div>
      <FicheStatHero
        value={
          <>
            {total.value}
            <span className="fx-fiche-stat-unit">{total.unit}</span>
          </>
        }
        caption={fill(t("fx.fiche.theme.hero_cap"), { theme: fiche.theme, year: fiche.year })}
      />

      {/* Bénéficiaires et subventions sont égaux dès qu'aucun bénéficiaire du
       * thème n'a reçu deux versements — la bande affichait alors deux fois
       * le même nombre sous deux libellés différents. */}
      <FicheKpis
        items={[
          { label: t("fx.fiche.theme.kpi.part"), value: fmtDec(fiche.shareOfTotalPct, 1), unit: "%" },
          { label: t("fx.fiche.theme.kpi.benef"), value: fmtInt(fiche.nbBeneficiaires) },
          ...(fiche.nbSubventions !== fiche.nbBeneficiaires
            ? [{ label: t("fx.fiche.theme.kpi.subv"), value: fmtInt(fiche.nbSubventions) }]
            : []),
        ]}
      />

      {/* Le classement passe du tableau maison à la primitive partagée : même
       * barre proportionnelle, même comportement de lien, que sur les fiches
       * SF et Recife. La direction reste en seconde ligne (meta) plutôt qu'en
       * suffixe du nom, où elle se faisait tronquer sur mobile. */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{fill(t("fx.fiche.theme.top10"), { year: fiche.year })}</div>
        <FicheBreakdown
          cap={fiche.topBeneficiaires.length}
          rows={fiche.topBeneficiaires.map((b) => ({
            key: b.name,
            label: b.name,
            meta: b.direction ?? undefined,
            value: b.amount,
            href: `${basePath}/subventions/association/${encodeURIComponent(b.name)}`,
          }))}
          format={(n) => {
            const { value, unit } = fmtCompactEur(n);
            return `${value} ${unit}`;
          }}
        />
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
