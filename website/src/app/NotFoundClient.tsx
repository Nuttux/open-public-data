"use client";

import Link from "@/components/LocalizedLink";
import { useLocale } from '@/lib/localeContext';

/**
 * The 404 body. A client component on purpose: reading the locale through
 * headers() here made the not-found boundary dynamic, and a dynamic boundary
 * streams after the 200 shell — every notFound() on the site answered 200
 * (soft 404) until 2026-09-08. The context already carries the host's
 * language, server-rendered by the root layout, so nothing is lost.
 */
export default function NotFoundClient() {
  const en = useLocale().locale === 'en';
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
          href="/france/paris/budget"
          className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
        >
          {en ? 'Explore the budget' : 'Explorer le budget'}
        </Link>
      </div>
    </main>
  );
}
