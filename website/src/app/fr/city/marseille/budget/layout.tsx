import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: 'Budget de Marseille — Recettes, dépenses, flux Sankey',
    description:
      "Budget de la Ville de Marseille en visualisation interactive : 1,84 Md€ ventilés entre fonctionnement et investissement. Sankey des flux par type de dépense, drill-down par catégorie. Source : data.gouv.fr (M57, par nature).",
    en: {
      title: 'Marseille budget — Revenue, spending, Sankey flow',
      description:
        "Ville de Marseille budget as an interactive visualisation: €1.84Bn split between operating and investment. Sankey flows by spending category. Source: data.gouv.fr (M57, by nature).",
    },
    path: '/ville/marseille/budget',
    keywords: [
      'budget Marseille',
      'Ville de Marseille',
      'compte administratif',
      'Sankey budget',
      'finances Marseille',
    ],
  });
}

const dataset = datasetJsonLd({
  name: 'Budget de la Ville de Marseille (Comptes administratifs M57)',
  description:
    "Recettes et dépenses de la Ville de Marseille, ventilées par section (fonctionnement / investissement) et par nature comptable. Source : data.gouv.fr.",
  path: '/ville/marseille/budget',
  keywords: ['budget', 'Marseille', 'compte administratif', 'finances publiques'],
  temporalCoverage: '2018/2024',
  spatialCoverage: 'Marseille, France',
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
