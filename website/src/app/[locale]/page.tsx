'use client';

/**
 * Landing Page - Données Lumières
 *
 * Hacktivist / editorial / brutalist civic design.
 * Inspiration: ProPublica, The Markup, Bellingcat.
 * Data-first, typography-driven, no marketing polish.
 *
 * Sections: Headline + Sankey → Question Cards → Manifesto → Footer
 */

import { useState, useEffect } from 'react';
import LocaleLink from '@/components/LocaleLink';
import BudgetSankey from '@/components/BudgetSankey';
import type { BudgetData } from '@/lib/formatters';
import { useTrack } from '@/lib/analyticsContext';
import { useT } from '@/lib/localeContext';
import { useGlossary } from '@/lib/glossaryContext';

const CARD_KEYS = [
  { href: '/budget', key: 'budget', accent: 'border-rose-500', accentText: 'text-rose-400' },
  { href: '/subventions', key: 'subventions', accent: 'border-amber-500', accentText: 'text-amber-400' },
  { href: '/investissements', key: 'investissements', accent: 'border-purple-500', accentText: 'text-purple-400' },
  { href: '/budget?tab=tendances', key: 'tendances', accent: 'border-emerald-500', accentText: 'text-emerald-400' },
  { href: '/patrimoine', key: 'patrimoine', accent: 'border-violet-500', accentText: 'text-violet-400' },
  { href: '/logements', key: 'logements', accent: 'border-cyan-500', accentText: 'text-cyan-400' },
] as const;

