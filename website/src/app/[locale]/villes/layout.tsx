import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === 'en';

  return buildPageMetadata({
    title: isEn
      ? 'French cities — Local finances'
      : 'Villes françaises — Finances locales',
    description: isEn
      ? "Compare the finances of France's 20 largest cities: budget, debt, public contracts, subsidies. Standardised DGFiP and OFGL data."
      : "Comparer les finances des 20 plus grandes villes françaises : budget, dette, marchés publics, subventions. Données DGFiP et OFGL normalisées.",
    path: `/${locale}/villes`,
    keywords: [
      'finances villes France',
      'budget municipal',
      'comparaison villes',
      'DGFiP collectivités',
      'OFGL',
    ],
    alternates: {
      fr: '/fr/villes',
      en: '/en/villes',
    },
  });
}

export default function VillesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
