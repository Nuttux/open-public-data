import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: 'Logement social à Marseille — Taux SRU, parc, bailleurs',
    description:
      "Le parc social marseillais en visualisation interactive : taux SRU, atlas par arrondissement, principaux bailleurs. Source : Métropole AMP (RPLS atlas + sru-taux).",
    en: {
      title: 'Marseille social housing — SRU rate, stock, landlords',
      description:
        "Marseille's social-housing stock as an interactive visualisation: SRU rate, district-level atlas, main landlords. Source: Aix-Marseille-Provence Métropole.",
    },
    path: '/fr/city/marseille/logement',
    keywords: [
      'logement social Marseille',
      'taux SRU',
      'bailleurs sociaux Marseille',
      'RPLS Marseille',
    ],
  });
}

const dataset = datasetJsonLd({
  name: 'Logement social à Marseille (Atlas RPLS Métropole AMP)',
  description:
    "Parc social de Marseille — taux SRU annuel commune, atlas du parc par arrondissement (16), parts des principaux bailleurs. Source : Métropole Aix-Marseille-Provence (data.ampmetropole.fr).",
  path: '/fr/city/marseille/logement',
  keywords: ['logement social', 'SRU', 'Marseille', 'RPLS', 'bailleurs sociaux'],
  temporalCoverage: '2010/2024',
  spatialCoverage: 'Marseille, France',
});

export default function LogementSocialMarseilleLayout({
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
