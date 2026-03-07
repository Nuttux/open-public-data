import type { Locale } from './config';
import fr from './fr';
import en from './en';

const dictionaries: Record<Locale, Record<string, string>> = { fr, en };

export function getDictionary(locale: Locale): Record<string, string> {
  return dictionaries[locale];
}

export function t(locale: Locale, key: string): string {
  return dictionaries[locale][key] ?? dictionaries.fr[key] ?? key;
}
