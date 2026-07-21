"use client";

import { useState } from "react";
import type { BailleurFiche as BailleurFicheType } from "@/lib/fusion-data";
import { cap, fill, fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";
import EmpruntsTable from "./EmpruntsTable";
import FicheKpis from "./FicheKpis";
import ShowMoreButton from "./ShowMoreButton";

const EMPRUNTS_PREVIEW = 10;

export default function BailleurFiche({ bailleur }: { bailleur: BailleurFicheType }) {
  const t = useT();
  const [showAllEmprunts, setShowAllEmprunts] = useState(false);

  const mdLabel = t("fx.s.md_eur");
  const mLabel = t("fx.s.m_eur");
  const fmtAmount = (v: number) =>
    v >= 1e9
      ? { value: fmtBillions(v), unit: mdLabel }
      : { value: fmtMillions(v, 0), unit: mLabel };

  const hasEditorial = Boolean(bailleur.description || bailleur.type || bailleur.share);
  const g = bailleur.garanties;

  return (
    <div>
      {hasEditorial && bailleur.description && (
        <p className="fx-fiche-lead">
          {cap(bailleur.description)}
        </p>
      )}

      {hasEditorial && (
        <div className="fx-fiche-kpis">
          {bailleur.share != null && (
            <div className="fx-fiche-kpi">
              <div className="fx-fiche-kpi-label">{t("fx.fiche.bail.part")}</div>
              <div className="fx-fiche-kpi-value tnum">
                ~ {bailleur.share}
                <span className="u">%</span>
              </div>
            </div>
          )}
          {bailleur.type && (
            <div className="fx-fiche-kpi">
              <div className="fx-fiche-kpi-label">{t("fx.fiche.bail.type")}</div>
              <div className="fx-fiche-kpi-value" style={{ fontSize: 16 }}>
                {bailleur.type}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section Identité droppée : nom (drawer title), statut (KPI type), description
       * (lead), raison sociale (g.name_raw = debug/source info) tous redondants.
       *
       * Garanties promues en position 1 après KPIs principaux — c'est le différentiateur
       * éditorial (per-bailleur agrégé sur prêteurs + emprunts top, ce que la Ville ne
       * publie pas en agrégat lisible). */}
      {g && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.bail.garanties_title")}</div>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: "0 0 16px" }}>
            {t("fx.fiche.bail.garanties_lead")}{" "}
            <a
              /* name_raw = désignation verbatim du dataset dette-garantie, le
               * refine tombe donc exactement sur les emprunts de ce bailleur */
              href={`https://opendata.paris.fr/explore/dataset/dette-garantie/table/?refine.annee_de_publication=${g.year}&refine.designation_du_beneficiaire=${encodeURIComponent(g.name_raw)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
            >
              {t("fx.s.opendata")}
            </a>
          </p>

          <FicheKpis
            items={[
              {
                label: fill(t("fx.fiche.bg.capital"), { year: g.year }),
                value: fmtAmount(g.capital_restant).value,
                unit: fmtAmount(g.capital_restant).unit,
              },
              { label: t("fx.fiche.bg.taux"), value: fmtDec(g.taux_moyen_pondere_pct, 2), unit: "%" },
              { label: t("fx.fiche.bg.duree"), value: fmtDec(g.duree_residuelle_moyenne_ans, 1), unit: t("fx.det.s02.kpi.ans") },
              { label: t("fx.fiche.bg.part_fixe"), value: fmtInt(g.part_fixe * 100), unit: "%" },
            ]}
          />

          {/* Chaîne de financement : quelle part de la dette logement est
           * rattachée à une adresse précise. Le différentiateur — la Ville ne
           * publie pas ce lien emprunt → programme. */}
          {g.financement && g.financement.base_logement > 0 && (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.55,
                margin: "14px 0 0",
                padding: "10px 12px",
                background: "var(--bleu-wash, rgba(37,99,235,.06))",
                borderRadius: 8,
              }}
            >
              {fill(t("fx.fiche.bg.finance_summary"), {
                part: fmtInt(g.financement.part_rattachee * 100),
                n: fmtInt(g.financement.n_programmes),
              })}
            </p>
          )}

          {g.preteurs.length > 0 && (
            <>
              <h4 className="fx-h4" style={{ marginTop: 20, fontSize: 14 }}>
                {t("fx.fiche.bg.preteurs")}
              </h4>
              <table className="fx-fiche-table">
                <thead>
                  <tr>
                    <th>{t("fx.fiche.bg.col.preteur")}</th>
                    <th className="num">{t("fx.fiche.bg.col.encours")}</th>
                    <th className="num">{t("fx.fiche.bg.col.part")}</th>
                    <th className="num">{t("fx.fiche.bg.col.emprunts")}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.preteurs.map((p, i) => {
                    const f = fmtAmount(p.capital_restant);
                    return (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td className="num tnum">
                          <b>{f.value}</b> <span className="muted">{f.unit}</span>
                        </td>
                        <td className="num tnum mono">{fmtDec(p.share * 100, 1)} %</td>
                        <td className="num tnum mono">{fmtInt(p.count_emprunts)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {g.emprunts_top.length > 0 && (
            <>
              <h4 className="fx-h4" style={{ marginTop: 24, fontSize: 14 }}>
                {fill(t("fx.fiche.bg.emprunts_title"), { n: g.emprunts_top.length })}
              </h4>
              <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                {t("fx.fiche.bg.emprunts_desc")}
              </p>
              <EmpruntsTable
                variant="bailleur"
                emprunts={showAllEmprunts ? g.emprunts_top : g.emprunts_top.slice(0, EMPRUNTS_PREVIEW)}
              />
              {!showAllEmprunts && g.emprunts_top.length > EMPRUNTS_PREVIEW && (
                <ShowMoreButton onClick={() => setShowAllEmprunts(true)}>
                  {fill(t("fx.fiche.bg.voir_autres_emprunts"), { n: g.emprunts_top.length - EMPRUNTS_PREVIEW })}
                </ShowMoreButton>
              )}
            </>
          )}
        </section>
      )}

      {!g && hasEditorial && (
        <p
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: ".02em",
            lineHeight: 1.5,
          }}
        >
          {t("fx.fiche.bail.avenir")}
        </p>
      )}
    </div>
  );
}
