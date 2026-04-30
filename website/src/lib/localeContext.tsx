'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import fr from '@/i18n/fr';
import en from '@/i18n/en';

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

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr');

  // Hydrate from localStorage once on mount, and mirror to cookie so server-side
  // generateMetadata() can read it via next/headers cookies().
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en') {
        setLocaleState('en');
        writeCookie('en');
      } else if (stored === 'fr') {
        writeCookie('fr');
      }
    } catch { /* SSR / private browsing */ }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    writeCookie(l);
  }, []);

  const t = useCallback(
    (key: string): string => DICTIONARIES[locale][key] ?? DICTIONARIES.fr[key] ?? key,
    [locale],
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
