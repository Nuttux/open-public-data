import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';
import { freshnessFor } from '@/lib/data-freshness';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: 'Investissements de Paris — Projets géolocalisés par arrondissement',
    description:
      "Écoles, gymnases, voirie, parcs : tous les projets d'investissement de la Ville de Paris, géolocalisés arrondissement par arrondissement. Extraits des PDF du Conseil de Paris.",
    en: {
      title: 'Paris investments — Geolocated projects by arrondissement',
      description:
        "Schools, gyms, roads, parks: every Ville de Paris investment project, geolocated arrondissement by arrondissement. Extracted from Conseil de Paris PDFs.",
    },
    path: '/investissements',
    keywords: [
      'investissements Paris',
      'projets municipaux',
      'travaux arrondissement',
      'écoles Paris',
      'gymnases Paris',
      'voirie Paris',
    ],
  });
}

const dataset = datasetJsonLd({
  name: "Projets d'investissement de la Ville de Paris",
  description:
    "Liste des projets d'investissement de la Ville de Paris (équipements publics, voirie, espaces verts) avec géolocalisation par arrondissement et coût.",
  path: '/investissements',
  keywords: ['investissement', 'équipements publics', 'Paris', 'arrondissements'],
  temporalCoverage: '2019/2026',
  spatialCoverage: 'Paris, France',
  dateModified: freshnessFor(['ap_projets', 'logements_sociaux']).dateModified,
});

export default function InvestissementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }}
      />
      {children}
    </>
  );
}
