"use client";

/**
 * Bilingual page-header components for dynamic entity routes.
 *
 * Server `page.tsx` files cannot read the user's locale (it lives in
 * localStorage, set client-side). To keep visible h1 / lede / back-links
 * translated, we render those header sections from these tiny client
 * components and pass already-loaded data (numbers, dates, names) as props.
 *
 * Page-level metadata (title, description, og:*) stays French canonical —
 * see /Users/daniel/code/open-public-data/website/src/app/.../page.tsx.
 */

import Link from "next/link";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

// ─────────────────────────────────────────────────────────────────────
// Back kickers — translated section breadcrumbs
// ─────────────────────────────────────────────────────────────────────

export function MarchesBackKicker() {
  const t = useT();
  return (
    <div className="fx-page-kicker">
      <Link href="/ville/paris/marches" style={{ color: "var(--ocre)" }}>
        {t("fx.fiche.back.marches")}
      </Link>
    </div>
  );
}

export function InvestBackKicker() {
  const t = useT();
  return (
    <div className="fx-page-kicker">
      <Link href="/ville/paris/investissements" style={{ color: "var(--ocre)" }}>
        {t("fx.fiche.back.invest")}
      </Link>
    </div>
  );
}

export function SubventionsBackKicker() {
  const t = useT();
  return (
    <div className="fx-page-kicker">
      <Link href="/ville/paris/subventions" style={{ color: "var(--ocre)" }}>
        {t("fx.fiche.back.subventions")}
      </Link>
    </div>
  );
}

