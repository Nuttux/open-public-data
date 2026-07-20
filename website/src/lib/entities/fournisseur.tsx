import { FournisseurFiche } from "@/components/fusion";
import { MarchesBackKicker } from "@/components/fusion/EntityPageHeaders";
import VoirLeLieu from "@/components/fusion/VoirLeLieu";
import type { EntityPageConfig } from "@/lib/entity-page";
import { numLocale } from "@/lib/fmt";
import { loadFournisseur, loadSirene } from "@/lib/fusion-data";
import { lieuForBeneficiaire } from "@/lib/lieux-data";

type D = {
  fournisseur: NonNullable<ReturnType<typeof loadFournisseur>>;
  sirene: ReturnType<typeof loadSirene>;
  lieuLien: ReturnType<typeof lieuForBeneficiaire>;
};

export const fournisseurConfig: EntityPageConfig<D> = {
  load: ({ siren }) => {
    const fournisseur = loadFournisseur(siren);
    if (!fournisseur) return null;
    return {
      fournisseur,
      sirene: loadSirene(fournisseur.siren),
      lieuLien: lieuForBeneficiaire(fournisseur.nom),
    };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Supplier not found — France Open Data" : "Fournisseur introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ fournisseur: f }, locale) => {
    // Canonical URL = SIREN (9 chars) — la fiche agrège tous les SIRETs du
    // même SIREN, donc l'URL stable est le SIREN, pas le SIRET du premier
    // établissement rencontré.
    const canonical = `/fr/city/paris/marches/fournisseur/${f.siren || f.siret}`;
    const amountFmt = f.totalAmount.toLocaleString(numLocale(locale));
    const title = locale === "en"
      ? `${f.nom} — Supplier · France Open Data`
      : `${f.nom} — Fournisseur · France Open Data`;
    const description = locale === "en"
      ? `${f.nom}: ${f.contratCount} contracts, total €${amountFmt} with the Ville de Paris.`
      : `${f.nom} : ${f.contratCount} contrats, cumul ${amountFmt} € avec la Ville de Paris.`;
    return {
      title,
      description,
      alternates: {
        canonical,
        languages: { "fr-FR": canonical, "en-US": canonical },
      },
      openGraph: {
        title,
        description,
        type: "profile",
        locale: locale === "en" ? "en_US" : "fr_FR",
        alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
      },
    };
  },
  page: {
    header: ({ fournisseur }) => (
      <>
        <MarchesBackKicker />
        <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 52px)" }}>
          {fournisseur.nom}
        </h1>
      </>
    ),
    body: ({ fournisseur, sirene, lieuLien }, locale) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={locale} />
        <FournisseurFiche fournisseur={fournisseur} sirene={sirene} />
      </>
    ),
  },
  drawer: {
    kicker: ({ fournisseur }) => <>Fournisseur · {fournisseur.contratCount} contrats</>,
    title: ({ fournisseur }) => fournisseur.nom,
    shareUrl: ({ fournisseur }) =>
      `/fr/city/paris/marches/fournisseur/${fournisseur.siren || fournisseur.siret}`,
    shareText: ({ fournisseur }) => {
      const montantStr = fournisseur.totalAmount >= 1e9
        ? `${(fournisseur.totalAmount / 1e9).toFixed(2).replace(".", ",")} Md€`
        : `${(fournisseur.totalAmount / 1e6).toFixed(1).replace(".", ",")} M€`;
      const years = fournisseur.yearsActive.length
        ? `${Math.min(...fournisseur.yearsActive)}-${Math.max(...fournisseur.yearsActive)}`
        : "";
      return `${fournisseur.nom} a reçu ${montantStr} de la Ville de Paris via ${fournisseur.contratCount} marchés${years ? ` (${years})` : ""}`;
    },
    backHref: () => "/fr/city/paris/marches",
    breadcrumbLabel: ({ fournisseur }) => fournisseur.nom,
    children: ({ fournisseur, sirene, lieuLien }) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={"fr"} />
        <FournisseurFiche fournisseur={fournisseur} sirene={sirene} />
      </>
    ),
  },
};
