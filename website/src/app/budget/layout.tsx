import type { Metadata } from 'next';
import { buildPageMetadata, datasetJsonLd } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Budget de Paris — Recettes, dépenses, flux Sankey',
  description:
    "Budget de la Ville de Paris en visualisation interactive : 11,7 Md€ répartis entre fonctionnement et investissement. Sankey des flux, drill-down par thématique (éducation, logement, culture, voirie), évolution 2019-2026.",
  path: '/budget',
  keywords: [
    'budget Paris',
    'Ville de Paris',
    'compte administratif',
    'Sankey budget',
    'dépenses fonctionnement',
    'investissement municipal',
  ],
});

const dataset = datasetJsonLd({
  name: 'Budget de la Ville de Paris (Comptes administratifs)',
  description:
    "Recettes et dépenses de la Ville de Paris depuis 2019, ventilées par section (fonctionnement / investissement), par thématique et par entité bénéficiaire. Source : Open Data Paris.",
  path: '/budget',
  keywords: ['budget', 'Paris', 'compte administratif', 'finances publiques'],
  temporalCoverage: '2019/2026',
  spatialCoverage: 'Paris, France',
});

export default function BudgetLayout({ children }: { children: React.ReactNode }) {
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
