"use client";

import Link from "next/link";
import type { FournisseurFiche as FournisseurFicheType, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import Tip from "./Tip";

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
        </div>
      ) : (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
          {t("fx.fiche.fourn.no_sirene")}{fournisseur.siren ? ` ${fournisseur.siren}` : ""}. {t("fx.fiche.fourn.no_sirene_pre_link")}{" "}
          <a
            href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${fournisseur.siren}`}
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

      {fournisseur.siret && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.fourn.identite")}</div>
          <dl>
            {fournisseur.siret !== "#" && (
              <div className="fx-fiche-prop">
                <dt><Tip label={t("fx.fiche.siret.tip")}>SIRET</Tip></dt>
                <dd style={{ fontFamily: "var(--f-mono)" }}>{fournisseur.siret}</dd>
              </div>
            )}
            {fournisseur.siren && fournisseur.siren !== "#" && (
              <div className="fx-fiche-prop">
                <dt><Tip label={t("fx.fiche.siren.tip")}>SIREN</Tip></dt>
                <dd style={{ fontFamily: "var(--f-mono)" }}>{fournisseur.siren}</dd>
              </div>
            )}
            {sirene?.adresse && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.fourn.adresse")}</dt>
                <dd>{sirene.adresse}</dd>
              </div>
            )}
            {sirene?.etat && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.fourn.etat")}</dt>
                <dd style={{ textTransform: "capitalize" }}>{sirene.etat.toLowerCase()}</dd>
              </div>
            )}
            {sirene?.dirigeants && sirene.dirigeants.length > 0 && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.fourn.dirigeant")}</dt>
                <dd>
                  {sirene.dirigeants
                    .slice(0, 2)
                    .map((d) => `${d.prenom} ${d.nom}`.trim())
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            )}
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.fourn.annuaire")}</dt>
              <dd>
                <a
                  href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${fournisseur.siren}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  annuaire-entreprises.data.gouv.fr ↗
                </a>
              </dd>
            </div>
          </dl>
        </section>
      )}

      {fournisseur.siretBreakdown.length > 1 && (
        <section className="fx-fiche-section">
          <div
            style={{
              padding: "16px 18px",
              border: "1px solid var(--rule)",
              background: "rgba(166, 118, 56, 0.04)",
              borderLeft: "3px solid var(--ocre)",
              fontFamily: "var(--f-ui)",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--ink-2)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "var(--ocre)",
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              {t("fx.fiche.fourn.siret_agg_title")}
            </div>
            <p style={{ margin: "0 0 12px" }}>
              {fill(t("fx.fiche.fourn.siret_agg_body"), { n: fournisseur.siretBreakdown.length })}
            </p>
            <table className="fx-fiche-table" style={{ marginTop: 6 }}>
              <thead>
                <tr>
                  <th>{t("fx.fiche.fourn.siret_agg_col_siret")}</th>
                  <th>{t("fx.fiche.fourn.siret_agg_col_nom")}</th>
                  <th className="num">{t("fx.fiche.fourn.siret_agg_col_count")}</th>
                  <th className="num">{t("fx.fiche.fourn.siret_agg_col_amount")}</th>
                </tr>
              </thead>
              <tbody>
                {fournisseur.siretBreakdown.map((s) => {
                  const f = fmtEur(s.amount);
                  return (
                    <tr key={s.siret}>
                      <td style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{s.siret}</td>
                      <td>{s.nom}</td>
                      <td className="num tnum mono">{s.count}</td>
                      <td className="num tnum">
                        <b>{f.v}</b> <span className="muted">{f.u}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.fourn.historique")}</div>
        <div>
          {fournisseur.byYear
            .slice()
            .reverse()
            .map((y) => {
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
            })}
        </div>
      </section>

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

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.fourn.top8")}</div>
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
                          style={{ color: "var(--ink)" }}
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

      <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".02em", lineHeight: 1.5 }}>
        <b>{t("fx.fiche.coming_soon")}</b> : {t("fx.fiche.fourn.avenir")}
      </p>
    </div>
  );
}
