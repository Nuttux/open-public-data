'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import fr from '@/i18n/fr';
import en from '@/i18n/en';
import type { Locale } from '@/i18n/config';

export type { Locale };

const DICTIONARIES: Record<Locale, Record<string, string>> = { fr, en };

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

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const setLocale = useCallback((newLocale: Locale) => {
    // Replace the locale segment in the current path
    const segments = pathname.split('/');
    segments[1] = newLocale;
    router.push(segments.join('/'));
  }, [pathname, router]);

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
