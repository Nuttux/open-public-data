'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  startTransition,
  use,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

// City label rewriter — replaces hardcoded "Paris" forms with the current
// city's label when navigating under /fr/city/[city]/*. Lets us reuse the Paris
// i18n strings for other cities without forking 50+ keys (POC v1 Marseille).
const CITY_LABELS: Record<string, { nom: string; adj_m: string; adj_f: string }> = {
  paris: { nom: 'Paris', adj_m: 'parisien', adj_f: 'parisienne' },
  marseille: { nom: 'Marseille', adj_m: 'marseillais', adj_f: 'marseillaise' },
};

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
  const target = CITY_LABELS[citySlug];
  if (!target || citySlug === 'paris') return value;
  const adjMCap = target.adj_m.charAt(0).toUpperCase() + target.adj_m.slice(1);
  return value
    .replace(/Parisien·nes/g, adjMCap + '·es')
    .replace(/Parisien·ne/g, adjMCap + '·e')
    .replace(/parisien·nes/g, target.adj_m + '·es')
    .replace(/parisien·ne/g, target.adj_m + '·e')
    .replace(/\bparisiennes\b/g, target.adj_f + 's')
    .replace(/\bparisienne\b/g, target.adj_f)
    .replace(/\bparisiens\b/g, target.adj_m + 's')
    .replace(/\bparisien\b/g, target.adj_m)
    .replace(/Ville de Paris/g, `Ville de ${target.nom}`)
    .replace(/Conseil de Paris/g, `Conseil municipal de ${target.nom}`)
    .replace(/Mairie de Paris/g, `Mairie de ${target.nom}`)
    .replace(/Open Data Paris/g, `Open Data ${target.nom}`)
    .replace(/opendata\.paris\.fr/g, 'data.gouv.fr')
    .replace(/\bParis\b/g, target.nom);
}

export type Locale = 'fr' | 'en';

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

function loadDictionary(locale: Locale): Promise<Dict> {
  const pending = dictPromises[locale];
  if (pending) return pending;
  const promise = (locale === 'en' ? import('@/i18n/en') : import('@/i18n/fr')).then((mod) => {
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
  // `use()` may be called conditionally — that is its documented difference
  // from regular hooks — and short-circuits entirely once cached.
  const dict = dictCache[locale] ?? use(loadDictionary(locale));
  const frDict = locale === 'fr' ? dict : (dictCache.fr ?? use(loadDictionary('fr')));
  return { dict, frDict };
}

const STORAGE_KEY = 'dl_locale';
const COOKIE_KEY = 'dl_locale';

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

function writeCookie(value: Locale) {
  if (typeof document === 'undefined') return;
  // 1 year, root path. Lax SameSite is the right default for a same-site preference.
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_KEY}=${value}; max-age=${oneYear}; path=/; SameSite=Lax`;
}

export function LocaleProvider({
  children,
  initialLocale = 'fr',
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const { dict, frDict } = useDictionaries(locale);

  // Reconcile with localStorage on mount so a tab opened with a stale cookie still
  // honours the user's last explicit choice. Mirror back to cookie so SSR + future
  // tabs stay in sync. startTransition: switching locale may suspend on the other
  // dict chunk — a transition keeps the current UI on screen instead of blanking.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' && locale !== 'en') {
        startTransition(() => setLocaleState('en'));
        writeCookie('en');
      } else if (stored === 'fr' && locale !== 'fr') {
        startTransition(() => setLocaleState('fr'));
        writeCookie('fr');
      } else if (!stored) {
        // No localStorage choice yet: persist the SSR-determined locale so future
        // tabs without a cookie still get a stable preference.
        try { localStorage.setItem(STORAGE_KEY, locale); } catch {}
        writeCookie(locale);
      }
    } catch { /* SSR / private browsing */ }
  }, [locale]);

  // Keep <html lang> in sync with the active locale: SSR only knows the cookie,
  // so a client-side toggle would otherwise leave a stale lang attribute —
  // wrong for screen readers and for :lang() CSS (EN hero sizing).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    // Transition: the new locale's dict chunk may not be downloaded yet, so the
    // re-render suspends. Inside a transition React keeps showing the previous
    // locale until the chunk arrives — never raw keys, never a blank page.
    startTransition(() => setLocaleState(l));
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    writeCookie(l);
  }, []);

  // One-shot on mount: an explicit ?lang= in the URL wins over any stored
  // preference, so shared links (QR codes, printed material) land directly in
  // the requested language. Persists through the normal cookie/localStorage
  // path; the toggle behaves normally afterwards. Keeps EN opt-in explicit —
  // the link itself is the choice, we still never sniff Accept-Language.
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('lang');
      if (fromUrl === 'en' || fromUrl === 'fr') setLocale(fromUrl);
    } catch { /* non-browser */ }
  }, [setLocale]);

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
