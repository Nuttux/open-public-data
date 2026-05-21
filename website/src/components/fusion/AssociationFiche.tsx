"use client";

import { useState } from "react";
import type { AssociationFiche as AssociationFicheType, BeneficiaireGrounded, SubventionVulgarization } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

export default function AssociationFiche({
  asso,
  vulgarization,
  grounded,
}: {
  asso: AssociationFicheType;
  vulgarization?: SubventionVulgarization | null;
  grounded?: BeneficiaireGrounded | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const [openLigne, setOpenLigne] = useState<number | null>(null);

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
      {grounded && (grounded.confiance ?? 0) >= 0.6 && grounded.activite_verifiee ? (
        <div className="fx-fiche-grounded">
          <div className="fx-fiche-grounded-head">{t("fx.fiche.asso.activity_h")}</div>
          <p className="fx-fiche-grounded-body">
            {locale === "en" && grounded.activite_verifiee_en ? grounded.activite_verifiee_en : grounded.activite_verifiee}
          </p>
          <div className="fx-fiche-grounded-meta">
            {grounded.perimetre_geographique ? (
              <span>
                <b>{t("fx.fiche.asso.scope_label")} :</b>{" "}
                {locale === "en" && grounded.perimetre_geographique_en
                  ? grounded.perimetre_geographique_en
                  : grounded.perimetre_geographique}
              </span>
            ) : null}
            {grounded.sources && grounded.sources.length > 0 ? (
              <span className="fx-fiche-grounded-sources">
                <b>{t("fx.fiche.asso.sources_label")} :</b>{" "}
                {grounded.sources.map((src, i) => {
                  const s = typeof src === "string" ? { title: src } : src;
                  const label = s.title || s.url || "";
                  const href = s.url || (label.includes(".") ? `https://${label.replace(/^https?:\/\//, "")}` : undefined);
                  const node = href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {label}
                    </a>
                  ) : (
                    <span>{label}</span>
                  );
                  return (
                    <span key={i}>
                      {i > 0 ? ", " : ""}
                      {node}
                    </span>
                  );
                })}
              </span>
            ) : null}
          </div>
        </div>
      ) : vulgarization ? (() => {
        const activite = locale === "en" && vulgarization.activite_claire_en ? vulgarization.activite_claire_en : vulgarization.activite_claire;
        const pourquoi = locale === "en" && vulgarization.pourquoi_subvention_en ? vulgarization.pourquoi_subvention_en : vulgarization.pourquoi_subvention;
        const impact = locale === "en" && vulgarization.impact_citoyen_en ? vulgarization.impact_citoyen_en : vulgarization.impact_citoyen;
        return (
          <div className="fx-fiche-lead">
            {activite && <p className="fx-fiche-lead-main">{activite}</p>}
            {pourquoi && <p className="fx-fiche-lead-sub">{pourquoi}</p>}
            {impact && <p className="fx-fiche-lead-impact">→ {impact}</p>}
          </div>
        );
      })() : null}

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
                const isOpen = openLigne === i;
                const hasDetail = Boolean(l.objet || l.subCategory || l.secteurs);
                return (
                  <>
                    <tr
                      key={i}
                      onClick={hasDetail ? () => setOpenLigne(isOpen ? null : i) : undefined}
                      className={hasDetail ? "fx-row-link" : undefined}
                      style={{
                        background: isOpen ? "#fafaf7" : undefined,
                      }}
                      aria-expanded={hasDetail ? isOpen : undefined}
                    >
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
                        {hasDetail && (
                          <span
                            aria-hidden="true"
                            style={{
                              marginLeft: 6,
                              fontFamily: "var(--f-mono)",
                              fontSize: 10,
                              color: "var(--bleu)",
                              transition: "transform .15s",
                              display: "inline-block",
                              transform: isOpen ? "rotate(90deg)" : "none",
                            }}
                          >
                            ▸
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13 }}>
                        {v} <span style={{ fontSize: ".75em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
                        {l.nb}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${i}-detail`} style={{ background: "#fafaf7" }}>
                        <td colSpan={5} style={{ padding: "12px 14px 16px", borderTop: 0 }}>
                          <div style={{ display: "grid", gap: 10, fontFamily: "var(--f-ui)", fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
                            {l.objet && (
                              <div>
                                <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
                                  {t("fx.fiche.asso.col.motif")}
                                </div>
                                <div>{l.objet}</div>
                              </div>
                            )}
                            {l.subCategory && (
                              <div>
                                <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
                                  {t("fx.fiche.asso.detail.sub_category")}
                                </div>
                                <div>{l.subCategory}</div>
                              </div>
                            )}
                            {l.secteurs && (
                              <div>
                                <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
                                  {t("fx.fiche.asso.detail.secteurs")}
                                </div>
                                <div>{l.secteurs}</div>
                              </div>
                            )}
                            <div style={{ marginTop: 4 }}>
                              <a
                                href={`https://opendata.paris.fr/explore/dataset/subventions-associations-votees-/table/?refine.annee_budget=${l.year}&refine.nom_beneficiaire=${encodeURIComponent(asso.name)}${l.direction ? `&refine.direction=${encodeURIComponent(l.direction)}` : ""}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                              >
                                {t("fx.fiche.asso.detail.opendata")}
                              </a>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          <p className="fx-fiche-note" style={{ marginTop: 10 }}>
            {t("fx.fiche.asso.note")}{" "}
            <a
              href={`https://opendata.paris.fr/explore/dataset/subventions-associations-votees-/table/?refine.objet_du_dossier=&refine.nom_beneficiaire=${encodeURIComponent(asso.name)}`}
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
