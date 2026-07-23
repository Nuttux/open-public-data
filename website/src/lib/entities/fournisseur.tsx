import { FournisseurFiche } from "@/components/fusion";
import { MarchesBackKicker } from "@/components/fusion/EntityPageHeaders";
import VoirLeLieu from "@/components/fusion/VoirLeLieu";
import type { EntityPageConfig } from "@/lib/entity-page";
import { getCity } from "@/lib/cities";
import { numLocale } from "@/lib/fmt";
import { loadFournisseur, loadSirene } from "@/lib/fusion-data";
import { lieuForBeneficiaire } from "@/lib/lieux-data";

type D = {
  fournisseur: NonNullable<ReturnType<typeof loadFournisseur>>;
  sirene: ReturnType<typeof loadSirene>;
  lieuLien: ReturnType<typeof lieuForBeneficiaire>;
};

/**
 * Supplier (fournisseur) entity page — city-parametrized, mirroring the contract
 * factory: `loadFournisseur`, every href and the "Ville de X" copy derive from
 * `city`. The lieu link is a Paris-only enrichment (gated), so a second city
 * degrades to the plain supplier history — never a broken link.
 */
export function makeFournisseurConfig(city: string): EntityPageConfig<D> {
  const cityNom = getCity(city)?.nom ?? "la Ville";
  const base = `/fr/city/${city}/marches`;
  const isParis = city === "paris";
  return {
  load: ({ siren }) => {
    const fournisseur = loadFournisseur(siren, city);
    if (!fournisseur) return null;
    return {
      fournisseur,
      sirene: loadSirene(fournisseur.siren),
      lieuLien: isParis ? lieuForBeneficiaire(fournisseur.nom) : null,
    };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Supplier not found — Qipu" : "Fournisseur introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ fournisseur: f }, locale) => {
    // Canonical URL = SIREN (9 chars) — la fiche agrège tous les SIRETs du
    // même SIREN, donc l'URL stable est le SIREN, pas le SIRET du premier
    // établissement rencontré.
    const canonical = `${base}/fournisseur/${f.siren || f.siret}`;
    const amountFmt = f.totalAmount.toLocaleString(numLocale(locale));
    const title = locale === "en"
      ? `${f.nom} — Supplier · Qipu`
      : `${f.nom} — Fournisseur · Qipu`;
    const description = locale === "en"
      ? `${f.nom}: ${f.contratCount} contracts, total €${amountFmt} with the Ville de ${cityNom}.`
      : `${f.nom} : ${f.contratCount} contrats, cumul ${amountFmt} € avec la Ville de ${cityNom}.`;
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
      `${base}/fournisseur/${fournisseur.siren || fournisseur.siret}`,
    shareText: ({ fournisseur }) => {
      const montantStr = fournisseur.totalAmount >= 1e9
        ? `${(fournisseur.totalAmount / 1e9).toFixed(2).replace(".", ",")} Md€`
        : `${(fournisseur.totalAmount / 1e6).toFixed(1).replace(".", ",")} M€`;
      const years = fournisseur.yearsActive.length
        ? `${Math.min(...fournisseur.yearsActive)}-${Math.max(...fournisseur.yearsActive)}`
        : "";
      return `${fournisseur.nom} a reçu ${montantStr} de la Ville de ${cityNom} via ${fournisseur.contratCount} marchés${years ? ` (${years})` : ""}`;
    },
    backHref: () => base,
    breadcrumbLabel: ({ fournisseur }) => fournisseur.nom,
    children: ({ fournisseur, sirene, lieuLien }) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={"fr"} />
        <FournisseurFiche fournisseur={fournisseur} sirene={sirene} />
      </>
    ),
  },
  };
}

/** Paris supplier page — the original config, now via the factory. */
export const fournisseurConfig: EntityPageConfig<D> = makeFournisseurConfig("paris");
