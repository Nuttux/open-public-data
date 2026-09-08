'use client';

import {
  createContext,
  useContext,
  useCallback,
  use,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

import { getCity } from '@/lib/cities';
import { urlForLocale } from '@/lib/site-locale';
import frDictionary from '@/i18n/fr';

// City label rewriter — replaces hardcoded "Paris" forms with the current
// city's label when navigating under /fr/city/[city]/*. Lets us reuse the Paris
// i18n strings for other cities without forking 50+ keys.
//
// The city NAME comes from the shared registry (lib/cities), so noun
// substitution ("Ville de Paris" → "Ville de <city>") works for ANY registered
// city with zero edits here. Only the French adjective morphology
// ("parisien" → "marseillais"), which can't be derived from a name, is declared
// locally — and only for cities whose pages actually surface those adjectives.
const CITY_ADJECTIVES: Record<string, { adj_m: string; adj_f: string }> = {
  marseille: { adj_m: 'marseillais', adj_f: 'marseillaise' },
};

function cityRewriteTarget(
  citySlug: string,
): { nom: string; adj_m?: string; adj_f?: string } | null {
  if (citySlug === 'paris') return null;
  const nom = getCity(citySlug)?.nom;
  if (!nom) return null;
  return { nom, ...CITY_ADJECTIVES[citySlug] };
}

function detectCityFromPath(pathname: string | null): string | null {
  // usePathname() can momentarily hand back something other than a plain
  // string during a cold Turbopack dev compile (observed: an object without
  // .match, first request after a server restart only) — never on a warm
  // server. Guard defensively rather than crash the render; the next render
  // a few ms later gets a proper string and the city label rewrite applies.
  if (typeof pathname !== 'string') return null;
  const m = pathname.match(/^\/fr\/city\/([^/]+)/);
  return m ? m[1] : null;
}

function rewriteForCity(value: string, citySlug: string): string {
  const target = cityRewriteTarget(citySlug);
  if (!target) return value;
  let out = value;
  // Adjective morphology only when the city declares it (else leave the
  // "parisien" forms untouched rather than guess an inflection).
  if (target.adj_m && target.adj_f) {
    const adjMCap = target.adj_m.charAt(0).toUpperCase() + target.adj_m.slice(1);
    out = out
      .replace(/Parisien·nes/g, adjMCap + '·es')
      .replace(/Parisien·ne/g, adjMCap + '·e')
      .replace(/parisien·nes/g, target.adj_m + '·es')
      .replace(/parisien·ne/g, target.adj_m + '·e')
      .replace(/\bparisiennes\b/g, target.adj_f + 's')
      .replace(/\bparisienne\b/g, target.adj_f)
      .replace(/\bparisiens\b/g, target.adj_m + 's')
      .replace(/\bparisien\b/g, target.adj_m);
  }
  return out
    .replace(/Ville de Paris/g, `Ville de ${target.nom}`)
    .replace(/Conseil de Paris/g, `Conseil municipal de ${target.nom}`)
    .replace(/Mairie de Paris/g, `Mairie de ${target.nom}`)
    .replace(/Open Data Paris/g, `Open Data ${target.nom}`)
    .replace(/opendata\.paris\.fr/g, 'data.gouv.fr')
    .replace(/\bParis\b/g, target.nom);
}

export type Locale = 'fr' | 'en' | 'pt';

type Dict = Record<string, string>;

// Lazy dictionary loading — each locale is its own webpack chunk so a visitor
// only downloads the active locale (~350 KB of source each). Module-level
// caches keep the promise stable across renders (required for `use()`: an
// uncached promise would re-suspend on every render) and let us read the
// resolved dict synchronously once loaded.
const dictCache: Partial<Record<Locale, Dict>> = {};

// Tracked thenable (status/value/reason pre-attached): React's `use()` treats
// it as an instrumented promise and takes the fast path — without this it
// logs error #467 ("suspended by an uncached promise") whenever hydration
// races the chunk download.
type TrackedPromise<T> = Promise<T> & {
  status: 'pending' | 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
};
const dictPromises: Partial<Record<Locale, Promise<Dict>>> = {};

/**
 * French is the default locale of every FR page and the fallback dictionary
 * of every other locale, so it is bundled statically and exposed as an
 * already-fulfilled tracked promise: `use()` on it returns synchronously and
 * the very first client render never suspends. (EN/PT still load lazily.)
 */
function fulfilledPromise<T>(value: T): TrackedPromise<T> {
  const p = Promise.resolve(value) as TrackedPromise<T>;
  p.status = 'fulfilled';
  p.value = value;
  return p;
}
dictCache.fr = frDictionary as Dict;
dictPromises.fr = fulfilledPromise(frDictionary as Dict);

function loadDictionary(locale: Locale): Promise<Dict> {
  const pending = dictPromises[locale];
  if (pending) return pending;
  const promise = (locale === 'en' ? import('@/i18n/en')
    : locale === 'pt' ? import('@/i18n/pt')
    : import('@/i18n/fr')).then((mod) => {
    dictCache[locale] = mod.default;
    return mod.default;
  }) as TrackedPromise<Dict>;
  promise.status = 'pending';
  promise.then(
    (v) => {
      promise.status = 'fulfilled';
      promise.value = v;
    },
    (e) => {
      promise.status = 'rejected';
      promise.reason = e;
    },
  );
  dictPromises[locale] = promise;
  return promise;
}

/**
 * Returns the active dict + the FR fallback dict, suspending until both are
 * available. Suspending (via `use()`) is what guarantees "no flash of raw
 * i18n keys": SSR streams already-translated HTML, and client hydration
 * pauses on the dict chunk while the server HTML stays visible. FR visitors
 * load only fr; EN needs fr too for the en→fr→key fallback chain.
 */
function useDictionaries(locale: Locale): { dict: Dict; frDict: Dict } {
  // Measured 2026-08-26 (CI e2e + a clean local production build): when the
  // first client render suspended on the fr dictionary chunk, the replay of
  // this provider threw React #467 ("Update hook called on initial render")
  // from the useEffect below — on Vercel the chunk usually arrived before
  // `use()` ran, which is why production never showed it. Two guards: fr is
  // bundled statically as an already-fulfilled promise (no suspension on the
  // first render of any FR page), and both `use()` calls run on every render
  // so the replay sees the same sequence. `use()` on a fulfilled tracked
  // promise returns synchronously.
  const dict = use(loadDictionary(locale));
  const frDict = use(loadDictionary('fr'));
  return { dict, frDict };
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'fr',
  setLocale: () => {},
  t: (key) => key,
});

