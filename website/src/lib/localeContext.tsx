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
