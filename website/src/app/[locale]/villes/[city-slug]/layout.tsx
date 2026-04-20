import type { Metadata } from 'next';
import { getCityBySlug, CITY_SLUGS } from '@/lib/constants/cities';
import { buildPageMetadata, breadcrumbJsonLd, datasetJsonLd } from '@/lib/seo';
import CityLayoutClient from './CityLayoutClient';

type Params = { locale: string; 'city-slug': string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, 'city-slug': slug } = await params;
  const city = getCityBySlug(slug);

  if (!city) {
    return buildPageMetadata({
      title: 'Ville introuvable',
      description: 'Cette ville ne fait pas partie de nos données.',
      path: `/${locale}/villes/${slug}`,
      noindex: true,
    });
  }

  return buildPageMetadata({
    title: `${city.name} — Finances locales (${city.population.toLocaleString('fr-FR')} habitants)`,
    description: `Budget, patrimoine, marchés publics et subventions de la Ville de ${city.name}. Données DGFiP et OFGL normalisées, comparables avec les autres grandes villes françaises.`,
    path: `/${locale}/villes/${slug}/budget`,
    keywords: [
      `budget ${city.name}`,
      `finances ${city.name}`,
      `dette ${city.name}`,
      `marchés publics ${city.name}`,
      'DGFiP',
      'collectivités territoriales',
    ],
    alternates: {
      fr: `/fr/villes/${slug}/budget`,
      en: `/en/villes/${slug}/budget`,
    },
  });
}

export async function generateStaticParams() {
  return CITY_SLUGS.flatMap((slug) =>
    ['fr', 'en'].map((locale) => ({ locale, 'city-slug': slug })),
  );
}

export default async function CityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<Params>;
}) {
  const { locale, 'city-slug': slug } = await params;
  const city = getCityBySlug(slug);

  const breadcrumb = city
    ? breadcrumbJsonLd([
        { name: 'Accueil', path: '/' },
        { name: 'Villes', path: `/${locale}/villes` },
        { name: city.name, path: `/${locale}/villes/${slug}/budget` },
      ])
    : null;

  const dataset = city
    ? datasetJsonLd({
        name: `Finances de la Ville de ${city.name}`,
        description: `Budget, patrimoine, marchés publics et subventions de la Ville de ${city.name}, source DGFiP / OFGL / DECP.`,
        path: `/${locale}/villes/${slug}/budget`,
        keywords: [city.name, 'budget', 'finances locales', 'DGFiP'],
        spatialCoverage: `${city.name}, France`,
      })
    : null;

  return (
    <>
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
      )}
      {dataset && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }}
        />
      )}
      <CityLayoutClient slug={slug}>{children}</CityLayoutClient>
    </>
  );
}
