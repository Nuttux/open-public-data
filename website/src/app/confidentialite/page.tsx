import LocaleRefresh from '@/components/LocaleRefresh';
import ConfidentialiteToggles from './ConfidentialiteToggles';
import { readLocale } from '@/lib/seo';
import fr from '@/i18n/fr';
import en from '@/i18n/en';

export default async function ConfidentialitePage() {
  const locale = await readLocale();
  // Same lookup as the context t(): active dictionary, FR fallback, then key.
  // (The context's city-label rewrite is a no-op outside /fr/city/*.)
  const dict = locale === 'en' ? en : fr;
  const t = (key: string): string => dict[key] ?? fr[key] ?? key;

  return (
    <main className="min-h-screen">
      <LocaleRefresh />
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

          {/* Session replay opt-in + full opt-out toggles (client leaf) */}
          <ConfidentialiteToggles />

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
