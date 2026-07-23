'use client';

/**
 * Route-level error boundary (App Router).
 *
 * Catches render/runtime errors in any page below the root layout and shows a
 * graceful, in-brand fallback with a reset + home path instead of the default
 * Next.js crash screen. Deliberately dependency-light: an error page that pulls
 * in the i18n dictionary or the data layer risks throwing itself, so the copy
 * is inlined bilingual (fr · en) and styled with the same slate/emerald tokens
 * as globals.css.
 */

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console for now; wire a real error tracker (Sentry or
    // equivalent) here when one is added — see docs/runbooks/observability-setup.md.
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Qipu</p>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100 sm:text-3xl">
        Une erreur est survenue
      </h1>
      <p className="mt-3 max-w-md text-slate-400">
        Un problème inattendu a interrompu l’affichage de cette page. Vous pouvez réessayer
        ou revenir à l’accueil.
      </p>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        Something went wrong while rendering this page. Try again or head back home.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
        >
          Réessayer · Try again
        </button>
        <a
          href="/"
          className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
        >
          Accueil · Home
        </a>
      </div>
      {error?.digest && (
        <p className="mt-6 text-xs text-slate-600">Réf. {error.digest}</p>
      )}
    </main>
  );
}
