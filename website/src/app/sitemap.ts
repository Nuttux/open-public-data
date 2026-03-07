import { locales } from '@/i18n/config';

const BASE_URL = 'https://franceopendata.org';

const routes = [
  '',
  '/budget',
  '/patrimoine',
  '/subventions',
  '/investissements',
  '/marches-publics',
  '/logements',
  '/tableau-de-bord',
  '/confidentialite',
  '/blog',
];

export default function sitemap() {
  return locales.flatMap((locale) =>
    routes.map((route) => ({
      url: `${BASE_URL}/${locale}${route}`,
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${BASE_URL}/${l}${route}`]),
        ),
      },
    })),
  );
}
