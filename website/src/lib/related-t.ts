import fr from "@/i18n/fr";
import en from "@/i18n/en";
import pt from "@/i18n/pt";

const DICTS = { fr, en, pt } as const;
export type RelatedLocale = keyof typeof DICTS;

/**
 * Server-side resolver for the "see also" copy (components/fiche/RelatedLinks.tsx).
 * The block is computed in server code from data already loaded, so it cannot
 * use the client `useT()`; the strings still live in the dictionaries
 * (`fx.related.*`, `us.sf.related.*`, `br.recife.related.*`), resolved once for
 * the page's language. `{name}` placeholders are filled from `vars`.
 */
export function relatedT(locale: RelatedLocale) {
  const dict = DICTS[locale] ?? fr;
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = dict[key] ?? fr[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

/** Count in the page's language: 1 234 / 1,234 / 1.234. */
export function relatedInt(n: number, locale: RelatedLocale): string {
  return n.toLocaleString(locale === "en" ? "en-GB" : locale === "pt" ? "pt-BR" : "fr-FR");
}
