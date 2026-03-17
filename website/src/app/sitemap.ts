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
  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
  }));
}
