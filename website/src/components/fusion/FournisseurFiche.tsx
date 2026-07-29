"use client";

import { useState } from "react";
import Link from "next/link";
import type { FournisseurFiche as FournisseurFicheType, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, numLocale } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { trLabel } from "@/lib/label-translate";
import { slugifyLabel } from "@/lib/projet-utils";
import { FicheStatHero, FicheBreakdown, FicheMore } from "@/components/fiche";
import { useCity } from "./CityContext";
import FicheKpis from "./FicheKpis";
import ShowMoreButton from "./ShowMoreButton";
import YearBars from "./YearBars";

export default function FournisseurFiche({
  fournisseur,
  sirene,
}: {
  fournisseur: FournisseurFicheType;
  sirene?: SireneCompany | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const locStr = numLocale(locale);
  const [showAllYears, setShowAllYears] = useState(false);
  const YEARS_PREVIEW = 5;

  const fmtEur = useFmtEur();

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

      <FicheStatHero
        value={
          <>
            {vTot}
            <span className="fx-fiche-stat-unit">{uTot}</span>
          </>
        }
        caption={
          firstYear
            ? fill(t("fx.fiche.fourn.hero_cap"), { from: firstYear })
            : t("fx.fiche.fourn.hero_cap_noyear")
        }
      />

      {/* « Années actives » et « Actif depuis » disaient la même chose sur un
       * fournisseur présent chaque année depuis son premier contrat. Le cumul
       * part dans le chiffre-titre. */}
      <FicheKpis
        items={[
          { label: t("fx.fiche.fourn.contrats"), value: fournisseur.contratCount },
          { label: t("fx.fiche.fourn.actif_depuis"), value: firstYear ?? "—" },
          ...(fournisseur.yearsActive.length > 1
            ? [{ label: t("fx.fiche.fourn.annees"), value: fournisseur.yearsActive.length }]
            : []),
        ]}
      />

      {/* Contrats notifiés promu en position 1 après KPIs — c'est THE différentiateur
       * FOD (qui touche combien chez la Ville) vs annuaire SIRENE standard.
       *
       * Le reste au-delà de huit était annoncé par « + 2 autres contrats sur la
       * période » et s'arrêtait là : un compte honnête, mais une impasse. Il
       * passe derrière l'unique dépliant du kit (FicheMore), donc rien n'est
       * ni caché en silence ni hors d'atteinte. */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.fourn.contrats_label")}</div>
        {(() => {
          const CAP = 8;
          const head = (
            <thead>
              <tr>
                <th>{t("fx.fiche.fourn.col.objet")}</th>
                <th>{t("fx.fiche.shared.annee")}</th>
                <th>{t("fx.fiche.fourn.col.date")}</th>
                <th style={{ textAlign: "right" }}>{t("fx.fiche.shared.montant")}</th>
              </tr>
            </thead>
          );
          const row = (c: FournisseurFicheType["contrats"][number]) => {
            const { v, u } = fmtEur(c.montant);
            // Précédence partagée avec les pages liste : version vulgarisée si
            // elle existe, sinon repli regex sur le libellé technique DECP.
            const clair = locale === "en" ? c.objetClairEn || c.objetClair : c.objetClair;
            const clean = clair || normalizeObjet(c.objet);
            const shown = clean.length > 70 ? clean.slice(0, 70) + "…" : clean;
            return (
              <tr key={c.numero}>
                <td style={{ fontWeight: 500, maxWidth: 280 }}>
                  {c.numero ? (
                    <Link href={`${basePath}/marches/contrat/${c.numero}`} scroll={false}>
                      {shown}
                    </Link>
                  ) : (
                    <span>{shown}</span>
                  )}
                </td>
                <td className="rank">{c.year}</td>
                <td className="muted">{fmtDate(c.date)}</td>
                <td className="num">
                  {v} <span className="muted">{u}</span>
                </td>
              </tr>
            );
          };
          const rest = fournisseur.contrats.slice(CAP);
          return (
            <>
              <table className="fx-table" style={{ border: 0 }}>
                {head}
                <tbody>{fournisseur.contrats.slice(0, CAP).map(row)}</tbody>
              </table>
              <FicheMore count={rest.length} noun={t("fx.fiche.fourn.more_noun")}>
                <table className="fx-table" style={{ border: 0 }}>
                  {head}
                  <tbody>{rest.map(row)}</tbody>
                </table>
              </FicheMore>
            </>
          );
        })()}
      </section>

      {/* Historique année par année — conditionnel sur >1 année active : pour un
       * fournisseur avec 1 seul contrat sur 1 année, la section = 1 barre solo qui
       * répète le KPI "Actif depuis". Skip. Preview 5 années si plus. */}
      {fournisseur.byYear.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.fourn.historique")}</div>
          {(() => {
            const reversed = fournisseur.byYear.slice().reverse();
            const shown = showAllYears ? reversed : reversed.slice(0, YEARS_PREVIEW);
            return (
              <YearBars
                rows={shown}
                max={maxByYear}
                countLabel={(y) => (
                  <span className="muted">
                    {y.count}{" "}
                    {t(y.count === 1 ? "fx.fiche.fourn.contrat_row_one" : "fx.fiche.fourn.contrats_row")}
                  </span>
                )}
              />
            );
          })()}
          {!showAllYears && fournisseur.byYear.length > YEARS_PREVIEW && (
            <ShowMoreButton onClick={() => setShowAllYears(true)}>
              {fill(t("fx.fiche.fourn.voir_annees_avant"), { n: fournisseur.byYear.length - YEARS_PREVIEW })}
            </ShowMoreButton>
          )}
        </section>
      )}

      {/* Répartition par catégorie — désormais la primitive partagée, et
       * surtout CLIQUABLE : chaque catégorie a sa fiche (/marches/categorie/
       * <slug>) et la ligne y menait nulle part. Une fiche fournisseur doit
       * pouvoir mener à « qui d'autre la Ville paie pour ça ». */}
      {fournisseur.byCategory.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.fourn.repartition")}</div>
          <FicheBreakdown
            rows={fournisseur.byCategory.map((c) => ({
              key: c.category,
              label: trLabel(c.category, locale),
              value: c.amount,
              href: `${basePath}/marches/categorie/${slugifyLabel(c.category)}`,
            }))}
            format={(n) => {
              const { v, u } = fmtEur(n);
              return `${v} ${u}`;
            }}
          />
        </section>
      )}
    </div>
  );
}
