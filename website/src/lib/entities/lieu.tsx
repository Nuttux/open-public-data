import Link from "next/link";

import LieuFiche from "@/components/fusion/LieuFiche";
import LieuxVoisins from "@/components/fusion/LieuxVoisins";
import type { EntityPageConfig } from "@/lib/entity-page";
import { loadLieu, loadLieuxIndex } from "@/lib/lieux-data";

type D = { lieu: NonNullable<ReturnType<typeof loadLieu>> };

export function lieuStaticParams(): { slug: string }[] {
  return loadLieuxIndex().map((l) => ({ slug: l.slug }));
}

export const lieuConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const lieu = loadLieu(slug);
    if (!lieu) return null;
    return { lieu };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Place not found — France Open Data" : "Lieu introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ lieu }, locale, { slug }) => {
    const title = `${lieu.name} — ${locale === "en" ? lieu.kind_en : lieu.kind_fr} · France Open Data`;
    const description = locale === "en"
      ? `${lieu.name}: ${lieu.stats.n_lieu ?? 0} Conseil de Paris deliberations, municipal bulletin extracts back to 1882, city investments — every fact linked to its source.`
      : `${lieu.name} : ${lieu.stats.n_lieu ?? 0} délibérations du Conseil de Paris, extraits du Bulletin municipal depuis 1882, investissements de la Ville — chaque fait relié à sa source.`;
    const canonical = `/fr/city/paris/lieu/${slug}`;
    return {
      title,
      description,
      alternates: { canonical, languages: { "fr-FR": canonical, "en-US": canonical } },
      openGraph: { title, description, type: "article", locale: locale === "en" ? "en_US" : "fr_FR" },
    };
  },
  page: {
    // Pas de section fx-page-header : la fiche lieu rend son back-link,
    // kicker et h1 directement dans le fx-fiche-wrap (layout pré-refacto).
    body: ({ lieu }, locale) => {
      const kind = locale === "en" ? lieu.kind_en : lieu.kind_fr;
      return (
        <>
          <nav className="fx-fiche-back">
            <Link href="/fr/city/paris/lieux" className="fx-row-link">← {locale === "en" ? "All places" : "Tous les lieux"}</Link>
          </nav>
          <div className="fx-page-kicker">
            {kind}
            {lieu.arrondissement > 0 ? ` · ${lieu.arrondissement}${lieu.arrondissement === 1 ? "er" : "e"}` : ""}
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(26px, 3.4vw, 40px)", margin: "4px 0 24px" }}>
            {lieu.name}
          </h1>
          <LieuFiche lieu={lieu} />
          <LieuxVoisins slug={lieu.slug} famille={lieu.famille} arrondissement={lieu.arrondissement} />
        </>
      );
    },
  },
  drawer: {
    kicker: ({ lieu }) => `${lieu.kind_fr} · ${lieu.arrondissement}${lieu.arrondissement === 1 ? "er" : "e"}`,
    title: ({ lieu }) => lieu.name,
    shareUrl: ({ lieu }) => `/fr/city/paris/lieu/${lieu.slug}`,
    backHref: () => "/fr/city/paris/lieux",
    breadcrumbLabel: ({ lieu }) => lieu.name,
    children: ({ lieu }) => <LieuFiche lieu={lieu} />,
  },
  staticParams: lieuStaticParams,
};
