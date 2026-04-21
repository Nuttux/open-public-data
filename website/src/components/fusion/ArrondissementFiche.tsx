"use client";

import Link from "next/link";
import type { ArrondissementFiche as ArrondissementFicheType } from "@/lib/fusion-data";
import ProjetThumb from "./ProjetThumb";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

export default function ArrondissementFiche({ arr }: { arr: ArrondissementFicheType }) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const fmtEur = (n: number) => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    if (n >= 1e3) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
    return { v: new Intl.NumberFormat(locStr).format(n), u: "€" };
  };

  const suf = (n: number) => (locale === "en" ? (n === 1 ? "st" : "th") : n === 1 ? "er" : "ᵉ");

  const { v, u } = fmtEur(arr.total);
  const topChap = arr.byChapitre[0];

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

      {topChap && (
        <div className="fx-fiche-rank">
          <span className="fx-fiche-rank-num" style={{ color: "var(--ocre)" }}>{t("fx.fiche.arr.rank1")}</span>
          <span>
            {fill(t("fx.fiche.arr.top_chap"), {
              label: trLabel(topChap.label, locale),
              v: fmtEur(topChap.amount).v,
              u: fmtEur(topChap.amount).u,
              n: topChap.count,
              s: topChap.count > 1 ? "s" : "",
            })}
          </span>
        </div>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{fill(t("fx.fiche.arr.top_projets"), { year: arr.year })}</div>
        <div className="fx-arr-top-grid">
          {arr.topProjets.map((p, i) => {
            const f = fmtEur(p.amount);
            return (
              <Link
                key={p.id}
                href={`/investissements/projet/${encodeURIComponent(p.id)}`}
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
