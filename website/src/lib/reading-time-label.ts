/**
 * The `reading-time` package always writes "N min read". The site says it in
 * the reader's language: the count is kept, the words come from the
 * dictionary key `fx.analyses.reading_time` ("{n} min de lecture" / "{n} min read").
 * No server imports — used by client components and server pages alike.
 */
export function readingTimeLabel(text: string, template: string): string {
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? template.split("{n}").join(String(n)) : text;
}
