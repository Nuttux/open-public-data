'use client';

import { useState, useEffect } from 'react';
import { optOut, optIn, isCurrentlyOptedOut } from '@/lib/hooks/useAnalytics';
import { useT } from '@/lib/localeContext';

export default function ConfidentialitePage() {
  const t = useT();
  const [isOptedOut, setIsOptedOut] = useState(false);

  useEffect(() => {
    setIsOptedOut(isCurrentlyOptedOut());
  }, []);

  const handleToggle = () => {
    if (isOptedOut) {
      optIn();
      setIsOptedOut(false);
    } else {
      optOut();
      setIsOptedOut(true);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-slate-100 mb-8">
          {t('privacy.title')}
        </h1>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          {/* Section 1 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              {t('privacy.analytics.title')}
            </h2>
            <p>{t('privacy.analytics.text')}</p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              {t('privacy.data.title')}
            </h2>
            <p className="mb-3">{t('privacy.data.intro')}</p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400">
              <li>{t('privacy.data.pages')}</li>
              <li>{t('privacy.data.source')}</li>
              <li>{t('privacy.data.device')}</li>
              <li>{t('privacy.data.lang')}</li>
              <li>{t('privacy.data.geo')}</li>
              <li>{t('privacy.data.cookie_id')}</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              {t('privacy.cookie.title')}
            </h2>
            <p>
              {t('privacy.cookie.text')
                .replace('{code}', '')
                .split('{bold_13}')[0]}
              <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs">_dl_vid</code>
              {' '}
              {t('privacy.cookie.text').includes('{code}')
                ? t('privacy.cookie.text')
                    .split('{code}')[1]
                    ?.split('{bold_13}')[0]
                : ''}
              <strong>{t('privacy.13_months')}</strong>
              {t('privacy.cookie.text').split('{bold_13}')[1] || ''}
            </p>
            <p className="mt-2">
              {t('privacy.cookie.cnil_prefix')}
              <a
                href="https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                CNIL
              </a>
              {t('privacy.cookie.cnil')}
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              {t('privacy.hosting.title')}
            </h2>
            <p>
              {t('privacy.hosting.text')
                .split('{bold_eu}')[0]}
              <strong>{t('privacy.eu')}</strong>
              {t('privacy.hosting.text')
                .split('{bold_eu}')[1]
                ?.split('{bold_25}')[0]}
              <strong>{t('privacy.25_months')}</strong>
              {t('privacy.hosting.text').split('{bold_25}')[1] || ''}
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              {t('privacy.rights.title')}
            </h2>
            <p>{t('privacy.rights.text')}</p>
            <p className="mt-2">
              {t('privacy.rights.gpc_prefix')}
              <a
                href="https://globalprivacycontrol.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Global Privacy Control (GPC)
              </a>
              {t('privacy.rights.gpc_suffix')}
            </p>
          </section>

          {/* Opt-out toggle */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {t('privacy.toggle.title')}
                </h3>
                <p className="text-slate-400 text-sm mt-1">
                  {isOptedOut ? t('privacy.toggle.off') : t('privacy.toggle.on')}
                </p>
              </div>
              <button
                onClick={handleToggle}
                className={`
                  relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900
                  ${isOptedOut ? 'bg-slate-600' : 'bg-blue-600'}
                `}
                role="switch"
                aria-checked={!isOptedOut}
                aria-label={t('privacy.toggle.aria')}
              >
                <span
                  className={`
                    pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0
                    transition duration-200 ease-in-out
                    ${isOptedOut ? 'translate-x-0' : 'translate-x-5'}
                  `}
                />
              </button>
            </div>
          </section>

          {/* Contact */}
          <section className="text-xs text-slate-500 border-t border-slate-800 pt-6">
            <p>
              {t('privacy.contact')}
              <a
                href="https://www.cnil.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                CNIL
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
