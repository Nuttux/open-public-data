"use client";

import Link from "next/link";
import type { ArrondissementFiche as ArrondissementFicheType } from "@/lib/fusion-data";
import ProjetThumb from "./ProjetThumb";
import { useT, useLocale } from "@/lib/localeContext";
import { fill } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { trLabel } from "@/lib/label-translate";

export default function ArrondissementFiche({ arr }: { arr: ArrondissementFicheType }) {
  const t = useT();
  const { locale } = useLocale();
  const fmtEur = useFmtEur();

  const { v, u } = fmtEur(arr.total);

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{fill(t("fx.fiche.arr.investi"), { year: arr.year })}</div>
          <div className="fx-fiche-kpi-value tnum">
            {v}
            <span className="u">{u}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.arr.part_geo")}</div>
          <div className="fx-fiche-kpi-value tnum">{arr.totalShare.toFixed(1).replace(".", locale === "en" ? "." : ",")} <span className="u">%</span></div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.arr.rang")}</div>
          <div className="fx-fiche-kpi-value tnum">#{arr.rank}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.arr.projets")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 24 }}>
            {arr.nbProjets} <span className="muted" style={{ fontSize: 12 }}>{fill(t("fx.fiche.arr.geo_n"), { n: arr.nbGeo })}</span>
          </div>
        </div>
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{fill(t("fx.fiche.arr.top_projets"), { year: arr.year })}</div>
        <div className="fx-arr-top-grid">
          {arr.topProjets.map((p, i) => {
            const f = fmtEur(p.amount);
            return (
              <Link
                key={p.id}
                href={`/fr/city/paris/investissements/projet/${encodeURIComponent(p.id)}`}
                scroll={false}
                className="fx-arr-top-item"
              >
                <div className="fx-arr-top-thumb">
                  <ProjetThumb photo={p.photo.photo} generic={p.photo.generic} typologie={p.photo.typologie} aspectRatio="4 / 3" fallbackLabel={p.name} />
                </div>
                <div className="fx-arr-top-meta">
                  <div className="fx-arr-top-rank">{String(i + 1).padStart(2, "0")}</div>
                  <div className="fx-arr-top-name">{p.name.slice(0, 80)}</div>
                  <div className="fx-arr-top-amount">{f.v} <span className="u">{f.u}</span></div>
                  <div className="fx-arr-top-chap">{trLabel(p.chapitre, locale)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {arr.byChapitre.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.arr.repartition")}</div>
          <div>
            {arr.byChapitre.map((c) => {
              const pct = (c.amount / arr.total) * 100;
              const f = fmtEur(c.amount);
              return (
                <div
                  key={c.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "baseline",
                    gap: 12,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--rule)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{trLabel(c.label, locale)}</span>
                  <span className="muted" style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>
                    {c.count} {c.count > 1 ? t("fx.fiche.arr.projet_p") : t("fx.fiche.arr.projet_s")}
                  </span>
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, minWidth: 80, textAlign: "right" }}>
                    {f.v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{f.u}</span>
                    <span className="muted" style={{ marginLeft: 8, fontFamily: "var(--f-mono)", fontSize: 11 }}>
                      {pct.toFixed(0)} %
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
