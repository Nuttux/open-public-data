"use client";

import type { FournisseurFiche as FournisseurFicheType, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { cap, fill, numLocale } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { trLabel } from "@/lib/label-translate";
import { slugifyLabel } from "@/lib/projet-utils";
import { FicheBreakdown } from "@/components/fiche";
import { V3Amt, V3Fold, V3Foot, V3Hero, V3Lead, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import { useCity } from "./CityContext";
import YearBars from "./YearBars";
import AnneesRail, { RAIL_MIN } from "./AnneesRail";

const CONTRATS_CAP = 8;

/**
 * Fiche fournisseur v3 (2026-09-03) — sur le kit `fiche/v3` : une phrase
 * (activité SIRENE) avec forme, siège, effectif et SIREN en ligne grise, UN
 * chiffre — le cumul des plafonds de contrats, dit comme tel : « de contrats
 * signés », jamais « versés » — puis « Les contrats signés » en rangées,
 * « Année par année » et « Pour quoi » (cliquable vers la catégorie).
 */
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
  const fmtEur = useFmtEur();
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };
  const fmtDate = (iso: string) => {
    if (!iso) return "";
    try { return new Intl.DateTimeFormat(locStr, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)); } catch { return iso; }
  };

  const { v: vTot, u: uTot } = fmtEur(fournisseur.totalAmount);
  const firstYear = fournisseur.yearsActive[0];
  const maxByYear = Math.max(...fournisseur.byYear.map((y) => y.amount), 1);
  const sirenOk = /^\d{9}$/.test(fournisseur.siren);
  const annuaire = sirenOk
    ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${fournisseur.siren}`
    : `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(fournisseur.nom)}`;

  const contrats = foldRest(fournisseur.contrats, CONTRATS_CAP);
  const ContratRow = (c: FournisseurFicheType["contrats"][number]) => {
    const clair = locale === "en" ? c.objetClairEn || c.objetClair : c.objetClair;
    const clean = clair || normalizeObjet(c.objet);
    return (
      <V3Row key={c.numero || clean} href={c.numero ? `${basePath}/marches/contrat/${c.numero}` : null}
        label={clean.length > 110 ? clean.slice(0, 110) + "…" : clean}
        sub={c.date ? `${t("fx.fiche.fourn.notifie_le")} ${fmtDate(c.date)}` : String(c.year)}
        amount={<V3Amt {...fmtEur(c.montant)} />} />
    );
  };

  const yearsDesc = fournisseur.byYear.slice().reverse();
  const yearBars = (rows: typeof yearsDesc) => (
    <YearBars rows={rows} max={maxByYear}
      countLabel={(y) => <span className="muted">{y.count} {t(y.count === 1 ? "fx.fiche.fourn.contrat_row_one" : "fx.fiche.fourn.contrats_row")}</span>} />
  );

  const identity = sirene
    ? [
        // Le code catégorie juridique (« 5599 ») n'est pas un libellé : on ne l'affiche que s'il est en toutes lettres.
        sirene.forme_juridique && !/^\d+$/.test(sirene.forme_juridique) ? sirene.forme_juridique : null,
        sirene.commune && `${t("fx.fiche.fourn.siege")} ${sirene.commune}`,
        sirene.tranche_effectifs && `${t("fx.fiche.fourn.effectif")} ${sirene.tranche_effectifs.toLowerCase()}`,
        sirene.date_creation && `${t("fx.fiche.fourn.creee")} ${sirene.date_creation.slice(0, 4)}`,
      ].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="fx-v3">
      {sirene ? (
        <V3Lead
          src={
            <>
              {identity}
              {identity && sirenOk ? " · " : ""}
              {sirenOk && <>SIREN {fournisseur.siren} · <a href={annuaire} target="_blank" rel="noopener noreferrer">{t("fx.fiche.fourn.annuaire_link")}</a></>}
            </>
          }
        >
          {sirene.libelle_activite ? cap(sirene.libelle_activite) : (sirene.nom || fournisseur.nom)}
          {sirene.activite_principale && <span className="fx-v3-lead-src" style={{ display: "inline", marginLeft: 8 }}>NAF {sirene.activite_principale}</span>}
        </V3Lead>
      ) : (
        <p className="fx-v3-lead-src">
          {t("fx.fiche.fourn.no_sirene")}{sirenOk ? ` ${fournisseur.siren}` : ""}. {t("fx.fiche.fourn.no_sirene_pre_link")}{" "}
          <a href={annuaire} target="_blank" rel="noopener noreferrer">{t("fx.fiche.fourn.no_sirene_link")}</a>{t("fx.fiche.fourn.no_sirene_after")}
        </p>
      )}

      <V3Hero
        v={vTot} u={uTot}
        caption={firstYear ? fill(t("fx.fiche.fourn.hero_cap"), { from: firstYear }) : t("fx.fiche.fourn.hero_cap_noyear")}
        meta={
          <>
            {fill(t(fournisseur.contratCount === 1 ? "fx.fiche.fourn.meta_n1" : "fx.fiche.fourn.meta_n"), { n: fournisseur.contratCount })}
            {fournisseur.yearsActive.length > 1 ? ` · ${fill(t("fx.fiche.fourn.meta_annees"), { n: fournisseur.yearsActive.length })}` : ""}
          </>
        }
      />

      <V3Section title={t("fx.fiche.fourn.h.contrats")} sub={t("fx.fiche.fourn.h.contrats_sub")}>
        {contrats.shown.map(ContratRow)}
        {contrats.rest.length > 0 && (
          <V3Fold text label={fill(t("fx.fiche.fourn.fold_contrats"), { n: contrats.rest.length })}>{contrats.rest.map(ContratRow)}</V3Fold>
        )}
      </V3Section>

      {fournisseur.byYear.length > 1 && (
        <V3Section title={t("fx.fiche.fourn.h.annees")}>
          {/* Le rail porte les montants (bouts de l'axe, survol, clic) : la liste
              année par année le redoublait. */}
          {yearsDesc.length >= RAIL_MIN ? (
            <AnneesRail rows={yearsDesc.map((y) => ({ year: y.year, amount: y.amount, count: y.count }))} tone="w"
                        countText={(r) => (r.count ? `${r.count} ${t(r.count === 1 ? "fx.fiche.fourn.contrat_row_one" : "fx.fiche.fourn.contrats_row")}` : null)} />
          ) : yearBars(yearsDesc)}
        </V3Section>
      )}

      {fournisseur.byCategory.length > 1 && (
        <V3Section title={t("fx.fiche.fourn.h.pourquoi")} sub={t("fx.fiche.fourn.h.pourquoi_sub")}>
          <FicheBreakdown
            rows={fournisseur.byCategory.map((c) => ({ key: c.category, label: trLabel(c.category, locale), value: c.amount, href: `${basePath}/marches/categorie/${slugifyLabel(c.category)}` }))}
            format={eurTxt}
          />
        </V3Section>
      )}

      <V3Foot>{t("fx.fiche.fourn.note_plafond")}</V3Foot>
    </div>
  );
}
