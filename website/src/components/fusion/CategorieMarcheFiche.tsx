"use client";

import Link from "next/link";

import type { MarcheCategorieFiche } from "@/lib/fusion-data";
import { fmtCompactEur, fmtInt, fmtDec } from "@/lib/fmt";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";

export default function CategorieMarcheFiche({ fiche }: { fiche: MarcheCategorieFiche }) {
  const t = useT();
  const { locale } = useLocale();
  const fill = (s: string, vars: Record<string, string | number>) => {
    let r = s;
    for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
    return r;
  };
  const total = fmtCompactEur(fiche.total);

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{fill(t("fx.categorie.kpi.enveloppe_max"), { year: fiche.year })}</div>
          <div className="fx-fiche-kpi-value tnum">
            {total.value}
            <span className="u">{total.unit}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.categorie.kpi.share_paris")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtDec(fiche.shareOfTotalPct, 1)}
            <span className="u">%</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.categorie.kpi.contrats")}</div>
          <div className="fx-fiche-kpi-value tnum">{fmtInt(fiche.nbContrats)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.categorie.kpi.titulaires")}</div>
          <div className="fx-fiche-kpi-value tnum">{fmtInt(fiche.nbTitulaires)}</div>
        </div>
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{fill(t("fx.categorie.top_contrats"), { year: fiche.year })}</div>
        <table className="fx-fiche-subv-table">
          <thead>
            <tr>
              <th>{t("fx.categorie.col.objet")}</th>
              <th>{t("fx.categorie.col.titulaire")}</th>
              <th style={{ textAlign: "right" }}>{t("fx.categorie.col.enveloppe")}</th>
            </tr>
          </thead>
          <tbody>
            {fiche.topContrats.map((c) => {
              const { value, unit } = fmtCompactEur(c.montant);
              const preferred =
                locale === "en" && c.objetClairEn ? c.objetClairEn : c.objetClair;
              const objet = preferred || normalizeObjet(c.objet || "");
              return (
                <tr key={c.numero}>
                  <td style={{ maxWidth: 360 }}>
                    {c.numero ? (
                      <Link
                        href={`/marches-publics/contrat/${encodeURIComponent(c.numero)}`}
                        scroll={false}
                        style={{ color: "var(--ink)" }}
                      >
                        {objet.length > 90 ? objet.slice(0, 90) + "…" : objet}
                      </Link>
                    ) : (
                      <span>{objet}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c.fournisseurSiret ? (
                      <Link
                        href={`/marches-publics/fournisseur/${encodeURIComponent(c.fournisseurSiret)}`}
                        scroll={false}
                        style={{ color: "var(--ink-2)" }}
                      >
                        {c.fournisseur.slice(0, 40)}
                      </Link>
                    ) : (
                      c.fournisseur.slice(0, 40)
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700 }}>
                    {value} <span style={{ color: "var(--muted)", fontSize: ".75em" }}>{unit}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.categorie.top_titulaires")}</div>
        <div>
          {fiche.topTitulaires.map((tit, i) => {
            const { value, unit } = fmtCompactEur(tit.amount);
            const pct = (tit.amount / fiche.total) * 100;
            const href = tit.siret ? `/marches-publics/fournisseur/${encodeURIComponent(tit.siret)}` : null;
            const countLabel = fill(
              tit.nb > 1 ? t("fx.categorie.contrats_count_many") : t("fx.categorie.contrats_count_one"),
              { n: tit.nb },
            );
            const shareLabel = fill(t("fx.categorie.share_of_category"), { pct: fmtDec(pct, 1) });
            const inner = (
              <>
                <span className="rank">#{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontWeight: 500 }}>{tit.name}</span>
                <span className="muted fx-mini-hide-mobile">{countLabel} · {shareLabel}</span>
                <span className="num">
                  {value} <span className="muted">{unit}</span>
                </span>
              </>
            );
            return href ? (
              <Link key={i} href={href} scroll={false} className="fx-mini-row fx-mini-row-link">
                {inner}
              </Link>
            ) : (
              <div key={i} className="fx-mini-row">{inner}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
