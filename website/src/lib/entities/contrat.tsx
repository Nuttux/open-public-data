import { ContratFiche } from "@/components/fusion";
import { DrawerKicker } from "@/components/fusion/DataLabel";
import {
  MarchesBackKicker,
  ContratLede,
  ContratTitleFallback,
} from "@/components/fusion/EntityPageHeaders";
import VoirLeLieu from "@/components/fusion/VoirLeLieu";
import type { EntityPageConfig } from "@/lib/entity-page";
import { numLocale } from "@/lib/fmt";
import {
  loadContrat,
  loadContratProjet,
  loadContratRanking,
  loadMarcheVulgarization,
  loadSirene,
} from "@/lib/fusion-data";
import { lieuForMarche, lieuForProjet } from "@/lib/lieux-data";
import { normalizeObjet } from "@/lib/objet-normalizer";

type D = {
  contrat: NonNullable<ReturnType<typeof loadContrat>>;
  vulgarization: ReturnType<typeof loadMarcheVulgarization>;
  fournisseurSirene: ReturnType<typeof loadSirene>;
  ranking: ReturnType<typeof loadContratRanking>;
  projetLink: ReturnType<typeof loadContratProjet>;
  lieuLien: ReturnType<typeof lieuForMarche>;
};

export const contratConfig: EntityPageConfig<D> = {
  load: ({ numero }) => {
    const contrat = loadContrat(numero);
    if (!contrat) return null;
    const vulgarization = loadMarcheVulgarization(contrat.numero);
    const siren = contrat.fournisseurSiret && contrat.fournisseurSiret.length >= 9
      ? contrat.fournisseurSiret.slice(0, 9)
      : null;
    const fournisseurSirene = siren ? loadSirene(siren) : null;
    const ranking = loadContratRanking(contrat.numero, contrat.year, contrat.nature, contrat.montantMax);
    // Lien vers le lieu : d'abord le rattachement direct du juge (marché
    // « au-lieu », symétrique de la liste marchés de la fiche lieu), sinon la
    // chaîne transitive contrat → projet → lieu.
    const projetLink = loadContratProjet(contrat.numero);
    const lieuLien = lieuForMarche(contrat.numero) ?? (projetLink ? lieuForProjet(projetLink.nom) : null);
    return { contrat, vulgarization, fournisseurSirene, ranking, projetLink, lieuLien };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Contract not found — Qipu" : "Contrat introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ contrat: c, vulgarization: v }, locale) => {
    const canonical = `/fr/city/paris/marches/contrat/${c.numero}`;
    // Prefer EN object name when available (vulgarization_marches_en.json)
    const objetSnippet = locale === "en"
      ? (v?.objet_clair_en || v?.objet_clair || c.objet).slice(0, 60)
      : (v?.objet_clair || c.objet).slice(0, 60);
    const title = locale === "en"
      ? `${objetSnippet} — Contract ${c.numero} · Qipu`
      : `${objetSnippet} — Marché ${c.numero} · Qipu`;
    const amountFmt = c.montantMax.toLocaleString(numLocale(locale));
    const description = locale === "en"
      ? `Contract ${c.numero} notified in ${c.year} to ${c.fournisseur}. Max envelope €${amountFmt}.`
      : `Contrat ${c.numero} notifié en ${c.year} à ${c.fournisseur}. Enveloppe max ${amountFmt} €.`;
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
        type: "article",
        locale: locale === "en" ? "en_US" : "fr_FR",
        alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
      },
    };
  },
  page: {
    header: ({ contrat, vulgarization }) => {
      // h1 keeps proper-noun data (objet_clair / normalizeObjet output) — already
      // FR but data-driven, not template text. Fallback uses a translation key.
      const titleText = vulgarization?.objet_clair || normalizeObjet(contrat.objet);
      return (
        <>
          <MarchesBackKicker />
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {titleText || <ContratTitleFallback />}
          </h1>
          <ContratLede numero={contrat.numero} year={contrat.year} />
        </>
      );
    },
    body: ({ contrat, vulgarization, fournisseurSirene, ranking, projetLink, lieuLien }, locale) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={locale} />
        <ContratFiche
          contrat={contrat}
          vulgarization={vulgarization}
          fournisseurSirene={fournisseurSirene}
          ranking={ranking}
          projet={projetLink}
        />
      </>
    ),
  },
  drawer: {
    kicker: ({ contrat }) => <DrawerKicker k="contrat" year={contrat.year} nature={contrat.nature} />,
    // Même précédence que ContratFiche (objet_clair → regex → brut). Sans le
    // repli `normalizeObjet`, l'en-tête affichait le libellé technique brut
    // ("SA4.TRVX CSTRUCT…") juste au-dessus du lead qui, lui, montrait la version
    // normalisée ("Sa4.Travaux Cstruct…") — deux titres pour un même contrat.
    title: ({ contrat, vulgarization }) => {
      const label = vulgarization?.objet_clair || normalizeObjet(contrat.objet);
      return label || `Marché ${contrat.numero}`;
    },
    shareUrl: ({ contrat }) => `/fr/city/paris/marches/contrat/${contrat.numero}`,
    shareText: ({ contrat, vulgarization }) => {
      const montantStr = contrat.montantMax >= 1e6
        ? `${(contrat.montantMax / 1e6).toFixed(1).replace(".", ",")} M€`
        : `${Math.round(contrat.montantMax / 1000).toLocaleString("fr-FR")} k€`;
      const label = vulgarization?.objet_clair || normalizeObjet(contrat.objet);
      return `Paris a notifié un marché de ${montantStr} à ${contrat.fournisseur} en ${contrat.year} — ${label}`;
    },
    backHref: () => "/fr/city/paris/marches",
    breadcrumbLabel: ({ contrat }) => `Contrat ${contrat.numero}`,
    children: ({ contrat, vulgarization, fournisseurSirene, ranking, projetLink, lieuLien }) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={"fr"} />
        <ContratFiche
          contrat={contrat}
          vulgarization={vulgarization}
          fournisseurSirene={fournisseurSirene}
          ranking={ranking}
          projet={projetLink}
        />
      </>
    ),
  },
};