export default function LandingPage() {
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const track = useTrack();
  const t = useT();
  const { openFull } = useGlossary();

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/data/budget_sankey_2026.json');
        if (response.ok) {
          const data = await response.json();
          setBudgetData(data);
        }
      } catch (error) {
        console.error('Error loading Sankey data:', error);
      }
    }
    loadData();
  }, []);

  return (
    <main className="min-h-screen">

      {/* ——— 1. HEADLINE ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-10">
          <h1 className="font-mono text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            <span className="text-slate-50">{t('landing.headline_1')}</span>
            <span className="text-amber-400">{t('landing.headline_finances')}</span>
            <span className="text-slate-50">{t('landing.headline_2')}</span>
            <span className="text-blue-400">{t('landing.headline_city')}</span>
          </h1>
          <p className="mt-2 font-mono text-3xl sm:text-4xl lg:text-5xl font-bold">
            <span className="text-slate-50">{t('landing.subtitle_1')}</span>
            <span className="text-emerald-400">{t('landing.subtitle_years')}</span>
          </p>
          <p className="mt-4 text-lg sm:text-xl text-slate-400">
            {t('landing.tagline')}
          </p>
        </div>
      </section>

      {/* ——— 2. SANKEY EXAMPLE ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <h2 className="font-mono text-sm uppercase tracking-widest text-slate-400 mb-1">
            {t('landing.sankey_title')}
          </h2>
          <p className="font-mono text-4xl sm:text-5xl font-extrabold text-slate-50 mb-6">
            {t('landing.sankey_amount')}
          </p>
          {budgetData ? (
            <BudgetSankey data={budgetData} />
          ) : (
            <div className="bg-slate-900 border border-slate-600 p-6 h-[500px] flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-mono">{t('landing.sankey_loading')}</p>
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500 font-mono">
            {t('landing.sankey_source')}
          </p>
        </div>
      </section>

      {/* ——— 3. EXPLORER ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 sm:pt-16 pb-2">
          <h2 className="font-mono text-lg sm:text-xl font-bold text-slate-100">
            {t('landing.explore')}
          </h2>
        </div>
      </section>

      {/* ——— 3b. QUESTION CARDS ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
            {CARD_KEYS.map((card) => (
              <LocaleLink
                key={card.href}
                href={card.href}
                onClick={() => track('cta_click', { cta: 'question_card', destination: card.href })}
                className={`group block border border-slate-600 border-l-4 ${card.accent} p-6 hover:bg-slate-800 transition-colors -mt-px -ml-px`}
              >
                <span className={`font-mono text-xs uppercase tracking-widest ${card.accentText}`}>
                  {t(`landing.card.${card.key}.category`)}
                </span>
                <p className="mt-2 text-lg font-semibold text-slate-100 group-hover:text-white">
                  {t(`landing.card.${card.key}.question`)}
                </p>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  {t(`landing.card.${card.key}.detail`)}
                </p>
                <span className={`inline-block mt-4 text-sm ${card.accentText} font-mono`}>
                  {t(`landing.card.${card.key}.link`)} →
                </span>
              </LocaleLink>
            ))}
          </div>
        </div>
      </section>

      {/* ——— POURQUOI C'EST DIFFÉRENT ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <h2 className="font-mono text-lg sm:text-xl font-bold text-slate-100 mb-6">
            {t('landing.diff.title')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
            <div className="border border-slate-600 border-l-4 border-l-blue-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-blue-400">{t('landing.diff.problem.category')}</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">{t('landing.diff.problem.title')}</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                {t('landing.diff.problem.text')}
              </p>
            </div>
            <div className="border border-slate-600 border-l-4 border-l-amber-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-amber-400">{t('landing.diff.approach.category')}</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">{t('landing.diff.approach.title')}</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                {t('landing.diff.approach.text')}
              </p>
            </div>
            <a
              href="https://github.com/Nuttux/france-open-data"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('external_link_click', { url: 'https://github.com/Nuttux/france-open-data', text: 'open source' })}
              className="group border border-slate-600 border-l-4 border-l-emerald-500 p-6 -mt-px -ml-px hover:bg-slate-800 transition-colors"
            >
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">{t('landing.diff.guarantee.category')}</span>
              <p className="mt-2 text-lg font-semibold text-slate-100 group-hover:text-white">{t('landing.diff.guarantee.title')}</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                {t('landing.diff.guarantee.text')}
              </p>
              <span className="inline-block mt-4 text-sm text-emerald-400 font-mono">GitHub →</span>
            </a>
          </div>
        </div>
      </section>

      {/* ——— À QUI ÇA SERT ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <h2 className="font-mono text-lg sm:text-xl font-bold text-slate-100 mb-6">
            {t('landing.audience.title')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
            <div className="border border-slate-600 border-l-4 border-l-sky-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-sky-400">{t('landing.audience.citizens.category')}</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">{t('landing.audience.citizens.title')}</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                {t('landing.audience.citizens.text')}
              </p>
            </div>
            <div className="border border-slate-600 border-l-4 border-l-orange-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-orange-400">{t('landing.audience.journalists.category')}</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">{t('landing.audience.journalists.title')}</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                {t('landing.audience.journalists.text')}
              </p>
            </div>
            <div className="border border-slate-600 border-l-4 border-l-fuchsia-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-fuchsia-400">{t('landing.audience.institutions.category')}</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">{t('landing.audience.institutions.title')}</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                {t('landing.audience.institutions.text')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ——— MANIFESTO ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <p className="text-base sm:text-lg text-slate-300 max-w-3xl leading-relaxed">
            <strong className="text-slate-100">{t('nav.site_title')}</strong> {t('landing.manifesto')}
          </p>
          <p className="mt-6 text-sm text-slate-400">
            <a
              href="https://github.com/Nuttux/france-open-data"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-200"
            >
              GitHub
            </a>
            {' · '}
            <LocaleLink href="/blog" className="underline hover:text-slate-200">
              Blog
            </LocaleLink>
            {' · '}
            <a
              href="mailto:hi@franceopendata.org"
              className="underline hover:text-slate-200"
            >
              {t('landing.contact')}
            </a>
          </p>
        </div>
      </section>

      {/* ——— 4. FOOTER ——— */}
      <footer className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-slate-500 font-mono">
            <a href="https://opendata.paris.fr/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">{t('landing.footer.sources')}</a>
            {' · '}
            <span>{t('landing.footer.license')}</span>
            {' · '}
            <a href="https://github.com/Nuttux/france-open-data" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">GitHub</a>
            {' · '}
            <button type="button" onClick={() => { track('glossary_open', { trigger: 'footer_link' }); openFull(); }} className="hover:text-slate-300">{t('nav.glossary_title')}</button>
            {' · '}
            <LocaleLink href="/confidentialite" className="hover:text-slate-300">{t('nav.privacy_title')}</LocaleLink>
          </p>
        </div>
      </footer>
    </main>
  );
}
