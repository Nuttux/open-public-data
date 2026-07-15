import type { Metadata } from 'next';
import { buildLocaleAwareMetadata, datasetJsonLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: 'Marchés publics de Paris — Titulaires, montants, objets',
    description:
      "Marchés publics passés par la Ville de Paris : titulaires, montants, objets et catégories. Données essentielles de la commande publique (DECP) 2017-2025.",
    en: {
      title: 'Paris public contracts — Contractors, amounts, objects',
      description:
        "Public contracts awarded by the Ville de Paris: contractors, amounts, objects, and categories. DECP (Essential Public Procurement Data) 2017–2025.",
    },
    path: '/marches-publics',
    keywords: [
      'marchés publics Paris',
      'commande publique',
      'DECP',
      'titulaires marchés',
      "appels d'offres Paris",
    ],
  });
}

const dataset = datasetJsonLd({
  name: 'Marchés publics de la Ville de Paris',
  description:
    "Marchés publics passés par la Ville de Paris avec leurs titulaires, montants, objets et catégories. Source : Données Essentielles de la Commande Publique (DECP).",
  path: '/marches-publics',
  keywords: ['marchés publics', 'commande publique', 'Paris', 'DECP'],
  temporalCoverage: '2017/2025',
  spatialCoverage: 'Paris, France',
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
