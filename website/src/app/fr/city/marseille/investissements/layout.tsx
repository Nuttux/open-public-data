import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Investissements de Marseille — Projets par thématique et arrondissement",
    description:
      "Écoles, sécurité, environnement, sports : projets d'investissement de la Ville de Marseille extraits des rapports de présentation du compte administratif. Granularité arrondissement.",
    en: {
      title: 'Marseille investments — Projects by theme and district',
      description:
        "Schools, security, environment, sports: Ville de Marseille investment projects extracted from the administrative account presentation reports. District-level granularity.",
    },
    path: '/fr/city/marseille/investissements',
    keywords: [
      'investissements Marseille',
      'projets municipaux',
      'compte administratif',
      'thématiques',
      'arrondissements',
    ],
  });
}

const dataset = datasetJsonLd({
  name: "Projets d'investissement de la Ville de Marseille (CA, parsing PDF)",
  description:
    "Projets d'investissement de la Ville de Marseille extraits des rapports de présentation des comptes administratifs (PDF). Classification par thématique et arrondissement. POC v1 (couverture 2023-2024).",
  path: '/fr/city/marseille/investissements',
  keywords: ['investissement', 'Marseille', 'compte administratif', 'thématiques'],
  temporalCoverage: '2023/2024',
  spatialCoverage: 'Marseille, France',
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