export function LocaleProvider({
  children,
  initialLocale = 'fr',
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  // No Suspense boundary here, on purpose. A boundary above every page turned
  // each notFound() into a soft 404: Next streams the boundary's fallback with
  // a 200 and only then renders the not-found UI inside it — every unknown
  // entity URL on the site answered 200 until 2026-09-08. Without a boundary a
  // suspended dictionary read (EN/PT chunk, first render) holds the whole
  // shell instead, which is what we want: the status is decided first.
  // The suspending `use()` stays the FIRST hook of LocaleProviderInner, so a
  // suspended attempt never leaves a partial hook list behind (the
  // "change in the order of Hooks" crash this shape was introduced for).
  return <LocaleProviderInner locale={initialLocale}>{children}</LocaleProviderInner>;
}

function LocaleProviderInner({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  // Suspending call goes FIRST, before any other hook in this component, so a
  // suspended attempt never leaves a partial hook list to compare against.
  const { dict, frDict } = useDictionaries(locale);

  // The language is the host's (lib/site-locale.ts): the server already
  // rendered this page in it, so the client never flips it in place. Switching
  // language = going to the same path on the other host, a full navigation, so
  // that Google, the URL bar and the shared link all agree on the language.
  // Nothing is stored client-side: there is no preference to remember, the
  // address IS the choice.
  const setLocale = useCallback((l: Locale) => {
    if (l === locale || typeof window === 'undefined') return;
    const { pathname, search, hash, host } = window.location;
    window.location.assign(urlForLocale(l, `${pathname}${search}${hash}`, host));
  }, [locale]);

  const pathname = usePathname();
  const citySlug = detectCityFromPath(pathname);

  const t = useCallback(
    (key: string): string => {
      const raw = dict[key] ?? frDict[key] ?? key;
      return citySlug && citySlug !== 'paris' ? rewriteForCity(raw, citySlug) : raw;
    },
    [dict, frDict, citySlug],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return useContext(LocaleContext).t;
}

/**
 * Subtree locale override — re-provides the context with a FIXED locale and
 * an inert setLocale. US routes are EN-only (ADR-0010 D3: "the FR/EN toggle
 * is hidden or inert on US routes"): without this, shared-chrome strings
 * (DetailDrawer buttons, PageTOC aria…) render French for fr-locale visitors
 * on /us. Additive — France behavior unchanged (nothing wraps FR routes).
 * NB the root @drawer slot renders OUTSIDE nested layouts, so US drawer
 * pages must apply this wrapper themselves.
 */
export function ForcedLocale({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  // No Suspense boundary, same reason as LocaleProvider: a boundary above
  // the /us and /br pages made their notFound() answer 200.
  return <ForcedLocaleInner locale={locale}>{children}</ForcedLocaleInner>;
}

function ForcedLocaleInner({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { dict, frDict } = useDictionaries(locale);
  const t = useCallback(
    (key: string): string => dict[key] ?? frDict[key] ?? key,
    [dict, frDict],
  );
  const setLocale = useCallback(() => {}, []);
  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}
