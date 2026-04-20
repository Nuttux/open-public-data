'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useT } from '@/lib/localeContext';
import { getCityBySlug } from '@/lib/constants/cities';

const CITY_TABS = [
  { key: 'budget', labelKey: 'villes.budget_page' },
  { key: 'patrimoine', labelKey: 'villes.patrimoine_page' },
  { key: 'marches', labelKey: 'villes.marches_page' },
  { key: 'subventions', labelKey: 'villes.subventions_page' },
] as const;

export default function CityLayoutClient({
  children,
  slug,
}: {
  children: React.ReactNode;
  slug: string;
}) {
  const { locale } = useLocale();
  const t = useT();
  const pathname = usePathname();
  const city = getCityBySlug(slug);

  if (!city) {
    return <div className="max-w-6xl mx-auto px-4 py-8 text-slate-400">{t('villes.ville_introuvable')}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
        <Link href={`/${locale}/villes`} className="hover:text-slate-300 transition-colors">
          {t('villes.retour_villes')}
        </Link>
        <span>/</span>
        <span className="text-slate-300 font-medium">{city.name}</span>
      </div>

      {/* City header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: city.color }} />
        <h1 className="text-xl sm:text-2xl font-bold text-slate-100">{city.name}</h1>
      </div>

      {/* Paris-specific disclaimer: DGFiP normalisation vs Compte administratif */}
      {slug === 'paris' && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
          <div className="flex gap-3">
            <svg
              className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-300 mb-1">
                {t('villes.paris_disclaimer.title')}
              </p>
              <p className="text-sm text-slate-300 leading-relaxed mb-3">
                {t('villes.paris_disclaimer.body')}
              </p>
              <Link
                href="/budget"
                className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
              >
                {t('villes.paris_disclaimer.cta')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Sub-nav tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-slate-700/50 pb-px">
        {CITY_TABS.map((tab) => {
          const href = `/${locale}/villes/${slug}/${tab.key}`;
          const isActive = pathname.endsWith(`/${tab.key}`);

          return (
            <Link
              key={tab.key}
              href={href}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-teal-400 border-b-2 border-teal-400 bg-teal-600/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
              }`}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
