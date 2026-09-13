import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { LANGS, type Lang } from '@/lib/urls';

// Every page below reads its language from the request (proxy.ts stamps
// x-qipu-locale). Pages that list their slugs in generateStaticParams were
// prerendered without a language and answered 500 once the language moved into
// the path (2026-09-13), so the whole tree renders on demand; Vercel's edge
// cache (next.config.ts headers) keeps the rendered pages.
export const dynamic = "force-dynamic";

/**
 * The language segment of every page: /fr, /en, /pt (lib/urls.ts). The root
 * layout owns <html>, and reads the language the proxy stamped from this
 * segment; this layout only refuses a segment that is not a language.
 */
export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!LANGS.includes(lang as Lang)) notFound();
  return children;
}
