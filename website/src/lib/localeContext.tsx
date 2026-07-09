'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import fr from '@/i18n/fr';
import en from '@/i18n/en';

// City label rewriter — replaces hardcoded "Paris" forms with the current
// city's label when navigating under /ville/[city]/*. Lets us reuse the Paris
// i18n strings for other cities without forking 50+ keys (POC v1 Marseille).
const CITY_LABELS: Record<string, { nom: string; adj_m: string; adj_f: string }> = {
  paris: { nom: 'Paris', adj_m: 'parisien', adj_f: 'parisienne' },
  marseille: { nom: 'Marseille', adj_m: 'marseillais', adj_f: 'marseillaise' },
};

function detectCityFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/ville\/([^/]+)/);
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

const DICTIONARIES: Record<Locale, Record<string, string>> = { fr, en };
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

  // Reconcile with localStorage on mount so a tab opened with a stale cookie still
  // honours the user's last explicit choice. Mirror back to cookie so SSR + future
  // tabs stay in sync.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' && locale !== 'en') {
        setLocaleState('en');
        writeCookie('en');
      } else if (stored === 'fr' && locale !== 'fr') {
        setLocaleState('fr');
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
    setLocaleState(l);
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
      const raw = DICTIONARIES[locale][key] ?? DICTIONARIES.fr[key] ?? key;
      return citySlug && citySlug !== 'paris' ? rewriteForCity(raw, citySlug) : raw;
    },
    [locale, citySlug],
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
