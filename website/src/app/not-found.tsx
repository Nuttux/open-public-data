import Link from 'next/link';
import type { Metadata } from 'next';
import { readLocale } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
};

/**
 * Custom 404. Server component so it can pick the visitor's language from the
 * dl_locale cookie (same source as the root layout) and stay in-brand instead
 * of the default Next.js not-found screen. Offers a couple of real entry points
 * back into the explorer.
 */
export default async function NotFound() {
  const en = (await readLocale()) === 'en';
  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-7xl font-bold text-slate-700">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100 sm:text-3xl">
        {en ? 'Page not found' : 'Page introuvable'}
      </h1>
      <p className="mt-3 max-w-md text-slate-400">
        {en
          ? 'This page may have moved, or never existed. From the home page you can reach the budget, subsidies, public procurement and more.'
          : 'Cette page a peut-être été déplacée, ou n’a jamais existé. Depuis l’accueil, retrouvez le budget, les subventions, les marchés publics et le reste.'}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
        >
          {en ? 'Back home' : 'Retour à l’accueil'}
        </Link>
        <Link
          href="/fr/city/paris/budget"
          className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
        >
          {en ? 'Explore the budget' : 'Explorer le budget'}
        </Link>
      </div>
    </main>
  );
}
