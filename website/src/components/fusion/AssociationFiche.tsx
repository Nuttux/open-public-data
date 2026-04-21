"use client";

import type { AssociationFiche as AssociationFicheType, SubventionVulgarization } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

export default function AssociationFiche({
  asso,
  vulgarization,
}: {
  asso: AssociationFicheType;
  vulgarization?: SubventionVulgarization | null;
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

  const { v: vTot, u: uTot } = fmtEur(asso.totalAmount);
  const firstYear = asso.yearsActive[0];
  const lastYear = asso.yearsActive[asso.yearsActive.length - 1];
  const maxByYear = Math.max(...asso.byYear.map((y) => y.amount), 1);

  return (
    <div>
      {vulgarization ? (
        <div className="fx-fiche-lead">
          {vulgarization.activite_claire && (
            <p className="fx-fiche-lead-main">
              {vulgarization.activite_claire}
            </p>
          )}
          {vulgarization.pourquoi_subvention && (
            <p className="fx-fiche-lead-sub">
              {vulgarization.pourquoi_subvention}
            </p>
          )}
          {vulgarization.impact_citoyen && (
            <p className="fx-fiche-lead-impact">
              → {vulgarization.impact_citoyen}
            </p>
          )}
        </div>
      ) : null}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.asso.cumul")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {vTot}
            <span className="u">{uTot}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.asso.subventions")}</div>
          <div className="fx-fiche-kpi-value tnum">{asso.subventionCount}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.asso.actif_depuis")}</div>
          <div className="fx-fiche-kpi-value tnum">{firstYear ?? "—"}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.asso.derniere_annee")}</div>
          <div className="fx-fiche-kpi-value tnum">{lastYear ?? "—"}</div>
        </div>
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.asso.identite")}</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.shared.nom")}</dt>
            <dd>{asso.name}</dd>
          </div>
          {asso.natureJuridique && (
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.shared.nature")}</dt>
              <dd>{asso.natureJuridique}</dd>
            </div>
          )}
          {asso.theme && (
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.asso.thematique")}</dt>
              <dd>{trLabel(asso.theme, locale)}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.asso.historique")}</div>
        <div>
          {asso.byYear
            .slice()
            .reverse()
            .map((y) => {
              const { v, u } = fmtEur(y.amount);
              const pct = (y.amount / maxByYear) * 100;
              const highlight = asso.highlights.find((h) => h.year === y.year);
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
                        background: highlight
                          ? highlight.kind === "up"
                            ? "var(--rouge)"
                            : "var(--bleu)"
                          : "var(--ink)",
                      }}
                    />
                  </span>
                  <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14 }}>
                    {v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
                  </span>
                  <span style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11 }}>
                    {highlight ? (
                      <span style={{ color: highlight.kind === "up" ? "var(--rouge)" : "var(--bleu)" }}>
                        {highlight.kind === "up" ? "↑" : "↓"}{" "}
                        {Math.abs(highlight.pct).toFixed(0)} %
                      </span>
                    ) : (
                      <span className="muted">{y.count} {t("fx.fiche.asso.sub")}</span>
                    )}
                  </span>
                </div>
              );
            })}
        </div>
        {asso.highlights.length > 0 && (
          <p className="fx-fiche-note">
            <b>{t("fx.fiche.asso.mouvements")}</b> ·{" "}
            {asso.highlights
              .slice(-3)
              .reverse()
              .map((h) =>
                `${h.year}: ${h.kind === "up" ? "+" : "−"} ${Math.abs(h.pct).toFixed(0)} % ${t("fx.fiche.asso.vs_prev")}`,
              )
              .join(" · ")}
          </p>
        )}
      </section>

      {asso.lignes.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {fill(t("fx.fiche.asso.detail"), { n: asso.lignes.length, s: asso.lignes.length > 1 ? "s" : "" })}
          </div>
          <table className="fx-fiche-subv-table">
            <thead>
              <tr>
                <th>{t("fx.fiche.shared.annee")}</th>
                <th>{t("fx.fiche.asso.col.direction")}</th>
                <th>{t("fx.fiche.asso.col.motif")}</th>
                <th style={{ textAlign: "right" }}>{t("fx.fiche.shared.montant")}</th>
                <th style={{ textAlign: "right" }}>{t("fx.fiche.asso.col.lignes")}</th>
              </tr>
            </thead>
            <tbody>
              {asso.lignes.map((l, i) => {
                const { v, u } = fmtEur(l.amount);
                return (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--f-mono)", color: "var(--ocre)" }}>{l.year}</td>
                    <td>{l.direction || <span className="muted">—</span>}</td>
                    <td style={{ maxWidth: 280 }}>
                      {l.objet ? (
                        <span>{l.objet.length > 70 ? l.objet.slice(0, 70) + "…" : l.objet}</span>
                      ) : l.subCategory ? (
                        <span className="muted">{l.subCategory}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13 }}>
                      {v} <span style={{ fontSize: ".75em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
                      {l.nb}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="fx-fiche-note" style={{ marginTop: 10 }}>
            {t("fx.fiche.asso.note")}{" "}
            <a
              href={`https://opendata.paris.fr/explore/dataset/subventions-associations-votees/table/?refine.objet_du_dossier=&refine.nom_beneficiaire=${encodeURIComponent(asso.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
            >
              opendata.paris.fr ↗
            </a>.
          </p>
        </section>
      )}
    </div>
  );
}
