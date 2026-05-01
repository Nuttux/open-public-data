import type { Metadata } from 'next';
import { buildLocaleAwareMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: 'Politique de confidentialité',
    description:
      "Politique de confidentialité de Données Lumières : analytics, cookies, données personnelles, conformité RGPD.",
    en: {
      title: 'Privacy policy',
      description:
        "Données Lumières privacy policy: analytics, cookies, personal data, GDPR compliance.",
    },
    path: '/confidentialite',
  });
}

export default function ConfidentialiteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
