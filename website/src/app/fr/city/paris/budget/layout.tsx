import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';
import { freshnessFor } from '@/lib/data-freshness';

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
  // Le budget voté couvre jusqu'à N+1 : la borne haute reste celle du voté,
  // la date de mise à jour vient du refresh (data_freshness.json).
  temporalCoverage: '2019/2026',
  spatialCoverage: 'Paris, France',
  dateModified: freshnessFor(['budget_principal', 'budget_vote']).dateModified,
});

export default function BudgetLayout({
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
