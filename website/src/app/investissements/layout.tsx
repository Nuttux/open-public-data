import type { Metadata } from 'next';
import { buildPageMetadata, datasetJsonLd } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Investissements de Paris — Projets géolocalisés par arrondissement',
  description:
    "Écoles, gymnases, voirie, parcs : tous les projets d'investissement de la Ville de Paris, géolocalisés arrondissement par arrondissement. Extraits des PDF du Conseil de Paris.",
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

const dataset = datasetJsonLd({
  name: "Projets d'investissement de la Ville de Paris",
  description:
    "Liste des projets d'investissement de la Ville de Paris (équipements publics, voirie, espaces verts) avec géolocalisation par arrondissement et coût.",
  path: '/investissements',
  keywords: ['investissement', 'équipements publics', 'Paris', 'arrondissements'],
  temporalCoverage: '2019/2026',
  spatialCoverage: 'Paris, France',
});

export default function InvestissementsLayout({ children }: { children: React.ReactNode }) {
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
