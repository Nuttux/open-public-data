import type { Metadata } from 'next';
import { locales, isValidLocale, defaultLocale } from '@/i18n/config';
import { t } from '@/i18n/getDictionary';
import Navbar from '@/components/Navbar';
import GlossaryShell from '@/components/GlossaryShell';
import AnalyticsProvider from '@/components/AnalyticsProvider';
import SetHtmlLang from '@/components/SetHtmlLang';

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isValidLocale(raw) ? raw : defaultLocale;

  return {
    title: t(locale, 'meta.title'),
    description: t(locale, 'meta.description'),
    keywords: [
      'Paris',
      'budget',
      locale === 'fr' ? 'finances publiques' : 'public finances',
      'open data',
      locale === 'fr' ? 'visualisation' : 'visualisation',
      'Sankey',
      locale === 'fr' ? 'subventions' : 'grants',
      locale === 'fr' ? 'logements sociaux' : 'social housing',
    ],
    authors: [{ name: 'Données Lumières' }],
    openGraph: {
      title: t(locale, 'meta.title'),
      description: t(locale, 'meta.description'),
      type: 'website',
      locale: locale === 'fr' ? 'fr_FR' : 'en_GB',
    },
    alternates: {
      languages: {
        fr: '/fr',
        en: '/en',
      },
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: raw } = await params;
  const locale = isValidLocale(raw) ? raw : defaultLocale;

  return (
    <AnalyticsProvider>
      <SetHtmlLang locale={locale} />
      <GlossaryShell locale={locale}>
        <Navbar />
        <div className="pb-20 md:pb-0">{children}</div>
      </GlossaryShell>
    </AnalyticsProvider>
  );
}
