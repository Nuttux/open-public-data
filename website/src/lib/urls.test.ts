import { describe, expect, it } from 'vitest';
import {
  countryPath,
  isIndexable,
  langForLegacyHost,
  languageTwins,
  legacyToNew,
  sitePagePath,
  translatePath,
} from './urls';

describe('legacyToNew — every family of today’s routes', () => {
  const cases: [string, 'fr' | 'en' | 'pt', string | null][] = [
    // Landing
    ['/', 'fr', '/fr'],
    ['/', 'en', '/en'],
    ['/', 'pt', '/pt'],
    // French communes and their sections
    ['/fr/city/lille', 'fr', '/fr/france/lille'],
    ['/fr/city/lille', 'en', '/en/france/lille'],
    ['/fr/city/lille/marches', 'fr', '/fr/france/lille/marches'],
    ['/fr/city/saint-clement-89338/fonction/enseignement-formation', 'fr', '/fr/france/saint-clement-89338/fonction/enseignement-formation'],
    ['/fr/city/lille/marche/decp-2025T13454', 'en', '/en/france/lille/marche/decp-2025T13454'],
    // Paris and Marseille fiches
    ['/fr/city/paris/subventions/association/agospap', 'fr', '/fr/france/paris/subventions/association/agospap'],
    ['/fr/city/paris/marches/contrats/2024', 'en', '/en/france/paris/marches/contrats/2024'],
    ['/fr/city/marseille/lieu/mucem', 'fr', '/fr/france/marseille/lieu/mucem'],
    // National
    ['/fr/national/dette', 'fr', '/fr/france/dette'],
    ['/fr/national/budget/bucket/etat/agg/defense', 'en', '/en/france/budget/bucket/etat/agg/defense'],
    ['/fr/compare/lille/lyon', 'fr', '/fr/france/comparer/lille/lyon'],
    ['/comparer', 'en', '/en/france/comparer'],
    // France content has no Portuguese version: served in English
    ['/fr/city/lille', 'pt', '/en/france/lille'],
    // United States: English only, sf renamed
    ['/us', 'en', '/en/usa'],
    ['/us/national', 'en', '/en/usa/national'],
    ['/us/city/sf/budget', 'en', '/en/usa/san-francisco/budget'],
    ['/us/city/sf/budget', 'fr', '/en/usa/san-francisco/budget'],
    ['/us/city/sf/who-gets-paid/payee/the-depository-trust-company', 'en', '/en/usa/san-francisco/who-gets-paid/payee/the-depository-trust-company'],
    // Brazil
    ['/br/city/recife', 'pt', '/pt/brasil/recife'],
    ['/br/city/recife/quem-recebe/05291944000189', 'en', '/en/brasil/recife/quem-recebe/05291944000189'],
    ['/br/city/recife/contratos', 'fr', '/en/brasil/recife/contratos'],
    // Site pages, translated
    ['/methode', 'fr', '/fr/methode'],
    ['/methode', 'en', '/en/method'],
    ['/methode', 'pt', '/en/method'],
    ['/pour-les-villes', 'pt', '/pt/para-cidades'],
    ['/confidentialite', 'en', '/en/privacy'],
    ['/licence', 'en', '/en/license'],
    ['/signalement', 'en', '/en/report-an-error'],
    ['/analyses/paris-peut-elle-faire-faillite', 'en', '/en/analyses/paris-peut-elle-faire-faillite'],
    ['/chat/c/abc123', 'fr', '/fr/chat/c/abc123'],
    // Not legacy pages
    ['/robots.txt', 'en', null],
    ['/llms.txt', 'fr', null],
    ['/sitemap/3.xml', 'fr', null],
    ['/fr/france/lille', 'fr', null],
    ['/en/method', 'en', null],
  ];
  it.each(cases)('%s (%s) → %s', (legacy, lang, expected) => {
    expect(legacyToNew(legacy, lang)).toBe(expected);
  });

  it('ignores a trailing slash and a query string', () => {
    expect(legacyToNew('/fr/city/lille/', 'fr')).toBe('/fr/france/lille');
    expect(legacyToNew('/fr/city/paris/budget?year=2022', 'fr')).toBe('/fr/france/paris/budget');
  });
});

describe('langForLegacyHost', () => {
  it('reads the language the old host spoke', () => {
    expect(langForLegacyHost('fr.qipu.org')).toBe('fr');
    expect(langForLegacyHost('pt.qipu.org')).toBe('pt');
    expect(langForLegacyHost('www.qipu.org')).toBe('en');
    expect(langForLegacyHost('qipu.org')).toBe('en');
    expect(langForLegacyHost('www.franceopendata.org')).toBe('fr');
    expect(langForLegacyHost('fr.localhost:3011')).toBe('fr');
  });
});

describe('builders and translations', () => {
  it('builds country and site paths in the language they exist in', () => {
    expect(countryPath('fr', 'france', 'lille', 'marches')).toBe('/fr/france/lille/marches');
    expect(countryPath('fr', 'usa', 'san-francisco')).toBe('/en/usa/san-francisco');
    expect(sitePagePath('methode', 'pt')).toBe('/en/method');
    expect(sitePagePath('confidentialite', 'pt')).toBe('/pt/privacidade');
  });

  it('translates a page into its twins, and only into languages it exists in', () => {
    expect(translatePath('/fr/france/paris/subventions', 'en')).toBe('/en/france/paris/subventions');
    expect(translatePath('/fr/france/paris/subventions', 'pt')).toBeNull();
    expect(translatePath('/en/method', 'fr')).toBe('/fr/methode');
    expect(translatePath('/pt/para-cidades', 'en')).toBe('/en/for-cities');
    expect(languageTwins('/en/usa/san-francisco/budget')).toEqual({ en: '/en/usa/san-francisco/budget' });
    expect(languageTwins('/pt/brasil/recife')).toEqual({ pt: '/pt/brasil/recife', en: '/en/brasil/recife' });
    expect(languageTwins('/fr')).toEqual({ fr: '/fr', en: '/en', pt: '/pt' });
  });

  it('round-trips: translating there and back returns the same page', () => {
    for (const p of ['/fr/france/lille/marches', '/fr/methode', '/fr/pour-les-villes', '/pt/brasil/recife/contratos']) {
      const lang = p.split('/')[1] as 'fr' | 'en' | 'pt';
      const en = translatePath(p, 'en')!;
      expect(translatePath(en, lang)).toBe(p);
    }
  });
});

describe('isIndexable — native language always, translations only for hubs', () => {
  const cases: [string, boolean][] = [
    ['/fr', true],
    ['/en', true],
    ['/fr/france/lille', true],
    ['/en/france/lille', false],
    ['/en/france/lille/marches', false],
    ['/en/france/lille/fonction/enseignement-formation', false],
    ['/en/france', true],
    ['/en/france/dette', true],
    ['/en/france/budget/bucket/etat/agg/defense', false],
    ['/en/france/comparer', true],
    ['/en/france/paris', true],
    ['/en/france/paris/subventions', true],
    ['/en/france/paris/subventions/association/agospap', false],
    ['/fr/france/paris/subventions/association/agospap', true],
    ['/en/usa/san-francisco/who-gets-paid/payee/x', true],
    ['/pt/brasil/recife/quem-recebe/05291944000189', true],
    ['/en/brasil/recife/contratos', true],
    ['/en/brasil/recife/quem-recebe/05291944000189', false],
    ['/en/method', true],
    ['/nope', false],
  ];
  it.each(cases)('%s → %s', (p, expected) => {
    expect(isIndexable(p)).toBe(expected);
  });
});
