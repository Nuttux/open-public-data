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
      <Link href="/fr/city/paris/marches" style={{ color: "var(--ocre)" }}>
        {t("fx.fiche.back.marches")}
      </Link>
    </div>
  );
}

export function InvestBackKicker() {
  const t = useT();
  return (
    <div className="fx-page-kicker">
      <Link href="/fr/city/paris/investissements" style={{ color: "var(--ocre)" }}>
        {t("fx.fiche.back.invest")}
      </Link>
    </div>
  );
}

export function SubventionsBackKicker() {
  const t = useT();
  return (
    <div className="fx-page-kicker">
      <Link href="/fr/city/paris/subventions" style={{ color: "var(--ocre)" }}>
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

export function ContratLede({ numero, year }: { numero: string; year: number }) {
  const t = useT();
  return (
    <p className="fx-page-lede">
      {t("fx.fiche.contrat.lede.prefix")} <b>{numero}</b> ·{" "}
      {fill(t("fx.fiche.contrat.lede.notifie_year"), { year })}
    </p>
  );
}

export function ContratTitleFallback() {
  const t = useT();
  return <>{t("fx.fiche.contrat.title.fallback")}</>;
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
// Investissements — arrondissement
// ─────────────────────────────────────────────────────────────────────

export function ArrInvestTitleAndLede({ arr }: { arr: number }) {
  const t = useT();
  const { locale } = useLocale();
  const suf = locale === "en" ? (arr === 1 ? "st" : "th") : arr === 1 ? "er" : "ᵉ";
  return (
    <>
      <h1 className="fx-page-title">
        {arr}
        {suf} <em>{t("fx.fiche.arr_invest.title.suffix")}</em>
      </h1>
    </>
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
      <Link href="/fr/city/paris/logement">{t("fx.fiche.back.logement")}</Link>
    </p>
  );
}
