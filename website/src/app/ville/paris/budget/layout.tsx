import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: 'Budget de Paris — Recettes, dépenses, flux Sankey',
    description:
      "Budget de la Ville de Paris en visualisation interactive : 11,7 Md€ répartis entre fonctionnement et investissement. Sankey des flux, drill-down par thématique (éducation, logement, culture, voirie), évolution 2019-2026.",
    en: {
      title: 'Paris budget — Revenue, spending, Sankey flow',
      description:
        "Ville de Paris budget as an interactive visualisation: €11.7Bn split between operating and investment. Sankey flows, drill-down by theme (education, housing, culture, roads), 2019–2026 trend.",
    },
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
}

const dataset = datasetJsonLd({
  name: 'Budget de la Ville de Paris (Comptes administratifs)',
  description:
    "Recettes et dépenses de la Ville de Paris depuis 2019, ventilées par section (fonctionnement / investissement), par thématique et par entité bénéficiaire. Source : Open Data Paris.",
  path: '/budget',
  keywords: ['budget', 'Paris', 'compte administratif', 'finances publiques'],
  temporalCoverage: '2019/2026',
  spatialCoverage: 'Paris, France',
});

/**
 * Layout with parallel `drawer` slot — filled by intercepted route under
 * `@drawer/(.)poste/[slug]`. The slot renders `null` by default via
 * default.tsx, so the drawer only appears when a poste link is clicked.
 */
export default function BudgetLayout({
  children,
  drawer,
}: {
  children: React.ReactNode;
  drawer: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }}
      />
      {children}
      {drawer}
    </>
  );
}
