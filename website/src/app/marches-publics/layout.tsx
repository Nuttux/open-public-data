import type { Metadata } from 'next';
import { buildPageMetadata, datasetJsonLd } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Marchés publics de Paris — Titulaires, montants, objets',
  description:
    "Marchés publics passés par la Ville de Paris : titulaires, montants, objets et catégories. Données essentielles de la commande publique (DECP) 2017-2025.",
  path: '/marches-publics',
  keywords: [
    'marchés publics Paris',
    'commande publique',
    'DECP',
    'titulaires marchés',
    "appels d'offres Paris",
  ],
});

const dataset = datasetJsonLd({
  name: 'Marchés publics de la Ville de Paris',
  description:
    "Marchés publics passés par la Ville de Paris avec leurs titulaires, montants, objets et catégories. Source : Données Essentielles de la Commande Publique (DECP).",
  path: '/marches-publics',
  keywords: ['marchés publics', 'commande publique', 'Paris', 'DECP'],
  temporalCoverage: '2017/2025',
  spatialCoverage: 'Paris, France',
});

/**
 * Layout with parallel `drawer` slot — filled by intercepted routes under
 * `@drawer/(.)contrat/[numero]` and `@drawer/(.)fournisseur/[siren]`.
 * The slot renders `null` by default (default.tsx).
 */
export default function MarchesPublicsLayout({
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
