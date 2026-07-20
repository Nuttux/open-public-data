"use client";

import { Fragment, useState } from "react";
import type { AssociationFiche as AssociationFicheType, BeneficiaireGrounded, SubventionVulgarization } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { cap, fill } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";

/** Source réelle des subventions : dataset "versées annexe CA" (les noms de
 * l'export en sont issus verbatim, le refine matche donc exactement).
 * Exception 2020-2021 : ces exercices viennent du PDF B8.1.1 du compte
 * administratif (le dataset opendata ne contient que les prestations en
 * nature sur ces deux années). */
const SUBV_DATASET =
  "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/table/";
const B811_PDF: Record<number, string> = {
  2020: "https://cdn.paris.fr/paris/2021/06/29/6af66b077794b1079d192c1d50df98f4.pdf",
  2021: "https://cdn.paris.fr/paris/2022/06/28/358d098a9a8a7bc4feb74399c61fd634.pdf",
};

function subvSourceUrl(name: string, year?: number): { href: string; isPdf: boolean } {
  if (year != null && B811_PDF[year]) return { href: B811_PDF[year], isPdf: true };
  const nom = `refine.nom_de_l_organisme_beneficiaire=${encodeURIComponent(name)}`;
  if (year == null) return { href: `${SUBV_DATASET}?${nom}`, isPdf: false };
  const pub = year >= 2022 ? String(year) : `CA ${year}`;
  return { href: `${SUBV_DATASET}?refine.publication=${encodeURIComponent(pub)}&${nom}`, isPdf: false };
}

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
  const [openLigne, setOpenLigne] = useState<number | null>(null);
  const [showAllLignes, setShowAllLignes] = useState(false);
  const [showAllYears, setShowAllYears] = useState(false);
  const LIGNES_PREVIEW = 5;
  const YEARS_PREVIEW = 5;

  const fmtEur = useFmtEur();

  const { v: vTot, u: uTot } = fmtEur(asso.totalAmount);
  const firstYear = asso.yearsActive[0];
  const lastYear = asso.yearsActive[asso.yearsActive.length - 1];
  const maxByYear = Math.max(...asso.byYear.map((y) => y.amount), 1);

  return (
    <div>
      {/* Tag inline : nature juridique (préserve l'info de l'ancienne section Identité droppée).
       * Format discret, comme les tags typologie dans ProjetFiche. */}
      {asso.natureJuridique && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14, fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{asso.natureJuridique}</span>
        </div>
      )}

      {grounded && (grounded.confiance ?? 0) >= 0.6 && grounded.activite_verifiee ? (
        <div className="fx-fiche-grounded">
          <div className="fx-fiche-grounded-head">{t("fx.fiche.asso.activity_h")}</div>
          <p className="fx-fiche-grounded-body">
            {cap(locale === "en" && grounded.activite_verifiee_en ? grounded.activite_verifiee_en : grounded.activite_verifiee)}
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
        // Drop `impact_citoyen` (promo-y, cohérence avec ProjetFiche).
        const activite = cap(locale === "en" && vulgarization.activite_claire_en ? vulgarization.activite_claire_en : vulgarization.activite_claire);
        const pourquoi = cap(locale === "en" && vulgarization.pourquoi_subvention_en ? vulgarization.pourquoi_subvention_en : vulgarization.pourquoi_subvention);
        return (
          <div className="fx-fiche-lead">
            {activite && <p className="fx-fiche-lead-main">{activite}</p>}
            {pourquoi && <p className="fx-fiche-lead-sub">{pourquoi}</p>}
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

      {/* Historique année par année — promu juste après KPIs (différentiateur visuel).
       * Drop des arrow markers ↑/↓ % et de la footnote "Mouvements notables" : varie
       * trop pour être éditorialement pertinent. Toujours afficher le count de subventions.
       *
       * Affiche les 5 années actives les plus récentes par défaut. Bouton expand pour les
       * années antérieures. asso.byYear ne contient que les années avec subv > 0 (gaps
       * éventuels skippés naturellement). */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.asso.historique")}</div>
        <div>
          {(() => {
            const reversed = asso.byYear.slice().reverse();
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
                  <span style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11 }}>
                    <span className="muted">{y.count} {t("fx.fiche.asso.sub")}</span>
                  </span>
                </div>
              );
            });
          })()}
        </div>
        {!showAllYears && asso.byYear.length > YEARS_PREVIEW && (
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
            {fill(t("fx.fiche.asso.voir_annees_avant"), { n: asso.byYear.length - YEARS_PREVIEW })}
          </button>
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
              {(showAllLignes ? asso.lignes : asso.lignes.slice(0, LIGNES_PREVIEW)).map((l, i) => {
                const { v, u } = fmtEur(l.amount);
                const isOpen = openLigne === i;
                const hasDetail = Boolean(l.objet || l.subCategory || l.secteurs);
                return (
                  <Fragment key={i}>
                    <tr
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
                              {(() => {
                                const src = subvSourceUrl(asso.name, l.year);
                                return (
                                  <a
                                    href={src.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                                  >
                                    {t(src.isPdf ? "fx.fiche.asso.detail.pdf" : "fx.fiche.asso.detail.opendata")}
                                  </a>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!showAllLignes && asso.lignes.length > LIGNES_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllLignes(true)}
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
              {fill(t("fx.fiche.asso.voir_autres"), { n: asso.lignes.length - LIGNES_PREVIEW })}
            </button>
          )}
          <p className="fx-fiche-note" style={{ marginTop: 10 }}>
            {t("fx.fiche.asso.note")}{" "}
            {(() => {
              /* Asso financée uniquement en 2020-2021 : absente du dataset
               * opendata (années PDF), le refine par nom renverrait 0 ligne. */
              const pdfOnly = asso.yearsActive.every((y) => B811_PDF[y]);
              const href = pdfOnly
                ? B811_PDF[Math.max(...asso.yearsActive)]
                : subvSourceUrl(asso.name).href;
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  {pdfOnly ? "cdn.paris.fr (PDF) ↗" : "opendata.paris.fr ↗"}
                </a>
              );
            })()}.
          </p>
        </section>
      )}
    </div>
  );
}
