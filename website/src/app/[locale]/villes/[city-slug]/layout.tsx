'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useT } from '@/lib/localeContext';
import { getCityBySlug } from '@/lib/constants/cities';
import { use } from 'react';

const CITY_TABS = [
  { key: 'budget', labelKey: 'villes.budget_page' },
  { key: 'patrimoine', labelKey: 'villes.patrimoine_page' },
  { key: 'marches', labelKey: 'villes.marches_page' },
  { key: 'subventions', labelKey: 'villes.subventions_page' },
] as const;

export default function CityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ 'city-slug': string }>;
}) {
  const { 'city-slug': slug } = use(params);
  const { locale } = useLocale();
  const t = useT();
  const pathname = usePathname();
  const city = getCityBySlug(slug);

  if (!city) {
    return <div className="max-w-6xl mx-auto px-4 py-8 text-slate-400">Ville introuvable</div>;
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
