import { ProjetFiche } from "@/components/fusion";
import { InvestBackKicker } from "@/components/fusion/EntityPageHeaders";
import VoirLeLieu from "@/components/fusion/VoirLeLieu";
import type { EntityPageConfig } from "@/lib/entity-page";
import { numLocale } from "@/lib/fmt";
import { loadProjet, resolveProjetPhoto } from "@/lib/fusion-data";
import { lieuForProjet } from "@/lib/lieux-data";
import { trLabel } from "@/lib/label-translate";

type D = {
  projet: NonNullable<ReturnType<typeof loadProjet>>;
  photo: ReturnType<typeof resolveProjetPhoto>;
  lieuLien: ReturnType<typeof lieuForProjet>;
};

export const projetConfig: EntityPageConfig<D> = {
  load: ({ id }) => {
    const projet = loadProjet(id);
    if (!projet) return null;
    return {
      projet,
      photo: resolveProjetPhoto(projet.id, projet.name),
      lieuLien: lieuForProjet(projet.name),
    };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Project not found — France Open Data" : "Projet introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ projet: p }, locale) => {
    const canonical = `/fr/city/paris/investissements/projet/${encodeURIComponent(p.id)}`;
    const projectName = locale === "en" && (p as { name_en?: string }).name_en
      ? (p as { name_en?: string }).name_en!
      : p.name;
    const title = locale === "en"
      ? `${projectName.slice(0, 60)} — Project · France Open Data`
      : `${projectName.slice(0, 60)} — Projet · France Open Data`;
    const amountFmt = p.montant.toLocaleString(numLocale(locale));
    const chapitreLabel = trLabel(p.chapitre, locale);
    const description = locale === "en"
      ? `Investment project ${p.year} · €${amountFmt} · ${chapitreLabel}.`
      : `Projet d'investissement ${p.year} · ${amountFmt} € · ${chapitreLabel}.`;
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
    header: ({ projet }, locale) => {
      const displayName = locale === "en" && projet.name_en ? projet.name_en : projet.name;
      return (
        <>
          <InvestBackKicker />
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {displayName}
          </h1>
        </>
      );
    },
    body: ({ projet, photo, lieuLien }, locale) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={locale} />
        <ProjetFiche projet={projet} photo={photo} />
      </>
    ),
  },
  drawer: {
    usesLocale: true,
    kicker: ({ projet }, locale) => {
      const arr = projet.arrondissement > 0
        ? (locale === "en"
            ? `${projet.arrondissement}${projet.arrondissement === 1 ? "st" : projet.arrondissement === 2 ? "nd" : projet.arrondissement === 3 ? "rd" : "th"} district`
            : `${projet.arrondissement}${projet.arrondissement === 1 ? "er" : "ᵉ"} arr.`)
        : (locale === "en" ? "Citywide" : "Transverse");
      return <>{locale === "en" ? "Investment" : "Investissement"} · {projet.year} · {arr}</>;
    },
    title: ({ projet }, locale) =>
      locale === "en" && projet.name_en ? projet.name_en : projet.name,
    shareUrl: ({ projet }) =>
      `/fr/city/paris/investissements/projet/${encodeURIComponent(projet.id)}`,
    shareText: ({ projet }, locale) => {
      const displayName = locale === "en" && projet.name_en ? projet.name_en : projet.name;
      const montantStr = projet.montant >= 1e6
        ? `${(projet.montant / 1e6).toFixed(1).replace(".", ",")} ${locale === "en" ? "€M" : "M€"}`
        : `${Math.round(projet.montant / 1000).toLocaleString(numLocale(locale))} ${locale === "en" ? "€k" : "k€"}`;
      return locale === "en"
        ? `City of Paris investment ${projet.year} · ${displayName} · ${montantStr}`
        : `Investissement Ville de Paris ${projet.year} · ${displayName} · ${montantStr}`;
    },
    backHref: () => "/",
    breadcrumbLabel: ({ projet }, locale) => {
      const displayName = locale === "en" && projet.name_en ? projet.name_en : projet.name;
      return displayName.slice(0, 50);
    },
    children: ({ projet, photo, lieuLien }, locale) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={locale} />
        <ProjetFiche projet={projet} photo={photo} />
      </>
    ),
  },
};
