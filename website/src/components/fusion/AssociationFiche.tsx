"use client";

import { Fragment, useState } from "react";
import { usePathname } from "next/navigation";
import type { AssociationFiche as AssociationFicheType, BeneficiaireGrounded, SubventionVulgarization } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { citySlugFromPathname } from "@/lib/methodology";
import { cap, fill } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { slugifyLabel } from "@/lib/projet-utils";
import { FicheStatHero, FicheBreakdown } from "@/components/fiche";
import type { FicheBreakdownRow } from "@/components/fiche";
import FicheKpis from "./FicheKpis";
import ShowMoreButton from "./ShowMoreButton";
import YearBars from "./YearBars";

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

  // Source of the subventions data is city-specific. Paris uses the exact
  // "versées annexe CA" dataset (per-year refine) + the B8.1.1 PDF fallback;
  // other cities (SCDL on data.gouv.fr) can't reuse those Paris URLs — that
  // would mis-cite the source. Fall back to the city's data.gouv.fr datasets.
  const citySlug = citySlugFromPathname(usePathname());
  const isParis = citySlug === "paris";
  const cityDatagouvUrl = `https://www.data.gouv.fr/fr/datasets/?q=${encodeURIComponent(`${citySlug} subventions`)}`;

  const { v: vTot, u: uTot } = fmtEur(asso.totalAmount);
  const firstYear = asso.yearsActive[0];
  const lastYear = asso.yearsActive[asso.yearsActive.length - 1];
  const maxByYear = Math.max(...asso.byYear.map((y) => y.amount), 1);

  /* « Qui la finance » — la direction de la Ville qui a versé, agrégée sur
   * toutes les années. C'était la seule information structurelle de la fiche
   * à n'exister que comme colonne d'un tableau (souvent « — »), donc jamais
   * lue ; l'équivalent chez Recife (« Repartição por órgão ») est une des
   * premières choses qu'on regarde sur une fiche bénéficiaire. */
  const byDirection: FicheBreakdownRow[] = (() => {
    const m = new Map<string, number>();
    for (const l of asso.lignes) {
      if (!l.direction) continue;
      m.set(l.direction, (m.get(l.direction) ?? 0) + l.amount);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ key: label, label, value }));
  })();
  const directionKnown = byDirection.reduce((s, r) => s + r.value, 0);
  const directionUnknown = Math.max(0, asso.totalAmount - directionKnown);

  /* Par thème — cliquable vers la fiche du thème. Un seul thème ne fait pas
   * une répartition : dans ce cas le tag d'en-tête le dit déjà. */
  const byTheme: FicheBreakdownRow[] = asso.byTheme
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .map((th) => ({
      key: th.theme,
      label: th.theme,
      value: th.amount,
      href: `/fr/city/${citySlug}/subventions/theme/${slugifyLabel(th.theme)}`,
    }));

  /* Le tableau « détail » n'ajoute que trois colonnes à l'histogramme
   * au-dessus : direction, motif, nombre de lignes. Quand aucune des trois ne
   * varie et qu'il y a une ligne par exercice, chaque rangée redit sa barre —
   * la fiche CASVP affichait cinq fois « Action sociale municipale (CASVP) »
   * sous cinq barres qui portaient déjà les mêmes montants. On garde alors la
   * seule information du tableau : le motif, écrit une fois.
   *
   * Le motif affiché est `objet` sinon `sous_categorie` — sur beaucoup de
   * bénéficiaires (Paris Musées) `objet` est nul et toute l'information est
   * dans la sous-catégorie, ce qui rendait un test sur `objet` seul aveugle. */
  const motifOf = (l: AssociationFicheType["lignes"][number]) => l.objet || l.subCategory || null;
  const anyDirection = asso.lignes.some((l) => l.direction);
  const anySecteurs = asso.lignes.some((l) => l.secteurs);
  const anyMultiLigne = asso.lignes.some((l) => l.nb > 1);
  const motifs = new Set(asso.lignes.map(motifOf).filter(Boolean) as string[]);
  const tableIsRepetition =
    asso.lignes.length > 1 &&
    asso.lignes.length === asso.byYear.length &&
    !anyDirection &&
    !anySecteurs &&
    !anyMultiLigne &&
    motifs.size <= 1;
  const singleMotif = tableIsRepetition ? ([...motifs][0] ?? null) : null;

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

      {/* Un chiffre porte la fiche, la bande le qualifie. Avant, le cumul
       * était une cellule parmi quatre : rien ne disait de quoi la page
       * parlait avant d'avoir lu les quatre libellés. */}
      <FicheStatHero
        value={
          <>
            {vTot}
            <span className="fx-fiche-stat-unit">{uTot}</span>
          </>
        }
        caption={
          firstYear && lastYear && firstYear !== lastYear
            ? fill(t("fx.fiche.asso.hero_cap"), { from: firstYear, to: lastYear })
            : fill(t("fx.fiche.asso.hero_cap_one"), { year: lastYear ?? "—" })
        }
      />

      <FicheKpis
        items={[
          { label: t("fx.fiche.asso.subventions"), value: asso.subventionCount },
          { label: t("fx.fiche.asso.actif_depuis"), value: firstYear ?? "—" },
          { label: t("fx.fiche.asso.derniere_annee"), value: lastYear ?? "—" },
          ...(asso.themeRank
            ? [{ label: fill(t("fx.fiche.asso.rang_theme"), { theme: asso.themeRank.theme }), value: `${asso.themeRank.rank}/${asso.themeRank.total}` }]
            : []),
        ]}
      />

      {/* Historique année par année — promu juste après KPIs (différentiateur visuel).
       * Drop des arrow markers ↑/↓ % et de la footnote "Mouvements notables" : varie
       * trop pour être éditorialement pertinent. Toujours afficher le count de subventions.
       *
       * Affiche les 5 années actives les plus récentes par défaut. Bouton expand pour les
       * années antérieures. asso.byYear ne contient que les années avec subv > 0 (gaps
       * éventuels skippés naturellement). */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.asso.historique")}</div>
        {(() => {
          const reversed = asso.byYear.slice().reverse();
          const shown = showAllYears ? reversed : reversed.slice(0, YEARS_PREVIEW);
          return (
            <YearBars
              rows={shown}
              max={maxByYear}
              countLabel={(y) => (
                <span className="muted">{y.count} {t("fx.fiche.asso.sub")}</span>
              )}
            />
          );
        })()}
        {!showAllYears && asso.byYear.length > YEARS_PREVIEW && (
          <ShowMoreButton onClick={() => setShowAllYears(true)}>
            {fill(t("fx.fiche.asso.voir_annees_avant"), { n: asso.byYear.length - YEARS_PREVIEW })}
          </ShowMoreButton>
        )}
      </section>

      {byDirection.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.asso.par_direction")}</div>
          <FicheBreakdown
            rows={byDirection}
            format={(n) => {
              const { v, u } = fmtEur(n);
              return `${v} ${u}`;
            }}
            footer={
              directionUnknown > 0
                ? (() => {
                    const { v, u } = fmtEur(directionUnknown);
                    return fill(t("fx.fiche.asso.direction_unknown"), { amount: `${v} ${u}` });
                  })()
                : undefined
            }
          />
        </section>
      )}

      {byTheme.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.asso.par_theme")}</div>
          <FicheBreakdown
            rows={byTheme}
            format={(n) => {
              const { v, u } = fmtEur(n);
              return `${v} ${u}`;
            }}
          />
        </section>
      )}

      {tableIsRepetition && singleMotif && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.asso.col.motif")}</div>
          <p className="fx-fiche-sub" style={{ margin: 0 }}>
            {fill(t("fx.fiche.asso.objet_identique"), { n: asso.lignes.length })}{" "}
            <b style={{ color: "var(--ink)" }}>{singleMotif}</b>
          </p>
        </section>
      )}

      {!tableIsRepetition && asso.lignes.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {fill(t("fx.fiche.asso.detail"), { n: asso.lignes.length, s: asso.lignes.length > 1 ? "s" : "" })}
          </div>
          {/* Une colonne dont chaque cellule vaut « — » n'informe pas, elle
           * occupe : direction et nombre de lignes ne s'affichent que si au
           * moins une rangée a quelque chose à y mettre. */}
          <table className="fx-fiche-subv-table">
            <thead>
              <tr>
                <th>{t("fx.fiche.shared.annee")}</th>
                {anyDirection && <th>{t("fx.fiche.asso.col.direction")}</th>}
                <th>{t("fx.fiche.asso.col.motif")}</th>
                <th style={{ textAlign: "right" }}>{t("fx.fiche.shared.montant")}</th>
                {anyMultiLigne && <th style={{ textAlign: "right" }}>{t("fx.fiche.asso.col.lignes")}</th>}
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
                      {anyDirection && <td>{l.direction || <span className="muted">—</span>}</td>}
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
                      {anyMultiLigne && (
                        <td style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
                          {l.nb}
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr key={`${i}-detail`} style={{ background: "#fafaf7" }}>
                        <td colSpan={3 + (anyDirection ? 1 : 0) + (anyMultiLigne ? 1 : 0)} style={{ padding: "12px 14px 16px", borderTop: 0 }}>
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
                                const src = isParis
                                  ? subvSourceUrl(asso.name, l.year)
                                  : { href: cityDatagouvUrl, isPdf: false };
                                const label = isParis
                                  ? t(src.isPdf ? "fx.fiche.asso.detail.pdf" : "fx.fiche.asso.detail.opendata")
                                  : t("fx.fiche.asso.detail.datagouv");
                                return (
                                  <a
                                    href={src.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                                  >
                                    {label}
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
            <ShowMoreButton onClick={() => setShowAllLignes(true)}>
              {fill(t("fx.fiche.asso.voir_autres"), { n: asso.lignes.length - LIGNES_PREVIEW })}
            </ShowMoreButton>
          )}
        </section>
      )}

      {/* La ligne de source vivait dans la section « détail » : elle
       * disparaissait avec elle quand le tableau se replie. Elle vaut pour
       * toute la fiche, donc elle est un pied de fiche. */}
      <footer className="fx-fiche-sources">
        <p className="fx-footer-sources-meta">
          {isParis ? t("fx.fiche.asso.note") : t("fx.fiche.asso.note.generic")}{" "}
          {(() => {
            /* Paris — asso financée uniquement en 2020-2021 : absente du
             * dataset opendata (années PDF), le refine par nom renverrait 0
             * ligne. Autres villes : lien vers les jeux data.gouv.fr. */
            const pdfOnly = isParis && asso.yearsActive.every((y) => B811_PDF[y]);
            const href = !isParis
              ? cityDatagouvUrl
              : pdfOnly
                ? B811_PDF[Math.max(...asso.yearsActive)]
                : subvSourceUrl(asso.name).href;
            const label = !isParis
              ? "data.gouv.fr ↗"
              : pdfOnly
                ? "cdn.paris.fr (PDF) ↗"
                : "opendata.paris.fr ↗";
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            );
          })()}.
        </p>
      </footer>
    </div>
  );
}
