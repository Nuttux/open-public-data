"use client";

import { useState } from "react";
import Link from "next/link";
import type { FournisseurFiche as FournisseurFicheType, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

export default function FournisseurFiche({
  fournisseur,
  sirene,
}: {
  fournisseur: FournisseurFicheType;
  sirene?: SireneCompany | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const [showAllYears, setShowAllYears] = useState(false);
  const YEARS_PREVIEW = 5;

  const fmtEur = (n: number) => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    if (n >= 1e3) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
    return { v: new Intl.NumberFormat(locStr).format(n), u: "€" };
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locStr, { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const { v: vTot, u: uTot } = fmtEur(fournisseur.totalAmount);
  const firstYear = fournisseur.yearsActive[0];
  const maxByYear = Math.max(...fournisseur.byYear.map((y) => y.amount), 1);
  const maxByCat = Math.max(...fournisseur.byCategory.map((c) => c.amount), 1);

  return (
    <div>
      {sirene ? (
        <div className="fx-fiche-lead">
          <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)", fontSize: 16, lineHeight: 1.4 }}>
            {sirene.nom || fournisseur.nom}
          </p>
          {sirene.libelle_activite && (
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ink-2)" }}>
              {sirene.libelle_activite}
              {sirene.activite_principale && (
                <span style={{ color: "var(--muted)", fontFamily: "var(--f-mono)", fontSize: 11, marginLeft: 8 }}>
                  NAF {sirene.activite_principale}
                </span>
              )}
            </p>
          )}
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
            {[
              sirene.forme_juridique,
              sirene.commune && `${t("fx.fiche.fourn.siege")} ${sirene.commune}`,
              sirene.tranche_effectifs && `${t("fx.fiche.fourn.effectif")} ${sirene.tranche_effectifs.toLowerCase()}`,
              sirene.date_creation && `${t("fx.fiche.fourn.creee")} ${sirene.date_creation.slice(0, 4)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {fournisseur.siren && fournisseur.siren !== "#" && (
            <p style={{ margin: "8px 0 0", fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--muted)" }}>
              SIREN {fournisseur.siren} ·{" "}
              <a
                href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${fournisseur.siren}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
              >
                {t("fx.fiche.fourn.annuaire_link")}
              </a>
            </p>
          )}
        </div>
      ) : (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
          {t("fx.fiche.fourn.no_sirene")}{/^\d{9}$/.test(fournisseur.siren) ? ` ${fournisseur.siren}` : ""}. {t("fx.fiche.fourn.no_sirene_pre_link")}{" "}
          <a
            /* siret "#" ou absent dans DECP → /entreprise/<siren> serait un
             * lien mort ; on retombe sur la recherche par nom */
            href={/^\d{9}$/.test(fournisseur.siren)
              ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${fournisseur.siren}`
              : `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(fournisseur.nom)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {t("fx.fiche.fourn.no_sirene_link")}
          </a>{t("fx.fiche.fourn.no_sirene_after")}
        </p>
      )}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.fourn.cumul")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {vTot}
            <span className="u">{uTot}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.fourn.contrats")}</div>
          <div className="fx-fiche-kpi-value tnum">{fournisseur.contratCount}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.fourn.actif_depuis")}</div>
          <div className="fx-fiche-kpi-value tnum">{firstYear ?? "—"}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.fourn.annees")}</div>
          <div className="fx-fiche-kpi-value tnum">{fournisseur.yearsActive.length}</div>
        </div>
      </div>

      {/* Contrats notifiés promu en position 1 après KPIs — c'est THE différentiateur
       * FOD (qui touche combien chez la Ville) vs annuaire SIRENE standard.
       * Label dynamique : "Contrats notifiés" si <= 8, "Top 8" si on tronque. */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">
          {fournisseur.contrats.length > 8
            ? t("fx.fiche.fourn.top8")
            : t("fx.fiche.fourn.contrats_label")}
        </div>
        <table className="fx-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>{t("fx.fiche.fourn.col.objet")}</th>
              <th>{t("fx.fiche.shared.annee")}</th>
              <th>{t("fx.fiche.fourn.col.date")}</th>
              <th style={{ textAlign: "right" }}>{t("fx.fiche.shared.montant")}</th>
            </tr>
          </thead>
          <tbody>
            {fournisseur.contrats.slice(0, 8).map((c) => {
              const { v, u } = fmtEur(c.montant);
              return (
                <tr key={c.numero}>
                  <td style={{ fontWeight: 500, maxWidth: 280 }}>
                    {(() => {
                      const clean = normalizeObjet(c.objet);
                      const shown = clean.length > 70 ? clean.slice(0, 70) + "…" : clean;
                      return c.numero ? (
                        <Link
                          href={`/ville/paris/marches/contrat/${c.numero}`}
                          scroll={false}
                        >
                          {shown}
                        </Link>
                      ) : (
                        <span>{shown}</span>
                      );
                    })()}
                  </td>
                  <td className="rank">{c.year}</td>
                  <td className="muted">{fmtDate(c.date)}</td>
                  <td className="num">
                    {v} <span className="muted">{u}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {fournisseur.contrats.length > 8 && (
          <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
            {fill(t("fx.fiche.fourn.overflow"), { n: fournisseur.contrats.length - 8 })}
          </p>
        )}
      </section>

      {/* Historique année par année — conditionnel sur >1 année active : pour un
       * fournisseur avec 1 seul contrat sur 1 année, la section = 1 barre solo qui
       * répète le KPI "Actif depuis". Skip. Preview 5 années si plus. */}
      {fournisseur.byYear.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.fourn.historique")}</div>
          <div>
            {(() => {
              const reversed = fournisseur.byYear.slice().reverse();
              const shown = showAllYears ? reversed : reversed.slice(0, YEARS_PREVIEW);
              return shown.map((y) => {
                const { v, u } = fmtEur(y.amount);
                const pct = (y.amount / maxByYear) * 100;
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
                          background: "var(--ink)",
                        }}
                      />
                    </span>
                    <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14 }}>
                      {v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
                    </span>
                    <span className="muted" style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11 }}>
                      {y.count} {t("fx.fiche.fourn.contrats_row")}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
          {!showAllYears && fournisseur.byYear.length > YEARS_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllYears(true)}
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
              {fill(t("fx.fiche.fourn.voir_annees_avant"), { n: fournisseur.byYear.length - YEARS_PREVIEW })}
            </button>
          )}
        </section>
      )}

      {fournisseur.byCategory.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.fourn.repartition")}</div>
          {fournisseur.byCategory.slice(0, 6).map((c) => {
            const { v, u } = fmtEur(c.amount);
            return (
              <div
                key={c.category}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px",
                  gap: 14,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--rule)",
                  fontFamily: "var(--f-ui)",
                  fontSize: 13,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ position: "relative", display: "inline-block", width: `${(c.amount / maxByCat) * 100}%`, height: 4, background: "var(--ink)", verticalAlign: "middle", marginRight: 8, maxWidth: "35%" }} />
                  {trLabel(c.category, locale)}
                </span>
                <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13 }}>
                  {v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