export function BudgetBackKicker({ href }: { href: string }) {
  const t = useT();
  return (
    <div className="fx-page-kicker">
      <Link href={href} style={{ color: "var(--ocre)" }}>
        {t("fx.fiche.back.budget")}
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Marchés publics — contrat
// ─────────────────────────────────────────────────────────────────────

export function ContratLede({
  numero,
  year,
  nature,
  multiAttributaire,
  fournisseur,
}: {
  numero: string;
  year: number;
  nature: string;
  multiAttributaire: boolean;
  fournisseur: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const natureLabel = trLabel(nature, locale).toLowerCase();
  return (
    <p className="fx-page-lede">
      {t("fx.fiche.contrat.lede.prefix")} <b>{numero}</b> ·{" "}
      {fill(t("fx.fiche.contrat.lede.notifie_year"), { year })} · {natureLabel}
      {multiAttributaire
        ? ` · ${t("fx.fiche.contrat.lede.multi")}`
        : ` · ${fill(t("fx.fiche.contrat.lede.attribue_a"), { fournisseur })}`}
    </p>
  );
}

export function ContratTitleFallback() {
  const t = useT();
  return <>{t("fx.fiche.contrat.title.fallback")}</>;
}

// ─────────────────────────────────────────────────────────────────────
// Marchés publics — fournisseur
// ─────────────────────────────────────────────────────────────────────

export function FournisseurLede({
  contratCount,
  yearsActive,
  totalAmount,
}: {
  contratCount: number;
  yearsActive: number[];
  totalAmount: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const totalM = totalAmount / 1_000_000;
  const value = new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(totalM);
  const unit = t("fx.s.m_eur");
  const between =
    yearsActive.length > 0
      ? fill(t("fx.fiche.fourn.lede.between"), {
          a: yearsActive[0],
          b: yearsActive[yearsActive.length - 1],
        })
      : "";
  return (
    <p className="fx-page-lede">
      <b>{fill(t("fx.fiche.fourn.lede.contracts_n"), { n: contratCount })}</b>{" "}
      {t("fx.fiche.fourn.lede.notified_by")}
      {between && ` ${between}`}
      {" · "}
      {t("fx.fiche.fourn.lede.cumul_eur").split("{value}")[0]}
      <b>
        {value} {unit}
      </b>
      .
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Investissements — projet
// ─────────────────────────────────────────────────────────────────────

export function ProjetLede({
  year,
  chapitre,
  montant,
}: {
  year: number;
  chapitre: string;
  montant: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const chapitreLabel = trLabel(chapitre, locale);
  return (
    <p className="fx-page-lede">
      {fill(t("fx.fiche.projet.lede.exercice"), { year })} · {chapitreLabel} ·{" "}
      {new Intl.NumberFormat(locStr).format(montant)} €
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Subventions — theme
// ─────────────────────────────────────────────────────────────────────

export function ThemeLede({
  nbBeneficiaires,
  nbSubventions,
  year,
}: {
  nbBeneficiaires: number;
  nbSubventions: number;
  year: number;
}) {
  const t = useT();
  return (
    <p className="fx-page-lede">
      {fill(t("fx.fiche.theme.lede.benef_n"), { n: nbBeneficiaires })} ·{" "}
      {fill(t("fx.fiche.theme.lede.subv_n"), { n: nbSubventions })} ·{" "}
      {fill(t("fx.fiche.theme.lede.exercice"), { year })}.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Dette/patrimoine — bailleur
// ─────────────────────────────────────────────────────────────────────

export function BailleurKickerText({ type }: { type?: string | null }) {
  const t = useT();
  if (type) {
    return <>{fill(t("fx.fiche.bail.kicker.bailleur_type"), { type })}</>;
  }
  return <>{t("fx.fiche.bail.kicker.beneficiaire")}</>;
}

// ─────────────────────────────────────────────────────────────────────
// Marchés publics — categorie
// ─────────────────────────────────────────────────────────────────────

export function CategorieLede({
  nbContrats,
  nbTitulaires,
  year,
}: {
  nbContrats: number;
  nbTitulaires: number;
  year: number;
}) {
  const t = useT();
  return (
    <p className="fx-page-lede">
      {fill(t("fx.fiche.categorie.lede.contrats_n"), { n: nbContrats })} ·{" "}
      {fill(t("fx.fiche.categorie.lede.titulaires_n"), { n: nbTitulaires })} ·{" "}
      {fill(t("fx.fiche.categorie.lede.exercice"), { year })}.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Investissements — chapitre
// ─────────────────────────────────────────────────────────────────────

export function ChapitreInvestLede({
  year,
  nbProjets,
}: {
  year: number;
  nbProjets: number;
}) {
  const t = useT();
  return (
    <p className="fx-page-lede">
      {t("fx.fiche.chap.lede.invest")} ·{" "}
      {fill(t("fx.fiche.chap.lede.exercice"), { year })} ·{" "}
      {fill(t("fx.fiche.chap.lede.projets_n"), { n: nbProjets })}.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Investissements — arrondissement
// ─────────────────────────────────────────────────────────────────────

export function ArrInvestTitleAndLede({
  arr,
  year,
  nbProjets,
}: {
  arr: number;
  year: number;
  nbProjets: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const suf = locale === "en" ? (arr === 1 ? "st" : "th") : arr === 1 ? "er" : "ᵉ";
  return (
    <>
      <h1 className="fx-page-title">
        {arr}
        {suf} <em>{t("fx.fiche.arr_invest.title.suffix")}</em>
      </h1>
      <p className="fx-page-lede">
        {t("fx.fiche.chap.lede.invest")} ·{" "}
        {fill(t("fx.fiche.chap.lede.exercice"), { year })} ·{" "}
        {fill(t("fx.fiche.chap.lede.projets_n"), { n: nbProjets })}.
      </p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Budget — poste
// ─────────────────────────────────────────────────────────────────────

export function PosteLede({
  kind,
  year,
  nbSousPostes,
}: {
  kind: "depense" | "recette";
  year: number;
  nbSousPostes: number;
}) {
  const t = useT();
  const kindLabel =
    kind === "depense"
      ? t("fx.fiche.poste.kind.depense")
      : t("fx.fiche.poste.kind.recette");
  return (
    <p className="fx-page-lede">
      {kindLabel} · {fill(t("fx.fiche.poste.lede.exercice"), { year })} ·{" "}
      {fill(t("fx.fiche.poste.lede.sous_postes_n"), { n: nbSousPostes })}.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Logement social — arrondissement
// ─────────────────────────────────────────────────────────────────────

export function LogementArrKicker({ year }: { year: number }) {
  const t = useT();
  return <>{fill(t("fx.fiche.log_arr.kicker"), { year })}</>;
}

export function LogementArrBackLink() {
  const t = useT();
  return (
    <p className="fx-page-lede">
      <Link href="/ville/paris/logement">{t("fx.fiche.back.logement")}</Link>
    </p>
  );
}
