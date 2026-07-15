import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: 'Marchés publics de Marseille — Titulaires, montants',
    description:
      "Marchés publics passés par la Ville de Marseille (2020) : titulaires, montants, objets, catégories CPV. Source : data.gouv.fr (SCDL Ville).",
    en: {
      title: 'Marseille public contracts — Contractors, amounts',
      description:
        "Public contracts awarded by Ville de Marseille (2020). Source: data.gouv.fr (SCDL Ville).",
    },
    path: '/ville/marseille/marches',
    keywords: ['marchés publics Marseille', 'commande publique', 'SCDL'],
  });
}

const dataset = datasetJsonLd({
  name: 'Marchés publics de la Ville de Marseille',
  description:
    "Marchés publics passés par la Ville de Marseille (2020). Source : data.gouv.fr (SCDL Ville).",
  path: '/ville/marseille/marches',
  keywords: ['marchés publics', 'commande publique', 'Marseille', 'SCDL'],
  temporalCoverage: '2020/2020',
  spatialCoverage: 'Marseille, France',
});

export default function MarchesPublicsLayout({
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
