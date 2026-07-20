"use client";

import { useState } from "react";
import type { BailleurFiche as BailleurFicheType } from "@/lib/fusion-data";
import { cap, fill, fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";

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

          <div className="fx-fiche-kpis">
            <div className="fx-fiche-kpi">
              <div className="fx-fiche-kpi-label">
                {fill(t("fx.fiche.bg.capital"), { year: g.year })}
              </div>
              <div className="fx-fiche-kpi-value tnum">
                {fmtAmount(g.capital_restant).value}
                <span className="u">{fmtAmount(g.capital_restant).unit}</span>
              </div>
            </div>
            <div className="fx-fiche-kpi">
              <div className="fx-fiche-kpi-label">{t("fx.fiche.bg.taux")}</div>
              <div className="fx-fiche-kpi-value tnum">
                {fmtDec(g.taux_moyen_pondere_pct, 2)}
                <span className="u">%</span>
              </div>
            </div>
            <div className="fx-fiche-kpi">
              <div className="fx-fiche-kpi-label">{t("fx.fiche.bg.duree")}</div>
              <div className="fx-fiche-kpi-value tnum">
                {fmtDec(g.duree_residuelle_moyenne_ans, 1)}
                <span className="u">{t("fx.det.s02.kpi.ans")}</span>
              </div>
            </div>
            <div className="fx-fiche-kpi">
              <div className="fx-fiche-kpi-label">{t("fx.fiche.bg.part_fixe")}</div>
              <div className="fx-fiche-kpi-value tnum">
                {fmtInt(g.part_fixe * 100)}
                <span className="u">%</span>
              </div>
            </div>
          </div>

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
              <table className="fx-fiche-table">
                <thead>
                  <tr>
                    <th>{t("fx.fiche.bg.col.objet")}</th>
                    <th>{t("fx.fiche.bg.col.preteur")}</th>
                    <th className="num">{t("fx.fiche.bg.col.an")}</th>
                    <th className="num">{t("fx.fiche.bg.col.capital")}</th>
                    <th className="num">{t("fx.fiche.bg.col.taux")}</th>
                    <th className="num">{t("fx.fiche.bg.col.duree")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllEmprunts ? g.emprunts_top : g.emprunts_top.slice(0, EMPRUNTS_PREVIEW)).map((e, i) => {
                    const f = fmtAmount(e.capital_restant);
                    const isFixed = e.taux_type.startsWith("F");
                    return (
                      <tr key={i}>
                        <td>
                          <div>{e.objet || "—"}</div>
                          {e.montant_initial > 0 && (
                            <div className="meta">
                              {t("fx.fiche.bg.montant_init")} ·{" "}
                              {fmtAmount(e.montant_initial).value}{" "}
                              {fmtAmount(e.montant_initial).unit}
                            </div>
                          )}
                        </td>
                        <td>
                          <div>{e.preteur || "—"}</div>
                          {!isFixed && e.taux_index && (
                            <div className="meta">{e.taux_index}</div>
                          )}
                        </td>
                        <td className="num tnum mono">{e.annee_mobilisation ?? "—"}</td>
                        <td className="num tnum">
                          <b>{f.value}</b> <span className="muted">{f.unit}</span>
                        </td>
                        <td className="num tnum mono">
                          {e.taux_actuariel != null ? `${fmtDec(e.taux_actuariel, 2)} %` : "—"}
                          <div className="meta">
                            {isFixed ? t("fx.fiche.bg.fixe") : t("fx.fiche.bg.variable")}
                          </div>
                        </td>
                        <td className="num tnum mono">
                          {e.duree_residuelle != null ? fmtDec(e.duree_residuelle, 1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!showAllEmprunts && g.emprunts_top.length > EMPRUNTS_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAllEmprunts(true)}
                  style={{
                    marginTop: 10,
                    background: "transparent",
                    border: "none",
                    padding: "8px 0",
                    cursor: "pointer",
                    fontFamily: "var(--f-mono)",
                    fontSize: 12.5,
                    color: "var(--bleu)",
                    borderBottom: "1px solid var(--bleu)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {fill(t("fx.fiche.bg.voir_autres_emprunts"), { n: g.emprunts_top.length - EMPRUNTS_PREVIEW })}
                </button>
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
