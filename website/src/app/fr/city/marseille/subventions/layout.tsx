import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: 'Qui reçoit l’argent public à Marseille ? — Subventions Ville',
    description:
      'Subventions versées par la Ville de Marseille (2017-2022) : bénéficiaires, montants, évolution. Source : data.gouv.fr (SCDL).',
    en: {
      title: 'Who receives public money in Marseille? — Ville grants',
      description:
        'Grants paid by the Ville de Marseille (2017-2022). Source: data.gouv.fr (SCDL).',
    },
    path: '/fr/city/marseille/subventions',
    keywords: ['subventions Marseille', 'associations', 'SCDL', 'bénéficiaires'],
  });
}

const dataset = datasetJsonLd({
  name: 'Subventions de la Ville de Marseille',
  description:
    'Subventions versées par la Ville de Marseille (2017-2022). Source : data.gouv.fr (SCDL).',
  path: '/fr/city/marseille/subventions',
  keywords: ['subventions', 'Marseille', 'SCDL', 'associations'],
  temporalCoverage: '2017/2022',
  spatialCoverage: 'Marseille, France',
});

export default function QuiRecoitLayout({
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
