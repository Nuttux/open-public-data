import "@/app/fusion.css";
import Navbar from '@/components/fusion/Navbar';
import Footer from '@/components/fusion/Footer';
import LocaleRefresh from '@/components/LocaleRefresh';
import ConfidentialiteToggles from './ConfidentialiteToggles';
import { readSiteLocale } from '@/lib/seo';
import { ForcedLocale } from '@/lib/localeContext';
import fr from '@/i18n/fr';
import en from '@/i18n/en';
import pt from '@/i18n/pt';

/** "before {tag} after" → [before, after]; a missing tag yields [text, '']. */
function splitOn(text: string, tag: string): [string, string] {
  const [before, after = ''] = text.split(tag);
  return [before, after];
}

export default async function ConfidentialitePage() {
  const locale = await readSiteLocale();
  // Same lookup as the context t(): active dictionary, then fallbacks, then
  // the raw key. Portuguese is a partial dictionary and reads as English for
  // anything it lacks. (The context's city-label rewrite is a no-op here.)
  const dict = locale === 'pt' ? pt : locale === 'en' ? en : fr;
  const t = (key: string): string => dict[key] ?? en[key] ?? fr[key] ?? key;
  // posthog-js names its cookie after the project key.
  const cookieName = `ph_${process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '…'}_posthog`;

  // "Un cookie nommé {code} est déposé … durée maximale de {bold_13}. …"
  const [cookieBefore, cookieRest] = splitOn(t('privacy.cookie.text'), '{code}');
  const [cookieMid, cookieAfter] = splitOn(cookieRest, '{bold_13}');
  // "… situés dans l'{bold_eu} … supprimés après {bold_25}."
  const [hostBefore, hostRest] = splitOn(t('privacy.hosting.text'), '{bold_eu}');
  const [hostMid, hostAfter] = splitOn(hostRest, '{bold_25}');

  return (
    <div className="theme-fusion">
      <LocaleRefresh />
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <section className="fx-page-header">
          <div className="fx-wrap">
            <div className="fx-page-kicker">{t('fx.foot.legal.confidentialite')}</div>
            <h1 className="fx-page-title" style={{ fontSize: 'clamp(32px, 5vw, 64px)' }}>
              {t('privacy.title')}
            </h1>
            <p className="fx-page-lede">{t('privacy.analytics.text')}</p>
          </div>
        </section>

        <div className="fx-wrap">
          <article className="fx-article-full">
            <h2>{t('privacy.data.title')}</h2>
            <p>{t('privacy.data.intro')}</p>
            <ul>
              <li>{t('privacy.data.pages')}</li>
              <li>{t('privacy.data.source')}</li>
              <li>{t('privacy.data.device')}</li>
              <li>{t('privacy.data.lang')}</li>
              <li>{t('privacy.data.geo')}</li>
              <li>{t('privacy.data.cookie_id')}</li>
              <li>{t('privacy.data.chat')}</li>
            </ul>

            <h2>{t('privacy.cookie.title')}</h2>
            <p>
              {cookieBefore}
              <code style={{ wordBreak: 'break-all' }}>{cookieName}</code>
              {cookieMid}
              <strong>{t('privacy.13_months')}</strong>
              {cookieAfter}
            </p>
            <p>
              {t('privacy.cookie.cnil_prefix')}
              <a
                href="https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience"
                target="_blank"
                rel="noopener noreferrer"
              >
                CNIL
              </a>
              {t('privacy.cookie.cnil')}
            </p>

            <h2>{t('privacy.hosting.title')}</h2>
            <p>
              {hostBefore}
              <strong>{t('privacy.eu')}</strong>
              {hostMid}
              <strong>{t('privacy.25_months')}</strong>
              {hostAfter}
            </p>

            <h2>{t('privacy.rights.title')}</h2>
            <p>{t('privacy.rights.text')}</p>
            <p>
              {t('privacy.rights.gpc_prefix')}
              <a href="https://globalprivacycontrol.org/" target="_blank" rel="noopener noreferrer">
                Global Privacy Control (GPC)
              </a>
              {t('privacy.rights.gpc_suffix')}
            </p>

            {/* Audience-measurement opt-out + session-replay opt-in (client leaf).
                The root LocaleProvider only knows fr/en, so the Portuguese host
                forces its dictionary here the way /us and /br layouts do. */}
            {locale === 'pt' ? (
              <ForcedLocale locale="pt">
                <ConfidentialiteToggles />
              </ForcedLocale>
            ) : (
              <ConfidentialiteToggles />
            )}

            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              {t('privacy.contact')}
              <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
                CNIL
              </a>
              .
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
